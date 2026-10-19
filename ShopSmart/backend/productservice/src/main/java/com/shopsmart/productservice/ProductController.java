package com.shopsmart.productservice;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.shopsmart.productservice.security.AuthPrincipal;
import com.shopsmart.productservice.security.RequestAuth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

@RestController
public class ProductController {

    private final ProductService productService;
    private final PrivacyActivityLogger privacyActivityLogger;
    private final RequestAuth auth;

    public ProductController(ProductService productService,
                             PrivacyActivityLogger privacyActivityLogger,
                             RequestAuth auth) {
        this.productService = productService;
        this.privacyActivityLogger = privacyActivityLogger;
        this.auth = auth;
    }

    // ---------- public catalogue ----------

    @GetMapping("/products")
    public List<Product> getAllProducts() {
        return productService.getAllProducts();
    }

    @GetMapping("/products/search")
    public PageResponse<Product> search(
            @RequestParam(required = false) String q,
            @RequestParam(required = false) String category,
            @RequestParam(required = false) BigDecimal minPrice,
            @RequestParam(required = false) BigDecimal maxPrice,
            @RequestParam(defaultValue = "false") boolean inStock,
            @RequestParam(defaultValue = "relevance") String sort,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "12") int size) {
        return productService.search(q, category, minPrice, maxPrice, inStock, sort, page, size);
    }

    @GetMapping("/products/categories")
    public List<String> categories() {
        return ProductService.CATEGORIES;
    }

    @GetMapping("/products/{id}")
    public Product getProductById(@PathVariable Long id) {
        Product product = productService.get(id);
        logEvent("PRODUCT_VIEWED", "catalog_browsing", "unknown");
        return product;
    }

    // ---------- administrators ----------

    @PostMapping("/products")
    public ResponseEntity<Product> addProduct(HttpServletRequest request, @Valid @RequestBody ProductRequest body) {
        AuthPrincipal admin = auth.requireAdmin(request);
        Product saved = productService.create(body);
        logEvent("PRODUCT_CREATED", "catalog_management", "admin:" + admin.userId());
        return ResponseEntity.status(HttpStatus.CREATED).body(saved);
    }

    @PutMapping("/products/{id}")
    public Product updateProduct(HttpServletRequest request, @PathVariable Long id,
                                 @Valid @RequestBody ProductRequest body) {
        AuthPrincipal admin = auth.requireAdmin(request);
        Product saved = productService.update(id, body);
        logEvent("PRODUCT_UPDATED", "catalog_management", "admin:" + admin.userId());
        return saved;
    }

    @DeleteMapping("/products/{id}")
    public ResponseEntity<Void> deleteProduct(HttpServletRequest request, @PathVariable Long id) {
        AuthPrincipal admin = auth.requireAdmin(request);
        productService.delete(id);
        logEvent("PRODUCT_DELETED", "catalog_management", "admin:" + admin.userId());
        return ResponseEntity.noContent().build();
    }

    @PatchMapping("/products/{id}/stock")
    public Product adjustStock(HttpServletRequest request, @PathVariable Long id,
                               @Valid @RequestBody StockAdjustmentRequest body) {
        AuthPrincipal admin = auth.requireAdmin(request);
        Product product = productService.adjustStock(id, body, admin.userId());
        logEvent("PRODUCT_STOCK_ADJUSTED", "inventory_management", "admin:" + admin.userId());
        return product;
    }

    @GetMapping("/products/stock-adjustments")
    public List<StockAdjustment> stockAdjustments(HttpServletRequest request,
                                                  @RequestParam(required = false) Long productId) {
        auth.requireAdmin(request);
        return productService.adjustments(productId);
    }

    // ---------- service-to-service ----------

    @PostMapping("/internal/inventory/reserve")
    public Map<String, Object> reserve(HttpServletRequest request, @Valid @RequestBody ReservationRequest body) {
        auth.requireInternal(request);
        InventoryReservation reservation = productService.reserve(body);
        return Map.of("orderRef", reservation.getOrderRef(), "status", reservation.getStatus());
    }

    @PostMapping("/internal/inventory/release")
    public Map<String, Object> release(HttpServletRequest request, @RequestBody Map<String, String> body) {
        auth.requireInternal(request);
        String orderRef = body.get("orderRef");
        if (orderRef == null || orderRef.isBlank() || orderRef.length() > 64) {
            throw new IllegalArgumentException("orderRef is required");
        }
        return Map.of("orderRef", orderRef, "status", productService.release(orderRef));
    }

    private void logEvent(String type, String purpose, String actor) {
        PrivacyActivityEvent event = new PrivacyActivityEvent();
        event.setEventType(type);
        event.setTraceId(MDC.get("traceId"));
        event.setActorRef(actor);
        event.setDataCategory("product_catalog");
        event.setPurpose(purpose);
        event.setDestination("internal");
        event.setOutcome("SUCCESS");
        privacyActivityLogger.logEvent(event);
    }
}
