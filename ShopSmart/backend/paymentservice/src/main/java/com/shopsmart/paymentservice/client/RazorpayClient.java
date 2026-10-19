package com.shopsmart.paymentservice.client;

import java.nio.charset.StandardCharsets;
import java.security.InvalidKeyException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Supplier;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

import com.shopsmart.paymentservice.security.ApiException;

/**
 * Minimal Razorpay REST client (Orders, Payments, Refunds) plus signature checks.
 * Keys come only from backend environment variables.
 */
@Component
public class RazorpayClient {

    private static final Logger log = LoggerFactory.getLogger(RazorpayClient.class);

    private final String keyId;
    private final String keySecret;
    private final String webhookSecret;
    private final RestClient client;

    public RazorpayClient(
            @Value("${razorpay.key-id:}") String keyId,
            @Value("${razorpay.key-secret:}") String keySecret,
            @Value("${razorpay.webhook-secret:}") String webhookSecret,
            @Value("${razorpay.base-url:https://api.razorpay.com}") String baseUrl) {
        this.keyId = keyId == null ? "" : keyId.trim();
        this.keySecret = keySecret == null ? "" : keySecret.trim();
        this.webhookSecret = webhookSecret == null ? "" : webhookSecret.trim();

        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(5));
        factory.setReadTimeout(Duration.ofSeconds(20));

        RestClient.Builder builder = RestClient.builder().baseUrl(baseUrl).requestFactory(factory);
        if (isConfigured()) {
            builder.defaultHeaders(headers -> headers.setBasicAuth(this.keyId, this.keySecret));
        }
        this.client = builder.build();

        if (isConfigured()) {
            log.info("event=razorpay_configured service=payment-service mode={}", mode());
        } else {
            log.warn("event=razorpay_not_configured service=payment-service online payments are disabled");
        }
    }

    public boolean isConfigured() {
        return !keySecret.isEmpty()
                && (keyId.startsWith("rzp_test_") || keyId.startsWith("rzp_live_"));
    }

    public boolean isWebhookConfigured() {
        return !webhookSecret.isEmpty();
    }

    public String mode() {
        return keyId.startsWith("rzp_live_") ? "LIVE" : "TEST";
    }

    public String keyId() {
        return keyId;
    }

    public Map<String, Object> createOrder(long amountPaise, String currency, String receipt, Map<String, String> notes) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("amount", amountPaise);
        body.put("currency", currency);
        body.put("receipt", receipt);
        body.put("notes", notes);
        return call(() -> client.post().uri("/v1/orders").body(body).retrieve().body(Map.class));
    }

    public Map<String, Object> fetchPayment(String paymentId) {
        return call(() -> client.get().uri("/v1/payments/{id}", paymentId).retrieve().body(Map.class));
    }

    public Map<String, Object> capture(String paymentId, long amountPaise, String currency) {
        Map<String, Object> body = Map.of("amount", amountPaise, "currency", currency);
        return call(() -> client.post().uri("/v1/payments/{id}/capture", paymentId).body(body).retrieve().body(Map.class));
    }

    @SuppressWarnings("unchecked")
    public List<Map<String, Object>> orderPayments(String providerOrderId) {
        Map<String, Object> collection = call(() ->
                client.get().uri("/v1/orders/{id}/payments", providerOrderId).retrieve().body(Map.class));
        Object items = collection.get("items");
        return items instanceof List<?> list ? (List<Map<String, Object>>) list : List.of();
    }

    public Map<String, Object> refund(String paymentId, long amountPaise, Map<String, String> notes) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("amount", amountPaise);
        body.put("notes", notes);
        return call(() -> client.post().uri("/v1/payments/{id}/refund", paymentId).body(body).retrieve().body(Map.class));
    }

    /** Checkout signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret). */
    public boolean verifyPaymentSignature(String providerOrderId, String paymentId, String signature) {
        return isConfigured() && constantTimeEquals(hmacHex(providerOrderId + "|" + paymentId, keySecret), signature);
    }

    /** Webhook signature: HMAC-SHA256(raw request body, webhook secret). */
    public boolean verifyWebhookSignature(String rawBody, String signature) {
        return isWebhookConfigured() && signature != null
                && constantTimeEquals(hmacHex(rawBody, webhookSecret), signature);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> call(Supplier<Map> request) {
        if (!isConfigured()) {
            throw ApiException.unavailable("Online payments are not configured on this server");
        }
        try {
            Map<String, Object> body = request.get();
            if (body == null) {
                throw ApiException.unavailable("The payment provider returned an empty response");
            }
            return body;
        } catch (RestClientResponseException exception) {
            int status = exception.getStatusCode().value();
            log.warn("event=razorpay_error service=payment-service httpStatus={}", status);
            if (status >= 500) {
                throw ApiException.unavailable("The payment provider is temporarily unavailable. Please try again.");
            }
            throw new ApiException(HttpStatus.BAD_GATEWAY, "The payment provider rejected the request");
        } catch (RestClientException exception) {
            throw ApiException.unavailable("The payment provider is temporarily unavailable. Please try again.");
        }
    }

    private static String hmacHex(String message, String secret) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            byte[] digest = mac.doFinal(message.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException | InvalidKeyException exception) {
            throw new IllegalStateException(exception);
        }
    }

    private static boolean constantTimeEquals(String expected, String provided) {
        if (provided == null) {
            return false;
        }
        return MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8));
    }
}
