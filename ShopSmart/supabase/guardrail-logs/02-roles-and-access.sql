-- GuardRail Compliance Logs project: roles and access
-- Run after 01-schema.sql, in the GuardRail logs project only. Safe to run again.
-- BEFORE RUNNING: replace the three CHANGE_ME passwords below with long random passwords.
-- These roles exist only in this project's database, so they cannot log in to ShopSmart production.
--
--   guardrail_ingest    the log shipper: may INSERT log rows, nothing else (cannot read them back)
--   guardrail_monitor   the compliance monitoring company: read-only on logs, views and alerts
--   guardrail_detector  the GuardRail detection engine: reads logs, writes alerts and detection runs,
--                       and marks events as processed

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'guardrail_ingest') then
    create role guardrail_ingest login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'guardrail_monitor') then
    create role guardrail_monitor login;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'guardrail_detector') then
    create role guardrail_detector login;
  end if;
end $$;

alter role guardrail_ingest   with login password 'Ingest@123'   valid until 'infinity' connection limit 5;
alter role guardrail_monitor  with login password 'Monitor@123'  valid until 'infinity' connection limit 5;
alter role guardrail_detector with login password 'Detector@123' valid until 'infinity' connection limit 5;

-- Nobody else (including Supabase's public API roles) gets anything in this schema by default
revoke all on schema guardrail from public;
revoke all on all tables in schema guardrail from public;
revoke all on all sequences in schema guardrail from public;
do $$
declare r text;
begin
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on schema guardrail from %I', r);
      execute format('revoke all on all tables in schema guardrail from %I', r);
      execute format('revoke all on all sequences in schema guardrail from %I', r);
      execute format('alter default privileges in schema guardrail revoke all on tables from %I', r);
    end if;
  end loop;
end $$;
revoke all on function guardrail.capture_schema_change() from public;

grant usage on schema guardrail to guardrail_ingest, guardrail_monitor, guardrail_detector;

-- Ingest: insert only
grant insert on guardrail.activity_logs, guardrail.database_logs, guardrail.violation_labels to guardrail_ingest;

-- Monitor: read-only (logs, views, alerts, runs, registry, schema changes). Not the answer key.
grant select on guardrail.activity_logs, guardrail.database_logs, guardrail.schema_change_events,
                guardrail.service_registry, guardrail.compliance_alerts, guardrail.detection_runs,
                guardrail.all_logs to guardrail_monitor;
do $$
declare v record;
begin
  for v in select table_name from information_schema.views
           where table_schema = 'guardrail' and (table_name like 'activity\_%' or table_name like 'database\_%') loop
    execute format('grant select on guardrail.%I to guardrail_monitor, guardrail_detector', v.table_name);
  end loop;
end $$;

-- Detector: read logs, write alerts and runs, update processing status only
grant select on guardrail.activity_logs, guardrail.database_logs, guardrail.schema_change_events,
                guardrail.service_registry, guardrail.all_logs to guardrail_detector;
grant select, insert on guardrail.compliance_alerts to guardrail_detector;
grant update (finished_at, detector_version, events_scanned, alerts_created, status, notes)
on guardrail.detection_runs to guardrail_detector;
grant update (processing_status) on guardrail.activity_logs, guardrail.database_logs to guardrail_detector;

-- Row Level Security: every table on, each role gets exactly its own policies
alter table guardrail.activity_logs        enable row level security;
alter table guardrail.database_logs        enable row level security;
alter table guardrail.violation_labels     enable row level security;
alter table guardrail.schema_change_events enable row level security;
alter table guardrail.service_registry     enable row level security;
alter table guardrail.compliance_alerts    enable row level security;
alter table guardrail.detection_runs       enable row level security;

drop policy if exists ingest_insert on guardrail.activity_logs;
drop policy if exists ingest_insert on guardrail.database_logs;
drop policy if exists ingest_insert on guardrail.violation_labels;
create policy ingest_insert on guardrail.activity_logs    for insert to guardrail_ingest with check (true);
create policy ingest_insert on guardrail.database_logs    for insert to guardrail_ingest with check (true);
create policy ingest_insert on guardrail.violation_labels for insert to guardrail_ingest with check (true);

drop policy if exists read_logs on guardrail.activity_logs;
drop policy if exists read_logs on guardrail.database_logs;
drop policy if exists read_logs on guardrail.schema_change_events;
drop policy if exists read_logs on guardrail.service_registry;
drop policy if exists read_logs on guardrail.compliance_alerts;
drop policy if exists read_logs on guardrail.detection_runs;
create policy read_logs on guardrail.activity_logs        for select to guardrail_monitor, guardrail_detector using (true);
create policy read_logs on guardrail.database_logs        for select to guardrail_monitor, guardrail_detector using (true);
create policy read_logs on guardrail.schema_change_events for select to guardrail_monitor, guardrail_detector using (true);
create policy read_logs on guardrail.service_registry     for select to guardrail_monitor, guardrail_detector using (true);
create policy read_logs on guardrail.compliance_alerts    for select to guardrail_monitor, guardrail_detector using (true);
create policy read_logs on guardrail.detection_runs       for select to guardrail_monitor, guardrail_detector using (true);

drop policy if exists detector_status on guardrail.activity_logs;
drop policy if exists detector_status on guardrail.database_logs;
drop policy if exists detector_write on guardrail.compliance_alerts;
drop policy if exists detector_update on guardrail.compliance_alerts;
drop policy if exists detector_write on guardrail.detection_runs;
drop policy if exists detector_update on guardrail.detection_runs;
create policy detector_status on guardrail.activity_logs     for update to guardrail_detector using (true) with check (true);
create policy detector_status on guardrail.database_logs     for update to guardrail_detector using (true) with check (true);
create policy detector_write  on guardrail.compliance_alerts for insert to guardrail_detector with check (true);
create policy detector_update on guardrail.compliance_alerts for update to guardrail_detector using (true) with check (true);
create policy detector_write  on guardrail.detection_runs    for insert to guardrail_detector with check (true);
create policy detector_update on guardrail.detection_runs    for update to guardrail_detector using (true) with check (true);

