
package com.shopsmart.notificationservice.logging;

import java.time.Instant;
import java.util.UUID;

public class NotificationActivityEvent {

    private String eventId;
    private Instant timestamp;
    private String service;
    private String eventType;
    private String traceId;
    private Long notificationId;
    private Long recipientId;
    private String notificationType;
    private String outcome;

    public NotificationActivityEvent() {
    }

    public NotificationActivityEvent(
            String eventType,
            String traceId,
            Long notificationId,
            Long recipientId,
            String notificationType,
            String outcome) {

        this.eventId = UUID.randomUUID().toString();
        this.timestamp = Instant.now();
        this.service = "notification-service";
        this.eventType = eventType;
        this.traceId = traceId;
        this.notificationId = notificationId;
        this.recipientId = recipientId;
        this.notificationType = notificationType;
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

    public Long getNotificationId() {
        return notificationId;
    }

    public Long getRecipientId() {
        return recipientId;
    }

    public String getNotificationType() {
        return notificationType;
    }

    public String getOutcome() {
        return outcome;
    }
}
