
package com.shopsmart.productservice;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;

@Component
public class PrivacyActivityLogger {

    private static final Logger log =
            LoggerFactory.getLogger(PrivacyActivityLogger.class);

    private final ObjectMapper objectMapper;

    public PrivacyActivityLogger(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void logEvent(PrivacyActivityEvent event) {

        if (event == null) {
            throw new IllegalArgumentException(
                    "Privacy activity event cannot be null");
        }

        String traceId = event.getTraceId();

        if (traceId == null || traceId.isBlank()) {
            traceId = MDC.get("traceId");
        }

        // Create a separate map without modifying the original event.
        Map<String, Object> eventData = new LinkedHashMap<>();

        eventData.put("eventId", event.getEventId());
        eventData.put("timestamp", event.getTimestamp());
        eventData.put("service", event.getService());
        eventData.put("eventType", safe(event.getEventType()));
        eventData.put("traceId", safe(traceId));
        eventData.put("actorRef", safe(event.getActorRef()));
        eventData.put("dataCategory", safe(event.getDataCategory()));
        eventData.put("purpose", safe(event.getPurpose()));
        eventData.put("destination", safe(event.getDestination()));
        eventData.put("outcome", safe(event.getOutcome()));

        try {
            String json = objectMapper.writeValueAsString(eventData);
            log.info("{}", json);

        } catch (JsonProcessingException ex) {
            log.error(
                    "event=privacy_activity_json_error service=product-service reason=serialization_failed");
        }
    }

    private String safe(String value) {
        if (value == null || value.isBlank()) {
            return "unknown";
        }

        return value
                .replace('\n', '_')
                .replace('\r', '_')
                .replace('\t', '_');
    }
}
