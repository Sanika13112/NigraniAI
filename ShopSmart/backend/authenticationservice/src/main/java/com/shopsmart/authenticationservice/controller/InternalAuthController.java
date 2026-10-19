package com.shopsmart.authenticationservice.controller;

import java.util.Map;

import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import com.shopsmart.authenticationservice.security.RequestAuth;
import com.shopsmart.authenticationservice.service.AuthService;

import jakarta.servlet.http.HttpServletRequest;

/** Service-to-service endpoints (blocked at the gateway; require the internal key). */
@RestController
public class InternalAuthController {

    private final AuthService authService;
    private final RequestAuth requestAuth;

    public InternalAuthController(AuthService authService, RequestAuth requestAuth) {
        this.authService = authService;
        this.requestAuth = requestAuth;
    }

    @PostMapping("/internal/auth/customers/{customerId}/erase")
    public Map<String, Object> erase(HttpServletRequest request, @PathVariable Long customerId) {
        requestAuth.requireInternal(request);
        return Map.of("erased", authService.eraseForCustomer(customerId));
    }
}
