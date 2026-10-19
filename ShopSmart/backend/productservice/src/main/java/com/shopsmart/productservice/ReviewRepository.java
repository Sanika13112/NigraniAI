package com.shopsmart.productservice;

import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface ReviewRepository extends JpaRepository<Review, Long> {

    Page<Review> findByProductId(Long productId, Pageable pageable);

    Optional<Review> findByProductIdAndCustomerId(Long productId, Long customerId);

    List<Review> findTop100ByOrderByCreatedAtDesc();

    /** Rows of [rating, count]. */
    @Query("select r.rating, count(r) from Review r where r.productId = :productId group by r.rating")
    List<Object[]> distribution(@Param("productId") Long productId);
}
