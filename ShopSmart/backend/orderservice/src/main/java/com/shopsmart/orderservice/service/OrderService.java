package com.shopsmart.orderservice.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;

import com.shopsmart.orderservice.client.NotificationClient;
import com.shopsmart.orderservice.demo.DemoSwitches;
import com.shopsmart.orderservice.demo.GroundTruth;
import com.shopsmart.orderservice.demo.PiiTypes;
import com.shopsmart.orderservice.demo.SyntheticPii;
import com.shopsmart.orderservice.client.PaymentClient;
import com.shopsmart.orderservice.client.ProductClient;
import com.shopsmart.orderservice.dto.CreateOrderRequest;
import com.shopsmart.orderservice.dto.OrderItemRequest;
import com.shopsmart.orderservice.dto.PageResponse;
import com.shopsmart.orderservice.dto.QuoteResponse;
import com.shopsmart.orderservice.dto.ShippingAddressRequest;
import com.shopsmart.orderservice.entity.Order;
import com.shopsmart.orderservice.entity.OrderItem;
import com.shopsmart.orderservice.entity.OrderStatus;
import com.shopsmart.orderservice.entity.ShippingAddress;
import com.shopsmart.orderservice.logging.OrderActivityLogger;
import com.shopsmart.orderservice.repository.OrderRepository;
import com.shopsmart.orderservice.security.ApiException;

import static com.shopsmart.orderservice.entity.OrderStatus.*;

/**
 * Order-service is the source of truth for orders. Remote calls (catalogue, inventory, payments)
 * happen outside database transactions; each save is guarded by optimistic locking.
 */
@Service
public class OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderService.class);

    private final DemoSwitches demo;
    private final GroundTruth groundTruth;

    /** Transitions an administrator may perform. Payment-driven confirmation is internal only. */
    private static final Map<String, Set<String>> ADMIN_TRANSITIONS = Map.of(
            PENDING_PAYMENT, Set.of(CANCELLED),
            PENDING, Set.of(CONFIRMED, CANCELLED),
            CONFIRMED, Set.of(PROCESSING, CANCELLED),
            PROCESSING, Set.of(SHIPPED, CANCELLED),
            SHIPPED, Set.of(DELIVERED),
            RETURN_REQUESTED, Set.of(RETURNED, DELIVERED));

    private static final Set<String> CUSTOMER_CANCELLABLE =
            Set.of(PENDING_PAYMENT, PENDING, CONFIRMED, PROCESSING);

    public static final Set<String> ALL_STATUSES = Set.of(PENDING_PAYMENT, PENDING, CONFIRMED,
            PROCESSING, SHIPPED, DELIVERED, CANCELLED, RETURN_REQUESTED, RETURNED);

    private final OrderRepository orders;
    private final ProductClient productClient;
    private final PaymentClient paymentClient;
    private final NotificationClient notifications;
    private final PricingPolicy pricing;
    private final OrderActivityLogger activityLogger;
    private final Duration returnWindow;

    public OrderService(
            OrderRepository orders,
            ProductClient productClient,
            PaymentClient paymentClient,
            NotificationClient notifications,
            PricingPolicy pricing,
            OrderActivityLogger activityLogger,
            DemoSwitches demo,
            GroundTruth groundTruth,
            @Value("${shopsmart.orders.return-window-days:7}") long returnWindowDays) {
        this.demo = demo;
        this.groundTruth = groundTruth;
        this.orders = orders;
        this.productClient = productClient;
        this.paymentClient = paymentClient;
        this.notifications = notifications;
        this.pricing = pricing;
        this.activityLogger = activityLogger;
        this.returnWindow = Duration.ofDays(returnWindowDays);
    }

    public record CreateResult(Order order, boolean replayed) {
    }

    // ---------------------------------------------------------------- quote

    public QuoteResponse quote(List<OrderItemRequest> items) {
        validateItems(items);
        List<QuoteResponse.Line> lines = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        boolean valid = true;

        for (OrderItemRequest item : items) {
            ProductClient.ProductDetails product = productClient.find(item.productId());
            if (product == null || !product.isSellable()) {
                valid = false;
                lines.add(new QuoteResponse.Line(item.productId(),
                        product == null ? null : product.getName(), null, null, null,
                        item.quantity(), BigDecimal.ZERO, 0, "This product is no longer available"));
                continue;
            }
            BigDecimal unitPrice = product.getPrice().setScale(2, RoundingMode.HALF_UP);
            BigDecimal lineTotal = unitPrice.multiply(BigDecimal.valueOf(item.quantity()));
            String problem = null;
            if (product.getStockQuantity() <= 0) {
                problem = "Out of stock";
            } else if (product.getStockQuantity() < item.quantity()) {
                problem = "Only " + product.getStockQuantity() + " left";
            }
            if (problem == null) {
                subtotal = subtotal.add(lineTotal);
            } else {
                valid = false;
            }
            lines.add(new QuoteResponse.Line(product.getId(), product.getName(), product.getImageUrl(),
                    product.getCategory(), unitPrice, item.quantity(), lineTotal,
                    Math.max(product.getStockQuantity(), 0), problem));
        }

        subtotal = subtotal.setScale(2, RoundingMode.HALF_UP);
        BigDecimal shipping = subtotal.signum() == 0 ? BigDecimal.ZERO.setScale(2) : pricing.shippingFor(subtotal);
        BigDecimal zero = BigDecimal.ZERO.setScale(2);
        return new QuoteResponse(lines, subtotal, shipping, zero, zero, subtotal.add(shipping),
                "INR", true, valid, pricing.shippingNote());
    }

    // ---------------------------------------------------------------- create

    public CreateResult create(Long customerId, CreateOrderRequest request, String idempotencyKey) {
        if (idempotencyKey == null || !idempotencyKey.matches("[A-Za-z0-9_-]{8,64}")) {
            throw ApiException.badRequest("A valid Idempotency-Key header is required");
        }
        Order previous = orders.findByCustomerIdAndIdempotencyKey(customerId, idempotencyKey).orElse(null);
        if (previous != null) {
            return new CreateResult(previous, true);
        }

        validateItems(request.items());
        String method = normalizeMethod(request.paymentMethod());

        List<OrderItem> items = new ArrayList<>();
        BigDecimal subtotal = BigDecimal.ZERO;
        for (OrderItemRequest item : request.items()) {
            ProductClient.ProductDetails product = productClient.find(item.productId());
            if (product == null || !product.isSellable()) {
                throw ApiException.conflict("A product in your cart is no longer available");
            }
            if (product.getStockQuantity() < item.quantity()) {
                throw ApiException.conflict(product.getStockQuantity() <= 0
                        ? product.getName() + " is out of stock"
                        : "Only " + product.getStockQuantity() + " left of " + product.getName());
            }
            BigDecimal unitPrice = product.getPrice().setScale(2, RoundingMode.HALF_UP);
            items.add(new OrderItem(product.getId(), product.getName(), product.getCategory(),
                    product.getImageUrl(), unitPrice, item.quantity()));
            subtotal = subtotal.add(unitPrice.multiply(BigDecimal.valueOf(item.quantity())));
        }
        subtotal = subtotal.setScale(2, RoundingMode.HALF_UP);
        BigDecimal shipping = pricing.shippingFor(subtotal);
        BigDecimal total = subtotal.add(shipping).setScale(2, RoundingMode.HALF_UP);

        if (request.expectedTotal() != null && request.expectedTotal().compareTo(total) != 0) {
            throw ApiException.conflict("Prices in your cart have changed. Please review your order before paying.");
        }

        String reservationRef = "ord-" + UUID.randomUUID();
        productClient.reserve(reservationRef, request.items());

        Order order = new Order();
        order.setCustomerId(customerId);
        order.setItems(items);
        order.setSubtotal(subtotal);
        order.setShippingFee(shipping);
        order.setTaxAmount(BigDecimal.ZERO.setScale(2));
        order.setDiscountAmount(BigDecimal.ZERO.setScale(2));
        order.setTotalAmount(total);
        order.setCurrency("INR");
        order.setTaxInclusive(true);
        order.setPaymentMethod(method);
        order.setShippingAddress(toAddress(request.shippingAddress()));
        order.setIdempotencyKey(idempotencyKey);
        order.setReservationRef(reservationRef);
        if (METHOD_COD.equals(method)) {
            order.setPaymentStatus(PAY_COD_PENDING);
            order.changeStatus(CONFIRMED, "Order placed with cash on delivery", "customer");
        } else {
            order.setPaymentStatus(PAY_UNPAID);
            order.changeStatus(PENDING_PAYMENT, "Order placed; awaiting online payment", "customer");
        }

        Order saved;
        try {
            saved = orders.saveAndFlush(order);
        } catch (DataIntegrityViolationException duplicate) {
            // A concurrent request with the same Idempotency-Key won the race.
            productClient.release(reservationRef);
            return orders.findByCustomerIdAndIdempotencyKey(customerId, idempotencyKey)
                    .map(existing -> new CreateResult(existing, true))
                    .orElseThrow(() -> duplicate);
        } catch (RuntimeException failure) {
            productClient.release(reservationRef);
            throw failure;
        }

        activity("ORDER_CREATED", saved.getId());
        if (demo.on(DemoSwitches.PII_IN_LOGS)) {
            // Demo only: fictional values, never this order's real recipient or address.
            SyntheticPii.Person fake = SyntheticPii.person();
            String message = SyntheticPii.demoPrefix("order-service", "PII_IN_LOGS")
                    + "Order " + saved.getId() + " created for " + fake.name() + " (" + fake.phone()
                    + ") shipping to " + SyntheticPii.address() + ", total " + saved.getTotalAmount() + " INR";
            log.info("{}", message);
            groundTruth.record("PII_IN_LOGS", PiiTypes.of(message, true, true), "customer:" + customerId,
                    "order-service.log", log.getName(), message, "Shipping address and phone written to the application log");
        }
        notifications.notifyCustomer(customerId, METHOD_COD.equals(method)
                ? "Your order #" + saved.getId() + " is confirmed. Pay ₹" + total.toPlainString() + " on delivery."
                : "Your order #" + saved.getId() + " was placed. Complete payment within 30 minutes to confirm it.");
        return new CreateResult(saved, false);
    }

    // ---------------------------------------------------------------- reads

    public Order get(Long id) {
        return orders.findById(id).orElseThrow(() -> ApiException.notFound("Order not found"));
    }

    public Order getForCustomer(Long id, Long customerId) {
        Order order = get(id);
        if (!order.getCustomerId().equals(customerId)) {
            throw ApiException.notFound("Order not found");
        }
        return order;
    }

    public PageResponse<Order> listForCustomer(Long customerId, String status, int page, int size) {
        if (status == null || status.isBlank()) {
            return PageResponse.of(orders.findByCustomerId(customerId, pageRequest(page, size)));
        }
        return PageResponse.of(orders.findByCustomerIdAndStatus(customerId, normalizeStatus(status), pageRequest(page, size)));
    }

    public PageResponse<Order> returnsAndRefunds(Long customerId, int page, int size) {
        return PageResponse.of(orders.findReturnsAndRefunds(customerId,
                Set.of(PAY_REFUND_PENDING, PAY_REFUNDED, PAY_REFUND_FAILED, PAY_REFUND_ACTION_REQUIRED),
                pageRequest(page, size)));
    }

    /** Verified purchase: the product was delivered to this customer (including later returns). */
    public boolean hasReceived(Long customerId, Long productId) {
        return orders.countPurchases(customerId, productId, Set.of(DELIVERED, RETURN_REQUESTED, RETURNED)) > 0;
    }

    public PageResponse<Order> listAll(String status, int page, int size) {
        if (status == null || status.isBlank()) {
            return PageResponse.of(orders.findAll(pageRequest(page, size)));
        }
        return PageResponse.of(orders.findByStatus(normalizeStatus(status), pageRequest(page, size)));
    }

    // ---------------------------------------------------------------- customer actions

    public Order cancelByCustomer(Long id, Long customerId, String reason) {
        Order order = getForCustomer(id, customerId);
        if (!CUSTOMER_CANCELLABLE.contains(order.getStatus())) {
            throw ApiException.conflict("This order can no longer be cancelled");
        }
        String why = reason == null || reason.isBlank() ? "Cancelled by customer" : reason.trim();
        order.setCancelReason(why);
        return applyTransition(order, CANCELLED, why, "customer");
    }

    public Order requestReturn(Long id, Long customerId, String reason) {
        Order order = getForCustomer(id, customerId);
        if (!DELIVERED.equals(order.getStatus())) {
            throw ApiException.conflict("Only delivered orders can be returned");
        }
        Instant deliveredAt = order.getDeliveredAt() != null ? order.getDeliveredAt() : order.getUpdatedAt();
        if (deliveredAt == null || deliveredAt.plus(returnWindow).isBefore(Instant.now())) {
            throw ApiException.conflict("The return window for this order has closed");
        }
        if (reason == null || reason.isBlank()) {
            throw ApiException.badRequest("Please tell us why you are returning this order");
        }
        order.setReturnReason(reason.trim());
        return applyTransition(order, RETURN_REQUESTED, reason.trim(), "customer");
    }

    // ---------------------------------------------------------------- admin actions

    public Order updateStatusByAdmin(Long id, String requestedStatus, String note, Long adminUserId) {
        Order order = get(id);
        String target = normalizeStatus(requestedStatus);
        if (target.equals(order.getStatus())) {
            throw ApiException.conflict("Order already has this status");
        }
        Set<String> allowed = ADMIN_TRANSITIONS.getOrDefault(order.getStatus(), Set.of());
        if (!allowed.contains(target)) {
            throw ApiException.conflict("Invalid order status transition from " + order.getStatus() + " to " + target);
        }
        if (CANCELLED.equals(target)) {
            order.setCancelReason(note == null || note.isBlank() ? "Cancelled by ShopSmart" : note.trim());
        }
        String text = note == null || note.isBlank() ? null : note.trim();
        if (RETURN_REQUESTED.equals(order.getStatus()) && DELIVERED.equals(target)) {
            text = text == null ? "Return request declined" : "Return request declined: " + text;
        }
        return applyTransition(order, target, text, "admin:" + adminUserId);
    }

    // ---------------------------------------------------------------- payment-service callbacks

    /** Called after payment-service has verified a captured payment with the gateway. */
    public Order markPaid(Long id, String paymentReference) {
        Order order = get(id);
        if (PAY_PAID.equals(order.getPaymentStatus())) {
            return order;
        }
        if (!METHOD_ONLINE.equals(order.getPaymentMethod()) || !order.awaitingPayment()) {
            throw ApiException.conflict("ORDER_NOT_AWAITING_PAYMENT");
        }
        order.setPaymentStatus(PAY_PAID);
        order.setPaymentReference(paymentReference);
        order.changeStatus(CONFIRMED, "Payment verified", "payment-service");
        Order saved = orders.saveAndFlush(order);
        activity("ORDER_PAID", saved.getId());
        notifications.notifyCustomer(saved.getCustomerId(),
                "Payment received. Your order #" + saved.getId() + " is confirmed.");
        return saved;
    }

    /** Refund progress reported by payment-service (from the gateway's refund webhooks). */
    public Order updatePaymentStatus(Long id, String paymentStatus) {
        Set<String> allowed = Set.of(PAY_REFUND_PENDING, PAY_REFUNDED, PAY_REFUND_FAILED);
        if (!allowed.contains(paymentStatus)) {
            throw ApiException.badRequest("Unsupported payment status");
        }
        Order order = get(id);
        if (paymentStatus.equals(order.getPaymentStatus())) {
            return order;
        }
        order.setPaymentStatus(paymentStatus);
        Order saved = orders.saveAndFlush(order);
        if (PAY_REFUNDED.equals(paymentStatus)) {
            notifications.notifyCustomer(saved.getCustomerId(),
                    "Your refund for order #" + saved.getId() + " has been processed by the payment provider.");
        } else if (PAY_REFUND_FAILED.equals(paymentStatus)) {
            notifications.notifyCustomer(saved.getCustomerId(),
                    "We couldn't complete the refund for order #" + saved.getId() + ". Our team will contact you.");
        }
        return saved;
    }

    // ---------------------------------------------------------------- expiry

    /** Cancels an unpaid online order after checking the gateway for a late payment. */
    public void expireIfUnpaid(Long id) {
        Order order = get(id);
        if (!PENDING_PAYMENT.equals(order.getStatus())) {
            return;
        }
        String paymentState = paymentClient.reconcile(id);
        if ("CAPTURED".equals(paymentState)) {
            return;
        }
        order.setCancelReason("Payment was not completed in time");
        applyTransition(order, CANCELLED, "Payment was not completed in time", "system");
    }

    public List<Order> unpaidOlderThan(Instant cutoff) {
        return orders.findTop100ByStatusAndCreatedAtBefore(PENDING_PAYMENT, cutoff);
    }

    // ---------------------------------------------------------------- transitions

    private Order applyTransition(Order order, String target, String note, String actor) {
        order.changeStatus(target, note, actor);
        if (DELIVERED.equals(target) && order.getDeliveredAt() == null) {
            order.setDeliveredAt(Instant.now());
            if (PAY_COD_PENDING.equals(order.getPaymentStatus())) {
                order.setPaymentStatus(PAY_COD_COLLECTED);
            }
        }
        Order saved = orders.saveAndFlush(order);
        activity("ORDER_STATUS_UPDATED", saved.getId());

        if (CANCELLED.equals(target) || RETURNED.equals(target)) {
            productClient.release(saved.getReservationRef());
            saved = settleRefund(saved, note);
        }

        notifications.notifyCustomer(saved.getCustomerId(), customerMessage(saved));
        return saved;
    }

    private Order settleRefund(Order order, String reason) {
        String paymentStatus = order.getPaymentStatus();
        if (PAY_PAID.equals(paymentStatus)) {
            String result = paymentClient.requestRefund(order.getId(), reason);
            order.setPaymentStatus(PAY_REFUNDED.equals(result) ? PAY_REFUNDED
                    : PAY_REFUND_PENDING.equals(result) ? PAY_REFUND_PENDING
                    : PAY_REFUND_ACTION_REQUIRED);
            return orders.saveAndFlush(order);
        }
        if (PAY_COD_COLLECTED.equals(paymentStatus)) {
            order.setPaymentStatus(PAY_REFUND_ACTION_REQUIRED);
            return orders.saveAndFlush(order);
        }
        if (PAY_COD_PENDING.equals(paymentStatus) || PAY_UNPAID.equals(paymentStatus)) {
            return order;
        }
        return order;
    }

    private static String customerMessage(Order order) {
        String ref = "Your order #" + order.getId();
        return switch (order.getStatus()) {
            case CONFIRMED -> ref + " is confirmed.";
            case PROCESSING -> ref + " is being prepared for dispatch.";
            case SHIPPED -> ref + " has been shipped.";
            case DELIVERED -> ref + " has been delivered.";
            case CANCELLED -> ref + " was cancelled."
                    + (PAY_REFUND_PENDING.equals(order.getPaymentStatus()) ? " A refund has been initiated." : "");
            case RETURN_REQUESTED -> "We received your return request for order #" + order.getId() + ".";
            case RETURNED -> "Your return for order #" + order.getId() + " was accepted.";
            default -> ref + " is now " + order.getStatus() + ".";
        };
    }

    // ---------------------------------------------------------------- helpers

    private static void validateItems(List<OrderItemRequest> items) {
        if (items == null || items.isEmpty()) {
            throw ApiException.badRequest("At least one order item is required");
        }
        Set<Long> ids = new HashSet<>();
        for (OrderItemRequest item : items) {
            if (item == null || item.productId() == null || item.productId() <= 0) {
                throw ApiException.badRequest("Product ID must be positive");
            }
            if (item.quantity() == null || item.quantity() <= 0 || item.quantity() > 10) {
                throw ApiException.badRequest("Quantity must be between 1 and 10");
            }
            if (!ids.add(item.productId())) {
                throw ApiException.badRequest("A product can appear only once per order");
            }
        }
    }

    private static String normalizeMethod(String method) {
        String value = method == null ? "" : method.trim().toUpperCase(Locale.ROOT);
        if (!METHOD_ONLINE.equals(value) && !METHOD_COD.equals(value)) {
            throw ApiException.badRequest("Payment method must be ONLINE or COD");
        }
        return value;
    }

    private static String normalizeStatus(String status) {
        String value = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
        if (!ALL_STATUSES.contains(value)) {
            throw ApiException.badRequest("Invalid order status");
        }
        return value;
    }

    private static ShippingAddress toAddress(ShippingAddressRequest a) {
        return new ShippingAddress(a.fullName().trim(), a.phone().trim(), a.line1().trim(),
                a.line2() == null || a.line2().isBlank() ? null : a.line2().trim(),
                a.city().trim(), a.state().trim(), a.pincode().trim());
    }

    private static PageRequest pageRequest(int page, int size) {
        if (page < 0 || size < 1 || size > 100) {
            throw ApiException.badRequest("Page size must be between 1 and 100");
        }
        return PageRequest.of(page, size, Sort.by(Sort.Direction.DESC, "createdAt").and(Sort.by(Sort.Direction.DESC, "id")));
    }

    private void activity(String type, Long orderId) {
        activityLogger.logActivity(type, MDC.get("traceId") != null ? MDC.get("traceId") : "unknown", orderId, "SUCCESS");
        log.debug("event={} service=order-service orderId={}", type, orderId);
    }
}
