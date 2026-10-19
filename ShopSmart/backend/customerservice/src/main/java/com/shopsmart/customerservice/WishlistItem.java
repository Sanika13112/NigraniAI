package com.shopsmart.customerservice;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Entity
@Table(name = "customer_wishlist",
        uniqueConstraints = @UniqueConstraint(name = "uk_wishlist_customer_product", columnNames = {"customerId", "productId"}))
public class WishlistItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long customerId;

    @Column(nullable = false)
    private Long productId;

    @Column(nullable = false)
    private Instant addedAt = Instant.now();

    public WishlistItem() {
    }

    public WishlistItem(Long customerId, Long productId) {
        this.customerId = customerId;
        this.productId = productId;
    }

    public Long getId() { return id; }
    public Long getCustomerId() { return customerId; }
    public Long getProductId() { return productId; }
    public Instant getAddedAt() { return addedAt; }
}
