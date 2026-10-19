package com.shopsmart.productservice.security;

import java.io.IOException;

import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * Reads a Bearer token when present and stores the verified principal on the request.
 * Endpoints decide what access they require through {@link RequestAuth}.
 */
@Component
public class AuthFilter extends OncePerRequestFilter {

    public static final String PRINCIPAL_ATTRIBUTE = "shopsmart.principal";
    public static final String TOKEN_INVALID_ATTRIBUTE = "shopsmart.tokenInvalid";

    private final JwtVerifier verifier;

    public AuthFilter(JwtVerifier verifier) {
        this.verifier = verifier;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {

        String header = request.getHeader("Authorization");

        if (header != null && header.regionMatches(true, 0, "Bearer ", 0, 7)) {
            String token = header.substring(7).trim();
            try {
                request.setAttribute(PRINCIPAL_ATTRIBUTE, verifier.verify(token));
            } catch (RuntimeException exception) {
                request.setAttribute(TOKEN_INVALID_ATTRIBUTE, Boolean.TRUE);
            }
        }

        filterChain.doFilter(request, response);
    }
}
