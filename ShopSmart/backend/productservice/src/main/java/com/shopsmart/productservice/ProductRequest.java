package com.shopsmart.productservice;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** Admin create/update payload. It has no id field, so a create can never overwrite a product. */
public record ProductRequest(
        @NotBlank(message = "Product name is required") @Size(max = 180, message = "Name must be at most 180 characters") String name,
        @NotBlank(message = "Product description is required") @Size(max = 2000, message = "Description must be at most 2000 characters") String description,
        @NotNull(message = "Price is required")
        @DecimalMin(value = "1.00", message = "Price must be at least ₹1")
        @DecimalMax(value = "10000000.00", message = "Price is too large")
        @Digits(integer = 10, fraction = 2, message = "Price can have at most 2 decimal places") BigDecimal price,
        @NotBlank(message = "Category is required") String category,
        @NotNull(message = "Stock quantity is required")
        @Min(value = 0, message = "Stock quantity cannot be negative")
        @Max(value = 1000000, message = "Stock quantity is too large") Integer stockQuantity,
        @Size(max = 2048, message = "Image URL is too long") String imageUrl) {
}
