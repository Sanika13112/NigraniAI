@echo off
REM ShopSmart PRODUCTION database (Supabase project "shopsmart-production").
REM Copy to shopsmart.env.bat and fill in. Read ONLY by the ShopSmart backend services
REM (via start-backend.bat) and by tools\migrate. Never give these values to GuardRail.
REM Values: production project > Connect > "Transaction pooler".

set "SHOPSMART_PROJECT_REF=your-production-project-ref"
set "SHOPSMART_POOLER_HOST=aws-0-ap-south-1.pooler.supabase.com"
set "SHOPSMART_DB_PASSWORD=your-production-database-password"

REM Demo violation switches (Admin > Demo violations). They are always off until an admin turns
REM one on. Set to false to disable the whole harness on this deployment (no switch can be turned on).
set "DEMO_VIOLATIONS_ALLOWED=true"

REM ---- nothing to change below this line ----
set "DB_URL=jdbc:postgresql://%SHOPSMART_POOLER_HOST%:6543/postgres?sslmode=require&prepareThreshold=0"
set "DB_USERNAME=postgres.%SHOPSMART_PROJECT_REF%"
set "DB_PASSWORD=%SHOPSMART_DB_PASSWORD%"
set "DB_POOL_SIZE=3"
REM used by tools\migrate\migrate_mysql_to_postgres.py
set "SHOPSMART_PG_URL=postgresql://postgres.%SHOPSMART_PROJECT_REF%@%SHOPSMART_POOLER_HOST%:6543/postgres?sslmode=require"
set "SHOPSMART_PG_PASSWORD=%SHOPSMART_DB_PASSWORD%"
