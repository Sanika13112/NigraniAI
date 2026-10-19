package com.shopsmart.productservice;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record ReservationRequest(
        @NotBlank @Size(max = 64) String orderRef,
        @NotEmpty @Size(max = 50) List<@Valid Item> items) {

    public record Item(@NotNull @Positive Long productId, @NotNull @Positive Integer quantity) {
    }
}
