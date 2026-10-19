# Windows setup: ShopSmart and GuardRail on Supabase

You need Python 3.10 or later (`python --version`) and the ShopSmart folder with this update applied. Every command runs in **cmd** from the ShopSmart folder.

## 1. Create two Supabase projects

In supabase.com, create (or use) one organization and add **two projects**:

| Project name | Purpose |
|---|---|
| `shopsmart-production` | The shop's database |
| `guardrail-compliance-logs` | The logs that GuardRail watches |

Use a different database password for each, and keep both passwords safe. You are the organization **Owner**; keep it that way.

**Who gets access (important):**
- **Do not invite the monitoring company or the GuardRail team to the organization.** On the Free and Pro plans, every organization member can open every project in it, including `shopsmart-production`.
- **Give them only the `guardrail_monitor` connection string** (step 2). It works for the logs project and nothing else.
- If someone truly needs the Supabase dashboard of the logs project, the **Team plan** offers project-scoped roles: invite them with a role on `guardrail-compliance-logs` **only**. Even then, a dashboard role sees everything in that project, including the answer key, so the connection string is the safer choice.
- Check it in **Organization settings → Team**: only you, and anyone who builds ShopSmart with you, should be listed.

For each project, open **Connect → Transaction pooler** and note two values:
- the **project ref** (the part after `postgres.` in the user name)
- the **host** (for example `aws-0-ap-south-1.pooler.supabase.com`)

## 2. Set up the GuardRail logs project

In the **guardrail-compliance-logs** project, open **SQL Editor** and run these files in order:

1. `supabase/guardrail-logs/01-schema.sql`
2. `supabase/guardrail-logs/02-roles-and-access.sql`. **First** replace the three `CHANGE_ME_...` passwords in it with long random passwords, and write them down:
   - **ingest:** used by the log shipper (you)
   - **monitor:** give to the monitoring company or GuardRail team
   - **detector:** give to the GuardRail detection engine
3. `supabase/guardrail-logs/03-reference-rules.sql` (optional reference rules)

## 3. Fill in the two settings files

```
copy shopsmart.env.example.bat shopsmart.env.bat
copy guardrail.env.example.bat guardrail.env.bat
notepad shopsmart.env.bat
notepad guardrail.env.bat
```

- **`shopsmart.env.bat`:** the production project ref, host and password.
- **`guardrail.env.bat`:** the logs project ref, host and the **guardrail_ingest** password (not the logs project's main password).

## 4. Point the backend at the production project (one line, once)

Open `start-backend.bat` in Notepad. Just above the line `cd /d "%~dp0backend"`, add:

```
if exist "%~dp0shopsmart.env.bat" call "%~dp0shopsmart.env.bat"
```

If you added a `supabase.env.bat` line from the previous update, replace it with this one.

## 5. First start, then lock down the production tables

```
stop-project.bat
run-project.bat
```

1. Wait until all 9 service windows show `Started ...Application`. Each service creates its tables in **shopsmart-production**; the catalogue and admin account are added automatically.
2. In the **shopsmart-production** project's SQL Editor, run `supabase/shopsmart-production/01-secure-tables.sql`. The result should show `rls_on = true` and `api_access = false` for every table.

## 6. Optional: bring over your existing MySQL data

Before you start, keep a backup of MySQL. The migration only reads from MySQL, but a backup is still wise:

```
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe" -u root -p -P 33006 shopsmart_db > shopsmart_db_backup.sql
```

Then run:

```
stop-project.bat
call shopsmart.env.bat
set MYSQL_PASSWORD=your-mysql-password
python -m pip install -r tools\requirements.txt
python tools\migrate\migrate_mysql_to_postgres.py
```

That is a dry run that writes nothing. It shows:
- the row counts per table
- one sample time per table
- MySQL tables that no ShopSmart service uses any more (`NOT MIGRATED`)
- foreign keys, unique keys and indexes that MySQL has and PostgreSQL does not

Then copy everything:

```
python tools\migrate\migrate_mysql_to_postgres.py --apply --replace-target --include-unmapped --add-missing-structure
run-project.bat
```

| Option | What it does |
|---|---|
| `--replace-target` | Empties the new tables first. On a fresh project they only hold the automatically created catalogue and admin account |
| `--include-unmapped` | Also copies old tables no service uses, so nothing is left behind |
| `--add-missing-structure` | Creates any missing relationships, unique keys and indexes |

The last line must say **`RESULT: COMPLETE`**. The details are in `migration-report.md`; keep that file. If it says `NOT COMPLETE`, the report shows which table or key failed and why. Do not delete MySQL.

If the sample times show the wrong hour, add `--source-timezone Asia/Kolkata`.

## 7. Logs to GuardRail

`run-project.bat` opens an **11 log-shipper** window when `guardrail.env.bat` exists. It should print `Connected to the GuardRail logs database`. If Supabase can't be reached, it shows `DELIVERY FAILED ... Retrying` and catches up later without losing anything.

In the **guardrail-compliance-logs** project:

| Where | What |
|---|---|
| Table Editor → schema `guardrail` | `activity_logs`, `database_logs`, `schema_change_events`, `compliance_alerts`, ... |
| Views | `activity_<service>`, `database_<service>` (9 services each), `all_logs`, `rule_*` |

## 8. Check the access rules

```
call guardrail.env.bat
set GUARDRAIL_MONITOR_DB_URL=postgresql://guardrail_monitor.%GUARDRAIL_PROJECT_REF%:MONITOR_PASSWORD@%GUARDRAIL_POOLER_HOST%:6543/postgres?sslmode=require
set GUARDRAIL_DETECTOR_DB_URL=postgresql://guardrail_detector.%GUARDRAIL_PROJECT_REF%:DETECTOR_PASSWORD@%GUARDRAIL_POOLER_HOST%:6543/postgres?sslmode=require
set GUARDRAIL_INGEST_DB_URL=postgresql://guardrail_ingest.%GUARDRAIL_PROJECT_REF%:%GUARDRAIL_INGEST_PASSWORD%@%GUARDRAIL_POOLER_HOST%:6543/postgres?sslmode=require
set MONITOR_ON_PRODUCTION_URL=postgresql://guardrail_monitor.PRODUCTION_REF:MONITOR_PASSWORD@PRODUCTION_HOST:6543/postgres?sslmode=require
python tools\guardrail\verify_access.py
```

Replace `MONITOR_PASSWORD`, `DETECTOR_PASSWORD`, `PRODUCTION_REF` and `PRODUCTION_HOST` with your values. If a password contains `@`, `:` or `/`, write it URL-encoded (for example `@` becomes `%40`). Every line should say PASS; the report is saved as `access-report.md`.

## 9. Demo run

The four demo switches are off until an admin turns one on in **Admin → Demo violations**. Only an ADMIN account can change them; the server checks this. To disable the harness completely, set `DEMO_VIOLATIONS_ALLOWED=false` in `shopsmart.env.bat`.


```
run-demo-traffic.bat 20
```

This runs 20 minutes of fictional customers, with the four demo switches turned on in turn. Watch the events arrive:

```sql
select logged_at, service, kind, event, severity, scenario from guardrail.activity_logs order by logged_at desc limit 50;
select * from guardrail.rule_marketing_without_consent order by logged_at desc;
```

## Switching back to MySQL

Rename `shopsmart.env.bat` (for example to `shopsmart.env.off.bat`) and run `run-project.bat`. The services use the MySQL settings in `start-backend.bat` again.
