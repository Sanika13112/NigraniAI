package com.shopsmart.notificationservice.controller;

import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.shopsmart.notificationservice.entity.Notification;
import com.shopsmart.notificationservice.security.RequestAuth;
import com.shopsmart.notificationservice.service.NotificationService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

@RestController
public class NotificationController {

    private final NotificationService service;
    private final RequestAuth auth;

    public NotificationController(NotificationService service, RequestAuth auth) {
        this.service = service;
        this.auth = auth;
    }

    // ---------- signed-in customer ----------

    @GetMapping("/notifications/me")
    public List<Notification> mine(HttpServletRequest http, @RequestParam(defaultValue = "50") int limit) {
        return service.forRecipient(auth.requireCustomer(http).customerId(), limit);
    }

    @GetMapping("/notifications/me/unread-count")
    public Map<String, Long> unread(HttpServletRequest http) {
        return Map.of("unread", service.unreadCount(auth.requireCustomer(http).customerId()));
    }

    @PatchMapping("/notifications/me/{id}/read")
    public Notification markRead(HttpServletRequest http, @PathVariable Long id) {
        return service.markRead(id, auth.requireCustomer(http).customerId());
    }

    @PostMapping("/notifications/me/read-all")
    public Map<String, Integer> markAllRead(HttpServletRequest http) {
        return Map.of("updated", service.markAllRead(auth.requireCustomer(http).customerId()));
    }

    // ---------- administrators ----------

    @GetMapping("/notifications")
    public List<Notification> recent(HttpServletRequest http, @RequestParam(defaultValue = "100") int limit) {
        auth.requireAdmin(http);
        return service.recent(limit);
    }

    @PostMapping("/notifications")
    public ResponseEntity<Notification> send(HttpServletRequest http, @Valid @RequestBody CreateNotificationRequest request) {
        auth.requireAdmin(http);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(request.recipientId(), "GENERAL", request.message()));
    }

    // ---------- service-to-service ----------

    @PostMapping("/internal/notifications")
    public ResponseEntity<Notification> internalCreate(HttpServletRequest http,
                                                       @Valid @RequestBody CreateNotificationRequest request) {
        auth.requireInternal(http);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(service.create(request.recipientId(), request.type(), request.message()));
    }

    public record CreateNotificationRequest(
            @NotNull(message = "Recipient ID is required") @Positive(message = "Recipient ID must be positive") Long recipientId,
            String type,
            @NotBlank(message = "Message is required") @Size(max = 500, message = "Message cannot exceed 500 characters") String message) {
    }
}
