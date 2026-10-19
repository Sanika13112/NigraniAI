package com.shopsmart.paymentservice.client;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.shopsmart.paymentservice.dto.OrderSnapshot;
import com.shopsmart.paymentservice.security.ApiException;

@Component
public class OrderClient {

    private static final Logger log = LoggerFactory.getLogger(OrderClient.class);

    private final RestClient client;

    public OrderClient(@Qualifier("orderRestClient") RestClient client) {
        this.client = client;
    }

    public OrderSnapshot get(Long orderId) {
        try {
            return client.get().uri("/internal/orders/{id}", orderId).retrieve().body(OrderSnapshot.class);
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 404) {
                throw ApiException.notFound("Order not found");
            }
            throw ApiException.unavailable("Order information is temporarily unavailable. Please try again.");
        } catch (RestClientException exception) {
            throw ApiException.unavailable("Order information is temporarily unavailable. Please try again.");
        }
    }

    /** Returns true when the order accepted the payment, false when it refused (e.g. already cancelled). */
    public boolean confirmPaid(Long orderId, String paymentReference) {
        try {
            client.post().uri("/internal/orders/{id}/payment-confirmed", orderId)
                    .body(Map.of("paymentReference", paymentReference))
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 409) {
                return false;
            }
            throw ApiException.unavailable("Order service is temporarily unavailable");
        } catch (RestClientException exception) {
            throw ApiException.unavailable("Order service is temporarily unavailable");
        }
    }

    public void updatePaymentStatus(Long orderId, String paymentStatus) {
        try {
            client.post().uri("/internal/orders/{id}/payment-status", orderId)
                    .body(Map.of("paymentStatus", paymentStatus))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientException exception) {
            log.error("event=order_payment_status_sync_failed service=payment-service orderId={} status={} error={}",
                    orderId, paymentStatus, exception.getClass().getSimpleName());
        }
    }
}
