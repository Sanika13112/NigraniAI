package com.shopsmart.paymentservice.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.shopsmart.paymentservice.dto.CheckoutSession;
import com.shopsmart.paymentservice.dto.VerifyRequest;
import com.shopsmart.paymentservice.entity.Payment;
import com.shopsmart.paymentservice.security.ApiException;
import com.shopsmart.paymentservice.security.RequestAuth;
import com.shopsmart.paymentservice.service.PaymentService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

@RestController
public class PaymentController {

    private final PaymentService paymentService;
    private final RequestAuth auth;

    public PaymentController(PaymentService paymentService, RequestAuth auth) {
        this.paymentService = paymentService;
        this.auth = auth;
    }

    /** Lets the storefront show whether online payment is available and whether it is sandbox. */
    @GetMapping("/payments/config")
    public Map<String, Object> config() {
        return paymentService.config();
    }

    @PostMapping("/payments/checkout")
    public CheckoutSession checkout(HttpServletRequest http, @RequestBody Map<String, Long> body) {
        Long orderId = body.get("orderId");
        if (orderId == null || orderId <= 0) {
            throw ApiException.badRequest("orderId is required");
        }
        return paymentService.checkout(auth.requireCustomer(http), orderId);
    }

    @PostMapping("/payments/verify")
    public Payment verify(HttpServletRequest http, @Valid @RequestBody VerifyRequest request) {
        return paymentService.verify(auth.requireCustomer(http), request);
    }

    @GetMapping("/payments/order/{orderId}")
    public Payment forOrder(HttpServletRequest http, @PathVariable Long orderId,
                            @RequestParam(defaultValue = "false") boolean refresh) {
        return paymentService.statusForCustomer(auth.requireCustomer(http), orderId, refresh);
    }

    /** Razorpay webhook. Authenticated by HMAC over the exact raw body, not by a user token. */
    @PostMapping("/payments/webhooks/razorpay")
    public ResponseEntity<Map<String, String>> webhook(
            @RequestBody String rawBody,
            @RequestHeader(name = "X-Razorpay-Signature", required = false) String signature,
            @RequestHeader(name = "x-razorpay-event-id", required = false) String eventId) {
        String outcome = paymentService.handleWebhook(rawBody, signature, eventId);
        return ResponseEntity.ok(Map.of("status", outcome));
    }

    // ---------- administrators ----------

    @GetMapping("/payments")
    public List<Payment> all(HttpServletRequest http) {
        auth.requireAdmin(http);
        return paymentService.all();
    }

    @GetMapping("/payments/{id}")
    public Payment one(HttpServletRequest http, @PathVariable Long id) {
        auth.requireAdmin(http);
        return paymentService.get(id);
    }

    @PostMapping("/payments/{id}/refund")
    public Payment refund(HttpServletRequest http, @PathVariable Long id,
                          @RequestBody(required = false) Map<String, String> body) {
        auth.requireAdmin(http);
        return paymentService.refundByAdmin(id, body == null ? null : body.get("reason"));
    }

    // ---------- service-to-service ----------

    @PostMapping("/internal/payments/order/{orderId}/refund")
    public Map<String, String> internalRefund(HttpServletRequest http, @PathVariable Long orderId,
                                              @RequestBody(required = false) Map<String, String> body) {
        auth.requireInternal(http);
        return Map.of("status", paymentService.refundForOrder(orderId, body == null ? null : body.get("reason")));
    }

    @PostMapping("/internal/payments/order/{orderId}/reconcile")
    public Map<String, String> internalReconcile(HttpServletRequest http, @PathVariable Long orderId) {
        auth.requireInternal(http);
        return Map.of("status", paymentService.reconcileOrder(orderId));
    }
}
