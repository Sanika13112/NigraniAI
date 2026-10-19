-- ShopSmart Production project: lock the shop tables away from Supabase's public API.
-- Run in the ShopSmart production project (NOT the GuardRail logs project), in SQL Editor,
-- AFTER the backend has started once (the services create their tables on first start).
-- Run again whenever new tables appear. Safe to run repeatedly.
--
-- The Spring Boot services connect as the table owner (postgres) through the pooler, so they keep
-- working. The public API keys (anon / authenticated) get no access at all: no grants, and Row Level
-- Security on with no policies. GuardRail roles do not exist in this project.

do $$
declare t record; r text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    foreach r in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_roles where rolname = r) then
        execute format('revoke all on table public.%I from %I', t.tablename, r);
      end if;
    end loop;
  end loop;
  foreach r in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke all on all sequences in schema public from %I', r);
      execute format('alter default privileges in schema public revoke all on tables from %I', r);
      execute format('alter default privileges in schema public revoke all on sequences from %I', r);
    end if;
  end loop;
end $$;

-- Check: every table should show rls_on = true and api_access = false
select c.relname as table_name, c.relrowsecurity as rls_on,
       has_table_privilege('anon', c.oid, 'select') as api_access
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by 1;
