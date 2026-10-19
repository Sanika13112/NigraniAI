package com.shopsmart.customerservice.client;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.shopsmart.customerservice.security.InternalClients;

/** Internal calls from customer-service to notification-service and authentication-service. */
@Component
public class PlatformClients {

    private static final Logger log = LoggerFactory.getLogger(PlatformClients.class);

    private final RestClient notifications;
    private final RestClient auth;

    public PlatformClients(
            @Value("${notification.service.url:http://localhost:8086}") String notificationUrl,
            @Value("${auth.service.url:http://localhost:8083}") String authUrl,
            @Value("${shopsmart.security.internal-api-key:}") String internalKey) {
        this.notifications = InternalClients.create(notificationUrl, internalKey);
        this.auth = InternalClients.create(authUrl, internalKey);
    }

    /** Best effort: returns false when the notification could not be created. */
    public boolean sendPromotion(Long customerId, String message) {
        try {
            notifications.post().uri("/internal/notifications")
                    .body(Map.of("recipientId", customerId, "type", "PROMOTION", "message", message))
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (RestClientException e) {
            log.warn("event=promotion_delivery_failed service=customer-service customerRef=customer:{} error={}",
                    customerId, e.getClass().getSimpleName());
            return false;
        }
    }

    /** Erases the login account that belongs to a customer. Returns false if it should be retried. */
    public boolean eraseLoginAccount(Long customerId) {
        try {
            auth.post().uri("/internal/auth/customers/{id}/erase", customerId)
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (RestClientException e) {
            log.warn("event=login_erasure_failed service=customer-service customerRef=customer:{} error={}",
                    customerId, e.getClass().getSimpleName());
            return false;
        }
    }
}
