package com.shopsmart.productservice;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

/** Audit trail for every manual inventory change made by staff. */
@Entity
@Table(name = "product_stock_adjustments", indexes = @Index(name = "idx_stock_adj_product", columnList = "productId"))
public class StockAdjustment {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long productId;

    @Column(nullable = false, length = 180)
    private String productName;

    @Column(nullable = false)
    private int delta;

    @Column(nullable = false)
    private int resultingStock;

    @Column(nullable = false, length = 200)
    private String reason;

    @Column(nullable = false)
    private Long actorUserId;

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    public StockAdjustment() {
    }

    public StockAdjustment(Long productId, String productName, int delta, int resultingStock,
                           String reason, Long actorUserId) {
        this.productId = productId;
        this.productName = productName;
        this.delta = delta;
        this.resultingStock = resultingStock;
        this.reason = reason;
        this.actorUserId = actorUserId;
    }

    public Long getId() { return id; }
    public Long getProductId() { return productId; }
    public String getProductName() { return productName; }
    public int getDelta() { return delta; }
    public int getResultingStock() { return resultingStock; }
    public String getReason() { return reason; }
    public Long getActorUserId() { return actorUserId; }
    public Instant getCreatedAt() { return createdAt; }
}
