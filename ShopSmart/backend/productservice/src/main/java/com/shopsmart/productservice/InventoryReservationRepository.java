package com.shopsmart.productservice;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface InventoryReservationRepository extends JpaRepository<InventoryReservation, Long> {

    Optional<InventoryReservation> findByOrderRef(String orderRef);
}
