package com.shopsmart.analyticsservice.security;

/** The verified identity carried by a ShopSmart access token. */
public record AuthPrincipal(Long userId, Long customerId, String email, String role) {

    public boolean isAdmin() {
        return "ADMIN".equals(role);
    }
}
