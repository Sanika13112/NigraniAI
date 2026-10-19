package com.shopsmart.productservice.client;

import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.shopsmart.productservice.security.ApiException;
import com.shopsmart.productservice.security.InternalClients;

/** Asks order-service / customer-service about a customer, for verified-purchase reviews. */
@Component
public class PurchaseClient {

    private static final Logger log = LoggerFactory.getLogger(PurchaseClient.class);

    private final RestClient orders;
    private final RestClient customers;

    public PurchaseClient(
            @Value("${order.service.url:http://localhost:8084}") String orderUrl,
            @Value("${customer.service.url:http://localhost:8081}") String customerUrl,
            @Value("${shopsmart.security.internal-api-key:}") String internalKey) {
        this.orders = InternalClients.create(orderUrl, internalKey);
        this.customers = InternalClients.create(customerUrl, internalKey);
    }

    public boolean hasReceived(Long customerId, Long productId) {
        try {
            Map<?, ?> body = orders.get()
                    .uri("/internal/orders/purchased?customerId={c}&productId={p}", customerId, productId)
                    .retrieve()
                    .body(Map.class);
            return body != null && Boolean.TRUE.equals(body.get("purchased"));
        } catch (RestClientException exception) {
            log.warn("event=purchase_check_failed service=product-service productId={} error={}", productId, exception.getClass().getSimpleName());
            throw ApiException.unavailable("We couldn't verify your purchase right now. Please try again.");
        }
    }

    /** "Asha V." style public name; falls back to "Verified buyer". */
    public String displayName(Long customerId) {
        try {
            Map<?, ?> body = customers.get().uri("/internal/customers/{id}", customerId).retrieve().body(Map.class);
            Object name = body == null ? null : body.get("name");
            if (name instanceof String full && !full.isBlank()) {
                String[] parts = full.trim().split("\\s+");
                String first = parts[0].length() > 30 ? parts[0].substring(0, 30) : parts[0];
                return parts.length > 1 ? first + " " + Character.toUpperCase(parts[parts.length - 1].charAt(0)) + "." : first;
            }
        } catch (RestClientException exception) {
            log.warn("event=reviewer_name_lookup_failed service=product-service error={}", exception.getClass().getSimpleName());
        }
        return "Verified buyer";
    }
}
