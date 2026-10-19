package com.shopsmart.customerservice;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface CustomerRepository extends JpaRepository<Customer, Long> {

    Optional<Customer> findByEmailIgnoreCase(String email);

    Optional<Customer> findByAuthUserId(Long authUserId);

    List<Customer> findByDeletionRequestedAtBeforeAndErasedAtIsNull(Instant cutoff);

    List<Customer> findByErasedAtIsNull();

    List<Customer> findByMarketingConsentTrueAndErasedAtIsNull();
}
