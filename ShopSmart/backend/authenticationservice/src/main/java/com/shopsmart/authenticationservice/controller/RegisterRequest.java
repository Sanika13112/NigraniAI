package com.shopsmart.authenticationservice.controller;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public class RegisterRequest {

    @NotBlank(message = "Name is required")
    @Size(max = 100, message = "Name must be at most 100 characters")
    private String name;

    @NotBlank(message = "Email is required")
    @Email(message = "Enter a valid email address")
    @Size(max = 150, message = "Email must not exceed 150 characters")
    private String email;

    @NotBlank(message = "Password is required")
    @Size(min = 8, max = 72, message = "Password must contain between 8 and 72 characters")
    @Pattern(regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$",
            message = "Password must contain at least one letter and one number")
    private String password;

    @Pattern(regexp = "^$|^[6-9][0-9]{9}$", message = "Enter a valid 10-digit mobile number")
    private String phone;

    /** DPDP notice and consent: required to create an account. */
    @AssertTrue(message = "Please accept the privacy notice to create an account")
    private boolean acceptPrivacyNotice;

    /** Optional, separate consent for promotional messages. */
    private boolean marketingConsent;

    /**
     * Terms and Conditions: required, and separate from the privacy-notice consent and marketing consent.
     * A Boolean so a missing value is rejected as well as false.
     */
    @NotNull(message = "Please accept the Terms and Conditions to continue.")
    @AssertTrue(message = "Please accept the Terms and Conditions to continue.")
    private Boolean termsAccepted;

    /** The version of the Terms and Conditions the customer was shown; must match the server's current version. */
    @NotBlank(message = "Terms version is missing. Reload the page and try again.")
    @Size(max = 20, message = "Terms version is invalid")
    private String termsVersion;

    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getEmail() { return email; }
    public void setEmail(String email) { this.email = email; }
    public String getPassword() { return password; }
    public void setPassword(String password) { this.password = password; }
    public String getPhone() { return phone; }
    public void setPhone(String phone) { this.phone = phone; }
    public boolean isAcceptPrivacyNotice() { return acceptPrivacyNotice; }
    public void setAcceptPrivacyNotice(boolean acceptPrivacyNotice) { this.acceptPrivacyNotice = acceptPrivacyNotice; }
    public boolean isMarketingConsent() { return marketingConsent; }
    public void setMarketingConsent(boolean marketingConsent) { this.marketingConsent = marketingConsent; }
    public Boolean getTermsAccepted() { return termsAccepted; }
    public void setTermsAccepted(Boolean termsAccepted) { this.termsAccepted = termsAccepted; }
    public String getTermsVersion() { return termsVersion; }
    public void setTermsVersion(String termsVersion) { this.termsVersion = termsVersion; }
}
