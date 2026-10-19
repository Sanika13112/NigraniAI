package com.shopsmart.analyticsservice.logging;

import java.time.Instant;

public class AnalyticsActivityEvent {

    private String eventId;
    private Instant timestamp;
    private String service;
    private String eventType;
    private String traceId;
    private String reportType;
    private String outcome;

    public AnalyticsActivityEvent() {
    }

    public AnalyticsActivityEvent(
            String eventId,
            Instant timestamp,
            String service,
            String eventType,
            String traceId,
            String reportType,
            String outcome) {

        this.eventId = eventId;
        this.timestamp = timestamp;
        this.service = service;
        this.eventType = eventType;
        this.traceId = traceId;
        this.reportType = reportType;
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

    public String getReportType() {
        return reportType;
    }

    public String getOutcome() {
        return outcome;
    }
}
