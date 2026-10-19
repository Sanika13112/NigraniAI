package com.shopsmart.customerservice;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

@Entity
@Table(name = "customers")
public class Customer {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(nullable = false, unique = true, length = 150)
    private String email;

    @Column(length = 10)
    private String phone;

    /** The login account in authentication-service that owns this profile. */
    @Column(unique = true)
    private Long authUserId;

    private Instant createdAt;

    /** DPDP consent: account, orders and delivery are always covered; marketing only when given. */
    private Boolean marketingConsent;

    @Column(length = 20)
    private String consentNoticeVersion;

    private Instant consentedAt;

    private Instant consentUpdatedAt;

    /** Set when the customer asks for their account to be deleted (DPDP erasure). */
    private Instant deletionRequestedAt;

    /** Set once personal data has been erased. */
    private Instant erasedAt;

    /**
     * Terms and Conditions acceptance, kept separate from the privacy-notice consent above and from marketing
     * consent. Null on profiles created before this feature: no acceptance was recorded for them.
     */
    private Boolean termsAccepted;

    /** Privacy-notice checkbox at sign-up (DPDP consent for account, orders, delivery, payment). Null on older profiles. */
    private Boolean privacyNoticeAccepted;

    @Column(length = 20)
    private String termsVersion;

    private Instant termsAcceptedAt;

    public Customer() {
    }

    public Customer(String name, String email, String phone) {
        this.name = name;
        this.email = email;
        this.phone = phone;
    }

    @PrePersist
    public void onCreate() {
        if (createdAt == null) {
            createdAt = Instant.now();
        }
    }

    public Long getId() { return id; }
    public String getName() { return name; }
    public String getEmail() { return email; }
    public String getPhone() { return phone; }
    public Long getAuthUserId() { return authUserId; }
    public Instant getCreatedAt() { return createdAt; }
    public boolean isMarketingConsent() { return Boolean.TRUE.equals(marketingConsent); }
    public String getConsentNoticeVersion() { return consentNoticeVersion; }
    public Instant getConsentedAt() { return consentedAt; }
    public Instant getConsentUpdatedAt() { return consentUpdatedAt; }
    public Instant getDeletionRequestedAt() { return deletionRequestedAt; }
    public Instant getErasedAt() { return erasedAt; }
    public Boolean getTermsAccepted() { return termsAccepted; }
    public Boolean getPrivacyNoticeAccepted() { return privacyNoticeAccepted; }
    public void setPrivacyNoticeAccepted(Boolean privacyNoticeAccepted) { this.privacyNoticeAccepted = privacyNoticeAccepted; }
    public String getTermsVersion() { return termsVersion; }
    public Instant getTermsAcceptedAt() { return termsAcceptedAt; }

    public void setName(String name) { this.name = name; }
    public void setEmail(String email) { this.email = email; }
    public void setPhone(String phone) { this.phone = phone; }
    public void setAuthUserId(Long authUserId) { this.authUserId = authUserId; }
    public void setMarketingConsent(boolean marketingConsent) { this.marketingConsent = marketingConsent; }
    public void setConsentNoticeVersion(String consentNoticeVersion) { this.consentNoticeVersion = consentNoticeVersion; }
    public void setConsentedAt(Instant consentedAt) { this.consentedAt = consentedAt; }
    public void setConsentUpdatedAt(Instant consentUpdatedAt) { this.consentUpdatedAt = consentUpdatedAt; }
    public void setDeletionRequestedAt(Instant deletionRequestedAt) { this.deletionRequestedAt = deletionRequestedAt; }
    public void setErasedAt(Instant erasedAt) { this.erasedAt = erasedAt; }

    /** Records acceptance of one Terms and Conditions version. Marketing consent is not touched. */
    public void acceptTerms(String version, Instant acceptedAt) {
        this.termsAccepted = Boolean.TRUE;
        this.termsVersion = version;
        this.termsAcceptedAt = acceptedAt;
    }
}
