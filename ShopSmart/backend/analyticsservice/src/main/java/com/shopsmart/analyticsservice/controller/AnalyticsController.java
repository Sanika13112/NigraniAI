package com.shopsmart.analyticsservice.controller;

import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.shopsmart.analyticsservice.security.RequestAuth;
import com.shopsmart.analyticsservice.service.AnalyticsService;

import jakarta.servlet.http.HttpServletRequest;

/** Business reports. Administrators only. */
@RestController
@RequestMapping("/analytics")
public class AnalyticsController {

    private final AnalyticsService analyticsService;
    private final RequestAuth auth;

    public AnalyticsController(AnalyticsService analyticsService, RequestAuth auth) {
        this.analyticsService = analyticsService;
        this.auth = auth;
    }

    @GetMapping("/overview")
    public Map<String, Object> overview(HttpServletRequest http) {
        auth.requireAdmin(http);
        return analyticsService.overview();
    }

    @GetMapping("/trends")
    public Map<String, Object> trends(HttpServletRequest http,
                                      @RequestParam(defaultValue = "30") int days,
                                      @RequestParam(defaultValue = "TEST") String mode) {
        auth.requireAdmin(http);
        return analyticsService.trends(days, mode);
    }

    @GetMapping("/top-products")
    public Map<String, Object> topProducts(HttpServletRequest http, @RequestParam(defaultValue = "5") int limit) {
        auth.requireAdmin(http);
        return analyticsService.topProducts(limit);
    }
}
