-- ShopSmart: one-time upgrade for an EXISTING shopsmart_db.
-- Hibernate (ddl-auto=update) adds the new tables and columns automatically on first start.
-- These statements cover what ddl-auto cannot do. Run AFTER starting the new services once.
-- Take a backup first:  mysqldump -u root -p shopsmart_db > backup.sql

-- 1. Money must be exact: change product price from DOUBLE to DECIMAL.
ALTER TABLE products MODIFY price DECIMAL(12,2) NOT NULL;

-- 2. Old simulated payments are kept for history but are never counted as revenue
--    (they have mode = NULL and status = 'SUCCESS'; the UI labels them "Simulated (legacy)").
SELECT COUNT(*) AS legacy_simulated_payments FROM payments WHERE mode IS NULL;

-- 3. Old orders created by the previous flow have status 'PENDING'/'CONFIRMED' and no
--    reservation, address snapshot or payment status. Review them; for example, mark old
--    simulated-paid orders explicitly:
-- UPDATE customer_orders o JOIN payments p ON p.order_id = o.id
--    SET o.payment_status = 'PAID', o.payment_method = 'ONLINE'
--  WHERE p.mode IS NULL AND p.status = 'SUCCESS' AND o.payment_status IS NULL;

-- 4. Existing login accounts are linked to their customer profile automatically on next sign-in
--    (matched by email). To see which accounts are not linked yet:
SELECT id, email FROM auth_users WHERE role = 'CUSTOMER' AND customer_id IS NULL;

-- 5. Production: replace ddl-auto=update with Flyway migrations and a least-privilege DB user.
