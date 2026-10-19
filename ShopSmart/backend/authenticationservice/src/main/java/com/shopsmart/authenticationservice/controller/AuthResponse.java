package com.shopsmart.authenticationservice.controller;

/** Returned by register, login and refresh. The refresh token travels only in an HttpOnly cookie. */
public record AuthResponse(String accessToken, String tokenType, long expiresIn, UserView user) {

    public record UserView(Long id, Long customerId, String email, String role) {
    }
}
