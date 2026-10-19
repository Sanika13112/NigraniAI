package com.shopsmart.orderservice.client;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.shopsmart.orderservice.dto.OrderItemRequest;
import com.shopsmart.orderservice.security.ApiException;
import com.shopsmart.orderservice.security.InternalClients;

@Component
public class ProductClient {

    private static final Logger log = LoggerFactory.getLogger(ProductClient.class);

    private final RestClient client;

    public ProductClient(@Qualifier("productRestClient") RestClient client) {
        this.client = client;
    }

    /** Current product data, or null when the product no longer exists. */
    public ProductDetails find(Long productId) {
        try {
            return client.get().uri("/products/{id}", productId).retrieve().body(ProductDetails.class);
        } catch (RestClientResponseException exception) {
            if (exception.getStatusCode().value() == 404) {
                return null;
            }
            throw ApiException.unavailable("The product catalogue is temporarily unavailable. Please try again.");
        } catch (RestClientException exception) {
            throw ApiException.unavailable("The product catalogue is temporarily unavailable. Please try again.");
        }
    }

    public void reserve(String orderRef, List<OrderItemRequest> items) {
        try {
            client.post().uri("/internal/inventory/reserve")
                    .body(Map.of("orderRef", orderRef, "items", items))
                    .retrieve()
                    .toBodilessEntity();
        } catch (RestClientResponseException exception) {
            int status = exception.getStatusCode().value();
            if (status == 409 || status == 400) {
                throw ApiException.conflict(InternalClients.messageOf(exception,
                        "Some items in your cart are no longer available"));
            }
            throw ApiException.unavailable("We couldn't reserve stock right now. Please try again.");
        } catch (RestClientException exception) {
            throw ApiException.unavailable("We couldn't reserve stock right now. Please try again.");
        }
    }

    /** Returns reserved stock. Failures are logged; release is idempotent and can be retried. */
    public boolean release(String orderRef) {
        if (orderRef == null) {
            return true;
        }
        try {
            client.post().uri("/internal/inventory/release")
                    .body(Map.of("orderRef", orderRef))
                    .retrieve()
                    .toBodilessEntity();
            return true;
        } catch (RestClientException exception) {
            log.error("event=inventory_release_failed service=order-service orderRef={} error={}", orderRef,
                    exception.getClass().getSimpleName());
            return false;
        }
    }

    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class ProductDetails {
        private Long id;
        private String name;
        private String category;
        private String imageUrl;
        private BigDecimal price;
        private int stockQuantity;

        public ProductDetails() {
        }

        public Long getId() { return id; }
        public void setId(Long id) { this.id = id; }
        public String getName() { return name; }
        public void setName(String name) { this.name = name; }
        public String getCategory() { return category; }
        public void setCategory(String category) { this.category = category; }
        public String getImageUrl() { return imageUrl; }
        public void setImageUrl(String imageUrl) { this.imageUrl = imageUrl; }
        public BigDecimal getPrice() { return price; }
        public void setPrice(BigDecimal price) { this.price = price; }
        public int getStockQuantity() { return stockQuantity; }
        public void setStockQuantity(int stockQuantity) { this.stockQuantity = stockQuantity; }

        public boolean isSellable() {
            return id != null && name != null && !name.isBlank()
                    && price != null && price.signum() > 0;
        }
    }
}
