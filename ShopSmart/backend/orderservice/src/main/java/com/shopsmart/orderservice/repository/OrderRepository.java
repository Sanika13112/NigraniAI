package com.shopsmart.orderservice.repository;

import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import com.shopsmart.orderservice.entity.Order;

@Repository
public interface OrderRepository extends JpaRepository<Order, Long> {

    Page<Order> findByCustomerId(Long customerId, Pageable pageable);

    Page<Order> findByStatus(String status, Pageable pageable);

    Optional<Order> findByCustomerIdAndIdempotencyKey(Long customerId, String idempotencyKey);

    List<Order> findTop100ByStatusAndCreatedAtBefore(String status, Instant cutoff);

    Page<Order> findByCustomerIdAndStatus(Long customerId, String status, Pageable pageable);

    /** Orders with a return request or any refund activity. */
    @Query("select o from Order o where o.customerId = :customerId "
            + "and (o.returnReason is not null or o.paymentStatus in :refundStatuses)")
    Page<Order> findReturnsAndRefunds(@Param("customerId") Long customerId,
                                      @Param("refundStatuses") Collection<String> refundStatuses,
                                      Pageable pageable);

    /** How many of the customer's orders in the given states contain the product. */
    @Query("select count(o) from Order o join o.items i "
            + "where o.customerId = :customerId and i.productId = :productId and o.status in :statuses")
    long countPurchases(@Param("customerId") Long customerId,
                        @Param("productId") Long productId,
                        @Param("statuses") Collection<String> statuses);
}
