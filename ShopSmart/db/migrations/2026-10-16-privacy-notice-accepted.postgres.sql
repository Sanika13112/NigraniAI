-- ShopSmart: one yes/no column per sign-up checkbox. Adds the privacy-notice column (PostgreSQL / Supabase).
-- Hibernate adds it by itself on the next start of customer-service; run this only for a hand-managed schema.
-- Safe to run again. Existing customers stay NULL ("not recorded"); nothing else changes.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS privacy_notice_accepted boolean;
