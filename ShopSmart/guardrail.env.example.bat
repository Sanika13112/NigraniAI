@echo off
REM GuardRail COMPLIANCE LOGS database (Supabase project "guardrail-compliance-logs").
REM Copy to guardrail.env.bat and fill in. Read ONLY by the log shipper (start-log-shipper.bat).
REM It holds the guardrail_ingest password, which can insert log rows and do nothing else.
REM The monitor and detector passwords belong to the GuardRail team: do not put them here.
REM Values: logs project > Connect > "Transaction pooler" (host and project ref).

set "GUARDRAIL_PROJECT_REF=vozxvzjzfcodgljlztis"
set "GUARDRAIL_POOLER_HOST=aws-0-ap-northeast-2.pooler.supabase.com"
set "GUARDRAIL_INGEST_PASSWORD=SanikaMane@123"
REM Optional: fixed secret for pseudonyms (otherwise one is generated and kept in tools\log-shipper\pseudonym-salt.txt)
REM set "GUARDRAIL_PSEUDONYM_SALT=long-random-text"

REM ---- nothing to change below this line ----
set "GUARDRAIL_INGEST_DB_URL=postgresql://guardrail_ingest.%GUARDRAIL_PROJECT_REF%@%GUARDRAIL_POOLER_HOST%:6543/postgres?sslmode=require"
