package com.shopsmart.productservice;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record ReviewRequest(
        @NotNull(message = "Choose a star rating") @Min(value = 1, message = "Rating must be 1 to 5") @Max(value = 5, message = "Rating must be 1 to 5") Integer rating,
        @Size(max = 120, message = "Title must be at most 120 characters") String title,
        @Size(max = 2000, message = "Review must be at most 2000 characters") String comment) {
}
