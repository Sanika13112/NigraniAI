package com.shopsmart.analyticsservice.repository;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

/**
 * Read-only reporting queries over the shared schema. Revenue is split by payment mode so
 * sandbox (TEST) and legacy simulated payments are never reported as real money.
 */
@Repository
public class AnalyticsRepository {

    private final JdbcTemplate jdbc;

    public AnalyticsRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public long totalOrders() {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM customer_orders", Long.class);
        return count != null ? count : 0L;
    }

    public List<Map<String, Object>> ordersByStatus() {
        return jdbc.queryForList("SELECT status, COUNT(*) AS total FROM customer_orders GROUP BY status ORDER BY total DESC");
    }

    public List<Map<String, Object>> paymentsByStatusAndMode() {
        return jdbc.queryForList(
                "SELECT status, COALESCE(mode, 'SIMULATED') AS mode, COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amount "
                + "FROM payments GROUP BY status, COALESCE(mode, 'SIMULATED') ORDER BY mode, status");
    }

    /** Captured gateway payments for one mode (TEST or LIVE), excluding refunded ones. */
    public BigDecimal capturedRevenue(String mode) {
        BigDecimal value = jdbc.queryForObject(
                "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE mode = ? AND status = 'CAPTURED'",
                BigDecimal.class, mode);
        return value != null ? value : BigDecimal.ZERO;
    }

    public BigDecimal refundedAmount(String mode) {
        BigDecimal value = jdbc.queryForObject(
                "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE mode = ? AND status IN ('REFUNDED', 'REFUND_PENDING')",
                BigDecimal.class, mode);
        return value != null ? value : BigDecimal.ZERO;
    }

    /** Old payment rows written by the simulated flow (no gateway). Reported separately, never as revenue. */
    public BigDecimal legacySimulatedAmount() {
        BigDecimal value = jdbc.queryForObject(
                "SELECT COALESCE(SUM(amount), 0) FROM payments WHERE mode IS NULL AND status = 'SUCCESS'",
                BigDecimal.class);
        return value != null ? value : BigDecimal.ZERO;
    }

    public BigDecimal codCollected() {
        BigDecimal value = jdbc.queryForObject(
                "SELECT COALESCE(SUM(total_amount), 0) FROM customer_orders WHERE payment_status = 'COD_COLLECTED'",
                BigDecimal.class);
        return value != null ? value : BigDecimal.ZERO;
    }

    public BigDecimal codOutstanding() {
        BigDecimal value = jdbc.queryForObject(
                "SELECT COALESCE(SUM(total_amount), 0) FROM customer_orders WHERE payment_status = 'COD_PENDING' "
                + "AND status NOT IN ('CANCELLED')",
                BigDecimal.class);
        return value != null ? value : BigDecimal.ZERO;
    }

    public List<Map<String, Object>> dailyCaptured(String mode, int days) {
        return jdbc.queryForList(
                "SELECT DATE(captured_at) AS day, COUNT(*) AS payments, COALESCE(SUM(amount), 0) AS amount "
                + "FROM payments WHERE mode = ? AND status IN ('CAPTURED', 'REFUND_PENDING', 'REFUNDED', 'REFUND_FAILED') "
                + "AND captured_at >= ? "
                + "GROUP BY DATE(captured_at) ORDER BY day",
                mode, since(days));
    }

    public List<Map<String, Object>> dailyOrders(int days) {
        return jdbc.queryForList(
                "SELECT DATE(created_at) AS day, COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS value "
                + "FROM customer_orders WHERE created_at >= ? "
                + "AND status <> 'CANCELLED' GROUP BY DATE(created_at) ORDER BY day",
                since(days));
    }

    public List<Map<String, Object>> topProducts(int limit) {
        return jdbc.queryForList(
                "SELECT li.product_id AS \"productId\", MAX(li.name) AS name, SUM(li.quantity) AS units, "
                + "SUM(li.quantity * li.unit_price) AS value "
                + "FROM order_line_items li JOIN customer_orders o ON o.id = li.order_id "
                + "WHERE o.status NOT IN ('CANCELLED', 'PENDING_PAYMENT', 'PENDING') "
                + "GROUP BY li.product_id ORDER BY units DESC LIMIT ?",
                limit);
    }

    public List<Map<String, Object>> lowStock(int threshold) {
        return jdbc.queryForList(
                "SELECT id, name, category, stock_quantity AS \"stockQuantity\" FROM products "
                + "WHERE stock_quantity <= ? ORDER BY stock_quantity ASC, name LIMIT 20",
                threshold);
    }

    public long productCount() {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM products", Long.class);
        return count != null ? count : 0L;
    }

    public long customerCount() {
        Long count = jdbc.queryForObject("SELECT COUNT(*) FROM customers", Long.class);
        return count != null ? count : 0L;
    }

    /** Start of the reporting window, computed here so the SQL works on MySQL and PostgreSQL alike. */
    private static java.sql.Timestamp since(int days) {
        return java.sql.Timestamp.from(java.time.Instant.now().minus(java.time.Duration.ofDays(Math.max(days, 0))));
    }
}
