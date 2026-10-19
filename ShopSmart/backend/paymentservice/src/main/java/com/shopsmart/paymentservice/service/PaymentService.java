package com.shopsmart.paymentservice.service;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.json.JsonParserFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import com.shopsmart.paymentservice.client.NotificationClient;
import com.shopsmart.paymentservice.client.OrderClient;
import com.shopsmart.paymentservice.client.RazorpayClient;
import com.shopsmart.paymentservice.dto.CheckoutSession;
import com.shopsmart.paymentservice.dto.OrderSnapshot;
import com.shopsmart.paymentservice.dto.VerifyRequest;
import com.shopsmart.paymentservice.entity.Payment;
import com.shopsmart.paymentservice.entity.WebhookEvent;
import com.shopsmart.paymentservice.logging.PaymentActivityEvent;
import com.shopsmart.paymentservice.logging.PaymentActivityLogger;
import com.shopsmart.paymentservice.repository.PaymentRepository;
import com.shopsmart.paymentservice.repository.WebhookEventRepository;
import com.shopsmart.paymentservice.security.ApiException;
import com.shopsmart.paymentservice.security.AuthPrincipal;

/**
 * Razorpay integration. The browser never decides whether a payment succeeded: a payment is
 * CAPTURED only after the checkout signature is valid AND the payment fetched from Razorpay's
 * API matches this order's gateway order id, amount and currency, and is captured.
 */
@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private final PaymentRepository payments;
    private final WebhookEventRepository webhookEvents;
    private final RazorpayClient razorpay;
    private final OrderClient orders;
    private final NotificationClient notifications;
    private final PaymentActivityLogger activityLogger;
    private final String merchantName;

    public PaymentService(
            PaymentRepository payments,
            WebhookEventRepository webhookEvents,
            RazorpayClient razorpay,
            OrderClient orders,
            NotificationClient notifications,
            PaymentActivityLogger activityLogger,
            @Value("${shopsmart.merchant-name:ShopSmart}") String merchantName) {
        this.payments = payments;
        this.webhookEvents = webhookEvents;
        this.razorpay = razorpay;
        this.orders = orders;
        this.notifications = notifications;
        this.activityLogger = activityLogger;
        this.merchantName = merchantName;
    }

    public Map<String, Object> config() {
        return Map.of(
                "provider", "RAZORPAY",
                "onlineEnabled", razorpay.isConfigured(),
                "mode", razorpay.isConfigured() ? razorpay.mode() : "DISABLED",
                "webhookConfigured", razorpay.isWebhookConfigured());
    }

    // ------------------------------------------------------------------ checkout

    public CheckoutSession checkout(AuthPrincipal principal, Long orderId) {
        if (!razorpay.isConfigured()) {
            throw ApiException.unavailable("Online payments are not available right now. Please choose cash on delivery.");
        }
        OrderSnapshot order = orders.get(orderId);
        if (!order.getCustomerId().equals(principal.customerId())) {
            throw ApiException.notFound("Order not found");
        }
        if (!"ONLINE".equals(order.getPaymentMethod())) {
            throw ApiException.badRequest("This order will be paid on delivery");
        }
        if ("PAID".equals(order.getPaymentStatus())) {
            throw ApiException.conflict("This order has already been paid");
        }
        if (!"PENDING_PAYMENT".equals(order.getStatus())) {
            throw ApiException.conflict("This order is no longer awaiting payment");
        }

        Payment existing = payments.findByOrderId(orderId).orElse(null);
        if (existing != null) {
            if (!Payment.CREATED.equals(existing.getStatus())) {
                throw ApiException.conflict("This order has already been paid");
            }
            if (existing.getProviderOrderId() != null
                    && existing.getAmount().compareTo(order.getTotalAmount()) == 0
                    && razorpay.mode().equals(existing.getMode())) {
                return session(existing, order, principal);
            }
            throw ApiException.conflict("A payment record already exists for this order. Please contact support.");
        }

        long amountPaise = toPaise(order.getTotalAmount());
        Map<String, Object> gatewayOrder = razorpay.createOrder(amountPaise, "INR",
                "shopsmart_order_" + orderId, Map.of("shopsmart_order_id", String.valueOf(orderId)));
        String providerOrderId = string(gatewayOrder.get("id"));
        if (providerOrderId == null || toLong(gatewayOrder.get("amount")) != amountPaise) {
            throw ApiException.unavailable("The payment provider returned an unexpected response");
        }

        Payment payment = new Payment(orderId, order.getCustomerId(), order.getTotalAmount(), "INR",
                "RAZORPAY", razorpay.mode(), providerOrderId);
        try {
            payment = payments.saveAndFlush(payment);
        } catch (DataIntegrityViolationException race) {
            // A parallel checkout for the same order created the record first; reuse it.
            Payment winner = payments.findByOrderId(orderId).orElseThrow(() -> race);
            return session(winner, order, principal);
        }
        activity("PAYMENT_SESSION_CREATED", payment);
        return session(payment, order, principal);
    }

    // ------------------------------------------------------------------ verify (browser callback)

    public Payment verify(AuthPrincipal principal, VerifyRequest request) {
        Payment payment = payments.findByOrderId(request.orderId())
                .orElseThrow(() -> ApiException.notFound("Payment not found"));
        if (!principal.customerId().equals(payment.getCustomerId())) {
            throw ApiException.notFound("Payment not found");
        }
        if (!request.razorpayOrderId().equals(payment.getProviderOrderId())) {
            throw ApiException.badRequest("This payment does not belong to the order");
        }
        if (!razorpay.verifyPaymentSignature(payment.getProviderOrderId(),
                request.razorpayPaymentId(), request.razorpaySignature())) {
            log.warn("event=payment_signature_invalid service=payment-service orderId={}", payment.getOrderId());
            throw ApiException.badRequest("Payment verification failed. If money was debited, it will be reconciled automatically.");
        }
        return finalizeCapture(payment.getId(), request.razorpayPaymentId());
    }

    /**
     * Confirms a payment with Razorpay's API and records it. Idempotent: verify, webhook and
     * reconcile can all call it for the same payment.
     */
    public Payment finalizeCapture(Long paymentRowId, String providerPaymentId) {
        Payment payment = payments.findById(paymentRowId)
                .orElseThrow(() -> ApiException.notFound("Payment not found"));

        if (!Payment.CREATED.equals(payment.getStatus())) {
            if (Payment.CAPTURED.equals(payment.getStatus())) {
                confirmOrder(payment);
            }
            return payment;
        }

        Map<String, Object> gatewayPayment = razorpay.fetchPayment(providerPaymentId);
        long expectedPaise = toPaise(payment.getAmount());

        if (!payment.getProviderOrderId().equals(string(gatewayPayment.get("order_id")))) {
            log.warn("event=payment_order_mismatch service=payment-service orderId={}", payment.getOrderId());
            throw ApiException.badRequest("This payment does not belong to the order");
        }
        if (toLong(gatewayPayment.get("amount")) != expectedPaise
                || !"INR".equals(string(gatewayPayment.get("currency")))) {
            log.error("event=payment_amount_mismatch service=payment-service orderId={}", payment.getOrderId());
            throw ApiException.badRequest("The payment amount does not match the order total");
        }

        String status = string(gatewayPayment.get("status"));
        if ("authorized".equals(status)) {
            gatewayPayment = razorpay.capture(providerPaymentId, expectedPaise, "INR");
            status = string(gatewayPayment.get("status"));
        }
        if (!"captured".equals(status)) {
            String reason = string(gatewayPayment.get("error_description"));
            payment.setFailureReason(truncate(reason != null ? reason : "Payment status: " + status));
            saveQuietly(payment);
            throw new ApiException(HttpStatus.PAYMENT_REQUIRED, "The payment was not completed. You can try again.");
        }

        payment.markCaptured(providerPaymentId, string(gatewayPayment.get("method")));
        try {
            payment = payments.saveAndFlush(payment);
        } catch (OptimisticLockingFailureException concurrent) {
            Payment current = payments.findById(paymentRowId).orElseThrow(() -> concurrent);
            if (Payment.CAPTURED.equals(current.getStatus())) {
                return current;
            }
            throw concurrent;
        }

        activity("PAYMENT_CAPTURED", payment);
        notifications.notifyCustomer(payment.getCustomerId(), "Payment of ₹" + payment.getAmount().toPlainString()
                + " received for order #" + payment.getOrderId()
                + ("TEST".equals(payment.getMode()) ? " (sandbox test payment, no real money moved)." : "."));
        confirmOrder(payment);
        return payment;
    }

    /** Tells order-service the payment is verified; refunds automatically if the order was cancelled meanwhile. */
    private void confirmOrder(Payment payment) {
        if (orders.confirmPaid(payment.getOrderId(), payment.getProviderPaymentId())) {
            return;
        }
        OrderSnapshot order = orders.get(payment.getOrderId());
        if ("PAID".equals(order.getPaymentStatus())
                && payment.getProviderPaymentId().equals(order.getPaymentReference())) {
            return;
        }
        if ("CANCELLED".equals(order.getStatus())) {
            log.warn("event=payment_for_cancelled_order service=payment-service orderId={} action=auto_refund", payment.getOrderId());
            String result = refundCaptured(payment, "Order was cancelled before payment completed");
            orders.updatePaymentStatus(payment.getOrderId(), result);
            return;
        }
        log.error("event=payment_order_state_mismatch service=payment-service orderId={} orderStatus={}",
                payment.getOrderId(), order.getStatus());
    }

    // ------------------------------------------------------------------ webhooks

    /** Returns a short outcome string. Throws only for problems Razorpay should retry. */
    public String handleWebhook(String rawBody, String signature, String eventId) {
        if (!razorpay.isWebhookConfigured()) {
            throw ApiException.unavailable("Webhooks are not configured");
        }
        if (!razorpay.verifyWebhookSignature(rawBody, signature)) {
            log.warn("event=webhook_signature_invalid service=payment-service");
            throw ApiException.badRequest("Invalid signature");
        }
        if (eventId != null && webhookEvents.existsById(eventId)) {
            return "duplicate";
        }

        Map<String, Object> json = JsonParserFactory.getJsonParser().parseMap(rawBody);
        String event = string(json.get("event"));
        Map<String, Object> payload = map(json.get("payload"));

        try {
            switch (event == null ? "" : event) {
                case "payment.captured", "order.paid", "payment.authorized" -> {
                    Map<String, Object> entity = map(map(payload.get("payment")).get("entity"));
                    String providerOrderId = string(entity.get("order_id"));
                    String providerPaymentId = string(entity.get("id"));
                    if (providerOrderId != null && providerPaymentId != null) {
                        payments.findByProviderOrderId(providerOrderId)
                                .ifPresent(p -> finalizeCapture(p.getId(), providerPaymentId));
                    }
                }
                case "payment.failed" -> {
                    Map<String, Object> entity = map(map(payload.get("payment")).get("entity"));
                    String providerOrderId = string(entity.get("order_id"));
                    if (providerOrderId != null) {
                        payments.findByProviderOrderId(providerOrderId)
                                .filter(p -> Payment.CREATED.equals(p.getStatus()))
                                .ifPresent(p -> {
                                    String reason = string(entity.get("error_description"));
                                    p.setFailureReason(truncate(reason != null ? reason : "Payment failed"));
                                    saveQuietly(p);
                                });
                    }
                }
                case "refund.processed", "refund.failed" -> {
                    Map<String, Object> entity = map(map(payload.get("refund")).get("entity"));
                    String providerPaymentId = string(entity.get("payment_id"));
                    boolean processed = "refund.processed".equals(event);
                    if (providerPaymentId != null) {
                        payments.findByProviderPaymentId(providerPaymentId).ifPresent(p -> {
                            String next = processed ? Payment.REFUNDED : Payment.REFUND_FAILED;
                            if (!next.equals(p.getStatus())) {
                                p.setStatus(next);
                                p.setRefundId(string(entity.get("id")));
                                saveQuietly(p);
                                activity(processed ? "PAYMENT_REFUNDED" : "PAYMENT_REFUND_FAILED", p);
                                orders.updatePaymentStatus(p.getOrderId(), next);
                            }
                        });
                    }
                }
                default -> log.info("event=webhook_ignored service=payment-service type={}", event);
            }
        } catch (ApiException exception) {
            if (exception.getStatus().is5xxServerError()) {
                throw exception;
            }
            log.warn("event=webhook_not_applied service=payment-service type={} reason={}", event, exception.getMessage());
        }

        if (eventId != null) {
            try {
                webhookEvents.save(new WebhookEvent(eventId, truncate(event, 60)));
            } catch (DataIntegrityViolationException duplicate) {
                return "duplicate";
            }
        }
        return "processed";
    }

    // ------------------------------------------------------------------ status & reconcile

    public Payment statusForCustomer(AuthPrincipal principal, Long orderId, boolean refresh) {
        Payment payment = payments.findByOrderId(orderId).orElse(null);
        if (payment == null) {
            OrderSnapshot order = orders.get(orderId);
            if (!order.getCustomerId().equals(principal.customerId())) {
                throw ApiException.notFound("Order not found");
            }
            throw ApiException.notFound("No payment has been started for this order");
        }
        if (!principal.customerId().equals(payment.getCustomerId())) {
            throw ApiException.notFound("Payment not found");
        }
        return refresh ? reconcile(payment) : payment;
    }

    public String reconcileOrder(Long orderId) {
        Payment payment = payments.findByOrderId(orderId).orElse(null);
        if (payment == null) {
            return "NONE";
        }
        try {
            return reconcile(payment).getStatus();
        } catch (ApiException exception) {
            return payment.getStatus();
        }
    }

    /** Looks up the gateway order for a captured payment the browser never reported. */
    private Payment reconcile(Payment payment) {
        if (!Payment.CREATED.equals(payment.getStatus()) || !razorpay.isConfigured()
                || payment.getProviderOrderId() == null || !razorpay.mode().equals(payment.getMode())) {
            return payment;
        }
        for (Map<String, Object> attempt : razorpay.orderPayments(payment.getProviderOrderId())) {
            String status = string(attempt.get("status"));
            String id = string(attempt.get("id"));
            if (id != null && ("captured".equals(status) || "authorized".equals(status))) {
                return finalizeCapture(payment.getId(), id);
            }
        }
        return payment;
    }

    // ------------------------------------------------------------------ refunds

    /** Called by order-service when a paid order is cancelled or returned. */
    public String refundForOrder(Long orderId, String reason) {
        Payment payment = payments.findByOrderId(orderId)
                .orElseThrow(() -> ApiException.notFound("Payment not found"));
        if (Payment.REFUND_PENDING.equals(payment.getStatus()) || Payment.REFUNDED.equals(payment.getStatus())) {
            return payment.getStatus();
        }
        return refundCaptured(payment, reason);
    }

    /** Admin retry for refunds that failed or needed attention. Only for cancelled/returned orders. */
    public Payment refundByAdmin(Long paymentId, String reason) {
        Payment payment = payments.findById(paymentId)
                .orElseThrow(() -> ApiException.notFound("Payment not found"));
        OrderSnapshot order = orders.get(payment.getOrderId());
        if (!"CANCELLED".equals(order.getStatus()) && !"RETURNED".equals(order.getStatus())) {
            throw ApiException.conflict("Cancel the order or accept the return before refunding");
        }
        String result = refundCaptured(payment, reason == null || reason.isBlank() ? "Refund by ShopSmart" : reason);
        orders.updatePaymentStatus(payment.getOrderId(), result);
        return payments.findById(paymentId).orElse(payment);
    }

    private String refundCaptured(Payment payment, String reason) {
        if (!Payment.CAPTURED.equals(payment.getStatus()) && !Payment.REFUND_FAILED.equals(payment.getStatus())) {
            throw ApiException.conflict("Only captured payments can be refunded");
        }
        if (payment.isLegacySimulated() || payment.getProviderPaymentId() == null) {
            throw ApiException.conflict("This payment was simulated and has nothing to refund");
        }
        Map<String, Object> refund = razorpay.refund(payment.getProviderPaymentId(), toPaise(payment.getAmount()),
                Map.of("reason", truncate(reason == null ? "" : reason, 250),
                        "shopsmart_order_id", String.valueOf(payment.getOrderId())));
        String refundStatus = string(refund.get("status"));
        payment.setRefundId(string(refund.get("id")));
        payment.setStatus("processed".equals(refundStatus) ? Payment.REFUNDED : Payment.REFUND_PENDING);
        payment = payments.saveAndFlush(payment);
        activity("PAYMENT_REFUND_REQUESTED", payment);
        notifications.notifyCustomer(payment.getCustomerId(), Payment.REFUNDED.equals(payment.getStatus())
                ? "Your refund of ₹" + payment.getAmount().toPlainString() + " for order #" + payment.getOrderId() + " was processed."
                : "A refund of ₹" + payment.getAmount().toPlainString() + " for order #" + payment.getOrderId()
                        + " has been initiated. Banks usually take 5–7 working days.");
        return payment.getStatus();
    }

    // ------------------------------------------------------------------ admin reads

    public List<Payment> all() {
        return payments.findAll(Sort.by(Sort.Direction.DESC, "id"));
    }

    public Payment get(Long id) {
        return payments.findById(id).orElseThrow(() -> ApiException.notFound("Payment not found"));
    }

    // ------------------------------------------------------------------ helpers

    private CheckoutSession session(Payment payment, OrderSnapshot order, AuthPrincipal principal) {
        OrderSnapshot.Address address = order.getShippingAddress();
        return new CheckoutSession("RAZORPAY", payment.getMode(), razorpay.keyId(), payment.getProviderOrderId(),
                toPaise(payment.getAmount()), "INR", payment.getOrderId(), merchantName,
                new CheckoutSession.Prefill(
                        address == null ? null : address.getFullName(),
                        principal.email(),
                        address == null ? null : address.getPhone()));
    }

    private void saveQuietly(Payment payment) {
        try {
            payments.saveAndFlush(payment);
        } catch (RuntimeException exception) {
            log.warn("event=payment_save_skipped service=payment-service paymentId={} error={}", payment.getId(),
                    exception.getClass().getSimpleName());
        }
    }

    private void activity(String type, Payment payment) {
        activityLogger.logPaymentActivity(new PaymentActivityEvent(type, MDC.get("traceId"),
                payment.getId(), payment.getOrderId(), payment.getStatus()));
    }

    static long toPaise(BigDecimal amount) {
        return amount.setScale(2, java.math.RoundingMode.HALF_UP).movePointRight(2).longValueExact();
    }

    private static long toLong(Object value) {
        return value instanceof Number number ? number.longValue() : -1L;
    }

    private static String string(Object value) {
        return value == null ? null : value.toString();
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object value) {
        return value instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    private static String truncate(String value) {
        return truncate(value, 300);
    }

    private static String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}
