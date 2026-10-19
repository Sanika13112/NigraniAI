package com.shopsmart.authenticationservice.demo;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Test-harness switches that make ShopSmart break a DPDPA rule on purpose, so the compliance
 * agent (GuardRail) has real violations to detect. All switches are off by default. They live in
 * the shared table demo_violation_switches; the DB activity log skips demo_ tables so the
 * harness itself never appears in the logs the agent analyses.
 *
 * DEMO_VIOLATIONS_ALLOWED=false turns the whole harness off: every switch reads as off and
 * none can be turned on, whatever the table says.
 */
@Component
public class DemoSwitches {

    public static final String PII_IN_LOGS = "PII_IN_LOGS";
    public static final String OUT_OF_SCOPE_PROCESSING = "OUT_OF_SCOPE_PROCESSING";
    public static final String RETENTION_BYPASS = "RETENTION_BYPASS";
    public static final String SCHEMA_DRIFT = "SCHEMA_DRIFT";
    public static final List<String> ALL = List.of(PII_IN_LOGS, OUT_OF_SCOPE_PROCESSING, RETENTION_BYPASS, SCHEMA_DRIFT);

    private static final long CACHE_MS = 3000;

    private final JdbcTemplate jdbc;
    private final boolean allowed;
    private volatile Map<String, Boolean> cache = Map.of();
    private volatile long loadedAt;
    private volatile boolean tableReady;

    public DemoSwitches(JdbcTemplate jdbc, @Value("${DEMO_VIOLATIONS_ALLOWED:true}") boolean allowed) {
        this.jdbc = jdbc;
        this.allowed = allowed;
    }

    /** False when DEMO_VIOLATIONS_ALLOWED=false: the harness is disabled for this deployment. */
    public boolean allowed() {
        return allowed;
    }

    /** True when the switch is on. Any database problem counts as off. */
    public boolean on(String name) {
        if (!allowed) {
            return false;
        }
        try {
            refresh(false);
            return Boolean.TRUE.equals(cache.get(name));
        } catch (RuntimeException e) {
            return false;
        }
    }

    public List<Map<String, Object>> list() {
        ensureTable();
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> row : jdbc.queryForList(
                "SELECT name, enabled, updated_at FROM demo_violation_switches ORDER BY name")) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("name", row.get("name"));
            item.put("enabled", allowed && truthy(row.get("enabled")));
            Object updated = row.get("updated_at");
            item.put("updatedAt", updated instanceof Timestamp ts ? ts.toInstant().toString() : null);
            out.add(item);
        }
        return out;
    }

    public void set(String name, boolean enabled) {
        if (!ALL.contains(name)) {
            throw new IllegalArgumentException("Unknown switch " + name);
        }
        if (!allowed && enabled) {
            throw new IllegalStateException("Demo violations are disabled (DEMO_VIOLATIONS_ALLOWED=false)");
        }
        ensureTable();
        jdbc.update("UPDATE demo_violation_switches SET enabled = ?, updated_at = ? WHERE name = ?",
                enabled, Timestamp.from(Instant.now()), name);
        refresh(true);
    }

    private void refresh(boolean force) {
        long now = System.currentTimeMillis();
        if (!force && now - loadedAt < CACHE_MS) {
            return;
        }
        ensureTable();
        Map<String, Boolean> next = new HashMap<>();
        for (Map<String, Object> row : jdbc.queryForList("SELECT name, enabled FROM demo_violation_switches")) {
            next.put(String.valueOf(row.get("name")), truthy(row.get("enabled")));
        }
        cache = next;
        loadedAt = now;
    }

    private void ensureTable() {
        if (tableReady) {
            return;
        }
        jdbc.execute("CREATE TABLE IF NOT EXISTS demo_violation_switches ("
                + "name VARCHAR(40) NOT NULL PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMP NULL)");
        for (String name : ALL) {
            // Portable "insert if missing" (works on MySQL and PostgreSQL).
            jdbc.update("INSERT INTO demo_violation_switches (name, enabled) SELECT ?, FALSE "
                    + "WHERE NOT EXISTS (SELECT 1 FROM demo_violation_switches WHERE name = ?)", name, name);
        }
        tableReady = true;
    }

    private static boolean truthy(Object value) {
        if (value instanceof Boolean b) {
            return b;
        }
        return value instanceof Number n && n.intValue() != 0;
    }
}
