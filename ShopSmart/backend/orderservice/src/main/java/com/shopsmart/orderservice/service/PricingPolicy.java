package com.shopsmart.orderservice.service;

import java.math.BigDecimal;
import java.math.RoundingMode;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Shipping rules come from configuration so the storefront never invents charges.
 * Defaults: no shipping fee. Catalogue prices are treated as GST-inclusive.
 */
@Component
public class PricingPolicy {

    private final BigDecimal flatFee;
    private final BigDecimal freeAbove;

    public PricingPolicy(
            @Value("${shopsmart.shipping.flat-fee:0}") BigDecimal flatFee,
            @Value("${shopsmart.shipping.free-above:0}") BigDecimal freeAbove) {
        if (flatFee.signum() < 0 || freeAbove.signum() < 0) {
            throw new IllegalStateException("Shipping configuration cannot be negative");
        }
        this.flatFee = flatFee.setScale(2, RoundingMode.HALF_UP);
        this.freeAbove = freeAbove.setScale(2, RoundingMode.HALF_UP);
    }

    public BigDecimal shippingFor(BigDecimal subtotal) {
        if (flatFee.signum() == 0) {
            return BigDecimal.ZERO.setScale(2);
        }
        if (freeAbove.signum() > 0 && subtotal.compareTo(freeAbove) >= 0) {
            return BigDecimal.ZERO.setScale(2);
        }
        return flatFee;
    }

    public String shippingNote() {
        if (flatFee.signum() == 0) {
            return "Free delivery";
        }
        if (freeAbove.signum() > 0) {
            return "₹" + flatFee.stripTrailingZeros().toPlainString() + " delivery fee; free on orders of ₹"
                    + freeAbove.stripTrailingZeros().toPlainString() + " or more";
        }
        return "₹" + flatFee.stripTrailingZeros().toPlainString() + " delivery fee";
    }
}
