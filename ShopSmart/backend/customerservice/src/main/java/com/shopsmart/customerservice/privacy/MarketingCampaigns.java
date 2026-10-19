package com.shopsmart.customerservice.privacy;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;

import com.shopsmart.customerservice.Customer;
import com.shopsmart.customerservice.CustomerRepository;
import com.shopsmart.customerservice.client.PlatformClients;
import com.shopsmart.customerservice.demo.DemoSwitches;
import com.shopsmart.customerservice.demo.GroundTruth;

/**
 * Promotional messages. Only customers who gave marketing consent are contacted.
 * With the OUT_OF_SCOPE_PROCESSING demo switch on, the consent filter is skipped and every
 * customer is contacted: processing beyond the purpose they agreed to.
 *
 * The per-recipient log line deliberately does not state the customer's consent; an agent has to
 * correlate it with that customer's consent_recorded / consent_given / consent_withdrawn events.
 */
@Service
public class MarketingCampaigns {

    private static final Logger log = LoggerFactory.getLogger(MarketingCampaigns.class);
    private static final String DEFAULT_MESSAGE = "New arrivals are here. Explore this week's picks on ShopSmart.";

    private final CustomerRepository customers;
    private final PlatformClients platform;
    private final DemoSwitches demo;
    private final GroundTruth groundTruth;

    public MarketingCampaigns(CustomerRepository customers, PlatformClients platform, DemoSwitches demo,
                              GroundTruth groundTruth) {
        this.customers = customers;
        this.platform = platform;
        this.demo = demo;
        this.groundTruth = groundTruth;
    }

    public Map<String, Object> send(String message, String actorRef) {
        String text = message == null || message.isBlank() ? DEFAULT_MESSAGE : message.trim();
        if (text.length() > 300) {
            text = text.substring(0, 300);
        }
        boolean skipConsentFilter = demo.on(DemoSwitches.OUT_OF_SCOPE_PROCESSING);
        List<Customer> audience = skipConsentFilter
                ? customers.findByErasedAtIsNull()
                : customers.findByMarketingConsentTrueAndErasedAtIsNull();
        String campaignId = "cmp-" + UUID.randomUUID().toString().substring(0, 8);
        int sent = 0;
        for (Customer c : audience) {
            if (c.getDeletionRequestedAt() != null && !skipConsentFilter) {
                continue;
            }
            if (!platform.sendPromotion(c.getId(), text)) {
                continue;
            }
            sent++;
            String consentStatus = c.getDeletionRequestedAt() != null ? "erasure_requested"
                    : c.isMarketingConsent() ? "granted"
                    : c.getConsentUpdatedAt() != null && c.getConsentedAt() != null
                            && c.getConsentUpdatedAt().isAfter(c.getConsentedAt()) ? "withdrawn" : "absent";
            boolean allowed = "granted".equals(consentStatus);
            log.info("event=marketing_message_sent service=customer-service traceId={} campaignId={} "
                            + "customerRef=customer:{} purpose=marketing channel=in_app dataCategory=contact "
                            + "consentStatus={} purposeAllowed={}{}",
                    trace(), campaignId, c.getId(), consentStatus, allowed,
                    allowed ? "" : " demo=true scenario=OUT_OF_SCOPE_PROCESSING");
            if (!allowed) {
                groundTruth.record("OUT_OF_SCOPE_PROCESSING", List.of(), "customer:" + c.getId(),
                        "customer-service.log", log.getName(), null,
                        "Marketing message sent in campaign " + campaignId
                                + " without marketing consent (consented purposes exclude marketing)");
            }
        }
        log.info("event=marketing_campaign_sent service=customer-service traceId={} campaignId={} actor={} "
                + "recipients={} purpose=marketing", trace(), campaignId, actorRef, sent);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("campaignId", campaignId);
        out.put("recipients", sent);
        out.put("sentAt", Instant.now().toString());
        return out;
    }

    private static String trace() {
        String traceId = MDC.get("traceId");
        return traceId == null ? "none" : traceId;
    }
}
