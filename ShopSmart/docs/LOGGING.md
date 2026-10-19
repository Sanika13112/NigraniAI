# ShopSmart log specification

This document describes every log ShopSmart writes for the GuardRail DPDPA compliance agent (PSE11): where the files are, what each line means, the four violation scenarios that can be injected on purpose, the answer key, and the JSONL export.

ShopSmart is the **monitored system**. It is a working Spring Boot microservices e-commerce application, and every customer and admin action leaves real log lines. GuardRail ingests these lines, detects personal data and rule breaches, and raises alerts.

## 1. Files

All services write to `backend/logs/`. Set the `LOG_PATH` environment variable to use another folder.

| File | Contents |
|---|---|
| `<service>.log` | General application log: everything the service prints, in the standard Spring Boot format |
| `<service>-db.log` | Database activity only: one `event=db_query` line per SQL statement, plus the schema log (`db_schema`, `db_schema_change`) |
| `ground-truth/<service>.jsonl` | Answer key: the violations injected by the demo switches. **Not for the agent.** |
| `archive/` | Rotated logs: daily or at 20 MB, kept 14 days (raise `maxHistory` in `logback-spring.xml` to keep one year, as the DPDP Rules expect) |

Services: `authentication-service`, `customer-service`, `product-service`, `order-service`, `payment-service`, `notification-service`, `analytics-service`, `api-gateway`, `discovery-server`. The gateway and discovery server have no database, so they write no `-db.log`.

## 2. Line format

Every line uses the standard Spring Boot format. The service name is in the brackets after `---`:

```
2026-10-14T15:50:02.114+05:30  INFO 4812 --- [order-service] [nio-8084-exec-3] c.s.orderservice.dblog.DbQueryLogger     : event=db_query service=order-service traceId=d84e8bc0-... dbOperation=SELECT table=customer_orders ...
└ timestamp with offset        level pid    service           thread             logger (abbreviated)                       message
```

Structured messages are `key=value` pairs separated by spaces and always start with `event=<name> service=<service>`. Privacy activity events are one JSON object instead (section 5). Spring framework lines (start-up, Hibernate, Eureka) are free text.

**`traceId`** is the same value across every line produced by one request: the request log, the privacy event and the DB queries it ran. Lines from background jobs carry `traceId=none` or a job id such as `retention-1791973122884`.

## 3. Request log (every service, and the gateway)

```
event=http_request service=customer-service traceId=<uuid> method=PUT path=/customers/me status=200 durationMs=14
event=http_request service=api-gateway traceId=<uuid> method=PUT path=/customer-service/customers/me status=200 durationMs=21 clientNet=192.168.1.0/24 channel=web
```

The gateway line is the website's view of each request, and its `traceId` is passed on to the service. The client address is masked to its /24 network, because a full IP address is personal data. Request and response bodies are not logged.

## 4. DB log (`<service>-db.log`)

One line per SQL statement, produced by a JDBC wrapper around the service's connection pool:

```
event=db_query service=customer-service traceId=<uuid> dbOperation=SELECT table=customers tables=customers,customer_addresses dataCategory=personal_data personalData=true durationMs=4 rows=2 slow=false status=success queryFingerprint=3f9a0c1b2d4e5f60 sqlTemplate="select c1_0.id,c1_0.phone from customers c1_0 where c1_0.id=?"
```

| Field | Meaning |
|---|---|
| `dbOperation` | SELECT, INSERT, UPDATE, DELETE, ALTER, CREATE, ... |
| `table` / `tables` | Main table, and every table touched (including joins) |
| `dataCategory` | Most sensitive category among the tables: `credentials` > `financial` > `personal_data` > `communication` > `transactional` > `catalog` > `system` |
| `personalData` | `true` for credentials, financial or personal data |
| `durationMs`, `rows`, `slow` | Time, rows returned or changed, and whether it exceeded `DB_LOG_SLOW_MS` (default 500) |
| `status` | `success`, or `error` with `sqlState` and `errorCode` (logged at WARN) |
| `queryFingerprint` | 16-character hash of the normalised statement: the same query shape always has the same fingerprint |
| `sqlTemplate` | The statement with every string and number literal replaced by `?` (and `IN (...)` lists collapsed), at most 400 characters |

Only metadata is logged. SQL parameter values, literals and row contents are never written. Statements on the demo harness tables (`demo_*`) and on `information_schema` are skipped.

Table categories: `auth_users`, `auth_refresh_tokens` = credentials; `payments`, `payment_webhook_events` = financial; `customers`, `customer_addresses`, `customer_orders`, `customer_wishlist`, `product_reviews` = personal_data; `notifications` = communication; `order_line_items` = transactional; `products`, `inventory_reservations`, `product_stock_adjustments` = catalog.

## 5. Schema log (also in `<service>-db.log`)

At start-up each service writes one line per column of the tables it owns, then checks every 60 seconds:

```
event=db_schema service=customer-service table=customers column=phone columnType=varchar(10) nullable=true classification=personal_data:phone registered=true
event=db_schema_change service=customer-service change=column_added table=customers column=alternate_mobile columnType=varchar(15) nullable=true classification=unregistered registered=false
```

`registered` says whether the column is in the service's declared data inventory (`SchemaLogger.REGISTRY`). A column that is not registered holds data nobody has declared. Note that a database upgraded from an older ShopSmart version may still contain old columns that show as `unregistered` from the first snapshot.

## 6. Privacy and business events

**Privacy activity.** customer- and product-service write one JSON object per line; order-, payment-, notification- and analytics-service write `event=<order|payment|notification|analytics>_activity service=<service> details={...json...}` (the exporter parses `details` into `fields.details`):

```json
{"eventId":"...","timestamp":"...","service":"customer-service","eventType":"CUSTOMER_LIST_VIEWED","traceId":"...","actorRef":"admin:1","dataCategory":"customer_profile","purpose":"customer_directory_viewing","destination":"internal","outcome":"SUCCESS"}
```

`actorRef` is `customer:<id>` or `admin:<userId>`. Examples of `eventType`: `CUSTOMER_SELF_VIEWED`, `CUSTOMER_UPDATED`, `ADDRESS_CREATED`, `CUSTOMER_LIST_VIEWED` (an admin reading everyone's records), `CUSTOMER_VIEWED`, `ERASURE_REQUESTED`.

**Consent and erasure (customer-service, key=value):**

| Event | When | Key fields |
|---|---|---|
| `consent_recorded` | Sign-up (the privacy notice must be accepted) | `customerRef`, `purposes=account,order_fulfilment,delivery,payment[,marketing]`, `noticeVersion`, `lawfulBasis=consent` |
| `terms_accepted` | Sign-up, after the profile is saved (Terms and Conditions, separate from the privacy notice and marketing) | `customerRef`, `termsVersion`, `source=registration`, `marketingConsent` (unchanged by the terms) |
| `consent_given` / `consent_withdrawn` | Customer changes the marketing choice | `customerRef`, `purpose=marketing`, `purposes` (the new full list) |
| `erasure_requested` | Customer deletes their account | `customerRef`, `eraseDueAt`, `retentionPolicy=erase_after_<n>s` |
| `retention_erasure` | Personal data erased on time | `customerRef`, `erased=customer_profile,addresses,wishlist,login_account`, `retained=orders`, `lawfulBasisForRetained=tax_record_obligation` |
| `retention_sweep` | Overdue erasures skipped (violation) | `overdueRecords`, `action=skipped` |
| `login_account_erased` | authentication-service erased the login | `authUserId`, `customerRef` |
| `marketing_message_sent` | One promotional message | `campaignId`, `customerRef`, `purpose=marketing` |
| `marketing_campaign_sent` | Campaign summary | `campaignId`, `actor`, `recipients` |

Other events include `AUTH_REGISTER_SUCCESS`, `AUTH_LOGIN_SUCCESS`, `order_activity`, `payment_activity`, `notification_activity`, `api_error`, `data_conflict` and the payment checks `payment_signature_invalid`, `payment_amount_mismatch`, `webhook_signature_invalid`.

## 7. Violation scenarios (demo switches)

Admins turn these on and off in **Admin → Demo violations**, or the traffic simulator does it on a timeline. All are off by default and can be switched off at any moment.

Every event a switch causes is **marked**: it carries `demo=true` and `scenario=<NAME>`. Any personal data it contains is **synthetic**: fictional names, `@example.in` emails, made-up phone numbers and addresses, and fake Aadhaar numbers that pass the checksum but belong to no one. Real customer data is never copied into a demo event. Each change of a switch is logged with the admin who made it:

```
event=demo_scenario_changed service=customer-service traceId=<uuid> scenario=PII_IN_LOGS enabled=true actor=admin:1 demo=true
```

| Switch | What ShopSmart does wrong | What appears in the logs | DPDP principle |
|---|---|---|---|
| `PII_IN_LOGS` | Sign-up, failed sign-in, profile, address and order code paths dump personal data into the log | `event=demo_debug_dump service=<svc> demo=true synthetic=true scenario=PII_IN_LOGS traceId=<id> \| Saving delivery address for customer 12: Kavya Iyer, 9123456780, 14 Lake View Road, Pune 411001, Aadhaar 2345 6789 0124 for delivery verification` | Security safeguards; purpose limitation |
| `OUT_OF_SCOPE_PROCESSING` | Promotions skip the consent filter | `marketing_message_sent ... purpose=marketing consentStatus=absent\|withdrawn\|erasure_requested purposeAllowed=false demo=true scenario=OUT_OF_SCOPE_PROCESSING`. Allowed sends show `consentStatus=granted purposeAllowed=true` | Consent is specific to a purpose (section 6) |
| `RETENTION_BYPASS` | The erasure job skips overdue accounts | One `retention_overdue customerRef=... retentionDeadline=<time> disposalStatus=retained demo=true scenario=RETENTION_BYPASS` per account, plus `retention_sweep ... action=skipped`. A normal erasure logs `retention_erasure ... retentionDeadline=<time> disposalStatus=erased` | Erase when the purpose ends or consent is withdrawn (section 8(7)) |
| `SCHEMA_DRIFT` | Adds `customers.alternate_mobile` and copies phone numbers into it | `schema_change_applied table=customers column=alternate_mobile change=column_added actor=demo-switch demo=true scenario=SCHEMA_DRIFT`; DB log: `dbOperation=ALTER` and an `UPDATE` on every customer; schema log: `db_schema_change change=column_added ... registered=false` | Know where personal data is stored; safeguards |

The `demo=true` marking is for people, so staged events are never mistaken for real incidents. A detector that is being evaluated must not use it as an input (see `GUARDRAIL-INTEGRATION.md`).

## 8. Answer key (`ground-truth/<service>.jsonl`)

One JSON object per injected violation. Use it to score the agent; never feed it to the agent. In Supabase it is the table `violation_labels`, which the monitor and detector roles cannot read.

```json
{"id":"...","recordedAt":"2026-10-14T10:20:01.060Z","service":"customer-service","violationType":"PII_IN_LOGS","piiTypes":["PERSON","PHONE_NUMBER","LOCATION","IN_AADHAAR"],"traceId":"...","subjectRef":"customer:12","logStream":"customer-service.log","logger":"com.shopsmart.customerservice.CustomerService","messageSha256":"<sha256 of the exact log message>","detail":"Delivery address written to the application log"}
```

- `violationType` is one of `PII_IN_LOGS`, `OUT_OF_SCOPE_PROCESSING`, `RETENTION_EXCEEDED` or `SCHEMA_DRIFT`. `SCENARIO_STARTED` and `SCENARIO_STOPPED` mark when a switch changed.
- `piiTypes` uses Microsoft Presidio entity names, so labels compare directly with Presidio output.
- `messageSha256` identifies the exact line for `PII_IN_LOGS`. The other types are linked by the export tool (section 9).

## 9. Export to JSONL

```
python tools/export_logs.py                     # everything in backend/logs
python tools/export_logs.py --since 2026-10-14T15:00
```

This writes `exports/<timestamp>/`:

- `events.jsonl`: one object per log record, with `id` (`file:line`), `timestamp`, `level`, `service`, `stream` (`app` / `db`), `sourceFile`, `line`, `pid`, `thread`, `logger`, `event`, `traceId`, `message`, and `fields` (all parsed `key=value` pairs or JSON fields). Multi-line records such as stack traces stay together.
- `labels.jsonl`: the answer key, each label with `matchedEventIds` pointing into `events.jsonl`.
- `summary.json`: counts per service, stream, event and violation type.
- `logs.sql`: the same events and labels as MySQL inserts (see below).

### Loading the logs into MySQL

Each export also writes `logs.sql`. It creates a separate database, `shopsmart_logs`, with two tables:

- `log_events`: one row per log line, with columns `logged_at`, `service`, `stream` (`app` or `db`), `event`, `trace_id`, `message`, and for DB lines `db_operation`, `db_table` and `data_category`
- `log_violation_labels`: the answer key

Load it with the MySQL command line, or in MySQL Workbench via **File → Open SQL Script**, then the lightning-bolt Execute button:

```
mysql -u root -p -P 33006 < exports\<time>\logs.sql
```

Running the export and load again later only adds the new lines. Example queries:

```sql
USE shopsmart_logs;
SELECT service, stream, COUNT(*) FROM log_events GROUP BY service, stream;
SELECT logged_at, service, db_operation, db_table FROM log_events WHERE data_category = 'personal_data' ORDER BY logged_at DESC LIMIT 50;
SELECT * FROM log_events WHERE trace_id = '<trace id>' ORDER BY logged_at;   -- one request across all services
```

## 10. Generating traffic

```
pip install requests faker
python tools/traffic-simulator/simulate.py --minutes 10                    # normal traffic only
python tools/traffic-simulator/simulate.py --minutes 20 --scenario demo    # with labelled violations
python tools/traffic-simulator/simulate.py --minutes 5 --enable PII_IN_LOGS
```

Fictional customers (Faker `en_IN`) sign up with a consent choice (40% accept marketing), browse, search, save addresses (5% include a fake Aadhaar number, 3% a fake PAN), keep wishlists, place cash-on-delivery orders, cancel, return, review, change consent and delete accounts. The admin moves orders through fulfilment, restocks, views customer records and sends promotions every few minutes.

With `--scenario demo`, each switch is on for one window of the run with normal traffic in between, and all switches are off at the end. Customers are saved in `customers.json` and reused next run. Emails use the reserved `example.com`, `example.in` and `example.org` domains, and the Aadhaar and PAN values are random numbers in the valid format that belong to no one.

## 11. Data safety

- Outside the demo switches, ShopSmart never writes personal data values to logs. Customers appear as `customer:<id>`, and the client address only as its /24 network.
- Demo events contain only synthetic data, generated by `SyntheticPii`, and are marked `demo=true synthetic=true`.
- The log shipper adds a second safety net before anything leaves the computer. It replaces ids with salted pseudonyms and masks emails, phone numbers, Aadhaar, PAN and card numbers in every event that is not a marked synthetic demo event.
- Never run the violation switches against a database with real customers.

## 12. Supabase (GuardRail Compliance Logs project)

Logs go to their **own** Supabase project, `guardrail-compliance-logs`, separate from the shop's database. `tools/log-shipper/ship_logs.py` inserts them within a few seconds as `guardrail_ingest`, a role that can only insert:

| Log | Table |
|---|---|
| General logs | `guardrail.activity_logs` |
| DB and schema logs | `guardrail.database_logs` (schema changes are also copied into `schema_change_events`) |
| Answer key | `guardrail.violation_labels` |

There are 18 per-service views (`activity_<service>`, `database_<service>`) and the combined `all_logs` view.

| For | See |
|---|---|
| Design | `ARCHITECTURE.md` |
| Setup | `SETUP-WINDOWS.md` |
| The detector team | `GUARDRAIL-INTEGRATION.md` |
| SQL | `supabase/guardrail-logs/` |
