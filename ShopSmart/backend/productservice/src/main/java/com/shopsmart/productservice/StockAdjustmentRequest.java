package com.shopsmart.productservice;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record StockAdjustmentRequest(
        @NotNull(message = "Adjustment is required")
        @Min(value = -1000000, message = "Adjustment is too large")
        @Max(value = 1000000, message = "Adjustment is too large") Integer delta,
        @NotBlank(message = "A reason is required") @Size(max = 200, message = "Reason must be at most 200 characters") String reason) {
}
