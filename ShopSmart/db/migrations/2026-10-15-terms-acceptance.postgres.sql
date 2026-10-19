-- ShopSmart: Terms and Conditions acceptance (customer-service, table customers). PostgreSQL / Supabase.
-- Hibernate (ddl-auto=update) adds these columns by itself on the next start of customer-service;
-- run this only if you manage the schema by hand. Safe to run again. Existing rows stay NULL
-- ("no acceptance recorded"); nothing else changes.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS terms_accepted    boolean,
  ADD COLUMN IF NOT EXISTS terms_version     varchar(20),
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamp(6) with time zone;

-- Check: customers with a recorded acceptance, per version.
SELECT terms_version, count(*) AS customers FROM public.customers WHERE terms_accepted GROUP BY terms_version;
