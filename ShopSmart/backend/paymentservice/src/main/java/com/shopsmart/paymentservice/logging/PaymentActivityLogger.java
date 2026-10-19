
package com.shopsmart.paymentservice.logging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class PaymentActivityLogger {

    private static final Logger logger =
            LoggerFactory.getLogger(PaymentActivityLogger.class);

    private final ObjectMapper objectMapper;

    public PaymentActivityLogger(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void logPaymentActivity(PaymentActivityEvent event) {
        try {
            String json = objectMapper.writeValueAsString(event);

            logger.info("event=payment_activity service=payment-service details={}", json);

        } catch (JsonProcessingException exception) {
            logger.error("Failed to serialize payment activity event");
        }
    }
}
