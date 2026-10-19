package com.shopsmart.orderservice.job;

import java.time.Duration;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.shopsmart.orderservice.entity.Order;
import com.shopsmart.orderservice.service.OrderService;

/** Releases stock held by online orders that were never paid. */
@Component
public class UnpaidOrderExpiryJob {

    private static final Logger log = LoggerFactory.getLogger(UnpaidOrderExpiryJob.class);

    private final OrderService orderService;
    private final Duration paymentWindow;

    public UnpaidOrderExpiryJob(OrderService orderService,
                                @Value("${shopsmart.orders.payment-window-minutes:30}") long minutes) {
        this.orderService = orderService;
        this.paymentWindow = Duration.ofMinutes(minutes);
    }

    @Scheduled(fixedDelayString = "${shopsmart.orders.expiry-check-ms:60000}", initialDelay = 30000)
    public void expireUnpaidOrders() {
        Instant cutoff = Instant.now().minus(paymentWindow);
        for (Order order : orderService.unpaidOlderThan(cutoff)) {
            try {
                orderService.expireIfUnpaid(order.getId());
            } catch (RuntimeException exception) {
                log.warn("event=order_expiry_failed service=order-service orderId={} error={}", order.getId(),
                        exception.getClass().getSimpleName());
            }
        }
    }
}
