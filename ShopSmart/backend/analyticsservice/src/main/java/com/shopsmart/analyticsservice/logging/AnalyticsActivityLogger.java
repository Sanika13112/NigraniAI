
package com.shopsmart.analyticsservice.logging;

import java.time.Instant;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class AnalyticsActivityLogger {

    private static final Logger logger =
            LoggerFactory.getLogger(AnalyticsActivityLogger.class);

    private final ObjectMapper objectMapper;

    public AnalyticsActivityLogger(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void logReportRequested(String reportType, String outcome) {

        String traceId = MDC.get("traceId");

        AnalyticsActivityEvent event = new AnalyticsActivityEvent(
                UUID.randomUUID().toString(),
                Instant.now(),
                "analytics-service",
                "ANALYTICS_REPORT_REQUESTED",
                traceId,
                reportType,
                outcome
        );

        try {
            String json = objectMapper.writeValueAsString(event);

            logger.info("event=analytics_activity service=analytics-service details={}", json);

        } catch (JsonProcessingException e) {
            logger.error(
                    "Failed to serialize analytics activity event",
                    e
            );
        }
    }
}
