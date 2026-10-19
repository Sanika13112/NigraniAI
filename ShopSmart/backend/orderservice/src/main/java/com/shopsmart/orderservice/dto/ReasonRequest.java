package com.shopsmart.orderservice.dto;

import jakarta.validation.constraints.Size;

public record ReasonRequest(@Size(max = 300, message = "Reason must be at most 300 characters") String reason) {
}
