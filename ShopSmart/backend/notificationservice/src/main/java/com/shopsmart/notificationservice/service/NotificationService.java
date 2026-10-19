package com.shopsmart.notificationservice.service;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import org.slf4j.MDC;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.shopsmart.notificationservice.entity.Notification;
import com.shopsmart.notificationservice.logging.NotificationActivityEvent;
import com.shopsmart.notificationservice.logging.NotificationActivityLogger;
import com.shopsmart.notificationservice.repository.NotificationRepository;
import com.shopsmart.notificationservice.security.ApiException;

@Service
public class NotificationService {

    private static final Set<String> TYPES = Set.of("ORDER", "PAYMENT", "GENERAL", "PROMOTION");
    /** Older services sent these names; they were silently rejected before. Map them instead. */
    private static final Map<String, String> LEGACY_TYPES = Map.of(
            "ORDER_STATUS", "ORDER",
            "PAYMENT_STATUS", "PAYMENT");

    private final NotificationRepository repository;
    private final NotificationActivityLogger activityLogger;

    public NotificationService(NotificationRepository repository, NotificationActivityLogger activityLogger) {
        this.repository = repository;
        this.activityLogger = activityLogger;
    }

    @Transactional
    public Notification create(Long recipientId, String type, String message) {
        if (recipientId == null || recipientId <= 0) {
            throw ApiException.badRequest("Recipient ID must be positive");
        }
        String normalized = type == null ? "" : type.trim().toUpperCase(Locale.ROOT);
        normalized = LEGACY_TYPES.getOrDefault(normalized, normalized);
        if (!TYPES.contains(normalized)) {
            throw ApiException.badRequest("Invalid notification type");
        }
        if (message == null || message.isBlank() || message.length() > 500) {
            throw ApiException.badRequest("Message must contain 1 to 500 characters");
        }
        Notification saved = repository.save(new Notification(recipientId, normalized, message.trim()));
        log("NOTIFICATION_CREATED", saved);
        return saved;
    }

    @Transactional(readOnly = true)
    public List<Notification> forRecipient(Long recipientId, int limit) {
        return repository.findByRecipientIdOrderByCreatedAtDesc(recipientId, PageRequest.of(0, clamp(limit)));
    }

    @Transactional(readOnly = true)
    public long unreadCount(Long recipientId) {
        return repository.countByRecipientIdAndStatus(recipientId, "UNREAD");
    }

    @Transactional
    public Notification markRead(Long id, Long recipientId) {
        Notification notification = repository.findByIdAndRecipientId(id, recipientId)
                .orElseThrow(() -> ApiException.notFound("Notification not found"));
        notification.setStatus("READ");
        Notification saved = repository.save(notification);
        log("NOTIFICATION_MARKED_READ", saved);
        return saved;
    }

    @Transactional
    public int markAllRead(Long recipientId) {
        return repository.markAllRead(recipientId);
    }

    @Transactional(readOnly = true)
    public List<Notification> recent(int limit) {
        return repository.findAllByOrderByCreatedAtDesc(PageRequest.of(0, clamp(limit)));
    }

    private static int clamp(int limit) {
        return Math.max(1, Math.min(limit, 200));
    }

    private void log(String type, Notification n) {
        activityLogger.logActivity(new NotificationActivityEvent(type, MDC.get("traceId"),
                n.getId(), n.getRecipientId(), n.getType(), "SUCCESS"));
    }
}
