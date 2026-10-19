package com.shopsmart.productservice;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.URI;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.shopsmart.productservice.security.ApiException;

@Service
public class ProductService {

    public static final List<String> CATEGORIES =
            List.of("Electronics", "Fashion", "Accessories", "Beauty", "Home",
                    "Sports", "Books", "Kitchen", "Grocery", "Toys");

    private final ProductRepository products;
    private final InventoryReservationRepository reservations;
    private final StockAdjustmentRepository adjustments;

    public ProductService(ProductRepository products,
                          InventoryReservationRepository reservations,
                          StockAdjustmentRepository adjustments) {
        this.products = products;
        this.reservations = reservations;
        this.adjustments = adjustments;
    }

    // ---------- catalogue ----------

    @Transactional(readOnly = true)
    public List<Product> getAllProducts() {
        return products.findAll(Sort.by("id"));
    }

    @Transactional(readOnly = true)
    public Product get(Long id) {
        return products.findById(id).orElseThrow(() -> ApiException.notFound("Product not found"));
    }

    @Transactional(readOnly = true)
    public PageResponse<Product> search(String q, String category, BigDecimal minPrice, BigDecimal maxPrice,
                                        boolean inStockOnly, String sort, int page, int size) {
        if (page < 0 || size < 1 || size > 60) {
            throw ApiException.badRequest("Page size must be between 1 and 60");
        }
        if (category != null && !category.isBlank() && !CATEGORIES.contains(category)) {
            throw ApiException.badRequest("Unknown category");
        }
        if (minPrice != null && maxPrice != null && minPrice.compareTo(maxPrice) > 0) {
            throw ApiException.badRequest("Minimum price cannot exceed maximum price");
        }
        String term = q == null ? "" : q.trim().toLowerCase(Locale.ROOT).replace("%", "").replace("_", "");
        String pattern = term.isEmpty() ? null : "%" + term + "%";
        Sort order = switch (sort == null ? "relevance" : sort) {
            case "price_asc" -> Sort.by(Sort.Direction.ASC, "price").and(Sort.by("id"));
            case "price_desc" -> Sort.by(Sort.Direction.DESC, "price").and(Sort.by("id"));
            case "newest" -> Sort.by(Sort.Direction.DESC, "id");
            case "name" -> Sort.by(Sort.Direction.ASC, "name");
            case "rating" -> Sort.by(Sort.Direction.DESC, "ratingAverage")
                    .and(Sort.by(Sort.Direction.DESC, "ratingCount")).and(Sort.by("id"));
            default -> Sort.by(Sort.Direction.ASC, "id");
        };
        String categoryFilter = category == null || category.isBlank() ? null : category;
        PageRequest pageable = PageRequest.of(page, size, order);
        if (!term.isEmpty() && term.length() <= 2) {
            return PageResponse.of(products.searchByPrefix(term + "%", "% " + term + "%",
                    categoryFilter, minPrice, maxPrice, inStockOnly, pageable));
        }
        return PageResponse.of(products.search(pattern, categoryFilter,
                minPrice, maxPrice, inStockOnly, pageable));
    }

    // ---------- admin ----------

    @Transactional
    public Product create(ProductRequest request) {
        validate(request);
        products.findByNameIgnoreCaseAndCategoryIgnoreCase(request.name().trim(), request.category())
                .ifPresent(existing -> {
                    throw ApiException.conflict("A product with this name already exists in " + request.category());
                });
        Product product = new Product();
        apply(product, request);
        return products.save(product);
    }

    @Transactional
    public Product update(Long id, ProductRequest request) {
        validate(request);
        Product product = get(id);
        products.findByNameIgnoreCaseAndCategoryIgnoreCase(request.name().trim(), request.category())
                .filter(other -> !other.getId().equals(id))
                .ifPresent(other -> {
                    throw ApiException.conflict("Another product already uses this name in " + request.category());
                });
        apply(product, request);
        return products.save(product);
    }

    @Transactional
    public void delete(Long id) {
        Product product = get(id);
        products.delete(product);
    }

    @Transactional
    public Product adjustStock(Long id, StockAdjustmentRequest request, Long actorUserId) {
        Product product = get(id);
        int delta = request.delta();
        if (delta == 0) {
            throw ApiException.badRequest("Adjustment cannot be zero");
        }
        int updated = delta > 0
                ? products.increment(id, delta)
                : products.decrementIfAvailable(id, -delta);
        if (updated == 0) {
            throw ApiException.conflict("Stock cannot go below zero. Current stock is " + product.getStockQuantity());
        }
        Product fresh = get(id);
        adjustments.save(new StockAdjustment(id, fresh.getName(), delta, fresh.getStockQuantity(),
                request.reason().trim(), actorUserId));
        return fresh;
    }

    @Transactional(readOnly = true)
    public List<StockAdjustment> adjustments(Long productId) {
        return productId == null
                ? adjustments.findTop100ByOrderByCreatedAtDesc()
                : adjustments.findTop100ByProductIdOrderByCreatedAtDesc(productId);
    }

    // ---------- inventory reservations (called by order-service) ----------

    /**
     * Reserves every line or none: a conditional UPDATE per product inside one transaction.
     * Repeating the call with the same orderRef is a no-op.
     */
    @Transactional
    public InventoryReservation reserve(ReservationRequest request) {
        InventoryReservation existing = reservations.findByOrderRef(request.orderRef()).orElse(null);
        if (existing != null) {
            if ("RESERVED".equals(existing.getStatus())) {
                return existing;
            }
            throw ApiException.conflict("This reservation has already been released");
        }

        Set<Long> seen = new HashSet<>();
        List<ReservationRequest.Item> items = new ArrayList<>(request.items());
        for (ReservationRequest.Item item : items) {
            if (!seen.add(item.productId())) {
                throw ApiException.badRequest("A product can appear only once per order");
            }
        }
        // Lock rows in a stable order to avoid deadlocks between concurrent checkouts.
        items.sort(Comparator.comparing(ReservationRequest.Item::productId));

        List<InventoryReservation.Line> lines = new ArrayList<>();
        for (ReservationRequest.Item item : items) {
            int updated = products.decrementIfAvailable(item.productId(), item.quantity());
            if (updated == 0) {
                Product product = products.findById(item.productId()).orElse(null);
                if (product == null) {
                    throw ApiException.conflict("A product in your cart is no longer available");
                }
                throw ApiException.conflict(product.getStockQuantity() <= 0
                        ? product.getName() + " is out of stock"
                        : "Only " + product.getStockQuantity() + " left of " + product.getName());
            }
            lines.add(new InventoryReservation.Line(item.productId(), item.quantity()));
        }
        return reservations.save(new InventoryReservation(request.orderRef(), lines));
    }

    /** Returns reserved stock to the shelf. Safe to call repeatedly. */
    @Transactional
    public String release(String orderRef) {
        InventoryReservation reservation = reservations.findByOrderRef(orderRef).orElse(null);
        if (reservation == null) {
            return "NOT_FOUND";
        }
        if ("RELEASED".equals(reservation.getStatus())) {
            return "RELEASED";
        }
        for (InventoryReservation.Line line : reservation.getLines()) {
            products.increment(line.getProductId(), line.getQuantity());
        }
        reservation.markReleased();
        reservations.save(reservation);
        return "RELEASED";
    }

    // ---------- seeding ----------

    @Transactional
    public void seedProduct(Product product) {
        Product existing = products.findBySeedKey(product.getSeedKey())
                .orElseGet(() -> products.findByNameIgnoreCaseAndCategoryIgnoreCase(
                        product.getName(), product.getCategory()).orElse(null));
        if (existing != null) {
            if ((existing.getImageUrl() == null || existing.getImageUrl().isBlank())
                    && product.getImageUrl() != null && !product.getImageUrl().isBlank()) {
                existing.setImageUrl(product.getImageUrl());
                if (existing.getSeedKey() == null || existing.getSeedKey().isBlank()) {
                    existing.setSeedKey(product.getSeedKey());
                }
                products.save(existing);
            }
            return;
        }
        products.save(product);
    }

    // ---------- helpers ----------

    private void apply(Product product, ProductRequest request) {
        product.setName(request.name().trim());
        product.setDescription(request.description().trim());
        product.setPrice(request.price().setScale(2, RoundingMode.HALF_UP));
        product.setCategory(request.category());
        product.setStockQuantity(request.stockQuantity());
        product.setImageUrl(request.imageUrl() == null || request.imageUrl().isBlank()
                ? null : request.imageUrl().trim());
    }

    private void validate(ProductRequest request) {
        if (!CATEGORIES.contains(request.category())) {
            throw ApiException.badRequest("Category must be one of " + String.join(", ", CATEGORIES));
        }
        String imageUrl = request.imageUrl();
        if (imageUrl != null && !imageUrl.isBlank()) {
            try {
                URI uri = URI.create(imageUrl.trim());
                String scheme = uri.getScheme();
                if (uri.getHost() == null || uri.getUserInfo() != null
                        || (!"https".equalsIgnoreCase(scheme) && !"http".equalsIgnoreCase(scheme))) {
                    throw ApiException.badRequest("Product image URL must be a valid HTTP or HTTPS URL");
                }
            } catch (IllegalArgumentException exception) {
                throw ApiException.badRequest("Product image URL must be a valid HTTP or HTTPS URL");
            }
        }
    }
}
