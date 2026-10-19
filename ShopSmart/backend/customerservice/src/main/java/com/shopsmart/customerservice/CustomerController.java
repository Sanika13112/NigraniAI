package com.shopsmart.customerservice;

import com.shopsmart.customerservice.privacy.MarketingCampaigns;
import com.shopsmart.customerservice.privacy.RetentionJob;
import com.shopsmart.customerservice.security.ApiException;

import java.util.List;
import java.util.Map;

import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import com.shopsmart.customerservice.security.AuthPrincipal;
import com.shopsmart.customerservice.security.RequestAuth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

@RestController
public class CustomerController {

    private final CustomerService customerService;
    private final CustomerPrivacyActivityLogger privacyActivityLogger;
    private final RequestAuth auth;
    private final RetentionJob retention;
    private final MarketingCampaigns campaigns;

    public CustomerController(
            CustomerService customerService,
            CustomerPrivacyActivityLogger privacyActivityLogger,
            RequestAuth auth,
            RetentionJob retention,
            MarketingCampaigns campaigns) {
        this.customerService = customerService;
        this.privacyActivityLogger = privacyActivityLogger;
        this.auth = auth;
        this.retention = retention;
        this.campaigns = campaigns;
    }

    @GetMapping("/customers/health")
    public String health() {
        return "Customer Service is running!";
    }

    // ---------- signed-in customer ----------

    @GetMapping("/customers/me")
    public Customer me(HttpServletRequest request) {
        AuthPrincipal principal = auth.requireCustomer(request);
        logCustomerEvent("CUSTOMER_SELF_VIEWED", "customer_profile_viewing", principal);
        return customerService.get(principal.customerId());
    }

    @PutMapping("/customers/me")
    public Customer updateMe(HttpServletRequest request, @Valid @RequestBody ProfileUpdateRequest body) {
        AuthPrincipal principal = auth.requireCustomer(request);
        logCustomerEvent("CUSTOMER_UPDATED", "customer_profile_update", principal);
        return customerService.updateProfile(principal.customerId(), body);
    }

    @GetMapping("/customers/me/consent")
    public Map<String, Object> consent(HttpServletRequest request) {
        return customerService.consent(auth.requireCustomer(request).customerId());
    }

    @PutMapping("/customers/me/consent")
    public Map<String, Object> updateConsent(HttpServletRequest request, @RequestBody Map<String, Object> body) {
        AuthPrincipal principal = auth.requireCustomer(request);
        Object marketing = body == null ? null : body.get("marketingConsent");
        if (!(marketing instanceof Boolean value)) {
            throw ApiException.badRequest("marketingConsent must be true or false");
        }
        return customerService.updateMarketingConsent(principal.customerId(), value);
    }

    @PostMapping("/customers/me/deletion-request")
    public Map<String, Object> requestDeletion(HttpServletRequest request) {
        AuthPrincipal principal = auth.requireCustomer(request);
        logCustomerEvent("ERASURE_REQUESTED", "data_principal_erasure_request", principal);
        return customerService.requestDeletion(principal.customerId(), retention.eraseAfterSeconds());
    }

    @GetMapping("/customers/me/addresses")
    public List<Address> addresses(HttpServletRequest request) {
        return customerService.addresses(auth.requireCustomer(request).customerId());
    }

    @PostMapping("/customers/me/addresses")
    public ResponseEntity<Address> addAddress(HttpServletRequest request, @Valid @RequestBody AddressRequest body) {
        AuthPrincipal principal = auth.requireCustomer(request);
        logCustomerEvent("ADDRESS_CREATED", "delivery_address_management", principal);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(customerService.addAddress(principal.customerId(), body));
    }

    @PutMapping("/customers/me/addresses/{id}")
    public Address updateAddress(HttpServletRequest request, @PathVariable Long id,
                                 @Valid @RequestBody AddressRequest body) {
        AuthPrincipal principal = auth.requireCustomer(request);
        logCustomerEvent("ADDRESS_UPDATED", "delivery_address_management", principal);
        return customerService.updateAddress(principal.customerId(), id, body);
    }

    @PostMapping("/customers/me/addresses/{id}/default")
    public Address makeDefault(HttpServletRequest request, @PathVariable Long id) {
        return customerService.makeDefault(auth.requireCustomer(request).customerId(), id);
    }

    @DeleteMapping("/customers/me/addresses/{id}")
    public ResponseEntity<Void> deleteAddress(HttpServletRequest request, @PathVariable Long id) {
        AuthPrincipal principal = auth.requireCustomer(request);
        logCustomerEvent("ADDRESS_DELETED", "delivery_address_management", principal);
        customerService.deleteAddress(principal.customerId(), id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/customers/me/wishlist")
    public Map<String, List<Long>> wishlist(HttpServletRequest request) {
        return Map.of("productIds", customerService.wishlist(auth.requireCustomer(request).customerId()));
    }

    @PutMapping("/customers/me/wishlist/{productId}")
    public Map<String, List<Long>> addToWishlist(HttpServletRequest request, @PathVariable Long productId) {
        return Map.of("productIds",
                customerService.addToWishlist(auth.requireCustomer(request).customerId(), productId));
    }

    @DeleteMapping("/customers/me/wishlist/{productId}")
    public Map<String, List<Long>> removeFromWishlist(HttpServletRequest request, @PathVariable Long productId) {
        return Map.of("productIds",
                customerService.removeFromWishlist(auth.requireCustomer(request).customerId(), productId));
    }

    // ---------- administrators ----------

    @GetMapping("/customers")
    public List<Customer> list(HttpServletRequest request) {
        AuthPrincipal principal = auth.requireAdmin(request);
        logCustomerEvent("CUSTOMER_LIST_VIEWED", "customer_directory_viewing", principal);
        return customerService.list();
    }

    @GetMapping("/customers/{id}")
    public Map<String, Object> get(HttpServletRequest request, @PathVariable Long id) {
        AuthPrincipal principal = auth.requireAdmin(request);
        logCustomerEvent("CUSTOMER_VIEWED", "customer_profile_viewing", principal);
        return Map.of(
                "customer", customerService.get(id),
                "addresses", customerService.addresses(id));
    }

    @PostMapping("/customers/admin/campaigns")
    public Map<String, Object> sendCampaign(HttpServletRequest request, @RequestBody(required = false) Map<String, Object> body) {
        AuthPrincipal principal = auth.requireAdmin(request);
        Object message = body == null ? null : body.get("message");
        return campaigns.send(message instanceof String text ? text : null, "admin:" + principal.userId());
    }

    // ---------- service-to-service ----------

    @PostMapping("/internal/customers")
    public Map<String, Object> ensure(HttpServletRequest request, @Valid @RequestBody InternalCustomerRequest body) {
        auth.requireInternal(request);
        Customer customer = customerService.ensureForAccount(body);
        return Map.of("id", customer.getId());
    }

    @GetMapping("/internal/customers/{id}")
    public Customer internalGet(HttpServletRequest request, @PathVariable Long id) {
        auth.requireInternal(request);
        return customerService.get(id);
    }

    private void logCustomerEvent(String eventType, String purpose, AuthPrincipal principal) {
        CustomerPrivacyActivityEvent event = new CustomerPrivacyActivityEvent();
        event.setEventType(eventType);
        event.setTraceId(MDC.get("traceId"));
        event.setActorRef(principal.isAdmin() ? "admin:" + principal.userId() : "customer:" + principal.customerId());
        event.setDataCategory("customer_profile");
        event.setPurpose(purpose);
        event.setDestination("internal");
        event.setOutcome("SUCCESS");
        privacyActivityLogger.logEvent(event);
    }
}
