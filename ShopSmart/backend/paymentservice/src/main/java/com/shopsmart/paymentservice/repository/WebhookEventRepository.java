package com.shopsmart.paymentservice.repository;

import org.springframework.data.jpa.repository.JpaRepository;

import com.shopsmart.paymentservice.entity.WebhookEvent;

public interface WebhookEventRepository extends JpaRepository<WebhookEvent, String> {
}
