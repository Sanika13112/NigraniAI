# Security and access-control test report

**Date:** 14 October 2026
**Scope:** separation of the ShopSmart production database from the GuardRail compliance logs database, the GuardRail database roles, and the privacy handling in the log shipper.

## How to read this report

| Status | Meaning |
|---|---|
| **Tested** | Run for real, against the scripts in this repository, with the result shown |
| **Partially tested** | Some of it was run, or it was run in a stand-in environment |
| **Unverified** | Not run yet; listed so nobody assumes it works |

**Test environment.** No Supabase account was available while this was built. The tests therefore ran on two separate local PostgreSQL 16 servers:
- one standing in for `guardrail-compliance-logs` (port 55432)
- one standing in for `shopsmart-production` (port 55433)

The roles connected over TCP with password authentication. A local MySQL 8 server was used for the migration and the portable-SQL checks.

Supabase adds things these local servers do not have: the Supavisor pooler, the `role.project_ref` user name, the `anon` and `authenticated` API roles, and the dashboard. Every result below therefore needs repeating on real Supabase with `tools/guardrail/verify_access.py`; see [Repeating the tests on Supabase](#repeating-the-tests-on-supabase).

## 1. Database roles: tested (29 of 29 passed)

The SQL used is `supabase/guardrail-logs/01-schema.sql` and `02-roles-and-access.sql`, run twice to confirm it is safe to re-run. The checker is `tools/guardrail/verify_access.py`, which logs in as each role and attempts both allowed and forbidden actions.

| Role | Check | Expected | Result |
|---|---|---|---|
| guardrail_ingest | insert activity log | allowed | PASS |
| guardrail_ingest | insert the same event again (idempotent, no error) | allowed | PASS: 0 rows, no error |
| guardrail_ingest | insert database log (schema change) | allowed | PASS |
| guardrail_ingest | read activity logs | refused | PASS: 42501 permission denied |
| guardrail_ingest | update a log row | refused | PASS: 42501 |
| guardrail_ingest | delete a log row | refused | PASS: 42501 |
| guardrail_ingest | create a table | refused | PASS: 42501 permission denied for schema |
| guardrail_monitor | read activity_logs, database_logs | allowed | PASS |
| guardrail_monitor | read views all_logs, activity_order_service, database_customer_service | allowed | PASS |
| guardrail_monitor | read schema_change_events (row created by the trigger) | allowed | PASS: 1 row |
| guardrail_monitor | read compliance_alerts | allowed | PASS |
| guardrail_monitor | read the answer key violation_labels | refused | PASS: 42501 |
| guardrail_monitor | insert / update / delete a log row | refused | PASS: 42501 (3 checks) |
| guardrail_monitor | insert an alert | refused | PASS: 42501 |
| guardrail_monitor | change a view, create a table | refused | PASS: 42501 (2 checks) |
| guardrail_monitor | drop a table | refused | PASS: must be owner |
| guardrail_detector | read activity logs | allowed | PASS |
| guardrail_detector | create an alert | allowed | PASS |
| guardrail_detector | mark an event processed (`processing_status` only) | allowed | PASS |
| guardrail_detector | change a log message | refused | PASS: 42501 |
| guardrail_detector | delete a log row | refused | PASS: 42501 |
| guardrail_detector | read the answer key violation_labels | refused | PASS: 42501 |
| guardrail_monitor | log in to the ShopSmart production database | refused | PASS: password authentication failed (the role does not exist there) |

The table groups some related checks; the script runs 29 separate checks, and all 29 passed.

**What this shows:**
- The monitoring account cannot insert, update, delete, run DDL, own objects, or read the test answer key.
- Only `guardrail_ingest` can add log events, and it cannot read them back.
- The detector can write alerts, but cannot alter or remove the evidence it is judging.
- GuardRail credentials do not open the production database.

## 2. Public API keys and the production lock-down: tested locally, unverified on Supabase

| Check | Status | Result |
|---|---|---|
| GuardRail: `anon` and `authenticated` have no rights on schema `guardrail` | Tested (roles created locally to mimic Supabase) | Grants revoked; RLS on for every table |
| Production: `01-secure-tables.sql` turns RLS on and removes API grants on every public table | Tested on the local production server | Check query showed `rls_on = t` and `api_access = f` for every table |
| The same on real Supabase, with the Data API using the anon key | **Unverified** | Run step 5 of `SETUP-WINDOWS.md`, then call `https://<ref>.supabase.co/rest/v1/customers` with the anon key; expect an empty result or an error |

## 3. Privacy handling in the log shipper: tested

`tools/log-shipper/ship_logs.py` was run end to end as `guardrail_ingest` against the local GuardRail server, on log files produced by the services' log formats.

| Check | Result |
|---|---|
| A non-demo line containing a real-looking email and phone number | Stored as `[EMAIL]` and `[PHONE]`; `pii_masked = true`, `masked_pii_types = {EMAIL_ADDRESS, PHONE_NUMBER}` |
| Card numbers | Masked only when Luhn-valid; trace ids and epoch timestamps left untouched |
| Aadhaar numbers | Masked when they match the 12-digit pattern |
| `customer:12`, `admin:1`, `auth-user:5` | Replaced by salted pseudonyms (`cust_…`, `adm_…`, `usr_…`), stable for the same id and salt |
| Marked synthetic demo lines (`demo=true synthetic=true`) | Kept as written, so the `PII_IN_LOGS` scenario stays detectable. These values are fictional (`@example.in`, Verhoeff-valid fake Aadhaar numbers). |
| Raw line kept for audit | Only its SHA-256 (`details.rawMessageSha256`), never the text |
| SQL in database logs | Stored as `sql_template` with literals replaced by `?`, plus `query_fingerprint`; a test with a phone number and name in the SQL showed neither in the output |

## 4. Delivery and failure handling: tested

| Check | Result |
|---|---|
| Re-sending the same events (restart from offset 0) | No duplicates: `on conflict do nothing` on the event id |
| Logs database unreachable | `DELIVERY FAILED … Retrying` on screen; `shipper-status.json` shows `healthy=false`; `--once` exits with code 1 |
| Database back | Shipper caught up; nothing lost; status back to `healthy=true` |
| Shipper killed mid-batch | File positions are saved only after a commit, so the batch is re-sent and deduplicated |
| A line still being written (no newline yet) | Held, then sent after 3 seconds |

**Delivery guarantee:** at-least-once, with duplicates removed by event id. Delivery is **not guaranteed** if the log files rotate away (14 days) before the shipper runs, or if a disk is lost.

## 5. Reference detection rules: tested

`03-reference-rules.sql` was run on the local GuardRail server after the demo scenarios had been shipped. Each of the four rules returned rows:
- `rule_pii_in_logs`
- `rule_marketing_without_consent`
- `rule_retention_overdue`
- `rule_unregistered_column`

The evidence column was masked. The rules never read `is_demo` or `violation_labels`. They are review signals, not legal findings.

## 6. Secrets: tested by inspection

| Check | Result |
|---|---|
| React / Vite code contains no database URL, Supabase key, `service_role` key or Razorpay secret | `grep` of `frontend/src` for `supabase`, `service_role`, `postgresql://`, `jdbc:`, `RAZORPAY_KEY_SECRET`: no matches. The only `VITE_` variable is `VITE_API_BASE_URL`. The Razorpay **key id** is public by design and comes from the backend at checkout. |
| Settings files with passwords are not committed | `shopsmart.env.bat`, `guardrail.env.bat`, the shipper's salt and state files, and the reports are in `.gitignore`; only `*.example.bat` with placeholders is shipped |
| Role passwords in SQL | `CHANGE_ME_*` placeholders; the setup guide asks for long random passwords |

## 7. Demo switches: checked by inspection

| Control | How it is enforced | Status |
|---|---|---|
| Off by default | Rows are created with `enabled = FALSE`; any database error counts as off | Checked in code |
| Only administrators can change them | `GET` and `PUT /customers/admin/demo-violations` call `requireAdmin` on the server, using the signed JWT role | Checked in code. The e2e suite's "customer denied admin access" journey covers the admin area, but not this endpoint in the Java service |
| Each change is recorded | `demo_scenario_changed … actor=admin:<id> demo=true`, plus `SCENARIO_STARTED`/`SCENARIO_STOPPED` in the answer key | Checked in code |
| Harness can be disabled for a whole deployment | `DEMO_VIOLATIONS_ALLOWED=false`: every switch reads as off, and turning one on returns 403 | Checked in code. **Not run** (Java not run here) |
| Demo events use only synthetic data | `SyntheticPii` creates fictional values; events are marked `demo=true synthetic=true` | Tested through the shipper (section 3) |

## 8. Not tested yet

| Item | Status | Why, and how to close it |
|---|---|---|
| All of sections 1–5 on real Supabase (pooler, `role.ref` user names, SSL) | **Unverified** | No Supabase account was available. Follow `SETUP-WINDOWS.md` steps 1–8; step 8 writes `access-report.md` |
| Java services compiled and started against PostgreSQL | **Unverified** | Maven could not download dependencies in the build environment. Syntax checks passed; the portable SQL (analytics queries, demo switch inserts, schema snapshot) was tested by hand on MySQL 8 and PostgreSQL 16 |
| End-to-end browser test after the latest frontend change | **Partially tested** | The frontend type-checks and builds. The 25-journey suite passed before the latest wording change on the Demo violations page, but was not re-run after it. It always runs against the stub backend, not the real services |
| GuardRail detector (Presidio/spaCy) and dashboard reading from Supabase | **Unverified** | Built by the GuardRail team; not in this repository. Integration notes: `GUARDRAIL-INTEGRATION.md` |
| Organization-level access (who is invited to which Supabase project) | **Unverified** | This is a dashboard setting only you can make. Follow `SETUP-WINDOWS.md` step 1 (do not invite the monitoring company), then check **Organization settings → Team** |

## Repeating the tests on Supabase

After setup, run `SETUP-WINDOWS.md` step 8. It runs the same 29 checks against your two projects and writes `access-report.md`. Attach that file to this report as the Supabase result.
