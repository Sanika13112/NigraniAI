package com.shopsmart.orderservice.dto;

import java.math.BigDecimal;
import java.util.List;

/** Authoritative server-side prices and availability for a cart. */
public record QuoteResponse(
        List<Line> lines,
        BigDecimal subtotal,
        BigDecimal shippingFee,
        BigDecimal taxAmount,
        BigDecimal discountAmount,
        BigDecimal total,
        String currency,
        boolean taxInclusive,
        boolean valid,
        String shippingNote) {

    public record Line(
            Long productId,
            String name,
            String imageUrl,
            String category,
            BigDecimal unitPrice,
            int quantity,
            BigDecimal lineTotal,
            int availableStock,
            String problem) {
    }
}
