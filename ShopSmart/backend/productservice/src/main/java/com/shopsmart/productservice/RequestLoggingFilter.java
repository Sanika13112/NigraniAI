
package com.shopsmart.productservice;

import java.io.IOException;
import java.util.UUID;
import java.util.concurrent.TimeUnit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class RequestLoggingFilter extends OncePerRequestFilter {

    private static final Logger log =
            LoggerFactory.getLogger(RequestLoggingFilter.class);

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain)
            throws ServletException, IOException {

        long startTime = System.nanoTime();

        // Reuse a valid incoming trace ID, or generate one.
        String traceId = request.getHeader("X-Trace-Id");

        if (traceId == null ||
                !traceId.matches("[A-Za-z0-9._-]{1,100}")) {
            traceId = UUID.randomUUID().toString();
        }

        MDC.put("traceId", traceId);
        response.setHeader("X-Trace-Id", traceId);

        try {
            filterChain.doFilter(request, response);
        } finally {
            long durationMs = TimeUnit.NANOSECONDS.toMillis(
                    System.nanoTime() - startTime);

            log.info(
                "event=http_request service=product-service " +
                "traceId={} method={} path={} status={} durationMs={}",
                traceId,
                request.getMethod(),
                request.getRequestURI(),
                response.getStatus(),
                durationMs
            );

            MDC.remove("traceId");
        }
    }
}

