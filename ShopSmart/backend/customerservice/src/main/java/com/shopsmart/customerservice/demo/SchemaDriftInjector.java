package com.shopsmart.customerservice.demo;

import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import com.shopsmart.customerservice.dblog.SchemaLogger;

/**
 * SCHEMA_DRIFT demo switch: adds an unregistered personal-data column (customers.alternate_mobile)
 * and copies phone numbers into it, as a quick feature change might. Turning the switch off
 * removes the column again. Both changes show up in the DB log and the schema log.
 */
@Component
public class SchemaDriftInjector {

    private static final Logger log = LoggerFactory.getLogger(SchemaDriftInjector.class);
    private static final String TABLE = "customers";
    private static final String COLUMN = "alternate_mobile";

    private final JdbcTemplate jdbc;
    private final DemoSwitches demo;
    private final GroundTruth groundTruth;
    private final SchemaLogger schemaLogger;
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "schema-drift-demo");
        t.setDaemon(true);
        return t;
    });

    public SchemaDriftInjector(JdbcTemplate jdbc, DemoSwitches demo, GroundTruth groundTruth, SchemaLogger schemaLogger) {
        this.jdbc = jdbc;
        this.demo = demo;
        this.groundTruth = groundTruth;
        this.schemaLogger = schemaLogger;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        timer.scheduleWithFixedDelay(this::apply, 15, 5, TimeUnit.SECONDS);
    }

    private void apply() {
        try {
            boolean wanted = demo.on(DemoSwitches.SCHEMA_DRIFT);
            boolean present = columnExists();
            if (wanted && !present) {
                jdbc.execute("ALTER TABLE " + TABLE + " ADD COLUMN " + COLUMN + " VARCHAR(15) NULL");
                int copied = jdbc.update("UPDATE " + TABLE + " SET " + COLUMN + " = phone WHERE phone IS NOT NULL");
                log.info("event=schema_change_applied service=customer-service table={} column={} change=column_added "
                        + "columnType=varchar(15) classification=unregistered copiedFrom=phone copiedRows={} "
                        + "actor=demo-switch demo=true scenario=SCHEMA_DRIFT", TABLE, COLUMN, copied);
                groundTruth.record("SCHEMA_DRIFT", List.of("PHONE_NUMBER"), "table:" + TABLE, "customer-service-db.log",
                        "com.shopsmart.customerservice.dblog", null,
                        "Unregistered column " + TABLE + "." + COLUMN + " added and filled with " + copied
                                + " phone numbers (not in the declared data inventory)");
                schemaLogger.checkNow();
            } else if (!wanted && present) {
                jdbc.execute("ALTER TABLE " + TABLE + " DROP COLUMN " + COLUMN);
                log.info("event=schema_change_applied service=customer-service table={} column={} change=column_removed "
                        + "actor=demo-switch demo=true scenario=SCHEMA_DRIFT", TABLE, COLUMN);
                schemaLogger.checkNow();
            }
        } catch (RuntimeException e) {
            log.warn("event=schema_drift_demo_failed service=customer-service error={}", e.getClass().getSimpleName());
        }
    }

    /** Checks through JDBC metadata, so it works on MySQL and PostgreSQL (Supabase). */
    private boolean columnExists() {
        Boolean exists = jdbc.execute((ConnectionCallback<Boolean>) con -> {
            DatabaseMetaData md = con.getMetaData();
            for (String t : List.of(TABLE, TABLE.toUpperCase())) {
                for (String c : List.of(COLUMN, COLUMN.toUpperCase())) {
                    try (ResultSet rs = md.getColumns(con.getCatalog(), con.getSchema(), t, c)) {
                        if (rs.next()) {
                            return true;
                        }
                    }
                }
            }
            return false;
        });
        return Boolean.TRUE.equals(exists);
    }
}
