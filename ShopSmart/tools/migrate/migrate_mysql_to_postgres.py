#!/usr/bin/env python3
"""
Copy ShopSmart data from the old MySQL database to the new ShopSmart production database
(Supabase PostgreSQL). MySQL is only read, never changed.

Order of work:
  1. Start the backend against Supabase once, so every service creates its tables, then stop it.
  2. Dry run (default): shows, per table, how many rows would be copied and which columns match.
       python tools/migrate/migrate_mysql_to_postgres.py
  3. Copy:
       python tools/migrate/migrate_mysql_to_postgres.py --apply --replace-target
     --replace-target first empties the Supabase tables (on a fresh project they only contain the
     automatically created catalogue and admin account). Without it, tables that already have rows
     are skipped.
  4. Start the backend again.

Connection settings (environment variables or options):
  MYSQL_HOST (localhost) MYSQL_PORT (33006) MYSQL_USER (root) MYSQL_PASSWORD MYSQL_DATABASE (shopsmart_db)
  SHOPSMART_PG_URL  postgresql://postgres.<production-ref>@<pooler-host>:6543/postgres?sslmode=require
  SHOPSMART_PG_PASSWORD

Structure: after copying, the tool compares every MySQL foreign key, unique key and index with the
PostgreSQL tables (by columns, since names differ) and lists anything missing. --add-missing-structure
creates the missing ones. MySQL tables that no ShopSmart service uses any more are listed; with
--include-unmapped they are created in PostgreSQL (types mapped, primary key kept) and copied too.

Times: Hibernate stores Instant values; --source-timezone says how the MySQL DATETIME values should be
read (default UTC). The dry run prints one sample per table so you can check before copying.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

try:
    import psycopg
    import pymysql
    import pymysql.cursors
except ImportError:
    sys.exit("Missing packages. Run:  pip install -r tools/requirements.txt")

# Parents before children. Session tokens and the demo switch table are deliberately not copied.
TABLES = [
    "auth_users", "customers", "customer_addresses", "customer_wishlist",
    "products", "product_reviews", "product_stock_adjustments",
    "inventory_reservations", "inventory_reservation_lines",
    "customer_orders", "order_line_items", "order_status_history",
    "payments", "payment_webhook_events", "notifications",
]
SKIPPED = {"auth_refresh_tokens": "sign-in sessions: customers simply sign in again",
           "demo_violation_switches": "demo harness state: recreated off"}


def convert(value, pg_type: str, tz):
    if value is None:
        return None
    if pg_type == "boolean":
        return bool(value) if not isinstance(value, (bytes, bytearray)) else value != b"\x00"
    if pg_type.startswith("timestamp") and isinstance(value, datetime):
        return value.replace(tzinfo=tz) if value.tzinfo is None else value
    if pg_type in ("jsonb", "json") and not isinstance(value, str):
        return json.dumps(value)
    if isinstance(value, (bytes, bytearray)) and pg_type in ("text", "character varying"):
        return value.decode("utf-8", "replace")
    return value


def pg_type_for(col: dict) -> str:
    """PostgreSQL type for a MySQL information_schema.COLUMNS row (used for --include-unmapped)."""
    dt, ct = col["DATA_TYPE"].lower(), col["COLUMN_TYPE"].lower()
    if ct in ("tinyint(1)", "bit(1)"):
        return "boolean"
    if dt in ("tinyint", "smallint"):
        return "smallint"
    if dt in ("int", "integer", "mediumint"):
        return "bigint" if "unsigned" in ct else "integer"
    if dt == "bigint":
        return "numeric(20)" if "unsigned" in ct else "bigint"
    if dt in ("decimal", "numeric"):
        return f"numeric({col['NUMERIC_PRECISION']},{col['NUMERIC_SCALE']})"
    if dt == "float":
        return "real"
    if dt in ("double", "real"):
        return "double precision"
    if dt in ("varchar", "char"):
        return f"varchar({col['CHARACTER_MAXIMUM_LENGTH']})"
    if dt in ("datetime", "timestamp"):
        return "timestamptz"
    if dt in ("date", "time"):
        return dt
    if dt == "json":
        return "jsonb"
    if dt in ("blob", "longblob", "mediumblob", "tinyblob", "binary", "varbinary", "bit"):
        return "bytea"
    return "text"  # text types, enum, set, year


def mysql_structure(my, database: str):
    """{table: {"fk": {(cols, ref_table, ref_cols): name}, "unique": {cols: name}, "index": {cols: name}}}"""
    out: dict[str, dict] = {}
    with my.cursor(pymysql.cursors.DictCursor) as c:
        c.execute("SELECT TABLE_NAME t, INDEX_NAME n, NON_UNIQUE nu, COLUMN_NAME col, SEQ_IN_INDEX seq "
                  "FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = %s ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX",
                  (database,))
        idx: dict[tuple, list] = {}
        meta: dict[tuple, int] = {}
        for r in c.fetchall():
            key = (r["t"].lower(), r["n"])
            idx.setdefault(key, []).append(r["col"].lower())
            meta[key] = int(r["nu"])
        c.execute("SELECT k.TABLE_NAME t, k.CONSTRAINT_NAME n, k.COLUMN_NAME col, k.REFERENCED_TABLE_NAME rt, "
                  "k.REFERENCED_COLUMN_NAME rc FROM information_schema.KEY_COLUMN_USAGE k "
                  "WHERE k.TABLE_SCHEMA = %s AND k.REFERENCED_TABLE_NAME IS NOT NULL "
                  "ORDER BY k.TABLE_NAME, k.CONSTRAINT_NAME, k.ORDINAL_POSITION", (database,))
        fks: dict[tuple, list] = {}
        for r in c.fetchall():
            fks.setdefault((r["t"].lower(), r["n"], r["rt"].lower()), []).append((r["col"].lower(), r["rc"].lower()))
    fk_names = {n for (_, n, _) in fks}
    for (t, n), cols in idx.items():
        entry = out.setdefault(t, {"fk": {}, "unique": {}, "index": {}})
        if n == "PRIMARY":
            continue
        if meta[(t, n)] == 0:
            entry["unique"][tuple(cols)] = n
        elif n not in fk_names:  # MySQL adds an index for each foreign key by itself
            entry["index"][tuple(cols)] = n
    for (t, n, rt), pairs in fks.items():
        entry = out.setdefault(t, {"fk": {}, "unique": {}, "index": {}})
        entry["fk"][(tuple(p[0] for p in pairs), rt, tuple(p[1] for p in pairs))] = n
    return out


def pg_structure(pg):
    out: dict[str, dict] = {}
    with pg.cursor() as c:
        c.execute("""
            select t.relname, i.indisunique, i.indisprimary,
                   array(select a.attname from unnest(i.indkey) with ordinality k(attnum, ord)
                         join pg_attribute a on a.attrelid = t.oid and a.attnum = k.attnum order by k.ord)
            from pg_index i join pg_class t on t.oid = i.indrelid join pg_namespace s on s.oid = t.relnamespace
            where s.nspname = 'public'""")
        for t, uniq, prim, cols in c.fetchall():
            entry = out.setdefault(t, {"fk": set(), "unique": set(), "index": set()})
            if prim:
                continue
            entry["unique" if uniq else "index"].add(tuple(cols))
        c.execute("""
            select cl.relname, rf.relname,
                   array(select a.attname from unnest(co.conkey) with ordinality k(n, ord)
                         join pg_attribute a on a.attrelid = co.conrelid and a.attnum = k.n order by k.ord),
                   array(select a.attname from unnest(co.confkey) with ordinality k(n, ord)
                         join pg_attribute a on a.attrelid = co.confrelid and a.attnum = k.n order by k.ord)
            from pg_constraint co join pg_class cl on cl.oid = co.conrelid join pg_class rf on rf.oid = co.confrelid
            join pg_namespace s on s.oid = cl.relnamespace where co.contype = 'f' and s.nspname = 'public'""")
        for t, rt, cols, rcols in c.fetchall():
            out.setdefault(t, {"fk": set(), "unique": set(), "index": set()})["fk"].add((tuple(cols), rt, tuple(rcols)))
    return out


def compare_structure(my_s, pg_s, tables):
    """List of (table, kind, columns, mysql_name, extra) present in MySQL but missing in PostgreSQL."""
    missing = []
    for t in tables:
        m = my_s.get(t)
        if not m:
            continue
        p = pg_s.get(t, {"fk": set(), "unique": set(), "index": set()})
        covering = p["unique"] | p["index"]
        for (cols, rt, rcols), name in m["fk"].items():
            if (cols, rt, rcols) not in p["fk"]:
                missing.append((t, "foreign key", cols, name, (rt, rcols)))
        for cols, name in m["unique"].items():
            if cols not in p["unique"]:
                missing.append((t, "unique key", cols, name, None))
        for cols, name in m["index"].items():
            # an index is preserved when PostgreSQL has any index starting with the same columns
            if not any(c[:len(cols)] == cols for c in covering):
                missing.append((t, "index", cols, name, None))
    return missing


def add_structure(pg, missing):
    """Create the missing keys and indexes, one at a time. Returns {(table, kind, cols): result}."""
    results = {}
    order = {"unique key": 0, "index": 1, "foreign key": 2}
    for t, kind, cols, name, extra in sorted(missing, key=lambda m: order[m[1]]):
        collist = ", ".join(f'"{c_}"' for c_ in cols)
        short = ("mig_" + t + "_" + "_".join(cols))[:55]
        if kind == "unique key":
            sql = f'alter table public."{t}" add constraint "{short}_uk" unique ({collist})'
        elif kind == "index":
            sql = f'create index if not exists "{short}_idx" on public."{t}" ({collist})'
        else:
            rt, rcols = extra
            sql = (f'alter table public."{t}" add constraint "{short}_fk" foreign key ({collist}) '
                   f'references public."{rt}" ({", ".join(chr(34) + c_ + chr(34) for c_ in rcols)})')
        try:
            with pg.cursor() as c:
                c.execute(sql)
            pg.commit()
            results[(t, kind, cols)] = "created"
        except psycopg.Error as e:
            pg.rollback()
            results[(t, kind, cols)] = "could not create: " + str(e).strip().splitlines()[0][:120]
    return results


def main():
    ap = argparse.ArgumentParser(description="Copy ShopSmart data from MySQL to PostgreSQL (Supabase).")
    ap.add_argument("--mysql-host", default=os.environ.get("MYSQL_HOST", "localhost"))
    ap.add_argument("--mysql-port", type=int, default=int(os.environ.get("MYSQL_PORT", "33006")))
    ap.add_argument("--mysql-user", default=os.environ.get("MYSQL_USER", "root"))
    ap.add_argument("--mysql-password", default=os.environ.get("MYSQL_PASSWORD", ""))
    ap.add_argument("--mysql-database", default=os.environ.get("MYSQL_DATABASE", "shopsmart_db"))
    ap.add_argument("--mysql-socket", default=os.environ.get("MYSQL_SOCKET"))
    ap.add_argument("--pg-url", default=os.environ.get("SHOPSMART_PG_URL"))
    ap.add_argument("--source-timezone", default="UTC", help="time zone of MySQL DATETIME values (default UTC)")
    ap.add_argument("--apply", action="store_true", help="copy the data (default is a dry run)")
    ap.add_argument("--replace-target", action="store_true", help="empty the target tables before copying")
    ap.add_argument("--include-unmapped", action="store_true",
                    help="also create and copy MySQL tables that no ShopSmart service uses")
    ap.add_argument("--add-missing-structure", action="store_true",
                    help="create foreign keys, unique keys and indexes that exist in MySQL but not in PostgreSQL")
    ap.add_argument("--report", default="migration-report.md")
    args = ap.parse_args()
    if not args.pg_url:
        sys.exit("Set SHOPSMART_PG_URL (ShopSmart production project > Connect > Transaction pooler).")
    tz = timezone.utc if args.source_timezone.upper() == "UTC" else ZoneInfo(args.source_timezone)

    my = pymysql.connect(host=args.mysql_host, port=args.mysql_port, user=args.mysql_user, password=args.mysql_password,
                         database=args.mysql_database, unix_socket=args.mysql_socket, charset="utf8mb4",
                         cursorclass=pymysql.cursors.SSDictCursor, read_timeout=600)
    kwargs = {"prepare_threshold": None, "connect_timeout": 15}
    if os.environ.get("SHOPSMART_PG_PASSWORD"):
        kwargs["password"] = os.environ["SHOPSMART_PG_PASSWORD"]
    pg = psycopg.connect(args.pg_url, **kwargs)

    with my.cursor(pymysql.cursors.DictCursor) as c:
        c.execute("SHOW TABLES")
        source_tables = {list(r.values())[0].lower() for r in c.fetchall()}
    with pg.cursor() as c:
        c.execute("select table_name, column_name, data_type, is_identity from information_schema.columns "
                  "where table_schema = 'public' order by table_name, ordinal_position")
        target_cols: dict[str, dict[str, str]] = {}
        identity: dict[str, str] = {}
        for t, col, typ, ident in c.fetchall():
            target_cols.setdefault(t, {})[col] = typ
            if ident == "YES":
                identity[t] = col

    unmapped = sorted(t for t in source_tables if t not in TABLES and t not in SKIPPED)
    if args.apply and args.include_unmapped:
        for t in unmapped:
            if t in target_cols:
                continue
            with my.cursor(pymysql.cursors.DictCursor) as c:
                c.execute("SELECT COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, NUMERIC_PRECISION, "
                          "NUMERIC_SCALE, CHARACTER_MAXIMUM_LENGTH FROM information_schema.COLUMNS "
                          "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s ORDER BY ORDINAL_POSITION", (args.mysql_database, t))
                cols_meta = c.fetchall()
            defs = [f'"{m["COLUMN_NAME"].lower()}" {pg_type_for(m)}' + ("" if m["IS_NULLABLE"] == "YES" else " not null")
                    for m in cols_meta]
            pk = [m["COLUMN_NAME"].lower() for m in cols_meta if m["COLUMN_KEY"] == "PRI"]
            if pk:
                defs.append("primary key (" + ", ".join(f'"{k}"' for k in pk) + ")")
            with pg.cursor() as c:
                c.execute(f'create table public."{t}" (' + ", ".join(defs) + ")")
            pg.commit()
            target_cols[t] = {m["COLUMN_NAME"].lower(): ("boolean" if pg_type_for(m) == "boolean" else
                              "timestamp with time zone" if pg_type_for(m) == "timestamptz" else
                              "jsonb" if pg_type_for(m) == "jsonb" else "other") for m in cols_meta}
            print(f"Created table {t} in PostgreSQL (not used by any ShopSmart service; kept as a copy).")
    copy_tables = TABLES + (unmapped if args.include_unmapped else [])

    rows_report = []
    mode = "COPY" if args.apply else "DRY RUN"
    print(f"{mode}: MySQL {args.mysql_database} -> PostgreSQL (source times read as {args.source_timezone})\n")
    if args.apply and args.replace_target:
        present = [t for t in copy_tables if t in target_cols]
        with pg.cursor() as c:
            c.execute("truncate " + ", ".join(f'public."{t}"' for t in present) + " restart identity cascade")
        pg.commit()
        print(f"Emptied {len(present)} target tables.\n")

    for table in unmapped if not args.include_unmapped else []:
        with my.cursor(pymysql.cursors.DictCursor) as c:
            c.execute(f"SELECT COUNT(*) AS n FROM `{table}`")
            n = c.fetchone()["n"]
        rows_report.append((table, n, "-", "NOT MIGRATED: not used by any ShopSmart service",
                            "kept in MySQL; add --include-unmapped to copy it as well"))

    for table in copy_tables:
        if table not in source_tables:
            rows_report.append((table, "-", "-", "not in MySQL", ""))
            continue
        if table not in target_cols:
            hint = ("created and copied with --apply --include-unmapped" if table in unmapped
                    else "missing in PostgreSQL: start the backend once first")
            rows_report.append((table, "?", "-", hint, ""))
            continue
        with my.cursor(pymysql.cursors.DictCursor) as c:
            c.execute(f"SELECT COUNT(*) AS n FROM `{table}`")
            src_n = c.fetchone()["n"]
            c.execute(f"SHOW COLUMNS FROM `{table}`")
            src_cols = [r["Field"].lower() for r in c.fetchall()]
        cols = [col for col in src_cols if col in target_cols[table]]
        dropped = [col for col in src_cols if col not in target_cols[table]]
        with pg.cursor() as c:
            c.execute(f'select count(*) from public."{table}"')
            tgt_n = c.fetchone()[0]
        note = ("columns not copied: " + ", ".join(dropped)) if dropped else ""
        if not args.apply:
            sample = ""
            with my.cursor(pymysql.cursors.DictCursor) as c:
                ts_cols = [col for col in cols if target_cols[table][col].startswith("timestamp")]
                if ts_cols and src_n:
                    c.execute(f"SELECT `{ts_cols[0]}` AS v FROM `{table}` WHERE `{ts_cols[0]}` IS NOT NULL LIMIT 1")
                    r = c.fetchone()
                    if r:
                        sample = f"{ts_cols[0]}: {r['v']} -> {convert(r['v'], 'timestamp with time zone', tz).isoformat()}"
            rows_report.append((table, src_n, tgt_n, "would copy" if tgt_n == 0 or args.replace_target else
                                "target has rows: skipped unless --replace-target", "; ".join(x for x in (note, sample) if x)))
            continue
        if tgt_n and not args.replace_target:
            rows_report.append((table, src_n, tgt_n, "skipped: target already has rows", note))
            continue
        col_list = ", ".join(f'"{c_}"' for c_ in cols)
        placeholders = ", ".join(["%s"] * len(cols))
        overriding = " overriding system value" if table in identity and identity[table] in cols else ""
        insert = f'insert into public."{table}" ({col_list}){overriding} values ({placeholders})'
        copied = 0
        with my.cursor() as src, pg.cursor() as dst:
            src.execute(f"SELECT {', '.join('`' + c_ + '`' for c_ in cols)} FROM `{table}`")
            batch = []
            for r in src:
                batch.append(tuple(convert(r[c_] if c_ in r else r[c_.upper()], target_cols[table][c_], tz) for c_ in cols))
                if len(batch) >= 500:
                    dst.executemany(insert, batch)
                    copied += len(batch)
                    batch = []
            if batch:
                dst.executemany(insert, batch)
                copied += len(batch)
            if table in identity:
                col = identity[table]
                dst.execute(f"select setval(pg_get_serial_sequence('public.\"{table}\"', '{col}'), "
                            f"coalesce((select max(\"{col}\") from public.\"{table}\"), 0) + 1, false)")
        pg.commit()
        with pg.cursor() as c:
            c.execute(f'select count(*) from public."{table}"')
            after = c.fetchone()[0]
        status = "copied" if after == src_n else f"copied {copied}, but target now has {after}"
        rows_report.append((table, src_n, after, status, note))

    # Relationships, unique keys and indexes
    pg.rollback()
    my_s = mysql_structure(my, args.mysql_database)
    struct_tables = [t for t in copy_tables if t in source_tables and t in target_cols]
    missing = compare_structure(my_s, pg_structure(pg), struct_tables)
    made = add_structure(pg, missing) if (args.apply and args.add_missing_structure and missing) else {}
    if made:
        missing_after = compare_structure(my_s, pg_structure(pg), struct_tables)
    else:
        missing_after = missing
    counted = {"foreign key": 0, "unique key": 0, "index": 0}
    for t in struct_tables:
        for k, key in (("foreign key", "fk"), ("unique key", "unique"), ("index", "index")):
            counted[k] += len(my_s.get(t, {}).get(key, {}))

    copy_problems = [r for r in rows_report if r[3] not in ("copied", "not in MySQL", "would copy")]
    lines = [f"# ShopSmart data migration ({mode.lower()})", "",
             f"Run at {datetime.now().astimezone().isoformat(timespec='seconds')}. MySQL `{args.mysql_database}` was only read.",
             f"MySQL DATETIME values were read as {args.source_timezone}.", "",
             "| Table | MySQL rows | PostgreSQL rows | Result | Notes |", "|---|---|---|---|---|"]
    lines += [f"| {t} | {a} | {b} | {r} | {n} |" for t, a, b, r, n in rows_report]
    lines += ["", "Not copied on purpose:"] + [f"- `{t}`: {why}" for t, why in SKIPPED.items()]
    lines += ["", "## Relationships, unique keys and indexes", "",
              f"MySQL has {counted['foreign key']} foreign keys, {counted['unique key']} unique keys and "
              f"{counted['index']} other indexes on the migrated tables (primary keys are always kept). "
              "They are compared with PostgreSQL by their columns, because the names differ.", ""]
    if not missing:
        lines.append("All of them exist in PostgreSQL.")
    else:
        lines += ["| Table | Kind | Columns | MySQL name | Result |", "|---|---|---|---|---|"]
        for t, kind, cols, name, extra in missing:
            target = f" -> {extra[0]}({', '.join(extra[1])})" if extra else ""
            result = made.get((t, kind, cols), "missing in PostgreSQL" +
                              ("" if args.add_missing_structure else " (add with --add-missing-structure)"))
            lines.append(f"| {t} | {kind} | {', '.join(cols)}{target} | {name} | {result} |")
        lines += ["", f"Still missing after this run: {len(missing_after)}."]
    complete = args.apply and not copy_problems and not missing_after and (args.include_unmapped or not unmapped)
    lines += ["", "## Result", "",
              ("**Complete:** every table was copied with matching row counts, and every relationship, unique key "
               "and index exists in PostgreSQL." if complete else
               "**Not complete:** see the rows above that are not `copied`, any missing structure, and any "
               "NOT MIGRATED tables." if args.apply else
               "Dry run only: nothing was written.")]
    with open(args.report, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines) + "\n")
    for t, a, b, r, n in rows_report:
        print(f"  {t:28} mysql={str(a):>6}  postgres={str(b):>6}  {r}" + (f"  ({n})" if n else ""))
    if missing:
        print(f"\nStructure: {len(missing)} key(s)/index(es) from MySQL missing in PostgreSQL"
              + (f", {len(missing) - len(missing_after)} created now" if made else "")
              + ("" if args.add_missing_structure else " (add with --add-missing-structure)"))
    else:
        print("\nStructure: every MySQL foreign key, unique key and index exists in PostgreSQL.")
    print("RESULT: COMPLETE" if complete else ("RESULT: NOT COMPLETE" if args.apply else "RESULT: dry run"))
    print(f"Report: {args.report}")
    sys.exit(0 if complete or not args.apply else 1)


if __name__ == "__main__":
    main()
