package com.shopsmart.productservice;

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

@Entity
@Table(name = "products")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    @Column(length = 2000)
    private String description;

    @Column(precision = 12, scale = 2)
    private BigDecimal price;

    private String category;

    private int stockQuantity;

    @Column(name = "image_url", length = 2048)
    private String imageUrl;

    @JsonIgnore
    @Column(name = "seed_key", unique = true, length = 80)
    private String seedKey;

    private Instant updatedAt;

    /** Average of verified-buyer reviews (null until the first review). */
    @Column(precision = 3, scale = 2)
    private BigDecimal ratingAverage;

    private Integer ratingCount;

    public Product() {
    }

    public Product(String name, String description, BigDecimal price,
                   String category, int stockQuantity, String imageUrl) {
        this.name = name;
        this.description = description;
        this.price = price;
        this.category = category;
        this.stockQuantity = stockQuantity;
        this.imageUrl = imageUrl;
    }

    @PrePersist
    @PreUpdate
    public void touch() {
        updatedAt = Instant.now();
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public String getDescription() { return description; }
    public BigDecimal getPrice() { return price; }
    public String getCategory() { return category; }
    public int getStockQuantity() { return stockQuantity; }
    public String getImageUrl() { return imageUrl; }
    public String getSeedKey() { return seedKey; }
    public Instant getUpdatedAt() { return updatedAt; }

    public BigDecimal getRatingAverage() { return ratingAverage; }
    public int getRatingCount() { return ratingCount == null ? 0 : ratingCount; }

    public void setRating(BigDecimal average, int count) {
        this.ratingAverage = average;
        this.ratingCount = count;
    }

    public boolean isInStock() {
        return stockQuantity > 0;
    }

    public void setName(String name) { this.name = name; }
    public void setDescription(String description) { this.description = description; }
    public void setPrice(BigDecimal price) { this.price = price; }
    public void setCategory(String category) { this.category = category; }
    public void setStockQuantity(int stockQuantity) { this.stockQuantity = stockQuantity; }
    public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
    public void setSeedKey(String seedKey) { this.seedKey = seedKey; }
}
