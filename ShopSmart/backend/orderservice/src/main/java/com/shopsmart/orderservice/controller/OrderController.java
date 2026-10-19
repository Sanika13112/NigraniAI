package com.shopsmart.orderservice.controller;

import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.shopsmart.orderservice.dto.CreateOrderRequest;
import com.shopsmart.orderservice.dto.PageResponse;
import com.shopsmart.orderservice.dto.QuoteRequest;
import com.shopsmart.orderservice.dto.QuoteResponse;
import com.shopsmart.orderservice.dto.ReasonRequest;
import com.shopsmart.orderservice.dto.StatusUpdateRequest;
import com.shopsmart.orderservice.entity.Order;
import com.shopsmart.orderservice.security.AuthPrincipal;
import com.shopsmart.orderservice.security.RequestAuth;
import com.shopsmart.orderservice.service.OrderService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

@RestController
public class OrderController {

    private final OrderService orderService;
    private final RequestAuth auth;

    public OrderController(OrderService orderService, RequestAuth auth) {
        this.orderService = orderService;
        this.auth = auth;
    }

    // ---------- customer ----------

    /** Authoritative prices, stock and totals for a cart. Public so guests see real totals. */
    @PostMapping("/orders/quote")
    public QuoteResponse quote(@Valid @RequestBody QuoteRequest request) {
        return orderService.quote(request.items());
    }

    @PostMapping("/orders")
    public ResponseEntity<Order> create(
            HttpServletRequest http,
            @RequestHeader(name = "Idempotency-Key", required = false) String idempotencyKey,
            @Valid @RequestBody CreateOrderRequest request) {
        AuthPrincipal principal = auth.requireCustomer(http);
        OrderService.CreateResult result = orderService.create(principal.customerId(), request, idempotencyKey);
        return ResponseEntity.status(result.replayed() ? HttpStatus.OK : HttpStatus.CREATED)
                .header("Idempotent-Replayed", String.valueOf(result.replayed()))
                .body(result.order());
    }

    @GetMapping("/orders/me")
    public PageResponse<Order> myOrders(HttpServletRequest http,
                                        @RequestParam(required = false) String status,
                                        @RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "10") int size) {
        return orderService.listForCustomer(auth.requireCustomer(http).customerId(), status, page, size);
    }

    /** Orders with a return request or any refund activity, newest first. */
    @GetMapping("/orders/me/returns")
    public PageResponse<Order> myReturns(HttpServletRequest http,
                                         @RequestParam(defaultValue = "0") int page,
                                         @RequestParam(defaultValue = "10") int size) {
        return orderService.returnsAndRefunds(auth.requireCustomer(http).customerId(), page, size);
    }

    @GetMapping("/orders/me/{id}")
    public Order myOrder(HttpServletRequest http, @PathVariable Long id) {
        return orderService.getForCustomer(id, auth.requireCustomer(http).customerId());
    }

    @PostMapping("/orders/me/{id}/cancel")
    public Order cancel(HttpServletRequest http, @PathVariable Long id,
                        @Valid @RequestBody(required = false) ReasonRequest body) {
        return orderService.cancelByCustomer(id, auth.requireCustomer(http).customerId(),
                body == null ? null : body.reason());
    }

    @PostMapping("/orders/me/{id}/return")
    public Order requestReturn(HttpServletRequest http, @PathVariable Long id,
                               @Valid @RequestBody ReasonRequest body) {
        return orderService.requestReturn(id, auth.requireCustomer(http).customerId(), body.reason());
    }

    // ---------- administrators ----------

    @GetMapping("/orders")
    public PageResponse<Order> all(HttpServletRequest http,
                                   @RequestParam(required = false) String status,
                                   @RequestParam(defaultValue = "0") int page,
                                   @RequestParam(defaultValue = "20") int size) {
        auth.requireAdmin(http);
        return orderService.listAll(status, page, size);
    }

    @GetMapping("/orders/{id}")
    public Order one(HttpServletRequest http, @PathVariable Long id) {
        auth.requireAdmin(http);
        return orderService.get(id);
    }

    @PatchMapping("/orders/{id}/status")
    public Order updateStatus(HttpServletRequest http, @PathVariable Long id,
                              @Valid @RequestBody StatusUpdateRequest request) {
        AuthPrincipal admin = auth.requireAdmin(http);
        return orderService.updateStatusByAdmin(id, request.status(), request.note(), admin.userId());
    }

    // ---------- service-to-service ----------

    @GetMapping("/internal/orders/{id}")
    public Order internalGet(HttpServletRequest http, @PathVariable Long id) {
        auth.requireInternal(http);
        return orderService.get(id);
    }

    @GetMapping("/internal/orders/purchased")
    public Map<String, Boolean> purchased(HttpServletRequest http,
                                          @RequestParam Long customerId,
                                          @RequestParam Long productId) {
        auth.requireInternal(http);
        return Map.of("purchased", orderService.hasReceived(customerId, productId));
    }

    @PostMapping("/internal/orders/{id}/payment-confirmed")
    public Order paymentConfirmed(HttpServletRequest http, @PathVariable Long id,
                                  @RequestBody Map<String, String> body) {
        auth.requireInternal(http);
        return orderService.markPaid(id, body.get("paymentReference"));
    }

    @PostMapping("/internal/orders/{id}/payment-status")
    public Order paymentStatus(HttpServletRequest http, @PathVariable Long id,
                               @RequestBody Map<String, String> body) {
        auth.requireInternal(http);
        return orderService.updatePaymentStatus(id, body.get("paymentStatus"));
    }
}
