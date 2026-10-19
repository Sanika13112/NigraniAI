package com.shopsmart.orderservice.client;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

@Component
public class PaymentClient {

    private static final Logger log = LoggerFactory.getLogger(PaymentClient.class);

    private final RestClient client;

    public PaymentClient(@Qualifier("paymentRestClient") RestClient client) {
        this.client = client;
    }

    /**
     * Asks payment-service to refund the captured payment for an order.
     * Returns the resulting payment status, or null if the refund could not be started.
     */
    public String requestRefund(Long orderId, String reason) {
        try {
            Map<?, ?> response = client.post()
                    .uri("/internal/payments/order/{orderId}/refund", orderId)
                    .body(Map.of("reason", reason == null ? "" : reason))
                    .retrieve()
                    .body(Map.class);
            Object status = response == null ? null : response.get("status");
            return status == null ? null : status.toString();
        } catch (RestClientException exception) {
            log.error("event=refund_request_failed service=order-service orderId={} error={}", orderId,
                    exception.getClass().getSimpleName());
            return null;
        }
    }

    /** Checks the gateway for a captured payment before an unpaid order is expired. */
    public String reconcile(Long orderId) {
        try {
            Map<?, ?> response = client.post()
                    .uri("/internal/payments/order/{orderId}/reconcile", orderId)
                    .retrieve()
                    .body(Map.class);
            Object status = response == null ? null : response.get("status");
            return status == null ? null : status.toString();
        } catch (RestClientException exception) {
            log.warn("event=payment_reconcile_failed service=order-service orderId={} error={}", orderId,
                    exception.getClass().getSimpleName());
            return null;
        }
    }
}
