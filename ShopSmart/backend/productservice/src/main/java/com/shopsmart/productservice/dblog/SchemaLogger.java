package com.shopsmart.productservice.dblog;

import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Schema log. On start-up it writes one line per column of this service's tables, then checks
 * every minute and logs any column that was added or removed:
 *
 * event=db_schema service=customer-service table=customers column=phone columnType=varchar(10)
 * nullable=true classification=personal_data:phone registered=true
 *
 * "registered" says whether the column is in this service's declared data inventory below.
 * A column that appears without being registered is schema drift.
 */
@Component
public class SchemaLogger {

    private static final Logger log = LoggerFactory.getLogger(SchemaLogger.class);

    /** Declared data inventory: table.column -> classification. */
    private static final Map<String, String> REGISTRY = new LinkedHashMap<>();
    static {
        REGISTRY.put("products.name", "catalog");
        REGISTRY.put("products.description", "catalog");
        REGISTRY.put("products.price", "catalog");
        REGISTRY.put("products.category", "catalog");
        REGISTRY.put("products.stock_quantity", "catalog");
        REGISTRY.put("products.image_url", "catalog");
        REGISTRY.put("products.seed_key", "catalog");
        REGISTRY.put("products.rating_average", "catalog");
        REGISTRY.put("products.rating_count", "catalog");
        REGISTRY.put("products.id", "identifier");
        REGISTRY.put("products.updated_at", "timestamp");
        REGISTRY.put("product_reviews.id", "identifier");
        REGISTRY.put("product_reviews.product_id", "catalog_ref");
        REGISTRY.put("product_reviews.customer_id", "identifier");
        REGISTRY.put("product_reviews.reviewer_name", "personal_data:name");
        REGISTRY.put("product_reviews.rating", "user_content");
        REGISTRY.put("product_reviews.title", "user_content");
        REGISTRY.put("product_reviews.comment", "user_content");
        REGISTRY.put("product_reviews.verified_purchase", "user_content");
        REGISTRY.put("product_reviews.created_at", "timestamp");
        REGISTRY.put("product_reviews.updated_at", "timestamp");
        REGISTRY.put("inventory_reservations.id", "identifier");
        REGISTRY.put("inventory_reservations.order_ref", "transactional");
        REGISTRY.put("inventory_reservations.status", "transactional");
        REGISTRY.put("inventory_reservations.created_at", "timestamp");
        REGISTRY.put("inventory_reservations.released_at", "timestamp");
        REGISTRY.put("inventory_reservation_lines.reservation_id", "identifier");
        REGISTRY.put("inventory_reservation_lines.product_id", "catalog_ref");
        REGISTRY.put("inventory_reservation_lines.quantity", "transactional");
        REGISTRY.put("product_stock_adjustments.id", "identifier");
        REGISTRY.put("product_stock_adjustments.product_id", "catalog_ref");
        REGISTRY.put("product_stock_adjustments.product_name", "catalog");
        REGISTRY.put("product_stock_adjustments.delta", "catalog");
        REGISTRY.put("product_stock_adjustments.resulting_stock", "catalog");
        REGISTRY.put("product_stock_adjustments.reason", "catalog");
        REGISTRY.put("product_stock_adjustments.actor_user_id", "identifier");
        REGISTRY.put("product_stock_adjustments.created_at", "timestamp");
    }

    private final JdbcTemplate jdbc;
    private final String service;
    private final long intervalSeconds;
    private final boolean enabled;
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "schema-log");
        t.setDaemon(true);
        return t;
    });
    private Map<String, String> previous;

    public SchemaLogger(JdbcTemplate jdbc,
                        @Value("${spring.application.name:unknown-service}") String service,
                        @Value("${shopsmart.schema-log.interval-seconds:60}") long intervalSeconds,
                        @Value("${shopsmart.schema-log.enabled:true}") boolean enabled) {
        this.jdbc = jdbc;
        this.service = service;
        this.intervalSeconds = Math.max(10, intervalSeconds);
        this.enabled = enabled;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        if (!enabled || REGISTRY.isEmpty()) {
            return;
        }
        timer.scheduleWithFixedDelay(this::check, 0, intervalSeconds, TimeUnit.SECONDS);
    }

    /** Runs a check now (used after the service changes its own schema). */
    public void checkNow() {
        if (enabled && !REGISTRY.isEmpty()) {
            timer.execute(this::check);
        }
    }

    private synchronized void check() {
        try {
            Map<String, String> current = snapshot();
            if (previous == null) {
                current.forEach((key, type) -> line("db_schema", null, key, type));
                log.info("event=db_schema_snapshot service={} tables={} columns={}",
                        service, tables().size(), current.size());
            } else {
                for (Map.Entry<String, String> e : current.entrySet()) {
                    if (!previous.containsKey(e.getKey())) line("db_schema_change", "column_added", e.getKey(), e.getValue());
                }
                for (Map.Entry<String, String> e : previous.entrySet()) {
                    if (!current.containsKey(e.getKey())) line("db_schema_change", "column_removed", e.getKey(), e.getValue());
                }
            }
            previous = current;
        } catch (RuntimeException e) {
            log.warn("event=db_schema_check_failed service={} error={}", service, e.getClass().getSimpleName());
        }
    }

    /** Reads the columns through JDBC metadata, so it works on MySQL and PostgreSQL (Supabase). */
    private Map<String, String> snapshot() {
        List<String> tables = tables();
        Map<String, String> columns = new LinkedHashMap<>();
        jdbc.execute((ConnectionCallback<Void>) con -> {
            DatabaseMetaData md = con.getMetaData();
            String catalog = con.getCatalog();
            String schema = con.getSchema();
            for (String table : tables) {
                for (String name : List.of(table, table.toUpperCase())) {
                    boolean found = false;
                    try (ResultSet rs = md.getColumns(catalog, schema, name, null)) {
                        while (rs.next()) {
                            found = true;
                            String type = rs.getString("TYPE_NAME").toLowerCase();
                            int size = rs.getInt("COLUMN_SIZE");
                            if (type.contains("char") && size > 0 && size < 100000) {
                                type = type + "(" + size + ")";
                            }
                            String key = table + "." + rs.getString("COLUMN_NAME").toLowerCase();
                            columns.put(key, type + "|" + "YES".equalsIgnoreCase(rs.getString("IS_NULLABLE")));
                        }
                    }
                    if (found) {
                        break;
                    }
                }
            }
            return null;
        });
        return columns;
    }

    private List<String> tables() {
        Map<String, Boolean> seen = new HashMap<>();
        return REGISTRY.keySet().stream().map(k -> k.substring(0, k.indexOf('.')))
                .filter(t -> seen.putIfAbsent(t, true) == null).toList();
    }

    private void line(String event, String change, String key, String typeAndNull) {
        String table = key.substring(0, key.indexOf('.'));
        String column = key.substring(key.indexOf('.') + 1);
        String[] parts = typeAndNull.split("\\|");
        String classification = REGISTRY.getOrDefault(key, "unregistered");
        log.info("event={} service={}{} table={} column={} columnType={} nullable={} classification={} registered={}",
                event, service, change == null ? "" : " change=" + change, table, column,
                parts[0], parts.length > 1 ? parts[1] : "unknown", classification, REGISTRY.containsKey(key));
    }
}
