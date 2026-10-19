package com.shopsmart.paymentservice.client;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class NotificationClient {

    private static final Logger log = LoggerFactory.getLogger(NotificationClient.class);

    private final RestClient client;

    public NotificationClient(@Qualifier("notificationRestClient") RestClient client) {
        this.client = client;
    }

    public void notifyCustomer(Long customerId, String message) {
        if (customerId == null) {
            return;
        }
        try {
            client.post().uri("/internal/notifications")
                    .body(Map.of("recipientId", customerId, "type", "PAYMENT", "message", message))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            log.warn("event=notification_failed service=payment-service customerId={} error={}", customerId,
                    exception.getClass().getSimpleName());
        }
    }
}
