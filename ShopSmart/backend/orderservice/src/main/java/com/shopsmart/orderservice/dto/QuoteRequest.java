package com.shopsmart.orderservice.dto;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;

public record QuoteRequest(
        @NotEmpty(message = "At least one item is required") @Size(max = 30) List<@Valid OrderItemRequest> items) {
}
