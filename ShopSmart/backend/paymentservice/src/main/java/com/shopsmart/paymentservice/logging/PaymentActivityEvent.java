
package com.shopsmart.paymentservice.logging;

import java.time.Instant;
import java.util.UUID;

public class PaymentActivityEvent {

    private String eventId;
    private Instant timestamp;
    private String service;
    private String eventType;
    private String traceId;
    private Long paymentId;
    private Long orderId;
    private String outcome;

    public PaymentActivityEvent() {
    }

    public PaymentActivityEvent(
            String eventType,
            String traceId,
            Long paymentId,
            Long orderId,
            String outcome) {

        this.eventId = UUID.randomUUID().toString();
        this.timestamp = Instant.now();
        this.service = "payment-service";
        this.eventType = eventType;
        this.traceId = traceId;
        this.paymentId = paymentId;
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

    public Long getPaymentId() {
        return paymentId;
    }

    public Long getOrderId() {
        return orderId;
    }

    public String getOutcome() {
        return outcome;
    }
}
