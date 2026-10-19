package com.shopsmart.paymentservice.entity;

import java.math.BigDecimal;
import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.Version;

/**
 * One gateway payment record per ShopSmart order. The gateway order can receive several
 * attempts (failed card, retried UPI); this row becomes CAPTURED only after server verification.
 * No card numbers, CVVs, UPI PINs or secrets are ever stored.
 */
@Entity
@Table(name = "payments")
public class Payment {

    public static final String CREATED = "CREATED";
    public static final String CAPTURED = "CAPTURED";
    public static final String REFUND_PENDING = "REFUND_PENDING";
    public static final String REFUNDED = "REFUNDED";
    public static final String REFUND_FAILED = "REFUND_FAILED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private Long orderId;

    private Long customerId;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal amount;

    @Column(length = 3)
    private String currency;

    @Column(nullable = false, length = 30)
    private String status;

    /** Kept for compatibility with existing rows; always ONLINE for gateway payments. */
    @Column(nullable = false, length = 30)
    private String paymentMethod;

    @Column(length = 20)
    private String provider;

    /** TEST (sandbox) or LIVE. */
    @Column(length = 10)
    private String mode;

    @Column(unique = true, length = 64)
    private String providerOrderId;

    @Column(unique = true, length = 64)
    private String providerPaymentId;

    /** Method reported by the gateway (upi, card, netbanking, wallet...). */
    @Column(length = 30)
    private String providerMethod;

    @Column(length = 300)
    private String failureReason;

    @Column(length = 64)
    private String refundId;

    @Column(nullable = false, updatable = false)
    private Instant createdAt;

    private Instant updatedAt;

    private Instant capturedAt;

    @JsonIgnore
    @Version
    private long version;

    public Payment() {
    }

    public Payment(Long orderId, Long customerId, BigDecimal amount, String currency,
                   String provider, String mode, String providerOrderId) {
        this.orderId = orderId;
        this.customerId = customerId;
        this.amount = amount;
        this.currency = currency;
        this.provider = provider;
        this.mode = mode;
        this.providerOrderId = providerOrderId;
        this.paymentMethod = "ONLINE";
        this.status = CREATED;
    }

    @PrePersist
    public void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
        updatedAt = Instant.now();
    }

    @PreUpdate
    public void onUpdate() {
        updatedAt = Instant.now();
    }

    public void markCaptured(String providerPaymentId, String providerMethod) {
        this.status = CAPTURED;
        this.providerPaymentId = providerPaymentId;
        this.providerMethod = providerMethod;
        this.failureReason = null;
        this.capturedAt = Instant.now();
    }

    public boolean isLegacySimulated() {
        return provider == null;
    }

    public Long getId() { return id; }
    public Long getOrderId() { return orderId; }
    public Long getCustomerId() { return customerId; }
    public BigDecimal getAmount() { return amount; }
    public String getCurrency() { return currency != null ? currency : "INR"; }
    public String getStatus() { return status; }
    public String getPaymentMethod() { return paymentMethod; }
    public String getProvider() { return provider != null ? provider : "LEGACY_SIMULATED"; }
    public String getMode() { return mode != null ? mode : "SIMULATED"; }
    public String getProviderOrderId() { return providerOrderId; }
    public String getProviderPaymentId() { return providerPaymentId; }
    public String getProviderMethod() { return providerMethod; }
    public String getFailureReason() { return failureReason; }
    public String getRefundId() { return refundId; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getCapturedAt() { return capturedAt; }

    public void setStatus(String status) { this.status = status; }
    public void setFailureReason(String failureReason) { this.failureReason = failureReason; }
    public void setRefundId(String refundId) { this.refundId = refundId; }
}
