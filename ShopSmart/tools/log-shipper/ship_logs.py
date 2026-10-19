#!/usr/bin/env python3
"""
ShopSmart -> GuardRail log shipper. Sends every new ShopSmart log line to the GuardRail Compliance
Logs project (a separate Supabase project) within a few seconds. It never connects to ShopSmart's
production database.

Watches backend/logs/ and inserts into the guardrail schema (supabase/guardrail-logs/01-schema.sql):
  <service>.log            -> guardrail.activity_logs     (website and application activity)
  <service>-db.log         -> guardrail.database_logs     (SQL metadata and schema changes)
  ground-truth/*.jsonl     -> guardrail.violation_labels  (answer key for the demo switches)

Privacy before sending:
  * Customer and admin ids are replaced by pseudonyms (salted hash), e.g. customer:12 -> cust_3f9a1c0b7d21.
  * Emails, phone numbers, Aadhaar, PAN and card-like numbers are masked in every event that is NOT a
    marked synthetic demo event; the event records which kinds were masked (pii_masked, masked_pii_types).
  * Marked demo events (demo=true synthetic=true) keep their fictional values so the detector can be tested.

Reliability: positions are saved only after a successful commit (shipper-state.json); failures are
retried with backoff and reported on screen and in shipper-status.json; event ids make re-sends no-ops.

Run:  set GUARDRAIL_INGEST_DB_URL=postgresql://guardrail_ingest.<logs-project-ref>@<pooler-host>:6543/postgres?sslmode=require
      set GUARDRAIL_INGEST_PASSWORD=<password of guardrail_ingest>
      python tools/log-shipper/ship_logs.py
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import re
import secrets
import sys
import time
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from export_logs import LINE, fields_of, parse_time  # noqa: E402  (shared parser)

try:
    import psycopg
    from psycopg.types.json import Jsonb
except ImportError:  # pragma: no cover
    sys.exit("Missing package. Run:  pip install -r tools/requirements.txt")

CONSENT_EVENTS = {"consent_recorded", "terms_accepted", "consent_given", "consent_withdrawn", "erasure_requested", "retention_erasure",
                  "retention_sweep", "retention_overdue", "login_account_erased"}
SECURITY_HINTS = ("signature_invalid", "mismatch", "AUTH_", "login", "unauthor", "forbidden")

# Masking rules: (Presidio-style type, pattern, replacement). Numbers inside ids, trace ids and
# timestamps are not touched: a match may not touch a letter, digit, "-" or "_".
EDGE_L, EDGE_R = r"(?<![\w-])", r"(?![\w-])"
PII_PATTERNS = [
    ("EMAIL_ADDRESS", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+"), "[EMAIL]"),
    ("IN_AADHAAR", re.compile(EDGE_L + r"[2-9]\d{3}[ ]?\d{4}[ ]?\d{4}" + EDGE_R), "[AADHAAR]"),
    ("PHONE_NUMBER", re.compile(EDGE_L + r"(?:\+91[ -]?)?[6-9]\d{9}" + EDGE_R), "[PHONE]"),
    ("IN_PAN", re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b"), "[PAN]"),
]
CARD = re.compile(EDGE_L + r"(?:\d[ -]?){12,18}\d" + EDGE_R)


def luhn_ok(digits: str) -> bool:
    total, alt = 0, False
    for ch in reversed(digits):
        d = int(ch)
        if alt:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
        alt = not alt
    return total % 10 == 0

ID_REF = re.compile(r"\b(customer|admin|auth-user):(\d+)\b")
ROUTE_ID = re.compile(r"/\d+(?=/|$)")

ACTIVITY_SQL = """insert into guardrail.activity_logs
 (id, logged_at, service, level, kind, event, trace_id, http_method, route, http_status, duration_ms, actor_type,
  actor_ref, data_category, purpose, consent_status, severity, risk_indicators, is_demo, scenario, pii_masked,
  masked_pii_types, message, details, source_file, line_no)
 values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict do nothing"""
DATABASE_SQL = """insert into guardrail.database_logs
 (id, logged_at, service, level, event, trace_id, operation, db_table, tables, data_category, personal_data,
  row_count, duration_ms, slow, status, sql_state, query_fingerprint, sql_template, schema_change, schema_column,
  column_type, classification, registered, is_demo, scenario, message, details, source_file, line_no)
 values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict do nothing"""
LABEL_SQL = """insert into guardrail.violation_labels
 (id, recorded_at, service, violation_type, pii_types, trace_id, subject_ref, log_stream, logger, message_sha256, detail)
 values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) on conflict do nothing"""


def to_int(v):
    try:
        return int(str(v))
    except (TypeError, ValueError):
        return None


def to_bool(v):
    if isinstance(v, bool):
        return v
    if v is None:
        return None
    return str(v).lower() == "true"


def kind_of(level: str, event: str | None, fields: dict) -> str:
    if event == "http_request":
        return "request"
    if event in CONSENT_EVENTS or event in ("marketing_message_sent",) and fields.get("consentStatus") not in (None, "granted"):
        return "consent"
    if "dataCategory" in fields and "eventType" in fields:
        return "privacy"
    if event and any(h.lower() in event.lower() for h in SECURITY_HINTS):
        return "security"
    if level in ("ERROR", "WARN") or event in ("api_error", "api_unavailable", "data_conflict"):
        return "error"
    if event:
        return "business"
    return "system"


class Privacy:
    """Pseudonymisation and masking applied to every event before it leaves ShopSmart."""

    def __init__(self, salt: bytes):
        self.salt = salt

    def pseudonym(self, kind: str, number: str) -> str:
        prefix = {"customer": "cust", "admin": "adm", "auth-user": "usr"}[kind]
        return prefix + "_" + hmac.new(self.salt, f"{kind}:{number}".encode(), hashlib.sha256).hexdigest()[:12]

    def pseudonymise(self, text: str) -> str:
        return ID_REF.sub(lambda m: self.pseudonym(m.group(1), m.group(2)), text)

    @staticmethod
    def mask(text: str) -> tuple[str, list[str]]:
        found = []

        def card(m):
            digits = re.sub(r"\D", "", m.group(0))
            if 13 <= len(digits) <= 19 and luhn_ok(digits):
                found.append("CREDIT_CARD") if "CREDIT_CARD" not in found else None
                return "[CARD]"
            return m.group(0)

        text = CARD.sub(card, text)
        for name, pattern, repl in PII_PATTERNS:
            text, n = pattern.subn(repl, text)
            if n:
                found.append(name)
        return text, found

    def clean_fields(self, value, masking: bool, found: set):
        if isinstance(value, dict):
            return {k: self.clean_fields(v, masking, found) for k, v in value.items()}
        if isinstance(value, list):
            return [self.clean_fields(v, masking, found) for v in value]
        if isinstance(value, str):
            value = self.pseudonymise(value)
            if masking:
                value, kinds = self.mask(value)
                found.update(kinds)
        return value


class Record:
    __slots__ = ("file", "line", "header", "extra", "start")

    def __init__(self, file: str, line: int, header, extra: list[str], start: int):
        self.file, self.line, self.header, self.extra, self.start = file, line, header, extra, start

    def row(self, stream: str, privacy: Privacy):
        m = self.header
        raw = m["msg"] + ("\n" + "\n".join(self.extra) if self.extra else "")
        f = fields_of(m["msg"])
        service = f.get("service") or m["app"] or Path(self.file).stem.removesuffix("-db")
        rid = hashlib.sha1(f"{self.file}|{self.line}|{m['ts']}|{raw}".encode("utf-8")).hexdigest()
        ts = parse_time(m["ts"])
        event = f.get("event") or f.get("eventType")
        details = f.get("details")
        trace = f.get("traceId") or (details.get("traceId") if isinstance(details, dict) else None)
        level = m["level"]
        is_demo = to_bool(f.get("demo")) is True
        synthetic = is_demo and to_bool(f.get("synthetic")) is True
        scenario = f.get("scenario") if is_demo else None

        # Privacy: pseudonymise ids everywhere; mask PII unless this is a marked synthetic demo event.
        found: set[str] = set()
        message = privacy.pseudonymise(raw)
        if not synthetic:
            message, kinds = privacy.mask(message)
            found.update(kinds)
        clean = privacy.clean_fields(f, not synthetic, found)
        clean["rawMessageSha256"] = hashlib.sha256(m["msg"].encode("utf-8")).hexdigest()
        masked_types = sorted(found)

        if stream == "db":
            return ("db", (rid, ts, service, level, event, trace, f.get("dbOperation"), f.get("table"), f.get("tables"),
                           f.get("dataCategory"), to_bool(f.get("personalData")), to_int(f.get("rows")),
                           to_int(f.get("durationMs")), to_bool(f.get("slow")), f.get("status"), f.get("sqlState"),
                           f.get("queryFingerprint"), clean.get("sqlTemplate"), f.get("change"), f.get("column"),
                           f.get("columnType"), f.get("classification"), to_bool(f.get("registered")),
                           is_demo, scenario, message, Jsonb(clean), self.file, self.line))

        actor_raw = f.get("actorRef") or f.get("actor") or f.get("customerRef")
        actor_ref = privacy.pseudonymise(actor_raw) if isinstance(actor_raw, str) else None
        actor_type = ("customer" if actor_ref and actor_ref.startswith("cust_") else
                      "admin" if actor_ref and actor_ref.startswith("adm_") else
                      "system" if (trace or "").startswith("retention-") or trace == "none" else
                      "anonymous" if event == "http_request" else None)
        route = ROUTE_ID.sub("/{id}", f["path"]) if isinstance(f.get("path"), str) else None
        consent = f.get("consentStatus")
        indicators = []
        if masked_types:
            indicators.append("pii_pattern_masked")
        if synthetic and event == "demo_debug_dump":
            indicators.append("pii_in_log_message")
        if f.get("purposeAllowed") == "false":
            indicators.append("purpose_not_consented")
        if event == "retention_overdue" or f.get("action") == "skipped":
            indicators.append("retention_deadline_passed")
        if f.get("classification") == "unregistered":
            indicators.append("unregistered_column")
        if f.get("dataCategory") in ("personal_data", "credentials", "financial", "contact", "customer_profile"):
            indicators.append("personal_data_category")
        if is_demo:
            indicators.append("demo_event")
        high = {"pii_pattern_masked", "pii_in_log_message", "purpose_not_consented", "retention_deadline_passed"}
        severity = ("high" if high & set(indicators) else
                    "medium" if "unregistered_column" in indicators or level == "ERROR" else
                    "low" if level == "WARN" else "info")
        return ("activity", (rid, ts, service, level, kind_of(level, event, f), event, trace, f.get("method"), route,
                             to_int(f.get("status")), to_int(f.get("durationMs")), actor_type, actor_ref,
                             f.get("dataCategory"), f.get("purpose"), consent, severity, indicators, is_demo, scenario,
                             bool(masked_types), masked_types, message, Jsonb(clean), self.file, self.line))


class Shipper:
    def __init__(self, args):
        self.args = args
        self.logs = Path(args.logs)
        self.state_path = Path(args.state)
        self.state = self.load_state()          # positions saved on disk (everything before them is in Supabase)
        self.read_pos = {k: dict(v) for k, v in self.state.items()}  # how far this run has read
        self.pending: dict[str, Record] = {}      # last record of each file, held until it is complete
        self.waiting_since: dict[str, float] = {}  # when each waiting record last grew
        self.conn = None
        self.sent = {"activity": 0, "db": 0, "labels": 0}
        self.privacy = Privacy(self.load_salt())
        self.status_path = self.state_path.with_name("shipper-status.json")

    def load_salt(self) -> bytes:
        env = os.environ.get("GUARDRAIL_PSEUDONYM_SALT")
        if env:
            return env.encode()
        path = self.state_path.with_name("pseudonym-salt.txt")
        if not path.exists():
            path.write_text(secrets.token_hex(32), encoding="utf-8")
        return path.read_text(encoding="utf-8").strip().encode()

    def write_status(self, ok: bool, error: str | None = None):
        try:
            prev = json.loads(self.status_path.read_text(encoding="utf-8")) if self.status_path.exists() else {}
        except ValueError:
            prev = {}
        now = datetime.now().astimezone().isoformat(timespec="seconds")
        status = {**prev, "updatedAt": now, "sent": self.sent, "healthy": ok}
        if ok:
            status["lastSuccessAt"] = now
            status.pop("lastError", None)
        else:
            status["lastError"] = error
            status["lastErrorAt"] = now
            status["failures"] = prev.get("failures", 0) + 1
        self.status_path.write_text(json.dumps(status, indent=1), encoding="utf-8")

    def load_state(self) -> dict:
        try:
            return json.loads(self.state_path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def save_state(self):
        tmp = self.state_path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.state, indent=1), encoding="utf-8")
        os.replace(tmp, self.state_path)

    def connect(self):
        kwargs = {"autocommit": False, "prepare_threshold": None, "connect_timeout": 15}
        if os.environ.get("GUARDRAIL_INGEST_PASSWORD"):
            kwargs["password"] = os.environ["GUARDRAIL_INGEST_PASSWORD"]
        self.conn = psycopg.connect(self.args.db_url, **kwargs)

    # ---------------------------------------------------------------- reading
    def read_new(self, path: Path):
        key = path.name if path.parent == self.logs else f"ground-truth/{path.name}"
        st = self.read_pos.get(key, {"offset": 0, "line": 0})
        size = path.stat().st_size
        if size < st["offset"]:  # file was rotated or truncated: start again
            st = {"offset": 0, "line": 0}
            self.pending.pop(key, None)
        if size == st["offset"]:
            return key, st, []
        with path.open("rb") as fh:
            fh.seek(st["offset"])
            data = fh.read(min(size - st["offset"], 8 * 1024 * 1024))
        end = data.rfind(b"\n")
        if end < 0:
            return key, st, []
        numbered, pos, n = [], st["offset"], st["line"]
        for raw in data[:end + 1].split(b"\n")[:-1]:
            n += 1
            numbered.append((n, raw.decode("utf-8", errors="replace").rstrip("\r"), pos))
            pos += len(raw) + 1
        return key, {"offset": pos, "line": n}, numbered

    def records(self, key: str, numbered: list[tuple[int, str, int]]) -> list[Record]:
        if not numbered:
            return []  # nothing new: a waiting record stays waiting (flush_idle sends it later)
        out = []
        current = self.pending.pop(key, None)
        for n, line, start in numbered:
            m = LINE.match(line)
            if m:
                if current:
                    out.append(current)
                current = Record(key, n, m, [], start)
            elif current is not None and line.strip():
                current.extra.append(line)
        if current:
            self.pending[key] = current
            self.waiting_since[key] = time.time()
        return out

    def flush_idle(self, force: bool = False) -> list[tuple[str, "Record"]]:
        """Sends a waiting record once its file has been quiet for 3 seconds (its stack trace is complete)."""
        done = []
        for key in list(self.pending):
            if force or time.time() - self.waiting_since.get(key, 0) >= 3:
                done.append((key, self.pending.pop(key)))
        return done

    # --------------------------------------------------------------- shipping
    def cycle(self, force_flush: bool = False):
        activity, db, labels, new_states = [], [], [], {}
        for path in sorted(self.logs.glob("*.log")):
            key, st, numbered = self.read_new(path)
            new_states[key] = st
            stream = "db" if path.stem.endswith("-db") else "app"
            for rec in self.records(key, numbered):
                kind, row = rec.row(stream, self.privacy)
                (db if kind == "db" else activity).append(row)
        for key, rec in self.flush_idle(force_flush):
            kind, row = rec.row("db" if key.endswith("-db.log") else "app", self.privacy)
            (db if kind == "db" else activity).append(row)
        gt = self.logs / "ground-truth"
        if gt.is_dir():
            for path in sorted(gt.glob("*.jsonl")):
                key, st, numbered = self.read_new(path)
                new_states[key] = st
                for _, raw, _start in numbered:
                    try:
                        lab = json.loads(raw)
                    except ValueError:
                        continue
                    labels.append((lab.get("id"), parse_time(lab.get("recordedAt") or ""), lab.get("service"),
                                   lab.get("violationType"), lab.get("piiTypes") or [], lab.get("traceId"),
                                   self.privacy.pseudonymise(lab.get("subjectRef") or "") or None,
                                   lab.get("logStream"), lab.get("logger"),
                                   lab.get("messageSha256"), lab.get("detail")))
        if activity or db or labels:
            with self.conn.cursor() as cur:
                for sql, rows in ((ACTIVITY_SQL, activity), (DATABASE_SQL, db), (LABEL_SQL, labels)):
                    for i in range(0, len(rows), 500):
                        cur.executemany(sql, rows[i:i + 500])
            self.conn.commit()
            self.sent["activity"] += len(activity)
            self.sent["db"] += len(db)
            self.sent["labels"] += len(labels)
        self.read_pos.update(new_states)
        # Saved position: everything before it is in Supabase. A record still waiting for its
        # last lines is re-read after a restart (its id makes the insert a no-op if it was sent).
        for key, pos in self.read_pos.items():
            rec = self.pending.get(key)
            self.state[key] = {"offset": rec.start, "line": rec.line - 1} if rec else dict(pos)
        self.save_state()

    def run(self):
        if not self.logs.is_dir():
            sys.exit(f"Log folder not found: {self.logs}. Start the backend first.")
        print(f"[{datetime.now():%H:%M:%S}] Shipping {self.logs} to GuardRail every {self.args.interval}s (Ctrl+C to stop)")
        last_report, backoff = time.time(), 2
        while True:
            try:
                if self.conn is None or self.conn.closed:
                    self.connect()
                    print(f"[{datetime.now():%H:%M:%S}] Connected to the GuardRail logs database")
                    backoff = 2
                self.cycle()
                self.write_status(True)
                if self.args.once:
                    self.cycle(force_flush=True)
                    self.write_status(True)
                    break
            except KeyboardInterrupt:
                break
            except (psycopg.Error, OSError) as exc:
                print(f"[{datetime.now():%H:%M:%S}] DELIVERY FAILED ({exc.__class__.__name__}: {str(exc).strip()[:160]}). "
                      f"Retrying in {backoff}s; nothing is lost.")
                self.write_status(False, f"{exc.__class__.__name__}: {str(exc).strip()[:300]}")
                if self.args.once:
                    sys.exit(1)
                try:
                    if self.conn:
                        self.conn.close()
                except psycopg.Error:
                    pass
                self.conn = None
                self.state = self.load_state()  # re-read from the last committed position
                self.read_pos = {k: dict(v) for k, v in self.state.items()}
                self.pending.clear()
                time.sleep(backoff)
                backoff = min(backoff * 2, 60)
                continue
            if time.time() - last_report >= 30:
                print(f"[{datetime.now():%H:%M:%S}] sent activity={self.sent['activity']} database={self.sent['db']} "
                      f"labels={self.sent['labels']}")
                last_report = time.time()
            time.sleep(self.args.interval)
        print(f"Done. Sent activity={self.sent['activity']} database={self.sent['db']} labels={self.sent['labels']}")


def main():
    root = Path(__file__).resolve().parents[2]
    ap = argparse.ArgumentParser(description="Send ShopSmart logs to Supabase continuously.")
    ap.add_argument("--logs", default=str(root / "backend" / "logs"))
    ap.add_argument("--db-url", default=os.environ.get("GUARDRAIL_INGEST_DB_URL"),
                    help="GuardRail logs project connection string for guardrail_ingest (or set GUARDRAIL_INGEST_DB_URL)")
    ap.add_argument("--interval", type=float, default=2.0, help="seconds between checks (default 2)")
    ap.add_argument("--state", default=str(Path(__file__).with_name("shipper-state.json")))
    ap.add_argument("--once", action="store_true", help="send what is there now and exit")
    args = ap.parse_args()
    if not args.db_url:
        sys.exit("Set GUARDRAIL_INGEST_DB_URL (GuardRail logs project > Connect > Transaction pooler, user guardrail_ingest.<ref>).")
    Shipper(args).run()


if __name__ == "__main__":
    main()
