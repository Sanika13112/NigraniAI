package com.shopsmart.orderservice.entity;

/** Order and payment state names (stored as strings for compatibility with existing rows). */
public final class OrderStatus {

    public static final String PENDING_PAYMENT = "PENDING_PAYMENT";
    /** Legacy status from the earlier simulated flow. Treated like PENDING_PAYMENT. */
    public static final String PENDING = "PENDING";
    public static final String CONFIRMED = "CONFIRMED";
    public static final String PROCESSING = "PROCESSING";
    public static final String SHIPPED = "SHIPPED";
    public static final String DELIVERED = "DELIVERED";
    public static final String CANCELLED = "CANCELLED";
    public static final String RETURN_REQUESTED = "RETURN_REQUESTED";
    public static final String RETURNED = "RETURNED";

    public static final String METHOD_ONLINE = "ONLINE";
    public static final String METHOD_COD = "COD";

    public static final String PAY_UNPAID = "UNPAID";
    public static final String PAY_PAID = "PAID";
    public static final String PAY_COD_PENDING = "COD_PENDING";
    public static final String PAY_COD_COLLECTED = "COD_COLLECTED";
    public static final String PAY_REFUND_PENDING = "REFUND_PENDING";
    public static final String PAY_REFUNDED = "REFUNDED";
    public static final String PAY_REFUND_FAILED = "REFUND_FAILED";
    /** A refund must be handled manually (for example cash collected on delivery). */
    public static final String PAY_REFUND_ACTION_REQUIRED = "REFUND_ACTION_REQUIRED";

    private OrderStatus() {
    }
}
