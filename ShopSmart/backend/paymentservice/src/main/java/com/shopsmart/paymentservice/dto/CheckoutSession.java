package com.shopsmart.paymentservice.dto;

/** Only what the browser needs to open Razorpay Checkout. Never contains secrets. */
public record CheckoutSession(
        String provider,
        String mode,
        String keyId,
        String providerOrderId,
        long amount,
        String currency,
        Long orderId,
        String merchantName,
        Prefill prefill) {

    public record Prefill(String name, String email, String contact) {
    }
}
