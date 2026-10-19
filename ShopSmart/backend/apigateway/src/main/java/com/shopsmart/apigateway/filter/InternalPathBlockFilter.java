package com.shopsmart.apigateway.filter;

import java.util.Locale;

import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

import reactor.core.publisher.Mono;

/**
 * Service-to-service endpoints live under /internal/ and must never be reachable from the
 * internet. They are also protected by INTERNAL_API_KEY inside each service; this is defence in depth.
 * Incoming X-Internal-Key headers from clients are stripped.
 */
@Component
public class InternalPathBlockFilter implements GlobalFilter, Ordered {

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String path = exchange.getRequest().getURI().getRawPath().toLowerCase(Locale.ROOT);
        if (path.contains("/internal/") || path.endsWith("/internal") || path.contains("%2f")) {
            exchange.getResponse().setStatusCode(HttpStatus.NOT_FOUND);
            return exchange.getResponse().setComplete();
        }
        ServerWebExchange sanitized = exchange.mutate()
                .request(request -> request.headers(headers -> headers.remove("X-Internal-Key")))
                .build();
        return chain.filter(sanitized);
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE;
    }
}
