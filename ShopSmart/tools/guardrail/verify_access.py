#!/usr/bin/env python3
"""
Checks the GuardRail logs database access rules by logging in as each role and trying things that
must work and things that must fail. Writes a Markdown report (access-report.md by default).

Environment variables (or the matching --options):
  GUARDRAIL_INGEST_DB_URL     postgresql://guardrail_ingest.<logs-ref>:<pw>@<pooler-host>:6543/postgres
  GUARDRAIL_MONITOR_DB_URL    postgresql://guardrail_monitor.<logs-ref>:<pw>@<pooler-host>:6543/postgres
  GUARDRAIL_DETECTOR_DB_URL   postgresql://guardrail_detector.<logs-ref>:<pw>@<pooler-host>:6543/postgres
  MONITOR_ON_PRODUCTION_URL   the monitor's user name and password, but the ShopSmart production host:
                              postgresql://guardrail_monitor.<production-ref>:<pw>@<prod-pooler-host>:6543/postgres

The checks write only clearly marked test rows (id starting with "verify-"); the owner can delete them.
"""
from __future__ import annotations

import argparse
import os
import sys
import uuid
from datetime import datetime

try:
    import psycopg
except ImportError:
    sys.exit("Missing package. Run:  pip install -r tools/requirements.txt")

RESULTS: list[tuple[str, str, str, str]] = []  # (role, check, expected, outcome)


def connect(url: str):
    return psycopg.connect(url, autocommit=True, prepare_threshold=None, connect_timeout=15)


def expect(role: str, check: str, url: str, sql: str, params=(), should_work=True):
    try:
        with connect(url) as conn, conn.cursor() as cur:
            cur.execute(sql, params)
            ok = True
            detail = f"ok ({cur.rowcount} rows)" if cur.rowcount >= 0 else "ok"
    except psycopg.Error as e:
        ok = False
        detail = (e.sqlstate or "") + " " + str(e).strip().splitlines()[0][:90]
    passed = ok == should_work
    RESULTS.append((role, check, "allowed" if should_work else "refused", ("PASS" if passed else "FAIL") + " - " + detail))


def expect_connect_fails(role: str, check: str, url: str):
    try:
        with connect(url) as conn, conn.cursor() as cur:
            cur.execute("select current_user")
            RESULTS.append((role, check, "refused", f"FAIL - connected as {cur.fetchone()[0]}"))
    except psycopg.Error as e:
        RESULTS.append((role, check, "refused", "PASS - " + str(e).strip().splitlines()[0][:100]))


def main():
    ap = argparse.ArgumentParser(description="Verify GuardRail logs database access rules.")
    ap.add_argument("--ingest-url", default=os.environ.get("GUARDRAIL_INGEST_DB_URL"))
    ap.add_argument("--monitor-url", default=os.environ.get("GUARDRAIL_MONITOR_DB_URL"))
    ap.add_argument("--detector-url", default=os.environ.get("GUARDRAIL_DETECTOR_DB_URL"))
    ap.add_argument("--monitor-on-production-url", default=os.environ.get("MONITOR_ON_PRODUCTION_URL"))
    ap.add_argument("--report", default="access-report.md")
    args = ap.parse_args()

    tag = "verify-" + uuid.uuid4().hex[:10]
    ins_activity = ("insert into guardrail.activity_logs (id, logged_at, service, level, kind, message, source_file, line_no) "
                    "values (%s, now(), 'customer-service', 'INFO', 'system', 'access check', 'verify', 1) on conflict do nothing")
    ins_db = ("insert into guardrail.database_logs (id, logged_at, service, level, event, schema_change, schema_column, "
              "db_table, classification, registered, message, source_file, line_no) values (%s, now(), 'customer-service', "
              "'INFO', 'db_schema_change', 'column_added', 'verify_col', 'customers', 'unregistered', false, 'access check', 'verify', 1) "
              "on conflict do nothing")

    if args.ingest_url:
        r = "guardrail_ingest"
        expect(r, "insert activity log", args.ingest_url, ins_activity, (tag + "-a",))
        expect(r, "insert same event again (idempotent, no error)", args.ingest_url, ins_activity, (tag + "-a",))
        expect(r, "insert database log (schema change)", args.ingest_url, ins_db, (tag + "-d",))
        expect(r, "read activity logs", args.ingest_url, "select 1 from guardrail.activity_logs limit 1", should_work=False)
        expect(r, "update a log row", args.ingest_url, "update guardrail.activity_logs set level = 'X' where id = %s", (tag + "-a",), False)
        expect(r, "delete a log row", args.ingest_url, "delete from guardrail.activity_logs where id = %s", (tag + "-a",), False)
        expect(r, "create a table", args.ingest_url, "create table guardrail.verify_tmp (x int)", should_work=False)
    if args.monitor_url:
        r = "guardrail_monitor"
        expect(r, "read activity_logs", args.monitor_url, "select count(*) from guardrail.activity_logs")
        expect(r, "read database_logs", args.monitor_url, "select count(*) from guardrail.database_logs")
        expect(r, "read view all_logs", args.monitor_url, "select count(*) from guardrail.all_logs")
        expect(r, "read view activity_order_service", args.monitor_url, "select count(*) from guardrail.activity_order_service")
        expect(r, "read view database_customer_service", args.monitor_url, "select count(*) from guardrail.database_customer_service")
        expect(r, "read schema_change_events (filled by trigger)", args.monitor_url,
               "select 1 from guardrail.schema_change_events where source_log_id = %s", (tag + "-d",))
        expect(r, "read compliance_alerts", args.monitor_url, "select count(*) from guardrail.compliance_alerts")
        expect(r, "read answer key violation_labels", args.monitor_url, "select count(*) from guardrail.violation_labels", should_work=False)
        expect(r, "insert a log row", args.monitor_url, ins_activity, (tag + "-m",), False)
        expect(r, "update a log row", args.monitor_url, "update guardrail.activity_logs set level = 'X' where id = %s", (tag + "-a",), False)
        expect(r, "delete a log row", args.monitor_url, "delete from guardrail.activity_logs where id = %s", (tag + "-a",), False)
        expect(r, "insert an alert", args.monitor_url,
               "insert into guardrail.compliance_alerts (rule_id, rule_type, severity, description) values ('x','other','low','x')", should_work=False)
        expect(r, "change a view", args.monitor_url,
               "create or replace view guardrail.all_logs as select 1 as x", should_work=False)
        expect(r, "create a table", args.monitor_url, "create table guardrail.verify_tmp (x int)", should_work=False)
        expect(r, "drop a table", args.monitor_url, "drop table guardrail.activity_logs", should_work=False)
    if args.detector_url:
        r = "guardrail_detector"
        expect(r, "read activity logs", args.detector_url, "select count(*) from guardrail.activity_logs")
        expect(r, "create an alert", args.detector_url,
               "insert into guardrail.compliance_alerts (rule_id, rule_type, severity, description, event_ref, is_demo) "
               "values ('verify.access', 'other', 'low', 'access check', %s, true)", (tag + "-a",))
        expect(r, "mark an event processed", args.detector_url,
               "update guardrail.activity_logs set processing_status = 'processed' where id = %s", (tag + "-a",))
        expect(r, "change a log message", args.detector_url,
               "update guardrail.activity_logs set message = 'tampered' where id = %s", (tag + "-a",), False)
        expect(r, "delete a log row", args.detector_url, "delete from guardrail.activity_logs where id = %s", (tag + "-a",), False)
        expect(r, "read answer key violation_labels", args.detector_url, "select count(*) from guardrail.violation_labels", should_work=False)
    if args.monitor_on_production_url:
        expect_connect_fails("guardrail_monitor", "log in to the ShopSmart production database", args.monitor_on_production_url)

    if not RESULTS:
        sys.exit("Nothing to check: set at least one of the URLs (see --help).")
    passed = sum(1 for r in RESULTS if r[3].startswith("PASS"))
    lines = [f"# GuardRail access check", "", f"Run at {datetime.now().astimezone().isoformat(timespec='seconds')}. "
             f"{passed} of {len(RESULTS)} checks passed.", "", "| Role | Check | Expected | Result |", "|---|---|---|---|"]
    lines += [f"| {a} | {b} | {c} | {d.replace('|', '/')} |" for a, b, c, d in RESULTS]
    lines += ["", f"Test rows written by this run have ids starting with `{tag}`."]
    with open(args.report, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    for a, b, c, d in RESULTS:
        print(f"{d[:4]}  {a:19} {b:48} expected {c}")
    print(f"\n{passed}/{len(RESULTS)} passed. Report: {args.report}")
    sys.exit(0 if passed == len(RESULTS) else 1)


if __name__ == "__main__":
    main()
