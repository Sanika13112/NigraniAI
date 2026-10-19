package com.shopsmart.analyticsservice.dblog;

import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import javax.sql.DataSource;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.config.BeanPostProcessor;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

/**
 * DB activity log. Wraps the service's DataSource and writes one line per SQL statement:
 *
 * event=db_query service=order-service traceId=... dbOperation=SELECT table=customer_orders
 * tables=customer_orders,order_line_items dataCategory=personal_data personalData=true
 * durationMs=4 rows=2 status=success
 *
 * Only metadata is logged. SQL parameter values and row contents are never written, so
 * the DB log cannot leak customer data, passwords or payment details.
 */
@Component
public class DbQueryLogger implements BeanPostProcessor, EnvironmentAware {

    private static final Logger log = LoggerFactory.getLogger(DbQueryLogger.class);

    /** Table to data category, used by privacy/compliance monitoring. Most sensitive first. */
    private static final List<String> CATEGORY_ORDER =
            List.of("credentials", "financial", "personal_data", "communication", "transactional", "catalog", "system");

    private static final Map<String, String> TABLE_CATEGORY = Map.ofEntries(
            Map.entry("auth_users", "credentials"),
            Map.entry("auth_refresh_tokens", "credentials"),
            Map.entry("payments", "financial"),
            Map.entry("payment_webhook_events", "financial"),
            Map.entry("customers", "personal_data"),
            Map.entry("customer_addresses", "personal_data"),
            Map.entry("customer_orders", "personal_data"),
            Map.entry("customer_wishlist", "personal_data"),
            Map.entry("product_reviews", "personal_data"),
            Map.entry("notifications", "communication"),
            Map.entry("order_line_items", "transactional"),
            Map.entry("products", "catalog"),
            Map.entry("inventory_reservations", "catalog"),
            Map.entry("product_stock_adjustments", "catalog"));

    private static final Pattern FROM = Pattern.compile("\\bfrom\\s+([`\\w.]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern JOIN = Pattern.compile("\\bjoin\\s+([`\\w.]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern INTO = Pattern.compile("\\binto\\s+([`\\w.]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern UPDATE = Pattern.compile("^\\s*update\\s+([`\\w.]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern DDL_TABLE = Pattern.compile(
            "\\btable\\s+(?:if\\s+(?:not\\s+)?exists\\s+)?([`\\w.]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern LEADING_COMMENT = Pattern.compile("^\\s*(/\\*.*?\\*/\\s*)+", Pattern.DOTALL);

    private String service = "unknown-service";
    private long slowMs = 500;
    private boolean enabled = true;

    @Override
    public void setEnvironment(Environment environment) {
        service = environment.getProperty("spring.application.name", "unknown-service");
        slowMs = environment.getProperty("shopsmart.db-log.slow-query-ms", Long.class, 500L);
        enabled = environment.getProperty("shopsmart.db-log.enabled", Boolean.class, true);
    }

    @Override
    public Object postProcessAfterInitialization(Object bean, String beanName) {
        if (!enabled || !(bean instanceof DataSource dataSource) || bean instanceof DbLogged) {
            return bean;
        }
        log.info("event=db_logging_enabled service={} dataSource={} slowQueryMs={}", service, beanName, slowMs);
        InvocationHandler handler = (p, m, a) -> {
            Object result = invoke(dataSource, m, a);
            return result instanceof Connection c && m.getName().equals("getConnection") ? wrapConnection(c) : result;
        };
        return Proxy.newProxyInstance(DbQueryLogger.class.getClassLoader(),
                new Class<?>[] {DataSource.class, DbLogged.class}, handler);
    }

    /** Marks a DataSource that is already wrapped, so it is never wrapped twice. */
    public interface DbLogged { }

    // ---------------- JDBC wrappers ----------------

    private Connection wrapConnection(Connection connection) {
        return proxy(Connection.class, (p, m, a) -> {
            Object result = invoke(connection, m, a);
            if (result instanceof Statement statement) {
                String sql = (m.getName().startsWith("prepare") && a != null && a.length > 0 && a[0] instanceof String s) ? s : null;
                return wrapStatement(statement, m.getReturnType(), sql);
            }
            return result;
        });
    }

    @SuppressWarnings("unchecked")
    private Object wrapStatement(Statement statement, Class<?> type, String preparedSql) {
        StatementHandler handler = new StatementHandler(statement, preparedSql);
        return proxy((Class<Object>) type, handler);
    }

    private final class StatementHandler implements InvocationHandler {
        private final Statement target;
        private final String preparedSql;
        private String batchSql;
        private int batchSize;
        private PendingQuery pending;

        StatementHandler(Statement target, String preparedSql) {
            this.target = target;
            this.preparedSql = preparedSql;
        }

        @Override
        public Object invoke(Object proxy, Method method, Object[] args) throws Throwable {
            String name = method.getName();
            if (name.equals("addBatch")) {
                batchSize++;
                if (batchSql == null && args != null && args.length == 1 && args[0] instanceof String s) batchSql = s;
                return DbQueryLogger.invoke(target, method, args);
            }
            if (name.equals("clearBatch")) {
                batchSize = 0;
                batchSql = null;
                return DbQueryLogger.invoke(target, method, args);
            }
            if (name.equals("close")) {
                flush();
                return DbQueryLogger.invoke(target, method, args);
            }
            if (name.equals("getResultSet")) {
                Object rs = DbQueryLogger.invoke(target, method, args);
                return rs instanceof ResultSet r && pending != null ? wrapResultSet(r, pending) : rs;
            }
            if (!name.startsWith("execute")) {
                return DbQueryLogger.invoke(target, method, args);
            }

            flush();
            String sql = args != null && args.length > 0 && args[0] instanceof String s ? s
                    : preparedSql != null ? preparedSql : batchSql;
            long start = System.nanoTime();
            Object result;
            try {
                result = DbQueryLogger.invoke(target, method, args);
            } catch (SQLException e) {
                write(sql, elapsed(start), -1, e);
                throw e;
            }
            long durationMs = elapsed(start);

            switch (name) {
                case "executeQuery" -> {
                    pending = new PendingQuery(sql, durationMs);
                    return wrapResultSet((ResultSet) result, pending);
                }
                case "executeUpdate", "executeLargeUpdate" ->
                        write(sql, durationMs, ((Number) result).longValue(), null);
                case "executeBatch", "executeLargeBatch" -> {
                    long rows = 0;
                    if (result instanceof int[] intCounts) for (int c : intCounts) rows += Math.max(c, 0);
                    if (result instanceof long[] longCounts) for (long c : longCounts) rows += Math.max(c, 0);
                    write(sql, durationMs, rows, null);
                    batchSize = 0;
                    batchSql = null;
                }
                case "execute" -> {
                    if (Boolean.TRUE.equals(result)) {
                        pending = new PendingQuery(sql, durationMs);
                    } else {
                        write(sql, durationMs, Math.max(target.getUpdateCount(), 0), null);
                    }
                }
                default -> write(sql, durationMs, -1, null);
            }
            return result;
        }

        private void flush() {
            if (pending != null) {
                pending.finish();
                pending = null;
            }
        }
    }

    private final class PendingQuery {
        private final String sql;
        private final long durationMs;
        private long rows;
        private boolean logged;

        PendingQuery(String sql, long durationMs) {
            this.sql = sql;
            this.durationMs = durationMs;
        }

        void finish() {
            if (!logged) {
                logged = true;
                write(sql, durationMs, rows, null);
            }
        }
    }

    private ResultSet wrapResultSet(ResultSet resultSet, PendingQuery pending) {
        return proxy(ResultSet.class, (p, m, a) -> {
            if (m.getName().equals("close")) {
                pending.finish();
            }
            Object result = invoke(resultSet, m, a);
            if (m.getName().equals("next") && Boolean.TRUE.equals(result)) {
                pending.rows++;
            }
            return result;
        });
    }

    // ---------------- log line ----------------

    private void write(String sql, long durationMs, long rows, SQLException error) {
        try {
            String operation = operation(sql);
            List<String> tables = tables(sql, operation);
            // The demo test harness and the schema checker are not application activity.
            if (tables.stream().anyMatch(t -> t.startsWith("demo_"))
                    || (sql != null && sql.toLowerCase(Locale.ROOT).contains("information_schema"))) {
                return;
            }
            String table = tables.isEmpty() ? "unknown" : tables.get(0);
            String category = category(tables);
            String traceId = MDC.get("traceId");
            String line = "event=db_query service=" + service
                    + " traceId=" + (traceId == null ? "none" : traceId)
                    + " dbOperation=" + operation
                    + " table=" + table
                    + " tables=" + (tables.isEmpty() ? "unknown" : String.join(",", tables))
                    + " dataCategory=" + category
                    + " personalData=" + (category.equals("personal_data") || category.equals("credentials") || category.equals("financial"))
                    + " durationMs=" + durationMs
                    + " rows=" + (rows < 0 ? "unknown" : rows)
                    + " slow=" + (durationMs >= slowMs)
                    + " queryFingerprint=" + fingerprint(template(sql))
                    + " sqlTemplate=\"" + template(sql) + "\"";
            if (error != null) {
                log.warn("{} status=error sqlState={} errorCode={}", line, error.getSQLState(), error.getErrorCode());
            } else if (durationMs >= slowMs) {
                log.warn("{} status=success", line);
            } else {
                log.info("{} status=success", line);
            }
        } catch (RuntimeException ignored) {
            // Logging must never break a database call.
        }
    }

    private static final Pattern STRING_LITERAL = Pattern.compile("'(?:[^']|'')*'");
    private static final Pattern NUMBER_LITERAL = Pattern.compile("(?<![\\w.])-?\\d+(?:\\.\\d+)?(?![\\w.])");
    private static final Pattern IN_LIST = Pattern.compile("\\(\\s*\\?(?:\\s*,\\s*\\?)+\\s*\\)");

    /** SQL with every literal replaced by ? (no customer values), whitespace collapsed, at most 400 chars. */
    static String template(String sql) {
        if (sql == null) return "unknown";
        String t = LEADING_COMMENT.matcher(sql).replaceFirst("");
        t = STRING_LITERAL.matcher(t).replaceAll("?");
        t = NUMBER_LITERAL.matcher(t).replaceAll("?");
        t = IN_LIST.matcher(t).replaceAll("(?+)");
        t = t.replaceAll("\\s+", " ").trim().replace('"', '\'');
        return t.length() > 400 ? t.substring(0, 400) + "..." : t;
    }

    static String fingerprint(String template) {
        try {
            byte[] h = java.security.MessageDigest.getInstance("SHA-1")
                    .digest(template.toLowerCase(Locale.ROOT).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(h).substring(0, 16);
        } catch (java.security.NoSuchAlgorithmException e) {
            return "unknown";
        }
    }

    static String operation(String sql) {
        if (sql == null) return "UNKNOWN";
        String s = LEADING_COMMENT.matcher(sql).replaceFirst("").trim();
        int end = 0;
        while (end < s.length() && Character.isLetter(s.charAt(end))) end++;
        return end == 0 ? "UNKNOWN" : s.substring(0, end).toUpperCase(Locale.ROOT);
    }

    static List<String> tables(String sql, String operation) {
        Set<String> found = new LinkedHashSet<>();
        if (sql == null) return new ArrayList<>();
        switch (operation) {
            case "INSERT", "REPLACE" -> add(found, INTO, sql);
            case "UPDATE" -> add(found, UPDATE, sql);
            case "CREATE", "ALTER", "DROP", "TRUNCATE" -> add(found, DDL_TABLE, sql);
            default -> { }
        }
        add(found, FROM, sql);
        add(found, JOIN, sql);
        return new ArrayList<>(found);
    }

    private static void add(Set<String> into, Pattern pattern, String sql) {
        Matcher m = pattern.matcher(sql);
        while (m.find()) {
            String name = m.group(1).replace("`", "");
            int dot = name.lastIndexOf('.');
            if (dot >= 0) name = name.substring(dot + 1);
            if (!name.isBlank() && !name.equalsIgnoreCase("dual") && !name.startsWith("(")) {
                into.add(name.toLowerCase(Locale.ROOT));
            }
        }
    }

    static String category(List<String> tables) {
        String best = "system";
        for (String t : tables) {
            String c = TABLE_CATEGORY.getOrDefault(t, "system");
            if (CATEGORY_ORDER.indexOf(c) < CATEGORY_ORDER.indexOf(best)) best = c;
        }
        return best;
    }

    // ---------------- helpers ----------------

    private static long elapsed(long startNanos) {
        return (System.nanoTime() - startNanos) / 1_000_000;
    }

    @SuppressWarnings("unchecked")
    private static <T> T proxy(Class<T> type, InvocationHandler handler) {
        return (T) Proxy.newProxyInstance(DbQueryLogger.class.getClassLoader(), new Class<?>[] {type}, handler);
    }

    static Object invoke(Object target, Method method, Object[] args) throws Throwable {
        try {
            return method.invoke(target, args);
        } catch (InvocationTargetException e) {
            throw e.getCause();
        }
    }
}
