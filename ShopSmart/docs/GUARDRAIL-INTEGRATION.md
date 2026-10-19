# GuardRail integration guide (for the GuardRail team)

This guide is for the GuardRail team: the detector (Presidio and spaCy) and the dashboard. ShopSmart's job ends when the log events are in the **GuardRail Compliance Logs** Supabase project. Everything you need is there; you never connect to ShopSmart production.

## 1. Connecting

Ask the ShopSmart owner for the connection string that matches what you are building. They create the passwords when they run `02-roles-and-access.sql`.

| You are building | Role | Connection string |
|---|---|---|
| Dashboard, or the external monitoring view | `guardrail_monitor` | `postgresql://guardrail_monitor.<logs-ref>:<pw>@<pooler-host>:6543/postgres?sslmode=require` |
| Detection engine | `guardrail_detector` | `postgresql://guardrail_detector.<logs-ref>:<pw>@<pooler-host>:6543/postgres?sslmode=require` |

- **Use the transaction pooler on port 6543.** Supabase's direct connection on port 5432 is IPv6-only, and many networks cannot reach it.
- **Turn off prepared statements:**
  - psycopg 3: `psycopg.connect(url, prepare_threshold=None)`
  - SQLAlchemy with psycopg: `connect_args={"prepare_threshold": None}`
- **Keep these strings on the server.** They must never go into browser code or a `VITE_`/`NEXT_PUBLIC_` variable. If the dashboard runs in a browser, give it a small backend (for example FastAPI) that holds the monitor string.
- **Never use these keys:** the logs project's `anon` key and `service_role` key are not for GuardRail. The `anon` key can read nothing, and `service_role` can do everything.

## 2. What you can read

Everything is in schema `guardrail`.

| Table / view | Contents |
|---|---|
| `activity_logs` | One row per application event from the 9 services: HTTP requests, consent changes, erasure, marketing sends, orders, payments, security events, errors |
| `database_logs` | One row per database operation (metadata only) or schema event |
| `schema_change_events` | Every `db_schema_change`, extracted from `database_logs` by a trigger |
| `activity_<service>`, `database_<service>` | The same tables filtered to one service (18 views). Service names use underscores, for example `activity_order_service` |
| `all_logs` | Both tables combined, with common columns |
| `service_registry` | The 9 ShopSmart services |
| `compliance_alerts`, `detection_runs` | Your output (section 4) |
| `rule_*` views | ShopSmart's simple reference rules (section 6) |

Useful `activity_logs` columns:

| Column | Notes |
|---|---|
| `kind` | `request`, `privacy`, `consent`, `business`, `security`, `error`, `system` |
| `event` | For example `http_request`, `consent_recorded`, `consent_withdrawn`, `marketing_message_sent`, `erasure_requested`, `retention_erasure`, `retention_overdue`, `order_activity`, `payment_activity`, `payment_signature_invalid`, `schema_change_applied`, `demo_debug_dump`. Full list: `LOGGING.md` |
| `trace_id` | The same value on every event in one customer request, across services and in `database_logs`. Use it to join activity to database operations |
| `actor_type`, `actor_ref` | `customer`, `admin`, `system` or `anonymous`, plus a salted pseudonym (`cust_…`). Stable, so you can follow one customer without knowing who they are |
| `purpose`, `consent_status`, `data_category` | Present on consent, marketing and retention events |
| `severity`, `risk_indicators` | **Hints** set by the shipper from simple patterns. They are not detections |
| `pii_masked`, `masked_pii_types` | The shipper found and masked personal data in this line. That is a finding in itself: the service logged personal data |
| `message`, `details` | Sanitised text and key/value fields |
| `processing_status` | `pending`, `processed` or `error`. The detector may update this column, and only this one |

Useful `database_logs` columns:
- `operation`, `db_table`, `data_category`, `personal_data`, `row_count`, `duration_ms`, `status`
- `query_fingerprint`, `sql_template`: the SQL with all literal values replaced by `?`
- `schema_change`, `schema_column`, `column_type`, `classification`, `registered`

## 3. What the data looks like

- **No real personal data.** Customer ids are pseudonyms. Emails, phone numbers, Aadhaar, PAN and Luhn-valid card numbers are replaced with `[EMAIL]`, `[PHONE]`, `[AADHAAR]`, `[PAN]` and `[CARD]`. SQL values are never stored.
- **One exception, on purpose.** When the `PII_IN_LOGS` demo switch is on, services write a debug line containing **synthetic** personal data: fictional names, `@example.in` emails, and fake Aadhaar numbers that pass the Verhoeff check. These lines start with `event=demo_debug_dump … demo=true synthetic=true` and are not masked, so Presidio has something real to find.
- **Masking still leaves a trace.** A masked line is also something to report: `pii_masked = true` with `masked_pii_types = {EMAIL_ADDRESS}` means a service logged an email, even though you see `[EMAIL]`.
- **Entity names** in `masked_pii_types` follow Presidio's: `EMAIL_ADDRESS`, `PHONE_NUMBER`, `IN_AADHAAR`, `IN_PAN`, `CREDIT_CARD`.

## 4. Writing alerts

As `guardrail_detector`, the workflow is:

1. **Start a run:**
   ```sql
   insert into guardrail.detection_runs (detector_version) values ('guardrail-0.3') returning id;
   ```
2. **Read pending events:**
   ```sql
   select * from guardrail.activity_logs where processing_status = 'pending' order by logged_at limit 500;
   ```
3. **For each finding, insert an alert:**
   ```sql
   insert into guardrail.compliance_alerts
     (detection_run_id, rule_id, rule_type, finding_level, severity, risk_score, service, log_table,
      event_ref, trace_id, pii_entity_types, masked_evidence, description)
   values (%s, 'pii.presidio', 'pii', 'signal', 'high', 82, %s, 'activity_logs', %s, %s,
           array['EMAIL_ADDRESS','IN_AADHAAR'], %s, 'Email and Aadhaar number in an application log');
   ```
4. **Mark the events processed:**
   ```sql
   update guardrail.activity_logs set processing_status = 'processed' where id = any(%s);
   ```
5. **Close the run:** set `finished_at`, `events_scanned`, `alerts_created` and `status = 'succeeded'`.

**Rules for alerts:**
- **`masked_evidence` must never contain the raw value.** Use Presidio's anonymizer, or replace each entity with its type, for example `name=<PERSON> aadhaar=<IN_AADHAAR>`.
- **`finding_level`:**
  - `signal`: a pattern matched (default)
  - `suspected_violation`: several signals agree, or a rule with strong context (for example a marketing send with consent `withdrawn`)
  - `confirmed_finding`: only after a person has reviewed it
- **Presidio alone does not establish non-compliance under the DPDP Act.** A Presidio match means "personal data appears here"; whether that breaks the Act depends on purpose, consent, notice and retention. Use `signal` for Presidio-only results.
- **`status`** moves `OPEN` → `INVESTIGATING` → `RESOLVED` or `FALSE_POSITIVE`. The reviewer sets `reviewed_by`, `reviewed_at` and `review_note`. The monitor role is read-only, so these review updates must go through a backend that uses the detector role.

## 5. Keeping the test fair

- **Do not use `is_demo`, `scenario` or the word `demo` in the message as detection inputs.** They exist so humans can see which events were staged. A detector that reads them is only reading the answer.
- **`violation_labels` is the answer key.** It holds the ground truth for every violation the demo switches produced. Neither the monitor nor the detector role can read it; the database refuses both. To score the detector, the ShopSmart owner runs a query as the project owner that compares `compliance_alerts.event_ref` with `violation_labels` by trace id and time.
- **Detector alerts carry `is_demo` only for display**, so a dashboard can label them. Copy it from the event after detection, never before.

## 6. Reference rules (optional)

`03-reference-rules.sql` defines four plain SQL views. You can use them to cross-check the detector, or as a first version of the rule engine:

| View | Signal |
|---|---|
| `rule_pii_in_logs` | Personal data patterns in a log line, with masked evidence |
| `rule_marketing_without_consent` | `marketing_message_sent` where `consent_status` is not `granted` |
| `rule_retention_overdue` | Erasure requested, deadline passed, no `retention_erasure` event for that pseudonym |
| `rule_unregistered_column` | A column added outside the service's declared data inventory |

They do not read `is_demo` or the answer key.

## 7. If your detector already reads another format

If GuardRail currently ingests files (JSONL from `tools/export_logs.py`, or the older `logs.sql`), switch the input to the SQL queries above. The field names are the same as in the JSONL export:
- `service`, `event`, `traceId` → `trace_id`
- `message`, plus the fields inside `details`

If you need a field that is not there, ask the ShopSmart owner. Do not query ShopSmart production to fill the gap.
