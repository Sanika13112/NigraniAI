
package com.shopsmart.notificationservice.logging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

@Component
public class NotificationActivityLogger {

    private static final Logger logger =
            LoggerFactory.getLogger(NotificationActivityLogger.class);

    private final ObjectMapper objectMapper;

    public NotificationActivityLogger(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    public void logActivity(NotificationActivityEvent event) {
        try {
            logger.info(
                "event=notification_activity service=notification-service details={}",
                objectMapper.writeValueAsString(event)
            );
        } catch (JsonProcessingException exception) {
            logger.error(
                "Failed to serialize notification activity event"
            );
        }
    }
}

