package com.shopsmart.orderservice.entity;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Embedded;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OrderBy;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import jakarta.persistence.Version;

@Entity
@Table(name = "customer_orders",
        uniqueConstraints = @UniqueConstraint(name = "uk_order_idempotency", columnNames = {"customer_id", "idempotency_key"}),
        indexes = {
                @Index(name = "idx_order_customer", columnList = "customer_id"),
                @Index(name = "idx_order_status_created", columnList = "status, created_at")
        })
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "customer_id", nullable = false)
    private Long customerId;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "order_line_items", joinColumns = @JoinColumn(name = "order_id"))
    private List<OrderItem> items = new ArrayList<>();

    @Column(precision = 12, scale = 2)
    private BigDecimal subtotal;

    @Column(precision = 12, scale = 2)
    private BigDecimal shippingFee;

    @Column(precision = 12, scale = 2)
    private BigDecimal taxAmount;

    @Column(precision = 12, scale = 2)
    private BigDecimal discountAmount;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal totalAmount;

    @Column(length = 3)
    private String currency;

    /** Prices are inclusive of GST, so taxAmount is informational only. */
    private Boolean taxInclusive;

    @Column(length = 20)
    private String paymentMethod;

    @Column(length = 30)
    private String paymentStatus;

    @Column(length = 100)
    private String paymentReference;

    @Column(nullable = false, length = 30)
    private String status;

    @Embedded
    private ShippingAddress shippingAddress;

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "order_status_history", joinColumns = @JoinColumn(name = "order_id"))
    @OrderBy("changedAt ASC")
    private List<StatusChange> statusHistory = new ArrayList<>();

    @Column(length = 300)
    private String cancelReason;

    @Column(length = 300)
    private String returnReason;

    @JsonIgnore
    @Column(name = "idempotency_key", length = 64)
    private String idempotencyKey;

    @JsonIgnore
    @Column(length = 64)
    private String reservationRef;

    @JsonIgnore
    @Version
    private long version;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    private Instant updatedAt;

    private Instant deliveredAt;

    public Order() {
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

    public void changeStatus(String newStatus, String note, String actor) {
        this.status = newStatus;
        this.statusHistory.add(new StatusChange(newStatus, note, actor));
    }

    public boolean awaitingPayment() {
        return OrderStatus.PENDING_PAYMENT.equals(status) || OrderStatus.PENDING.equals(status);
    }

    public Long getId() { return id; }
    public Long getCustomerId() { return customerId; }
    public List<OrderItem> getItems() { return items; }
    public BigDecimal getSubtotal() { return subtotal != null ? subtotal : totalAmount; }
    public BigDecimal getShippingFee() { return shippingFee != null ? shippingFee : BigDecimal.ZERO; }
    public BigDecimal getTaxAmount() { return taxAmount != null ? taxAmount : BigDecimal.ZERO; }
    public BigDecimal getDiscountAmount() { return discountAmount != null ? discountAmount : BigDecimal.ZERO; }
    public BigDecimal getTotalAmount() { return totalAmount; }
    public String getCurrency() { return currency != null ? currency : "INR"; }
    public boolean isTaxInclusive() { return taxInclusive == null || taxInclusive; }
    public String getPaymentMethod() { return paymentMethod; }
    public String getPaymentStatus() { return paymentStatus; }
    public String getPaymentReference() { return paymentReference; }
    public String getStatus() { return status; }
    public ShippingAddress getShippingAddress() { return shippingAddress; }
    public List<StatusChange> getStatusHistory() { return statusHistory; }
    public String getCancelReason() { return cancelReason; }
    public String getReturnReason() { return returnReason; }
    public String getIdempotencyKey() { return idempotencyKey; }
    public String getReservationRef() { return reservationRef; }
    public long getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getDeliveredAt() { return deliveredAt; }

    public void setCustomerId(Long customerId) { this.customerId = customerId; }
    public void setItems(List<OrderItem> items) { this.items = new ArrayList<>(items); }
    public void setSubtotal(BigDecimal subtotal) { this.subtotal = subtotal; }
    public void setShippingFee(BigDecimal shippingFee) { this.shippingFee = shippingFee; }
    public void setTaxAmount(BigDecimal taxAmount) { this.taxAmount = taxAmount; }
    public void setDiscountAmount(BigDecimal discountAmount) { this.discountAmount = discountAmount; }
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }
    public void setCurrency(String currency) { this.currency = currency; }
    public void setTaxInclusive(Boolean taxInclusive) { this.taxInclusive = taxInclusive; }
    public void setPaymentMethod(String paymentMethod) { this.paymentMethod = paymentMethod; }
    public void setPaymentStatus(String paymentStatus) { this.paymentStatus = paymentStatus; }
    public void setPaymentReference(String paymentReference) { this.paymentReference = paymentReference; }
    public void setShippingAddress(ShippingAddress shippingAddress) { this.shippingAddress = shippingAddress; }
    public void setCancelReason(String cancelReason) { this.cancelReason = cancelReason; }
    public void setReturnReason(String returnReason) { this.returnReason = returnReason; }
    public void setIdempotencyKey(String idempotencyKey) { this.idempotencyKey = idempotencyKey; }
    public void setReservationRef(String reservationRef) { this.reservationRef = reservationRef; }
    public void setDeliveredAt(Instant deliveredAt) { this.deliveredAt = deliveredAt; }
}
