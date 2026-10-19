package com.shopsmart.notificationservice.security;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Optional;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import jakarta.servlet.http.HttpServletRequest;

/** Server-side authorization checks used by every controller. */
@Component
public class RequestAuth {

    public static final String INTERNAL_KEY_HEADER = "X-Internal-Key";

    private final byte[] internalKey;

    public RequestAuth(@Value("${shopsmart.security.internal-api-key:}") String internalKey) {
        if (internalKey == null || internalKey.length() < 24) {
            throw new IllegalStateException(
                    "INTERNAL_API_KEY must be configured and contain at least 24 characters");
        }
        this.internalKey = internalKey.getBytes(StandardCharsets.UTF_8);
    }

    public Optional<AuthPrincipal> optional(HttpServletRequest request) {
        Object value = request.getAttribute(AuthFilter.PRINCIPAL_ATTRIBUTE);
        return value instanceof AuthPrincipal principal
                ? Optional.of(principal)
                : Optional.empty();
    }

    public AuthPrincipal require(HttpServletRequest request) {
        return optional(request).orElseThrow(() -> ApiException.unauthorized(
                Boolean.TRUE.equals(request.getAttribute(AuthFilter.TOKEN_INVALID_ATTRIBUTE))
                        ? "Your session has expired. Please sign in again."
                        : "Please sign in to continue."));
    }

    public AuthPrincipal requireAdmin(HttpServletRequest request) {
        AuthPrincipal principal = require(request);
        if (!principal.isAdmin()) {
            throw ApiException.forbidden("Administrator access is required.");
        }
        return principal;
    }

    public AuthPrincipal requireCustomer(HttpServletRequest request) {
        AuthPrincipal principal = require(request);
        if (principal.customerId() == null) {
            throw ApiException.forbidden("A customer account is required for this action.");
        }
        return principal;
    }

    /** Service-to-service calls carry a shared key that never leaves the backend network. */
    public void requireInternal(HttpServletRequest request) {
        String provided = request.getHeader(INTERNAL_KEY_HEADER);
        if (provided == null
                || !MessageDigest.isEqual(provided.getBytes(StandardCharsets.UTF_8), internalKey)) {
            throw ApiException.forbidden("Forbidden");
        }
    }
}
