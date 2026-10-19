package com.shopsmart.customerservice;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

public record InternalCustomerRequest(
        @NotNull @Positive Long authUserId,
        @NotBlank @Size(max = 100) String name,
        @NotBlank @Email @Size(max = 150) String email,
        @Size(max = 10) String phone,
        Boolean marketingConsent,
        @Size(max = 20) String noticeVersion,
        /** Terms and Conditions accepted at sign-up; null when the profile is created at sign-in for an old account. */
        Boolean termsAccepted,
        /** Privacy-notice checkbox ticked at sign-up. */
        Boolean privacyNoticeAccepted,
        @Size(max = 20) String termsVersion) {
}
