package com.shopsmart.productservice;

import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.shopsmart.productservice.security.RequestAuth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

@RestController
public class ReviewController {

    private final ReviewService reviews;
    private final RequestAuth auth;

    public ReviewController(ReviewService reviews, RequestAuth auth) {
        this.reviews = reviews;
        this.auth = auth;
    }

    /** Public: summary (average, count, star distribution) and a page of reviews. */
    @GetMapping("/products/{id}/reviews")
    public Map<String, Object> list(@PathVariable Long id,
                                    @RequestParam(defaultValue = "recent") String sort,
                                    @RequestParam(defaultValue = "0") int page,
                                    @RequestParam(defaultValue = "10") int size) {
        return reviews.list(id, sort, page, size);
    }

    /** The signed-in customer's own review, and whether they're allowed to write one. */
    @GetMapping("/products/{id}/reviews/me")
    public Map<String, Object> mine(HttpServletRequest http, @PathVariable Long id) {
        return reviews.mine(id, auth.requireCustomer(http).customerId());
    }

    @PutMapping("/products/{id}/reviews/me")
    public Review upsert(HttpServletRequest http, @PathVariable Long id, @Valid @RequestBody ReviewRequest body) {
        return reviews.upsert(id, auth.requireCustomer(http).customerId(), body);
    }

    @DeleteMapping("/products/{id}/reviews/me")
    public ResponseEntity<Void> deleteMine(HttpServletRequest http, @PathVariable Long id) {
        reviews.deleteMine(id, auth.requireCustomer(http).customerId());
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/products/reviews")
    public List<Review> recent(HttpServletRequest http) {
        auth.requireAdmin(http);
        return reviews.recent();
    }

    @DeleteMapping("/products/reviews/{reviewId}")
    public ResponseEntity<Void> moderate(HttpServletRequest http, @PathVariable Long reviewId) {
        auth.requireAdmin(http);
        reviews.deleteByAdmin(reviewId);
        return ResponseEntity.noContent().build();
    }
}
