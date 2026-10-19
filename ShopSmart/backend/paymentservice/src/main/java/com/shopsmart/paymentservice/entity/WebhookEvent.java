package com.shopsmart.paymentservice.entity;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Gateway webhook ids already processed, so duplicate deliveries are ignored. */
@Entity
@Table(name = "payment_webhook_events")
public class WebhookEvent {

    @Id
    @Column(length = 100)
    private String eventId;

    @Column(length = 60)
    private String eventType;

    @Column(nullable = false)
    private Instant receivedAt = Instant.now();

    public WebhookEvent() {
    }

    public WebhookEvent(String eventId, String eventType) {
        this.eventId = eventId;
        this.eventType = eventType;
    }

    public String getEventId() { return eventId; }
    public String getEventType() { return eventType; }
    public Instant getReceivedAt() { return receivedAt; }
}
