
package com.shopsmart.orderservice.logging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class OrderActivityLogger {

    private static final Logger log =
            LoggerFactory.getLogger(OrderActivityLogger.class);

    private final ObjectMapper objectMapper;

    public OrderActivityLogger(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void logActivity(
            String eventType,
            String traceId,
            Long orderId,
            String outcome) {

        OrderActivityEvent event = new OrderActivityEvent(
                eventType,
                traceId,
                orderId,
                outcome
        );

        try {
            String json = objectMapper.writeValueAsString(event);
            log.info("event=order_activity service=order-service details={}", json);
        } catch (JsonProcessingException ex) {
            log.error(
                    "event=order_activity_serialization_failed service=order-service eventType={} orderId={}",
                    eventType,
                    orderId
            );
        }
    }
}
