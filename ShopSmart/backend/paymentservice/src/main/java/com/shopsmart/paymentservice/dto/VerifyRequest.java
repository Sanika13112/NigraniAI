package com.shopsmart.paymentservice.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;

public record VerifyRequest(
        @NotNull @Positive Long orderId,
        @NotBlank @Pattern(regexp = "order_[A-Za-z0-9]{6,40}") String razorpayOrderId,
        @NotBlank @Pattern(regexp = "pay_[A-Za-z0-9]{6,40}") String razorpayPaymentId,
        @NotBlank @Pattern(regexp = "[a-f0-9]{64}") String razorpaySignature) {
}
