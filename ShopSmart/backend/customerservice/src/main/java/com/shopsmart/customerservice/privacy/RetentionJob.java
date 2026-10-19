package com.shopsmart.customerservice.privacy;

import java.time.Duration;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import com.shopsmart.customerservice.Customer;
import com.shopsmart.customerservice.CustomerRepository;
import com.shopsmart.customerservice.CustomerService;
import com.shopsmart.customerservice.client.PlatformClients;
import com.shopsmart.customerservice.demo.DemoSwitches;
import com.shopsmart.customerservice.demo.GroundTruth;

/**
 * Retention policy: when a customer asks to delete their account, their personal data is erased
 * once the erasure window has passed (short in the demo so it can be watched live).
 * With the RETENTION_BYPASS demo switch on, the sweep finds overdue records but skips them.
 */
@Component
public class RetentionJob {

    private static final Logger log = LoggerFactory.getLogger(RetentionJob.class);

    private final CustomerRepository customers;
    private final CustomerService customerService;
    private final PlatformClients platform;
    private final DemoSwitches demo;
    private final GroundTruth groundTruth;
    private final long eraseAfterSeconds;
    private final long sweepSeconds;
    private final Set<Long> reportedOverdue = new HashSet<>();
    private final ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(r -> {
        Thread t = new Thread(r, "retention-sweep");
        t.setDaemon(true);
        return t;
    });

    public RetentionJob(CustomerRepository customers, CustomerService customerService, PlatformClients platform,
                        DemoSwitches demo, GroundTruth groundTruth,
                        @Value("${shopsmart.retention.erase-after-seconds:120}") long eraseAfterSeconds,
                        @Value("${shopsmart.retention.sweep-seconds:30}") long sweepSeconds) {
        this.customers = customers;
        this.customerService = customerService;
        this.platform = platform;
        this.demo = demo;
        this.groundTruth = groundTruth;
        this.eraseAfterSeconds = eraseAfterSeconds;
        this.sweepSeconds = Math.max(10, sweepSeconds);
    }

    public long eraseAfterSeconds() {
        return eraseAfterSeconds;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void start() {
        timer.scheduleWithFixedDelay(this::sweep, sweepSeconds, sweepSeconds, TimeUnit.SECONDS);
    }

    synchronized void sweep() {
        MDC.put("traceId", "retention-" + Instant.now().toEpochMilli());
        try {
            Instant now = Instant.now();
            List<Customer> overdue = customers.findByDeletionRequestedAtBeforeAndErasedAtIsNull(
                    now.minusSeconds(eraseAfterSeconds));
            if (overdue.isEmpty()) {
                reportedOverdue.clear();
                return;
            }
            if (demo.on(DemoSwitches.RETENTION_BYPASS)) {
                log.info("event=retention_sweep service=customer-service traceId={} policy=erase_after_{}s "
                        + "overdueRecords={} action=skipped reason=erasure_job_disabled", MDC.get("traceId"),
                        eraseAfterSeconds, overdue.size());
                for (Customer c : overdue) {
                    if (reportedOverdue.add(c.getId())) {
                        long overdueSeconds = Duration.between(c.getDeletionRequestedAt().plusSeconds(eraseAfterSeconds), now).toSeconds();
                        log.info("event=retention_overdue service=customer-service traceId={} customerRef=customer:{} "
                                        + "retentionPolicy=erase_after_{}s erasureRequestedAt={} retentionDeadline={} "
                                        + "overdueSeconds={} disposalStatus=retained dataCategory=personal_data "
                                        + "demo=true scenario=RETENTION_BYPASS",
                                MDC.get("traceId"), c.getId(), eraseAfterSeconds, c.getDeletionRequestedAt(),
                                c.getDeletionRequestedAt().plusSeconds(eraseAfterSeconds), overdueSeconds);
                        groundTruth.record("RETENTION_EXCEEDED", List.of("PERSON", "EMAIL_ADDRESS", "PHONE_NUMBER", "LOCATION"),
                                "customer:" + c.getId(), "customer-service.log", log.getName(), null,
                                "Erasure requested at " + c.getDeletionRequestedAt() + " but personal data kept "
                                        + overdueSeconds + "s past the " + eraseAfterSeconds + "s retention window");
                    }
                }
                return;
            }
            reportedOverdue.clear();
            for (Customer c : overdue) {
                if (!platform.eraseLoginAccount(c.getId())) {
                    continue; // retried on the next sweep
                }
                customerService.erase(c);
                long lateBy = Duration.between(c.getDeletionRequestedAt().plusSeconds(eraseAfterSeconds), now).toSeconds();
                log.info("event=retention_erasure service=customer-service traceId={} customerRef=customer:{} "
                                + "policy=erase_after_{}s retentionDeadline={} secondsAfterDue={} disposalStatus=erased "
                                + "erased=customer_profile,addresses,wishlist,login_account "
                                + "retained=orders lawfulBasisForRetained=tax_record_obligation",
                        MDC.get("traceId"), c.getId(), eraseAfterSeconds,
                        c.getDeletionRequestedAt().plusSeconds(eraseAfterSeconds), lateBy);
            }
        } catch (RuntimeException e) {
            log.warn("event=retention_sweep_failed service=customer-service error={}", e.getClass().getSimpleName());
        } finally {
            MDC.remove("traceId");
        }
    }
}
