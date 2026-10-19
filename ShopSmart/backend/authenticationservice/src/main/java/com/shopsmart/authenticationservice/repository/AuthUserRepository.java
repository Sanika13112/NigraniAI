
package com.shopsmart.authenticationservice.repository;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

import com.shopsmart.authenticationservice.entity.AuthUser;

public interface AuthUserRepository
        extends JpaRepository<AuthUser, Long> {

    Optional<AuthUser> findByEmailIgnoreCase(String email);

    Optional<AuthUser> findByCustomerId(Long customerId);

    boolean existsByEmailIgnoreCase(String email);
}
