package com.shopsmart.apigateway.filter;

import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilterChain;
import org.springframework.cloud.gateway.filter.GlobalFilter;
import org.springframework.core.Ordered;
import org.springframework.http.HttpStatusCode;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ServerWebExchange;

import reactor.core.publisher.Mono;

/**
 * Website activity log: one line for every request that enters ShopSmart through the gateway.
 * Reuses the browser's X-Trace-Id (or creates one) and forwards it, so the same id appears in the
 * services' own logs. The client address is masked to its network (a full IP is personal data).
 */
@Component
public class RequestLoggingFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(RequestLoggingFilter.class);

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        long start = System.nanoTime();
        String incoming = exchange.getRequest().getHeaders().getFirst("X-Trace-Id");
        String traceId = incoming != null && incoming.matches("[A-Za-z0-9._-]{1,100}") ? incoming : UUID.randomUUID().toString();
        ServerWebExchange traced = exchange.mutate()
                .request(r -> r.headers(h -> h.set("X-Trace-Id", traceId)))
                .build();
        String path = exchange.getRequest().getURI().getRawPath();
        return chain.filter(traced).doFinally(signal -> {
            HttpStatusCode status = traced.getResponse().getStatusCode();
            log.info("event=http_request service=api-gateway traceId={} method={} path={} status={} durationMs={} clientNet={} channel=web",
                    traceId, exchange.getRequest().getMethod(), path, status == null ? 0 : status.value(),
                    (System.nanoTime() - start) / 1_000_000, maskedClient(exchange));
        });
    }

    private static String maskedClient(ServerWebExchange exchange) {
        InetSocketAddress remote = exchange.getRequest().getRemoteAddress();
        InetAddress address = remote == null ? null : remote.getAddress();
        if (address == null) {
            return "unknown";
        }
        byte[] b = address.getAddress();
        if (b.length == 4) {
            return (b[0] & 0xff) + "." + (b[1] & 0xff) + "." + (b[2] & 0xff) + ".0/24";
        }
        return "ipv6/48";
    }

    @Override
    public int getOrder() {
        return Ordered.HIGHEST_PRECEDENCE + 1;
    }
}
