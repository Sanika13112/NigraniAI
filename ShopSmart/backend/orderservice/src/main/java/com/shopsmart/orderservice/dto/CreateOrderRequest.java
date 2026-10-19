package com.shopsmart.orderservice.dto;

import java.math.BigDecimal;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * The customer comes from the access token, never from the body. expectedTotal is what the
 * shopper saw; if server prices changed since then the order is rejected so they can review.
 */
public record CreateOrderRequest(
        @NotEmpty(message = "At least one order item is required")
        @Size(max = 30, message = "An order can contain at most 30 different products")
        List<@Valid OrderItemRequest> items,
        @NotNull(message = "A delivery address is required") @Valid ShippingAddressRequest shippingAddress,
        @NotBlank(message = "Payment method is required") String paymentMethod,
        BigDecimal expectedTotal) {
}
