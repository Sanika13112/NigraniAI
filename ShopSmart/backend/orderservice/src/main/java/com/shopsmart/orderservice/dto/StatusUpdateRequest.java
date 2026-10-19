package com.shopsmart.orderservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record StatusUpdateRequest(
        @NotBlank(message = "Order status is required") String status,
        @Size(max = 300, message = "Note must be at most 300 characters") String note) {
}
