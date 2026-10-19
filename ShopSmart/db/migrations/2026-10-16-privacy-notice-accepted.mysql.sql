-- ShopSmart: one yes/no column per sign-up checkbox. Adds the privacy-notice column (MySQL 8).
-- Hibernate adds it by itself on the next start of customer-service; run this only for a hand-managed schema.
-- Run once. Existing customers stay NULL ("not recorded"); nothing else changes.
ALTER TABLE customers ADD COLUMN privacy_notice_accepted BIT(1) NULL;
