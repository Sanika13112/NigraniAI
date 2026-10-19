package com.shopsmart.orderservice.security;

import java.nio.charset.StandardCharsets;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

/** Verifies HS256 access tokens issued by the authentication service. */
@Component
public class JwtVerifier {

    private final SecretKey key;
    private final String issuer;

    public JwtVerifier(
            @Value("${shopsmart.security.jwt-secret:}") String secret,
            @Value("${shopsmart.security.jwt-issuer:shopsmart-auth}") String issuer) {

        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException(
                    "JWT_SECRET must be configured and contain at least 32 bytes");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.issuer = issuer;
    }

    public AuthPrincipal verify(String token) {
        Claims claims = Jwts.parser()
                .verifyWith(key)
                .requireIssuer(issuer)
                .build()
                .parseSignedClaims(token)
                .getPayload();

        if (!"access".equals(claims.get("typ", String.class))) {
            throw new JwtException("Token is not an access token");
        }

        String subject = claims.getSubject();
        if (subject == null || !subject.matches("\\d{1,18}")) {
            throw new JwtException("Token subject is invalid");
        }

        return new AuthPrincipal(
                Long.valueOf(subject),
                claims.get("cid", Long.class),
                claims.get("email", String.class),
                claims.get("role", String.class));
    }
}
