package com.shopsmart.authenticationservice.service;

import java.time.Duration;
import java.time.Instant;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.shopsmart.authenticationservice.client.CustomerClient;
import com.shopsmart.authenticationservice.demo.DemoSwitches;
import com.shopsmart.authenticationservice.demo.GroundTruth;
import com.shopsmart.authenticationservice.demo.PiiTypes;
import com.shopsmart.authenticationservice.demo.SyntheticPii;
import com.shopsmart.authenticationservice.repository.RefreshTokenRepository;
import com.shopsmart.authenticationservice.entity.AuthUser;
import com.shopsmart.authenticationservice.repository.AuthUserRepository;
import com.shopsmart.authenticationservice.security.ApiException;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);

    private static final int MAX_FAILED_ATTEMPTS = 5;
    private static final Duration LOCK_DURATION = Duration.ofMinutes(15);
    private static final String INVALID_CREDENTIALS = "Invalid email or password";

    private final AuthUserRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final CustomerClient customerClient;
    private final String timingDummyHash;
    private final RefreshTokenRepository refreshTokens;
    private final DemoSwitches demo;
    private final GroundTruth groundTruth;
    private final String currentTermsVersion;

    public AuthService(
            AuthUserRepository repository,
            PasswordEncoder passwordEncoder,
            CustomerClient customerClient,
            RefreshTokenRepository refreshTokens,
            DemoSwitches demo,
            GroundTruth groundTruth,
            @Value("${shopsmart.terms.version:2026-10-15}") String currentTermsVersion) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.customerClient = customerClient;
        this.refreshTokens = refreshTokens;
        this.demo = demo;
        this.groundTruth = groundTruth;
        this.currentTermsVersion = currentTermsVersion;
        this.timingDummyHash = passwordEncoder.encode("timing-equaliser-not-a-real-password");
    }

    /**
     * Creates the login account and its customer profile together. If the profile cannot be
     * created the transaction rolls back, so no half-registered account is left behind.
     */
    @Transactional
    public AuthUser register(String name, String email, String password, String phone, boolean marketingConsent,
                             String termsVersion) {
        // The request has already been checked for termsAccepted == true. The version must be the one in force,
        // so nobody can register against terms they were not shown.
        if (termsVersion == null || !currentTermsVersion.equals(termsVersion.trim())) {
            log.info("event=terms_version_rejected service=authentication-service current={}", currentTermsVersion);
            throw ApiException.conflict("The Terms and Conditions have been updated. Please reload the page, review them and try again.");
        }
        String normalizedEmail = normalize(email);
        if (demo.on(DemoSwitches.PII_IN_LOGS)) {
            // Demo only: fictional values, never the real sign-up details.
            SyntheticPii.Person fake = SyntheticPii.person();
            String message = SyntheticPii.demoPrefix("authentication-service", "PII_IN_LOGS")
                    + "Registering new user: name=" + fake.name() + ", email=" + fake.email() + ", phone=" + fake.phone();
            log.info("{}", message);
            groundTruth.record("PII_IN_LOGS", PiiTypes.of(message, true, false), "email-hash:"
                    + GroundTruth.sha256(normalizedEmail).substring(0, 12), "authentication-service.log",
                    log.getName(), message, "Sign-up details written to the application log");
        }

        if (repository.existsByEmailIgnoreCase(normalizedEmail)) {
            throw ApiException.conflict("An account with this email already exists");
        }

        AuthUser user = repository.saveAndFlush(
                new AuthUser(normalizedEmail, passwordEncoder.encode(password)));

        // Registration is only accepted with the privacy notice ticked (@AssertTrue on RegisterRequest).
        Long customerId = customerClient.ensureCustomer(user.getId(), name.trim(), normalizedEmail, phone, marketingConsent,
                Boolean.TRUE, currentTermsVersion);
        user.setCustomerId(customerId);
        return repository.save(user);
    }

    @Transactional(noRollbackFor = ApiException.class)
    public AuthUser login(String email, String password) {
        AuthUser user = repository.findByEmailIgnoreCase(normalize(email)).orElse(null);

        if (user == null) {
            // Spend comparable time so response timing does not reveal registered emails.
            passwordEncoder.matches(password, timingDummyHash);
            throw ApiException.unauthorized(INVALID_CREDENTIALS);
        }

        Instant now = Instant.now();
        if (user.getLockedUntil() != null && user.getLockedUntil().isAfter(now)) {
            throw new ApiException(org.springframework.http.HttpStatus.TOO_MANY_REQUESTS,
                    "Too many failed sign-in attempts. Please try again in 15 minutes.");
        }

        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            if (demo.on(DemoSwitches.PII_IN_LOGS)) {
                // Demo only: a fictional email, never the real account's.
                String message = SyntheticPii.demoPrefix("authentication-service", "PII_IN_LOGS")
                        + "Login failed: wrong password for " + SyntheticPii.person().email() + " (account " + user.getId()
                        + ", attempt " + (user.getFailedLoginAttempts() + 1) + ")";
                log.warn("{}", message);
                groundTruth.record("PII_IN_LOGS", PiiTypes.of(message, false, false), "auth-user:" + user.getId(),
                        "authentication-service.log", log.getName(), message, "Email address written to the log on a failed sign-in");
            }
            int attempts = user.getFailedLoginAttempts() + 1;
            user.setFailedLoginAttempts(attempts);
            if (attempts >= MAX_FAILED_ATTEMPTS) {
                user.setLockedUntil(now.plus(LOCK_DURATION));
                user.setFailedLoginAttempts(0);
            }
            repository.save(user);
            throw ApiException.unauthorized(INVALID_CREDENTIALS);
        }

        user.setFailedLoginAttempts(0);
        user.setLockedUntil(null);

        // Accounts created before profiles were linked get their profile on first sign-in.
        if ("CUSTOMER".equals(user.getRole()) && user.getCustomerId() == null) {
            String fallbackName = user.getEmail().substring(0, user.getEmail().indexOf('@'));
            user.setCustomerId(customerClient.ensureCustomer(user.getId(), fallbackName, user.getEmail(), null, null, null, null));
        }
        return repository.save(user);
    }

    /** DPDP erasure of the login account that belongs to a customer. Safe to call repeatedly. */
    @Transactional
    public boolean eraseForCustomer(Long customerId) {
        AuthUser user = repository.findByCustomerId(customerId).orElse(null);
        if (user == null || user.getEmail().endsWith("@erased.invalid")) {
            return false;
        }
        user.setEmail("erased-" + user.getId() + "@erased.invalid");
        user.setPasswordHash("!erased");
        user.setLockedUntil(Instant.now().plus(Duration.ofDays(36500)));
        repository.save(user);
        refreshTokens.revokeAllForUser(user.getId());
        log.info("event=login_account_erased service=authentication-service authUserId={} customerRef=customer:{} "
                + "erased=email,password_hash sessions=revoked", user.getId(), customerId);
        return true;
    }

    @Transactional(readOnly = true)
    public AuthUser getById(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.unauthorized("Your session has expired. Please sign in again."));
    }

    private static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }
}
