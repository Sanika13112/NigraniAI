package com.shopsmart.notificationservice.security;

import java.time.Duration;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.MDC;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

/** Builds RestClients for calls to other ShopSmart services. */
public final class InternalClients {

    private static final Pattern MESSAGE = Pattern.compile("\"message\"\\s*:\\s*\"((?:[^\"\\\\]|\\\\.)*)\"");

    private InternalClients() {
    }

    public static RestClient create(String baseUrl, String internalKey) {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(3));
        factory.setReadTimeout(Duration.ofSeconds(10));

        return RestClient.builder()
                .baseUrl(baseUrl)
                .requestFactory(factory)
                .requestInterceptor((request, body, execution) -> {
                    request.getHeaders().set(RequestAuth.INTERNAL_KEY_HEADER, internalKey);
                    String traceId = MDC.get("traceId");
                    if (traceId != null) {
                        request.getHeaders().set("X-Trace-Id", traceId);
                    }
                    return execution.execute(request, body);
                })
                .build();
    }

    /** Extracts the "message" field from a ShopSmart error body. */
    public static String messageOf(RestClientResponseException exception, String fallback) {
        String body = exception.getResponseBodyAsString();
        if (body != null) {
            Matcher matcher = MESSAGE.matcher(body);
            if (matcher.find()) {
                return matcher.group(1).replace("\\\"", "\"");
            }
        }
        return fallback;
    }
}
