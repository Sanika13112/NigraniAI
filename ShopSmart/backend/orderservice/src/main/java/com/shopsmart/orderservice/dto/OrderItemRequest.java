package com.shopsmart.orderservice.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

public record OrderItemRequest(
        @NotNull(message = "Product ID is required") @Positive(message = "Product ID must be positive") Long productId,
        @NotNull(message = "Quantity is required") @Positive(message = "Quantity must be positive")
        @Max(value = 10, message = "You can order at most 10 of each product") Integer quantity) {
}
