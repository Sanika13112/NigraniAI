package com.shopsmart.productservice;

import java.time.Instant;

import com.fasterxml.jackson.annotation.JsonIgnore;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

/** A rating and optional written review. One per customer per product, verified buyers only. */
@Entity
@Table(name = "product_reviews",
        uniqueConstraints = @UniqueConstraint(name = "uk_review_product_customer", columnNames = {"productId", "customerId"}),
        indexes = @Index(name = "idx_review_product", columnList = "productId"))
public class Review {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private Long productId;

    @JsonIgnore
    @Column(nullable = false)
    private Long customerId;

    /** Display name shown publicly (first name and last initial). */
    @Column(nullable = false, length = 60)
    private String reviewerName;

    @Column(nullable = false)
    private int rating;

    @Column(length = 120)
    private String title;

    @Column(length = 2000)
    private String comment;

    @Column(nullable = false)
    private boolean verifiedPurchase = true;

    private Instant createdAt;
    private Instant updatedAt;

    @PrePersist
    public void onCreate() {
        createdAt = Instant.now();
        updatedAt = createdAt;
    }

    @PreUpdate
    public void onUpdate() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public Long getProductId() { return productId; }
    public Long getCustomerId() { return customerId; }
    public String getReviewerName() { return reviewerName; }
    public int getRating() { return rating; }
    public String getTitle() { return title; }
    public String getComment() { return comment; }
    public boolean isVerifiedPurchase() { return verifiedPurchase; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void setProductId(Long productId) { this.productId = productId; }
    public void setCustomerId(Long customerId) { this.customerId = customerId; }
    public void setReviewerName(String reviewerName) { this.reviewerName = reviewerName; }
    public void setRating(int rating) { this.rating = rating; }
    public void setTitle(String title) { this.title = title; }
    public void setComment(String comment) { this.comment = comment; }
}
