package com.shopsmart.authenticationservice.config;

import java.util.Locale;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import com.shopsmart.authenticationservice.entity.AuthUser;
import com.shopsmart.authenticationservice.repository.AuthUserRepository;

/**
 * Creates the first staff account from ADMIN_EMAIL / ADMIN_PASSWORD. Public registration
 * always creates CUSTOMER accounts, so this is the only way an ADMIN account comes into being.
 */
@Component
public class AdminAccountSeeder implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminAccountSeeder.class);

    private final AuthUserRepository repository;
    private final PasswordEncoder passwordEncoder;
    private final String email;
    private final String password;

    public AdminAccountSeeder(
            AuthUserRepository repository,
            PasswordEncoder passwordEncoder,
            @Value("${shopsmart.admin.email:}") String email,
            @Value("${shopsmart.admin.password:}") String password) {
        this.repository = repository;
        this.passwordEncoder = passwordEncoder;
        this.email = email;
        this.password = password;
    }

    @Override
    public void run(String... args) {
        if (email == null || email.isBlank() || password == null || password.isBlank()) {
            log.info("event=admin_seed_skipped service=authentication-service reason=ADMIN_EMAIL/ADMIN_PASSWORD not set");
            return;
        }
        if (password.length() < 12) {
            log.warn("event=admin_seed_skipped service=authentication-service reason=ADMIN_PASSWORD must be at least 12 characters");
            return;
        }
        String normalized = email.trim().toLowerCase(Locale.ROOT);
        if (repository.existsByEmailIgnoreCase(normalized)) {
            log.info("event=admin_seed_skipped service=authentication-service reason=account_exists");
            return;
        }
        AuthUser admin = new AuthUser(normalized, passwordEncoder.encode(password));
        admin.setRole("ADMIN");
        repository.save(admin);
        log.info("event=admin_seed_created service=authentication-service");
    }
}
