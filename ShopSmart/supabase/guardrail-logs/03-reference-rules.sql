-- GuardRail Compliance Logs project: reference rules (optional)
-- Simple, explainable SQL rules for the four scenarios. They read only the logs (never the answer key
-- and never the is_demo flag), so they can be used to cross-check the GuardRail detector.
-- They produce SIGNALS for review, not legal findings. Run after 01 and 02. Safe to run again.

-- 1. Personal data in log text: masked by the shipper (real data) or present in a log message
create or replace view guardrail.rule_pii_in_logs with (security_invoker = on) as
select id as event_ref, logged_at, service, trace_id,
       coalesce(nullif(masked_pii_types, '{}'), array['PII_PATTERN']) as pii_entity_types,
       left(regexp_replace(regexp_replace(regexp_replace(message,
            '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[EMAIL]', 'g'),
            '(^|[^0-9])[2-9][0-9]{3} ?[0-9]{4} ?[0-9]{4}([^0-9]|$)', '\1[AADHAAR]\2', 'g'),
            '(^|[^0-9])[6-9][0-9]{9}([^0-9]|$)', '\1[PHONE]\2', 'g'), 300) as evidence, 'pii' as rule_type,
       'Personal data pattern in an application log line' as description
from guardrail.activity_logs
where pii_masked or 'pii_in_log_message' = any(risk_indicators)
   or message ~ '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}';

-- 2. Marketing processing without marketing consent
create or replace view guardrail.rule_marketing_without_consent with (security_invoker = on) as
select id as event_ref, logged_at, service, trace_id, actor_ref, consent_status, 'consent' as rule_type,
       'Marketing message sent to a customer whose consent does not include marketing' as description
from guardrail.activity_logs
where event = 'marketing_message_sent' and coalesce(consent_status, 'absent') <> 'granted';

-- 3. Erasure requested, deadline passed, no erasure recorded
create or replace view guardrail.rule_retention_overdue with (security_invoker = on) as
select r.id as event_ref, r.logged_at, r.service, r.trace_id, r.actor_ref,
       (r.details->>'eraseDueAt')::timestamptz as retention_deadline, 'retention' as rule_type,
       'Erasure was requested and the retention deadline has passed, but no erasure was logged' as description
from guardrail.activity_logs r
where r.event = 'erasure_requested'
  and (r.details->>'eraseDueAt') is not null
  and (r.details->>'eraseDueAt')::timestamptz < now()
  and not exists (select 1 from guardrail.activity_logs e
                  where e.event = 'retention_erasure' and e.actor_ref = r.actor_ref);

-- 4. Column added that is not in the service's declared data inventory
create or replace view guardrail.rule_unregistered_column with (security_invoker = on) as
select s.source_log_id as event_ref, s.logged_at, s.service, s.db_table, s.column_name, s.column_type,
       'schema_drift' as rule_type,
       'Column added outside the declared data inventory: classify it and review' as description
from guardrail.schema_change_events s
where s.change = 'column_added' and coalesce(s.registered, false) = false;

grant select on guardrail.rule_pii_in_logs, guardrail.rule_marketing_without_consent,
                guardrail.rule_retention_overdue, guardrail.rule_unregistered_column
  to guardrail_monitor, guardrail_detector;
