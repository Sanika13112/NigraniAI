-- GuardRail Compliance Logs project: schema
-- Run in the GuardRail logs Supabase project (NOT the ShopSmart production project):
-- SQL Editor > New query > paste > Run. Safe to run again.
-- Then run 02-roles-and-access.sql.

create schema if not exists guardrail;
create extension if not exists pgcrypto;

-- Which services can send telemetry
create table if not exists guardrail.service_registry (
  service       text primary key,
  display_name  text not null,
  has_database  boolean not null,
  owner_team    text not null default 'ShopSmart',
  active        boolean not null default true,
  registered_at timestamptz not null default now()
);
insert into guardrail.service_registry (service, display_name, has_database) values
  ('api-gateway', 'API gateway', false),
  ('discovery-server', 'Discovery server (Eureka)', false),
  ('authentication-service', 'Authentication', true),
  ('customer-service', 'Customers, consent and erasure', true),
  ('product-service', 'Catalogue, stock and reviews', true),
  ('order-service', 'Orders and returns', true),
  ('payment-service', 'Payments (Razorpay)', true),
  ('notification-service', 'Notifications', true),
  ('analytics-service', 'Analytics', true)
on conflict (service) do nothing;

-- A. Application and website activity (general logs of all services)
create table if not exists guardrail.activity_logs (
  id                text primary key,             -- event id: hash of source file, line, time and message
  logged_at         timestamptz,
  ingested_at       timestamptz not null default now(),
  service           text not null,               -- see service_registry
  level             text not null,
  kind              text not null,                -- request | privacy | consent | business | security | error | system
  event             text,
  trace_id          text,                         -- correlation id across services
  http_method       text,
  route             text,                         -- path with ids replaced by {id}
  http_status       integer,
  duration_ms       integer,
  actor_type        text,                         -- customer | admin | system | anonymous
  actor_ref         text,                         -- pseudonymous reference (salted hash), never a name or email
  data_category     text,
  purpose           text,
  consent_status    text,                         -- granted | absent | withdrawn | erasure_requested
  severity          text not null default 'info', -- info | low | medium | high
  risk_indicators   text[] not null default '{}',
  is_demo           boolean not null default false,
  scenario          text,                         -- demo scenario when is_demo
  pii_masked        boolean not null default false,
  masked_pii_types  text[] not null default '{}',
  message           text not null,                -- sanitised: PII masked unless it is synthetic demo data
  details           jsonb,                        -- sanitised key/value fields
  source_file       text not null,
  line_no           integer not null,
  processing_status text not null default 'pending' check (processing_status in ('pending','processed','error'))
);
create index if not exists activity_time_idx    on guardrail.activity_logs (logged_at desc);
create index if not exists activity_service_idx on guardrail.activity_logs (service, logged_at desc);
create index if not exists activity_event_idx   on guardrail.activity_logs (event);
create index if not exists activity_trace_idx   on guardrail.activity_logs (trace_id);
create index if not exists activity_pending_idx on guardrail.activity_logs (processing_status) where processing_status = 'pending';

-- B. Database operation metadata (DB logs of all services)
create table if not exists guardrail.database_logs (
  id                text primary key,
  logged_at         timestamptz,
  ingested_at       timestamptz not null default now(),
  service           text not null,               -- see service_registry
  level             text not null,
  event             text,                         -- db_query | db_schema | db_schema_change | db_schema_snapshot
  trace_id          text,
  operation         text,                         -- SELECT | INSERT | UPDATE | DELETE | DDL kinds
  db_table          text,
  tables            text,
  data_category     text,
  personal_data     boolean,
  row_count         integer,
  duration_ms       integer,
  slow              boolean,
  status            text,
  sql_state         text,
  query_fingerprint text,                         -- hash of the normalised statement
  sql_template      text,                         -- statement with every literal replaced by ?
  schema_change     text,
  schema_column     text,
  column_type       text,
  classification    text,                         -- e.g. personal_data:phone, or unregistered
  registered        boolean,
  is_demo           boolean not null default false,
  scenario          text,
  message           text not null,
  details           jsonb,
  source_file       text not null,
  line_no           integer not null,
  processing_status text not null default 'pending' check (processing_status in ('pending','processed','error'))
);
create index if not exists database_time_idx     on guardrail.database_logs (logged_at desc);
create index if not exists database_service_idx  on guardrail.database_logs (service, logged_at desc);
create index if not exists database_category_idx on guardrail.database_logs (data_category);
create index if not exists database_trace_idx    on guardrail.database_logs (trace_id);
create index if not exists database_fp_idx       on guardrail.database_logs (query_fingerprint);

-- Schema changes, extracted automatically from database_logs
create table if not exists guardrail.schema_change_events (
  id             bigint generated always as identity primary key,
  logged_at      timestamptz,
  service        text not null,
  db_table       text,
  column_name    text,
  change         text,
  column_type    text,
  classification text,
  registered     boolean,
  is_demo        boolean not null default false,
  source_log_id  text not null unique references guardrail.database_logs(id)
);

create or replace function guardrail.capture_schema_change() returns trigger
language plpgsql security definer set search_path = guardrail, pg_temp as $$
begin
  if new.event = 'db_schema_change' then
    insert into guardrail.schema_change_events
      (logged_at, service, db_table, column_name, change, column_type, classification, registered, is_demo, source_log_id)
    values (new.logged_at, new.service, new.db_table, new.schema_column, new.schema_change, new.column_type,
            new.classification, new.registered, new.is_demo, new.id)
    on conflict (source_log_id) do nothing;
  end if;
  return new;
end $$;
drop trigger if exists database_logs_schema_change on guardrail.database_logs;
create trigger database_logs_schema_change after insert on guardrail.database_logs
  for each row execute function guardrail.capture_schema_change();

-- C. Ground-truth labels for the demo/test environment (answer key; not detections)
create table if not exists guardrail.violation_labels (
  id             text primary key,
  recorded_at    timestamptz,
  ingested_at    timestamptz not null default now(),
  service        text,
  violation_type text,                            -- PII_IN_LOGS | OUT_OF_SCOPE_PROCESSING | RETENTION_EXCEEDED | SCHEMA_DRIFT | SCENARIO_*
  pii_types      text[],
  trace_id       text,
  subject_ref    text,                            -- pseudonymous
  log_stream     text,
  logger         text,
  message_sha256 text,
  detail         text,
  label_source   text not null default 'ground_truth'
);

-- D. Detector output (written by the GuardRail detector, reviewed by people)
create table if not exists guardrail.detection_runs (
  id               uuid primary key default gen_random_uuid(),
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  detector_version text,
  events_scanned   integer not null default 0,
  alerts_created   integer not null default 0,
  status           text not null default 'running' check (status in ('running','succeeded','failed')),
  notes            text
);

create table if not exists guardrail.compliance_alerts (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  detection_run_id uuid references guardrail.detection_runs(id),
  rule_id          text not null,                 -- e.g. pii.presidio, consent.purpose, retention.deadline, schema.unregistered
  rule_type        text not null check (rule_type in ('pii','consent','retention','schema_drift','security','other')),
  finding_level    text not null default 'signal'
                   check (finding_level in ('signal','suspected_violation','confirmed_finding')),
  severity         text not null check (severity in ('low','medium','high','critical')),
  risk_score       numeric(5,2) check (risk_score between 0 and 100),
  service          text,
  log_table        text check (log_table in ('activity_logs','database_logs')),
  event_ref        text,                          -- id in activity_logs / database_logs
  trace_id         text,
  pii_entity_types text[],
  masked_evidence  text,                          -- never raw personal data
  description      text not null,
  is_demo          boolean not null default false,
  status           text not null default 'OPEN' check (status in ('OPEN','INVESTIGATING','RESOLVED','FALSE_POSITIVE')),
  reviewed_by      text,
  reviewed_at      timestamptz,
  review_note      text
);
create index if not exists alerts_status_idx on guardrail.compliance_alerts (status, created_at desc);

-- Per-service views (18) and the combined view
create or replace view guardrail.activity_api_gateway with (security_invoker = on) as select * from guardrail.activity_logs where service = 'api-gateway';
create or replace view guardrail.database_api_gateway with (security_invoker = on) as select * from guardrail.database_logs where service = 'api-gateway';
create or replace view guardrail.activity_discovery_server with (security_invoker = on) as select * from guardrail.activity_logs where service = 'discovery-server';
create or replace view guardrail.database_discovery_server with (security_invoker = on) as select * from guardrail.database_logs where service = 'discovery-server';
create or replace view guardrail.activity_authentication_service with (security_invoker = on) as select * from guardrail.activity_logs where service = 'authentication-service';
create or replace view guardrail.database_authentication_service with (security_invoker = on) as select * from guardrail.database_logs where service = 'authentication-service';
create or replace view guardrail.activity_customer_service with (security_invoker = on) as select * from guardrail.activity_logs where service = 'customer-service';
create or replace view guardrail.database_customer_service with (security_invoker = on) as select * from guardrail.database_logs where service = 'customer-service';
create or replace view guardrail.activity_product_service with (security_invoker = on) as select * from guardrail.activity_logs where service = 'product-service';
create or replace view guardrail.database_product_service with (security_invoker = on) as select * from guardrail.database_logs where service = 'product-service';
create or replace view guardrail.activity_order_service with (security_invoker = on) as select * from guardrail.activity_logs where service = 'order-service';
create or replace view guardrail.database_order_service with (security_invoker = on) as select * from guardrail.database_logs where service = 'order-service';
create or replace view guardrail.activity_payment_service with (security_invoker = on) as select * from guardrail.activity_logs where service = 'payment-service';
create or replace view guardrail.database_payment_service with (security_invoker = on) as select * from guardrail.database_logs where service = 'payment-service';
create or replace view guardrail.activity_notification_service with (security_invoker = on) as select * from guardrail.activity_logs where service = 'notification-service';
create or replace view guardrail.database_notification_service with (security_invoker = on) as select * from guardrail.database_logs where service = 'notification-service';
create or replace view guardrail.activity_analytics_service with (security_invoker = on) as select * from guardrail.activity_logs where service = 'analytics-service';
create or replace view guardrail.database_analytics_service with (security_invoker = on) as select * from guardrail.database_logs where service = 'analytics-service';

create or replace view guardrail.all_logs with (security_invoker = on) as
  select 'activity'::text as log_type, id, logged_at, service, level, event, trace_id, data_category,
         kind as detail, severity, is_demo, scenario, message, details
    from guardrail.activity_logs
  union all
  select 'database'::text, id, logged_at, service, level, event, trace_id, data_category,
         coalesce(operation || ' ' || db_table, schema_change), case when status = 'error' then 'medium' else 'info' end,
         is_demo, scenario, message, details
    from guardrail.database_logs;
