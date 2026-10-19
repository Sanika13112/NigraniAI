package com.shopsmart.productservice;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import jakarta.persistence.CollectionTable;
import jakarta.persistence.Column;
import jakarta.persistence.ElementCollection;
import jakarta.persistence.Embeddable;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.Table;

/** Stock held for one order. Releasing it returns the quantities to the shelf exactly once. */
@Entity
@Table(name = "inventory_reservations")
public class InventoryReservation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String orderRef;

    @Column(nullable = false, length = 20)
    private String status = "RESERVED";

    @ElementCollection(fetch = FetchType.EAGER)
    @CollectionTable(name = "inventory_reservation_lines", joinColumns = @JoinColumn(name = "reservation_id"))
    private List<Line> lines = new ArrayList<>();

    @Column(nullable = false)
    private Instant createdAt = Instant.now();

    private Instant releasedAt;

    public InventoryReservation() {
    }

    public InventoryReservation(String orderRef, List<Line> lines) {
        this.orderRef = orderRef;
        this.lines = new ArrayList<>(lines);
    }

    public Long getId() { return id; }
    public String getOrderRef() { return orderRef; }
    public String getStatus() { return status; }
    public List<Line> getLines() { return lines; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getReleasedAt() { return releasedAt; }

    public void markReleased() {
        this.status = "RELEASED";
        this.releasedAt = Instant.now();
    }

    @Embeddable
    public static class Line {

        @Column(nullable = false)
        private Long productId;

        @Column(nullable = false)
        private int quantity;

        public Line() {
        }

        public Line(Long productId, int quantity) {
            this.productId = productId;
            this.quantity = quantity;
        }

        public Long getProductId() { return productId; }
        public int getQuantity() { return quantity; }
    }
}
