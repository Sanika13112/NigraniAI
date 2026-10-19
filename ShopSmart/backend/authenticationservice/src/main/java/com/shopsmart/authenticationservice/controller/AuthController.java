package com.shopsmart.authenticationservice.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.shopsmart.authenticationservice.entity.AuthUser;
import com.shopsmart.authenticationservice.security.AuthPrincipal;
import com.shopsmart.authenticationservice.security.RequestAuth;
import com.shopsmart.authenticationservice.service.AuthService;
import com.shopsmart.authenticationservice.service.TokenService;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

@RestController
@RequestMapping("/auth")
public class AuthController {

    private static final Logger log = LoggerFactory.getLogger(AuthController.class);
    static final String REFRESH_COOKIE = "ss_refresh";

    private final AuthService authService;
    private final TokenService tokenService;
    private final RequestAuth requestAuth;
    private final boolean secureCookie;

    public AuthController(
            AuthService authService,
            TokenService tokenService,
            RequestAuth requestAuth,
            @Value("${shopsmart.security.cookie-secure:true}") boolean secureCookie) {
        this.authService = authService;
        this.tokenService = tokenService;
        this.requestAuth = requestAuth;
        this.secureCookie = secureCookie;
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        AuthUser user = authService.register(
                request.getName(), request.getEmail(), request.getPassword(), request.getPhone(),
                request.isMarketingConsent(), request.getTermsVersion());
        log.info("event=AUTH_REGISTER_SUCCESS service=authentication-service userId={}", user.getId());
        return session(HttpStatus.CREATED, user);
    }

    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request) {
        AuthUser user = authService.login(request.getEmail(), request.getPassword());
        log.info("event=AUTH_LOGIN_SUCCESS service=authentication-service userId={}", user.getId());
        return session(HttpStatus.OK, user);
    }

    /** Exchanges the HttpOnly refresh cookie for a new access token, rotating the cookie. */
    @PostMapping("/refresh")
    public ResponseEntity<AuthResponse> refresh(
            @CookieValue(name = REFRESH_COOKIE, required = false) String refreshToken) {
        Long userId = tokenService.consumeRefreshToken(refreshToken);
        return session(HttpStatus.OK, authService.getById(userId));
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(
            @CookieValue(name = REFRESH_COOKIE, required = false) String refreshToken) {
        tokenService.revoke(refreshToken);
        return ResponseEntity.noContent()
                .header(HttpHeaders.SET_COOKIE, cookie("", 0).toString())
                .build();
    }

    @GetMapping("/me")
    public AuthResponse.UserView me(HttpServletRequest request) {
        AuthPrincipal principal = requestAuth.require(request);
        return view(authService.getById(principal.userId()));
    }

    private ResponseEntity<AuthResponse> session(HttpStatus status, AuthUser user) {
        String refresh = tokenService.issueRefreshToken(user);
        AuthResponse body = new AuthResponse(
                tokenService.issueAccessToken(user),
                "Bearer",
                tokenService.accessTtlSeconds(),
                view(user));
        return ResponseEntity.status(status)
                .header(HttpHeaders.SET_COOKIE,
                        cookie(refresh, tokenService.refreshTtl().toSeconds()).toString())
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(body);
    }

    private ResponseCookie cookie(String value, long maxAgeSeconds) {
        return ResponseCookie.from(REFRESH_COOKIE, value)
                .httpOnly(true)
                .secure(secureCookie)
                .sameSite("Strict")
                .path("/")
                .maxAge(maxAgeSeconds)
                .build();
    }

    private static AuthResponse.UserView view(AuthUser user) {
        return new AuthResponse.UserView(user.getId(), user.getCustomerId(), user.getEmail(), user.getRole());
    }
}
