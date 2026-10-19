package com.shopsmart.productservice;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface StockAdjustmentRepository extends JpaRepository<StockAdjustment, Long> {

    List<StockAdjustment> findTop100ByOrderByCreatedAtDesc();

    List<StockAdjustment> findTop100ByProductIdOrderByCreatedAtDesc(Long productId);
}
