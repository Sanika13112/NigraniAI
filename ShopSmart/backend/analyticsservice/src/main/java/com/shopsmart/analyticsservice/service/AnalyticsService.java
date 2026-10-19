package com.shopsmart.analyticsservice.service;

import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.shopsmart.analyticsservice.logging.AnalyticsActivityLogger;
import com.shopsmart.analyticsservice.repository.AnalyticsRepository;
import com.shopsmart.analyticsservice.security.ApiException;

@Service
public class AnalyticsService {

    private final AnalyticsRepository repository;
    private final AnalyticsActivityLogger activityLogger;

    public AnalyticsService(AnalyticsRepository repository, AnalyticsActivityLogger activityLogger) {
        this.repository = repository;
        this.activityLogger = activityLogger;
    }

    public Map<String, Object> overview() {
        return report("overview", () -> {
            Map<String, Object> orders = new LinkedHashMap<>();
            orders.put("total", repository.totalOrders());
            orders.put("byStatus", repository.ordersByStatus());

            Map<String, Object> revenue = new LinkedHashMap<>();
            revenue.put("currency", "INR");
            revenue.put("liveCaptured", repository.capturedRevenue("LIVE"));
            revenue.put("liveRefunded", repository.refundedAmount("LIVE"));
            revenue.put("sandboxCaptured", repository.capturedRevenue("TEST"));
            revenue.put("sandboxRefunded", repository.refundedAmount("TEST"));
            revenue.put("codCollected", repository.codCollected());
            revenue.put("codOutstanding", repository.codOutstanding());
            revenue.put("legacySimulated", repository.legacySimulatedAmount());

            Map<String, Object> catalogue = new LinkedHashMap<>();
            catalogue.put("products", repository.productCount());
            catalogue.put("lowStock", repository.lowStock(5));

            Map<String, Object> result = new LinkedHashMap<>();
            result.put("orders", orders);
            result.put("payments", repository.paymentsByStatusAndMode());
            result.put("revenue", revenue);
            result.put("catalogue", catalogue);
            result.put("customers", Map.of("total", repository.customerCount()));
            return result;
        });
    }

    public Map<String, Object> trends(int days, String mode) {
        if (days < 1 || days > 365) {
            throw ApiException.badRequest("days must be between 1 and 365");
        }
        if (!"LIVE".equals(mode) && !"TEST".equals(mode)) {
            throw ApiException.badRequest("mode must be LIVE or TEST");
        }
        return report("trends", () -> {
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("days", days);
            result.put("mode", mode);
            result.put("dailyCaptured", repository.dailyCaptured(mode, days));
            result.put("dailyOrders", repository.dailyOrders(days));
            return result;
        });
    }

    public Map<String, Object> topProducts(int limit) {
        if (limit < 1 || limit > 50) {
            throw ApiException.badRequest("limit must be between 1 and 50");
        }
        return report("top-products", () -> Map.of("products", repository.topProducts(limit)));
    }

    private Map<String, Object> report(String name, java.util.function.Supplier<Map<String, Object>> body) {
        try {
            Map<String, Object> result = body.get();
            activityLogger.logReportRequested(name, "SUCCESS");
            return result;
        } catch (RuntimeException exception) {
            activityLogger.logReportRequested(name, "FAILURE");
            throw exception;
        }
    }
}
