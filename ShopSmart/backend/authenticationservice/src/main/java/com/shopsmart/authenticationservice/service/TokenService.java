package com.shopsmart.authenticationservice.service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.HexFormat;

import javax.crypto.SecretKey;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.shopsmart.authenticationservice.entity.AuthUser;
import com.shopsmart.authenticationservice.entity.RefreshToken;
import com.shopsmart.authenticationservice.repository.RefreshTokenRepository;
import com.shopsmart.authenticationservice.security.ApiException;

import io.jsonwebtoken.JwtBuilder;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;

@Service
public class TokenService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private final SecretKey key;
    private final String issuer;
    private final Duration accessTtl;
    private final Duration refreshTtl;
    private final RefreshTokenRepository refreshTokens;

    public TokenService(
            @Value("${shopsmart.security.jwt-secret:}") String secret,
            @Value("${shopsmart.security.jwt-issuer:shopsmart-auth}") String issuer,
            @Value("${shopsmart.security.access-token-minutes:15}") long accessMinutes,
            @Value("${shopsmart.security.refresh-token-days:7}") long refreshDays,
            RefreshTokenRepository refreshTokens) {

        if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
            throw new IllegalStateException("JWT_SECRET must be configured and contain at least 32 bytes");
        }
        this.key = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
        this.issuer = issuer;
        this.accessTtl = Duration.ofMinutes(accessMinutes);
        this.refreshTtl = Duration.ofDays(refreshDays);
        this.refreshTokens = refreshTokens;
    }

    public long accessTtlSeconds() {
        return accessTtl.toSeconds();
    }

    public Duration refreshTtl() {
        return refreshTtl;
    }

    public String issueAccessToken(AuthUser user) {
        Instant now = Instant.now();
        JwtBuilder builder = Jwts.builder()
                .issuer(issuer)
                .subject(String.valueOf(user.getId()))
                .claim("typ", "access")
                .claim("email", user.getEmail())
                .claim("role", user.getRole())
                .issuedAt(Date.from(now))
                .expiration(Date.from(now.plus(accessTtl)));
        if (user.getCustomerId() != null) {
            builder.claim("cid", user.getCustomerId());
        }
        return builder.signWith(key).compact();
    }

    @Transactional
    public String issueRefreshToken(AuthUser user) {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        String raw = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        refreshTokens.save(new RefreshToken(user.getId(), hash(raw), Instant.now().plus(refreshTtl)));
        return raw;
    }

    /** Validates and revokes a refresh token, returning the owner id. Reuse of a revoked token revokes the whole family. */
    @Transactional
    public Long consumeRefreshToken(String raw) {
        if (raw == null || raw.isBlank() || raw.length() > 200) {
            throw ApiException.unauthorized("Your session has expired. Please sign in again.");
        }
        RefreshToken token = refreshTokens.findByTokenHash(hash(raw))
                .orElseThrow(() -> ApiException.unauthorized("Your session has expired. Please sign in again."));

        if (token.isRevoked()) {
            refreshTokens.revokeAllForUser(token.getUserId());
            throw ApiException.unauthorized("Your session has expired. Please sign in again.");
        }
        if (token.getExpiresAt().isBefore(Instant.now())) {
            token.setRevoked(true);
            throw ApiException.unauthorized("Your session has expired. Please sign in again.");
        }
        token.setRevoked(true);
        return token.getUserId();
    }

    @Transactional
    public void revoke(String raw) {
        if (raw == null || raw.isBlank() || raw.length() > 200) {
            return;
        }
        refreshTokens.findByTokenHash(hash(raw)).ifPresent(token -> token.setRevoked(true));
    }

    private static String hash(String raw) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(exception);
        }
    }
}
