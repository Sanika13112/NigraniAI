-- ShopSmart: Terms and Conditions acceptance (customer-service, table customers). MySQL 8.
-- Hibernate (ddl-auto=update) adds these columns by itself on the next start of customer-service;
-- run this only if you manage the schema by hand. Safe for existing rows: every new column is NULL-able,
-- so existing customers keep "no acceptance recorded" (NULL) and nothing else changes.
-- Run it once: a second run stops with "Duplicate column name", which changes nothing.
ALTER TABLE customers
  ADD COLUMN terms_accepted    BIT(1)      NULL,
  ADD COLUMN terms_version     VARCHAR(20) NULL,
  ADD COLUMN terms_accepted_at DATETIME(6) NULL;

-- Check: customers with a recorded acceptance, per version.
SELECT terms_version, COUNT(*) AS customers FROM customers WHERE terms_accepted = 1 GROUP BY terms_version;
