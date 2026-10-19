#!/usr/bin/env python3
"""
Export ShopSmart logs as JSONL for the GuardRail compliance agent.

Reads every log file in backend/logs/ (general logs <service>.log and DB logs <service>-db.log)
plus the answer key in backend/logs/ground-truth/, and writes to exports/<timestamp>/:

  events.jsonl   one JSON object per log record (what the agent should analyse)
  labels.jsonl   the injected violations, each linked to the event ids it produced
                 (keep this away from the agent; use it to score detections)
  summary.json   counts per service, stream, event type and violation type

Usage:
  python tools/export_logs.py
  python tools/export_logs.py --logs backend/logs --out exports --since 2026-10-14T15:00
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

# 2026-10-14T10:00:36.382+05:30  INFO 75757 --- [analytics-service] [           main] c.s.a.AnalyticsserviceApplication        : message
LINE = re.compile(
    r"^(?P<ts>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s+"
    r"(?P<level>TRACE|DEBUG|INFO|WARN|ERROR)\s+(?P<pid>\d+)\s+---\s+"
    r"(?:\[(?P<app>[^\]]*)\]\s+)?\[\s*(?P<thread>[^\]]*)\]\s+(?:\[[^\]]*\]\s+)?"
    r"(?P<logger>\S+)\s*:\s(?P<msg>.*)$")
KV = re.compile(r"(?<![\w.])([A-Za-z][\w.]*)=(\"[^\"]*\"|[^\s,]+)")


def parse_time(ts: str) -> datetime | None:
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except ValueError:
        return None


def fields_of(message: str) -> dict:
    stripped = message.strip()
    if stripped.startswith("{") and stripped.endswith("}"):
        try:
            data = json.loads(stripped)
            if isinstance(data, dict):
                return {k: v for k, v in data.items() if isinstance(v, (str, int, float, bool)) or v is None}
        except ValueError:
            pass
    details = None
    idx = message.find("details={")
    if idx >= 0:
        try:
            details = json.loads(message[idx + len("details="):])
        except ValueError:
            details = None
        message = message[:idx]
    out = {k: v.strip('"') for k, v in KV.findall(message)}
    if isinstance(details, dict):
        out["details"] = details
    return out


def read_events(log_dir: Path, since: datetime | None):
    files = sorted(p for p in log_dir.glob("*.log") if p.is_file())
    if not files:
        sys.exit(f"No .log files found in {log_dir}. Start the backend first (logs are written there).")
    events = []
    for path in files:
        stream = "db" if path.stem.endswith("-db") else "app"
        service_from_file = path.stem[:-3] if stream == "db" else path.stem
        current = None
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            for n, raw in enumerate(fh, 1):
                line = raw.rstrip("\r\n")
                m = LINE.match(line)
                if not m:
                    if current is not None and line.strip():
                        current["message"] += "\n" + line  # stack trace or multi-line message
                    continue
                ts = parse_time(m["ts"])
                if since and ts and ts < since:
                    current = None
                    continue
                msg = m["msg"]
                f = fields_of(msg)
                current = {
                    "id": f"{path.name}:{n}",
                    "timestamp": m["ts"],
                    "level": m["level"],
                    "service": f.get("service") or m["app"] or service_from_file,
                    "stream": stream,
                    "sourceFile": path.name,
                    "line": n,
                    "pid": int(m["pid"]),
                    "thread": m["thread"].strip(),
                    "logger": m["logger"],
                    "event": f.get("event") or f.get("eventType"),
                    "traceId": f.get("traceId") or (f.get("details") or {}).get("traceId"),
                    "message": msg,
                    "fields": f,
                    "_sha": hashlib.sha256(msg.encode("utf-8")).hexdigest(),
                    "_dt": ts,
                }
                events.append(current)
    return events


def read_labels(log_dir: Path):
    labels = []
    for path in sorted((log_dir / "ground-truth").glob("*.jsonl")):
        with path.open("r", encoding="utf-8", errors="replace") as fh:
            for raw in fh:
                raw = raw.strip()
                if raw:
                    try:
                        labels.append(json.loads(raw))
                    except ValueError:
                        pass
    return labels


def link_labels(labels, events, since):
    by_sha = defaultdict(list)
    for e in events:
        by_sha[e["_sha"]].append(e)

    def near(pred, at: datetime | None, window: float):
        if at is None:
            return []
        lo, hi = at - timedelta(seconds=window), at + timedelta(seconds=window)
        return [e for e in events if e["_dt"] and lo <= e["_dt"] <= hi and pred(e)]

    out = []
    for lab in labels:
        at = parse_time(lab.get("recordedAt", ""))
        if since and at and at < since.astimezone(at.tzinfo):
            continue
        kind = lab.get("violationType")
        if kind in ("SCENARIO_STARTED", "SCENARIO_STOPPED"):
            out.append({**lab, "matchedEventIds": []})
            continue
        matched = []
        if lab.get("messageSha256"):
            matched = [e for e in by_sha.get(lab["messageSha256"], []) if e["service"] == lab.get("service")]
            if len(matched) > 1 and at:  # the same text logged twice: take the closest in time
                matched = [min(matched, key=lambda e: abs((e["_dt"] - at).total_seconds()) if e["_dt"] else 1e9)]
        elif kind == "OUT_OF_SCOPE_PROCESSING":
            ref = lab.get("subjectRef")
            matched = near(lambda e: e["event"] == "marketing_message_sent" and e["fields"].get("customerRef") == ref, at, 5)[:1]
        elif kind == "RETENTION_EXCEEDED":
            matched = near(lambda e: e["event"] == "retention_sweep" and e["fields"].get("action") == "skipped", at, 5)[:1]
        elif kind == "SCHEMA_DRIFT":
            matched = near(lambda e: e["service"] == lab.get("service") and (
                ("alter table customers" in e["message"].lower() and "alternate_mobile" in e["message"].lower())
                or (e["stream"] == "db" and e["fields"].get("dbOperation") == "ALTER" and e["fields"].get("table") == "customers")
                or (e["event"] == "db_schema_change" and e["fields"].get("column") == "alternate_mobile"
                    and e["fields"].get("change") == "column_added")), at, 70)
        out.append({**lab, "matchedEventIds": [e["id"] for e in matched]})
    return out


SQL_SCHEMA = """-- ShopSmart logs for MySQL. Load with:
--   mysql -u root -p -P 33006 < logs.sql      (or MySQL Workbench: File > Run SQL Script)
-- Re-loading the same export is safe: rows already present are skipped.
CREATE DATABASE IF NOT EXISTS shopsmart_logs CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE shopsmart_logs;

CREATE TABLE IF NOT EXISTS log_events (
  id            CHAR(40)     NOT NULL PRIMARY KEY COMMENT 'hash of file, line, time and message',
  event_ref     VARCHAR(120) NOT NULL COMMENT 'file:line in the export',
  logged_at     DATETIME(3)  NULL     COMMENT 'local time of the log line',
  level         VARCHAR(5)   NOT NULL,
  service       VARCHAR(60)  NOT NULL COMMENT 'which microservice wrote the line',
  stream        VARCHAR(4)   NOT NULL COMMENT 'app = general log, db = database log',
  event         VARCHAR(80)  NULL,
  trace_id      VARCHAR(120) NULL,
  logger        VARCHAR(200) NULL,
  thread        VARCHAR(60)  NULL,
  source_file   VARCHAR(80)  NOT NULL,
  line_no       INT          NOT NULL,
  message       MEDIUMTEXT   NOT NULL,
  fields_json   MEDIUMTEXT   NULL     COMMENT 'parsed key=value pairs as JSON',
  db_operation  VARCHAR(20)  NULL     COMMENT 'DB log: SELECT, INSERT, ...',
  db_table      VARCHAR(80)  NULL     COMMENT 'DB log: main table',
  data_category VARCHAR(40)  NULL     COMMENT 'DB log: personal_data, credentials, ...',
  KEY idx_service (service), KEY idx_event (event), KEY idx_trace (trace_id), KEY idx_time (logged_at),
  KEY idx_category (data_category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Answer key for the demo violations. Use it to score GuardRail; do not give it to the agent.
CREATE TABLE IF NOT EXISTS log_violation_labels (
  id                 VARCHAR(40)  NOT NULL PRIMARY KEY,
  recorded_at        VARCHAR(40)  NULL,
  service            VARCHAR(60)  NULL,
  violation_type     VARCHAR(40)  NULL,
  pii_types          VARCHAR(200) NULL,
  trace_id           VARCHAR(120) NULL,
  subject_ref        VARCHAR(80)  NULL,
  detail             TEXT         NULL,
  matched_event_refs TEXT         NULL,
  KEY idx_type (violation_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
"""


def sql_str(value) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "1" if value else "0"
    if isinstance(value, (int, float)):
        return str(value)
    text = str(value)
    text = (text.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
            .replace("\r", "\\r").replace("\x00", "\\0").replace("\x1a", "\\Z"))
    return "'" + text + "'"


def write_sql(path: Path, events, labels):
    with path.open("w", encoding="utf-8") as fh:
        fh.write(SQL_SCHEMA)
        cols = ("id, event_ref, logged_at, level, service, stream, event, trace_id, logger, thread, source_file, "
                "line_no, message, fields_json, db_operation, db_table, data_category")
        for start in range(0, len(events), 300):
            rows = []
            for e in events[start:start + 300]:
                key = hashlib.sha1(f"{e['sourceFile']}|{e['line']}|{e['timestamp']}|{e['message']}".encode("utf-8")).hexdigest()
                dt = e["_dt"].strftime("%Y-%m-%d %H:%M:%S.%f")[:-3] if e["_dt"] else None
                f = e["fields"]
                rows.append("(" + ", ".join(sql_str(v) for v in (
                    key, e["id"], dt, e["level"], (e["service"] or "")[:60], e["stream"], (e["event"] or None) and str(e["event"])[:80],
                    (e["traceId"] or None) and str(e["traceId"])[:120], e["logger"][:200], e["thread"][:60], e["sourceFile"][:80],
                    e["line"], e["message"], json.dumps(f, ensure_ascii=False),
                    f.get("dbOperation") if e["stream"] == "db" else None,
                    (f.get("table") if e["stream"] == "db" else None),
                    (f.get("dataCategory") if e["stream"] == "db" else None))) + ")")
            fh.write(f"INSERT IGNORE INTO log_events ({cols}) VALUES\n" + ",\n".join(rows) + ";\n")
        lab_rows = []
        for lab in labels:
            lab_rows.append("(" + ", ".join(sql_str(v) for v in (
                lab.get("id"), lab.get("recordedAt"), lab.get("service"), lab.get("violationType"),
                ",".join(lab.get("piiTypes") or []), lab.get("traceId"), lab.get("subjectRef"), lab.get("detail"),
                ",".join(lab.get("matchedEventIds") or []))) + ")")
        for start in range(0, len(lab_rows), 300):
            fh.write("INSERT IGNORE INTO log_violation_labels (id, recorded_at, service, violation_type, pii_types, trace_id, "
                     "subject_ref, detail, matched_event_refs) VALUES\n" + ",\n".join(lab_rows[start:start + 300]) + ";\n")


def main():
    root = Path(__file__).resolve().parent.parent
    ap = argparse.ArgumentParser(description="Export ShopSmart logs as JSONL with an answer key.")
    ap.add_argument("--logs", default=str(root / "backend" / "logs"), help="log folder (default backend/logs)")
    ap.add_argument("--out", default=str(root / "exports"), help="output folder (default exports/)")
    ap.add_argument("--since", help="only records at or after this time, e.g. 2026-10-14T15:00 (local time)")
    args = ap.parse_args()

    log_dir = Path(args.logs)
    since = None
    if args.since:
        since = datetime.fromisoformat(args.since)
        if since.tzinfo is None:
            since = since.astimezone()
    events = read_events(log_dir, since)
    labels = link_labels(read_labels(log_dir), events, since)

    out_dir = Path(args.out) / datetime.now().strftime("%Y%m%d-%H%M%S")
    out_dir.mkdir(parents=True, exist_ok=True)
    with (out_dir / "events.jsonl").open("w", encoding="utf-8") as fh:
        for e in events:
            fh.write(json.dumps({k: v for k, v in e.items() if not k.startswith("_")}, ensure_ascii=False) + "\n")
    with (out_dir / "labels.jsonl").open("w", encoding="utf-8") as fh:
        for lab in labels:
            fh.write(json.dumps(lab, ensure_ascii=False) + "\n")

    real = [l for l in labels if l.get("violationType") not in ("SCENARIO_STARTED", "SCENARIO_STOPPED")]
    summary = {
        "exportedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "events": len(events),
        "byService": Counter(e["service"] for e in events),
        "byStream": Counter(e["stream"] for e in events),
        "topEvents": dict(Counter(e["event"] for e in events if e["event"]).most_common(30)),
        "violations": len(real),
        "violationsByType": Counter(l["violationType"] for l in real),
        "violationsMatchedToEvents": sum(1 for l in real if l["matchedEventIds"]),
        "labelledEventIds": len({i for l in real for i in l["matchedEventIds"]}),
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    write_sql(out_dir / "logs.sql", events, labels)
    print(f"Exported {len(events)} events and {len(real)} labelled violations to {out_dir}")
    print(f"MySQL: mysql -u root -p -P 33006 < \"{out_dir / 'logs.sql'}\"   (creates database shopsmart_logs)")
    for k, v in summary["violationsByType"].items():
        print(f"  {k:26} {v}")
    unmatched = len(real) - summary["violationsMatchedToEvents"]
    if unmatched:
        print(f"  ({unmatched} labels could not be linked to a log line; they still appear in labels.jsonl)")


if __name__ == "__main__":
    main()
