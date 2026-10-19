package com.shopsmart.productservice;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.shopsmart.productservice.client.PurchaseClient;
import com.shopsmart.productservice.security.ApiException;

@Service
public class ReviewService {

    private final ReviewRepository reviews;
    private final ProductRepository products;
    private final PurchaseClient purchases;

    public ReviewService(ReviewRepository reviews, ProductRepository products, PurchaseClient purchases) {
        this.reviews = reviews;
        this.products = products;
        this.purchases = purchases;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> list(Long productId, String sort, int page, int size) {
        if (!products.existsById(productId)) {
            throw ApiException.notFound("Product not found");
        }
        if (page < 0 || size < 1 || size > 50) {
            throw ApiException.badRequest("Page size must be between 1 and 50");
        }
        Sort order = switch (sort == null ? "recent" : sort) {
            case "highest" -> Sort.by(Sort.Direction.DESC, "rating").and(Sort.by(Sort.Direction.DESC, "createdAt"));
            case "lowest" -> Sort.by(Sort.Direction.ASC, "rating").and(Sort.by(Sort.Direction.DESC, "createdAt"));
            default -> Sort.by(Sort.Direction.DESC, "createdAt");
        };
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("summary", summary(productId));
        result.put("reviews", PageResponse.of(reviews.findByProductId(productId, PageRequest.of(page, size, order))));
        return result;
    }

    @Transactional(readOnly = true)
    public Map<String, Object> mine(Long productId, Long customerId) {
        if (!products.existsById(productId)) {
            throw ApiException.notFound("Product not found");
        }
        Review review = reviews.findByProductIdAndCustomerId(productId, customerId).orElse(null);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("canReview", review != null || purchases.hasReceived(customerId, productId));
        result.put("review", review);
        return result;
    }

    @Transactional
    public Review upsert(Long productId, Long customerId, ReviewRequest request) {
        Product product = products.findById(productId).orElseThrow(() -> ApiException.notFound("Product not found"));
        Review review = reviews.findByProductIdAndCustomerId(productId, customerId).orElse(null);
        if (review == null) {
            if (!purchases.hasReceived(customerId, productId)) {
                throw ApiException.forbidden("Only customers who received this product can review it.");
            }
            review = new Review();
            review.setProductId(productId);
            review.setCustomerId(customerId);
            review.setReviewerName(purchases.displayName(customerId));
        }
        review.setRating(request.rating());
        review.setTitle(blankToNull(request.title()));
        review.setComment(blankToNull(request.comment()));
        Review saved = reviews.saveAndFlush(review);
        refreshProductRating(product);
        return saved;
    }

    @Transactional
    public void deleteMine(Long productId, Long customerId) {
        Review review = reviews.findByProductIdAndCustomerId(productId, customerId)
                .orElseThrow(() -> ApiException.notFound("Review not found"));
        reviews.delete(review);
        reviews.flush();
        products.findById(productId).ifPresent(this::refreshProductRating);
    }

    @Transactional(readOnly = true)
    public List<Review> recent() {
        return reviews.findTop100ByOrderByCreatedAtDesc();
    }

    /** Moderation: remove an abusive or irrelevant review. */
    @Transactional
    public void deleteByAdmin(Long reviewId) {
        Review review = reviews.findById(reviewId).orElseThrow(() -> ApiException.notFound("Review not found"));
        Long productId = review.getProductId();
        reviews.delete(review);
        reviews.flush();
        products.findById(productId).ifPresent(this::refreshProductRating);
    }

    private Map<String, Object> summary(Long productId) {
        long[] counts = new long[6];
        long total = 0;
        long sum = 0;
        for (Object[] row : reviews.distribution(productId)) {
            int stars = ((Number) row[0]).intValue();
            long count = ((Number) row[1]).longValue();
            if (stars >= 1 && stars <= 5) {
                counts[stars] = count;
                total += count;
                sum += stars * count;
            }
        }
        Map<String, Object> distribution = new LinkedHashMap<>();
        for (int stars = 5; stars >= 1; stars--) {
            distribution.put(String.valueOf(stars), counts[stars]);
        }
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("average", total == 0 ? null
                : BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP));
        summary.put("count", total);
        summary.put("distribution", distribution);
        return summary;
    }

    private void refreshProductRating(Product product) {
        long total = 0;
        long sum = 0;
        for (Object[] row : reviews.distribution(product.getId())) {
            int stars = ((Number) row[0]).intValue();
            long count = ((Number) row[1]).longValue();
            total += count;
            sum += stars * count;
        }
        product.setRating(total == 0 ? null
                : BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(total), 2, RoundingMode.HALF_UP), (int) total);
        products.save(product);
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
