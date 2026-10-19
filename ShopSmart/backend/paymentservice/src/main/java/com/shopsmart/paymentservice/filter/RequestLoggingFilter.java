
package com.shopsmart.paymentservice.filter;

import java.io.IOException;
import java.util.UUID;

import org.slf4j.MDC;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@Component
public class RequestLoggingFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain)
            throws ServletException, IOException {

        String traceId = request.getHeader("X-Trace-Id");

        if (traceId == null || !traceId.matches(
                "[a-zA-Z0-9-]{1,64}")) {
            traceId = UUID.randomUUID().toString();
        }

        long startTime = System.currentTimeMillis();

        MDC.put("traceId", traceId);
        response.setHeader("X-Trace-Id", traceId);

        try {
            filterChain.doFilter(request, response);
        } finally {
            long duration = System.currentTimeMillis() - startTime;

            logger.info(
                    "event=http_request service=payment-service"
                    + " traceId=" + traceId
                    + " method=" + request.getMethod()
                    + " path=" + request.getRequestURI()
                    + " status=" + response.getStatus()
                    + " durationMs=" + duration
            );

            MDC.remove("traceId");
        }
    }
}
