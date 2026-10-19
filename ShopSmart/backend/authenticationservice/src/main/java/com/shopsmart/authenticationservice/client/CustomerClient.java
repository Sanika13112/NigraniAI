package com.shopsmart.authenticationservice.client;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.shopsmart.authenticationservice.security.ApiException;
import com.shopsmart.authenticationservice.security.InternalClients;

/** Creates or links the customer profile that belongs to an account. */
@Component
public class CustomerClient {

    private static final Logger log = LoggerFactory.getLogger(CustomerClient.class);

    private final RestClient client;

    public CustomerClient(
            @Value("${customer.service.url}") String baseUrl,
            @Value("${shopsmart.security.internal-api-key:}") String internalKey) {
        this.client = InternalClients.create(baseUrl, internalKey);
    }

    /**
     * Creates or links the customer profile. termsVersion is the accepted Terms and Conditions version at sign-up,
     * or null when an old account gets its profile at sign-in (no new acceptance is recorded then).
     */
    public Long ensureCustomer(Long authUserId, String name, String email, String phone, Boolean marketingConsent,
                               Boolean privacyNoticeAccepted, String termsVersion) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("authUserId", authUserId);
        body.put("name", name);
        body.put("email", email);
        body.put("phone", phone == null ? "" : phone);
        if (marketingConsent != null) {
            body.put("marketingConsent", marketingConsent);
            body.put("noticeVersion", "v1-2026-10");
        }
        if (privacyNoticeAccepted != null) {
            body.put("privacyNoticeAccepted", privacyNoticeAccepted);
        }
        if (termsVersion != null) {
            body.put("termsAccepted", true);
            body.put("termsVersion", termsVersion);
        }

        try {
            Map<?, ?> response = client.post()
                    .uri("/internal/customers")
                    .body(body)
                    .retrieve()
                    .body(Map.class);
            Object id = response == null ? null : response.get("id");
            if (id instanceof Number number) {
                return number.longValue();
            }
        } catch (RestClientException exception) {
            log.warn("event=customer_profile_link_failed service=authentication-service authUserId={} error={}",
                    authUserId, exception.getClass().getSimpleName());
        }
        throw ApiException.unavailable("We couldn't finish setting up your account. Please try again in a moment.");
    }
}
