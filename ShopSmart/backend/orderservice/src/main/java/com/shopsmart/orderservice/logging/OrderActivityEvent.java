
package com.shopsmart.orderservice.logging;

import java.time.Instant;
import java.util.UUID;

public class OrderActivityEvent {

    private String eventId;
    private Instant timestamp;
    private String service;
    private String eventType;
    private String traceId;
    private Long orderId;
    private String outcome;

    public OrderActivityEvent() {
    }

    public OrderActivityEvent(
            String eventType,
            String traceId,
            Long orderId,
            String outcome) {

        this.eventId = UUID.randomUUID().toString();
        this.timestamp = Instant.now();
        this.service = "order-service";
        this.eventType = eventType;
        this.traceId = traceId;
        this.orderId = orderId;
        this.outcome = outcome;
    }

    public String getEventId() {
        return eventId;
    }

    public Instant getTimestamp() {
        return timestamp;
    }

    public String getService() {
        return service;
    }

    public String getEventType() {
        return eventType;
    }

    public String getTraceId() {
        return traceId;
    }

    public Long getOrderId() {
        return orderId;
    }

    public String getOutcome() {
        return outcome;
    }
}
