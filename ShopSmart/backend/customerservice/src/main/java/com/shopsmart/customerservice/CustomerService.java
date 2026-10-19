package com.shopsmart.customerservice;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

import com.shopsmart.customerservice.demo.DemoSwitches;
import com.shopsmart.customerservice.demo.GroundTruth;
import com.shopsmart.customerservice.demo.PiiTypes;
import com.shopsmart.customerservice.demo.SyntheticPii;

import java.util.List;
import java.util.Locale;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.shopsmart.customerservice.security.ApiException;

@Service
public class CustomerService {

    private static final int MAX_ADDRESSES = 10;
    private static final int MAX_WISHLIST = 200;
    public static final String NOTICE_VERSION = "v1-2026-10";

    private static final Logger log = LoggerFactory.getLogger(CustomerService.class);

    private final CustomerRepository customers;
    private final AddressRepository addresses;
    private final WishlistRepository wishlist;
    private final DemoSwitches demo;
    private final GroundTruth groundTruth;

    public CustomerService(CustomerRepository customers, AddressRepository addresses, WishlistRepository wishlist,
                           DemoSwitches demo, GroundTruth groundTruth) {
        this.customers = customers;
        this.addresses = addresses;
        this.wishlist = wishlist;
        this.demo = demo;
        this.groundTruth = groundTruth;
    }

    /** Links (or creates) the profile for a login account. Safe to call repeatedly. */
    @Transactional
    public Customer ensureForAccount(InternalCustomerRequest request) {
        boolean termsGiven = Boolean.TRUE.equals(request.termsAccepted());
        if (termsGiven && (request.termsVersion() == null || request.termsVersion().isBlank())) {
            throw ApiException.badRequest("Terms version is required when the Terms and Conditions are accepted");
        }
        Customer linked = customers.findByAuthUserId(request.authUserId()).orElse(null);
        if (linked != null) {
            return linked; // repeated call for the same account: nothing new to record
        }
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        Customer existing = customers.findByEmailIgnoreCase(email).orElse(null);
        if (existing != null) {
            if (existing.getAuthUserId() != null && !existing.getAuthUserId().equals(request.authUserId())) {
                throw ApiException.conflict("This email is linked to another account");
            }
            existing.setAuthUserId(request.authUserId());
            if (Boolean.TRUE.equals(request.privacyNoticeAccepted())) {
                existing.setPrivacyNoticeAccepted(Boolean.TRUE);
            }
            if (termsGiven) {
                existing.acceptTerms(request.termsVersion().trim(), Instant.now());
            }
            Customer saved = customers.save(existing);
            if (termsGiven) {
                logTermsAccepted(saved);
            }
            return saved;
        }
        String phone = request.phone() == null || request.phone().isBlank() ? null : request.phone().trim();
        Customer customer = new Customer(request.name().trim(), email, phone);
        customer.setAuthUserId(request.authUserId());
        Instant now = Instant.now();
        customer.setMarketingConsent(Boolean.TRUE.equals(request.marketingConsent()));
        customer.setConsentNoticeVersion(request.noticeVersion() == null || request.noticeVersion().isBlank()
                ? NOTICE_VERSION : request.noticeVersion().trim());
        customer.setConsentedAt(now);
        customer.setConsentUpdatedAt(now);
        if (Boolean.TRUE.equals(request.privacyNoticeAccepted())) {
            customer.setPrivacyNoticeAccepted(Boolean.TRUE);
        }
        if (termsGiven) {
            customer.acceptTerms(request.termsVersion().trim(), now);
        }
        Customer saved = customers.save(customer);
        if (termsGiven) {
            logTermsAccepted(saved);
        }
        log.info("event=consent_recorded service=customer-service traceId={} customerRef=customer:{} "
                        + "purposes={} noticeVersion={} privacyNoticeAccepted={} lawfulBasis=consent",
                trace(), saved.getId(), purposes(saved.isMarketingConsent()), saved.getConsentNoticeVersion(),
                Boolean.TRUE.equals(saved.getPrivacyNoticeAccepted()));
        return saved;
    }

    @Transactional(readOnly = true)
    public Customer get(Long id) {
        return customers.findById(id).orElseThrow(() -> ApiException.notFound("Customer not found"));
    }

    @Transactional(readOnly = true)
    public List<Customer> list() {
        return customers.findAll();
    }

    @Transactional
    public Customer updateProfile(Long customerId, ProfileUpdateRequest request) {
        Customer customer = get(customerId);
        customer.setName(request.name().trim());
        customer.setPhone(request.phone() == null || request.phone().isBlank() ? null : request.phone().trim());
        Customer saved = customers.save(customer);
        if (demo.on(DemoSwitches.PII_IN_LOGS)) {
            // Demo only: fictional values, never this customer's real data.
            SyntheticPii.Person fake = SyntheticPii.person();
            String message = SyntheticPii.demoPrefix("customer-service", "PII_IN_LOGS")
                    + "Customer profile updated: Customer{id=" + saved.getId() + ", name='" + fake.name()
                    + "', email='" + fake.email() + "', phone='" + fake.phone() + "'}";
            log.info("{}", message);
            groundTruth.record("PII_IN_LOGS", PiiTypes.of(message, true, false), "customer:" + saved.getId(),
                    "customer-service.log", log.getName(), message, "Full customer record written to the application log");
        }
        return saved;
    }

    // ---------- consent and erasure (DPDP) ----------

    @Transactional(readOnly = true)
    public Map<String, Object> consent(Long customerId) {
        Customer customer = get(customerId);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("noticeVersion", customer.getConsentNoticeVersion() == null ? NOTICE_VERSION : customer.getConsentNoticeVersion());
        out.put("purposes", purposes(customer.isMarketingConsent()).split(","));
        out.put("marketingConsent", customer.isMarketingConsent());
        out.put("consentedAt", customer.getConsentedAt());
        out.put("consentUpdatedAt", customer.getConsentUpdatedAt());
        out.put("deletionRequestedAt", customer.getDeletionRequestedAt());
        out.put("privacyNoticeAccepted", Boolean.TRUE.equals(customer.getPrivacyNoticeAccepted()));
        out.put("termsAccepted", Boolean.TRUE.equals(customer.getTermsAccepted()));
        out.put("termsVersion", customer.getTermsVersion());
        out.put("termsAcceptedAt", customer.getTermsAcceptedAt());
        return out;
    }

    @Transactional
    public Map<String, Object> updateMarketingConsent(Long customerId, boolean marketingConsent) {
        Customer customer = get(customerId);
        if (customer.isMarketingConsent() != marketingConsent || customer.getConsentedAt() == null) {
            Instant now = Instant.now();
            customer.setMarketingConsent(marketingConsent);
            if (customer.getConsentedAt() == null) {
                customer.setConsentedAt(now);
                customer.setConsentNoticeVersion(NOTICE_VERSION);
            }
            customer.setConsentUpdatedAt(now);
            customers.save(customer);
            log.info("event={} service=customer-service traceId={} customerRef=customer:{} purpose=marketing "
                            + "purposes={} noticeVersion={}",
                    marketingConsent ? "consent_given" : "consent_withdrawn", trace(), customerId,
                    purposes(marketingConsent), customer.getConsentNoticeVersion());
        }
        return consent(customerId);
    }

    @Transactional
    public Map<String, Object> requestDeletion(Long customerId, long eraseAfterSeconds) {
        Customer customer = get(customerId);
        if (customer.getDeletionRequestedAt() == null) {
            Instant now = Instant.now();
            customer.setDeletionRequestedAt(now);
            customer.setMarketingConsent(false);
            customer.setConsentUpdatedAt(now);
            customers.save(customer);
            log.info("event=erasure_requested service=customer-service traceId={} customerRef=customer:{} "
                            + "eraseDueAt={} retentionPolicy=erase_after_{}s",
                    trace(), customerId, now.plusSeconds(eraseAfterSeconds), eraseAfterSeconds);
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("deletionRequestedAt", customer.getDeletionRequestedAt());
        out.put("eraseDueAt", customer.getDeletionRequestedAt().plusSeconds(eraseAfterSeconds));
        return out;
    }

    /** Erases the profile's personal data. Order records are kept under the tax-record obligation. */
    @Transactional
    public void erase(Customer customer) {
        Long id = customer.getId();
        addresses.deleteAll(addresses.findByCustomerIdOrderByDefaultAddressDescCreatedAtDesc(id));
        wishlist.deleteAll(wishlist.findByCustomerIdOrderByAddedAtDesc(id));
        customer.setName("Erased customer");
        customer.setEmail("erased-" + id + "@erased.invalid");
        customer.setPhone(null);
        customer.setMarketingConsent(false);
        customer.setErasedAt(Instant.now());
        customers.save(customer);
    }

    private void logTermsAccepted(Customer customer) {
        log.info("event=terms_accepted service=customer-service traceId={} customerRef=customer:{} termsVersion={} "
                        + "source=registration marketingConsent={}",
                trace(), customer.getId(), customer.getTermsVersion(), customer.isMarketingConsent());
    }

    static String purposes(boolean marketing) {
        return marketing ? "account,order_fulfilment,delivery,payment,marketing" : "account,order_fulfilment,delivery,payment";
    }

    private static String trace() {
        String traceId = MDC.get("traceId");
        return traceId == null ? "none" : traceId;
    }

    // ---------- addresses ----------

    @Transactional(readOnly = true)
    public List<Address> addresses(Long customerId) {
        return addresses.findByCustomerIdOrderByDefaultAddressDescCreatedAtDesc(customerId);
    }

    @Transactional
    public Address addAddress(Long customerId, AddressRequest request) {
        long count = addresses.countByCustomerId(customerId);
        if (count >= MAX_ADDRESSES) {
            throw ApiException.badRequest("You can save up to " + MAX_ADDRESSES + " addresses");
        }
        Address address = new Address();
        address.setCustomerId(customerId);
        address.apply(request);
        Address saved = addresses.save(address);
        leakAddress(customerId, saved);
        if (count == 0 || Boolean.TRUE.equals(request.makeDefault())) {
            makeDefault(customerId, saved.getId());
        }
        return saved;
    }

    @Transactional
    public Address updateAddress(Long customerId, Long addressId, AddressRequest request) {
        Address address = ownedAddress(customerId, addressId);
        address.apply(request);
        Address saved = addresses.save(address);
        leakAddress(customerId, saved);
        if (Boolean.TRUE.equals(request.makeDefault())) {
            makeDefault(customerId, addressId);
        }
        return saved;
    }

    @Transactional
    public void deleteAddress(Long customerId, Long addressId) {
        Address address = ownedAddress(customerId, addressId);
        boolean wasDefault = address.isDefaultAddress();
        addresses.delete(address);
        addresses.flush();
        if (wasDefault) {
            addresses(customerId).stream().findFirst()
                    .ifPresent(next -> makeDefault(customerId, next.getId()));
        }
    }

    @Transactional
    public Address makeDefault(Long customerId, Long addressId) {
        Address target = ownedAddress(customerId, addressId);
        for (Address address : addresses.findByCustomerIdOrderByDefaultAddressDescCreatedAtDesc(customerId)) {
            address.setDefaultAddress(address.getId().equals(target.getId()));
        }
        return target;
    }

    private void leakAddress(Long customerId, Address a) {
        if (!demo.on(DemoSwitches.PII_IN_LOGS)) {
            return;
        }
        // Demo only: fictional values, never this customer's real address.
        SyntheticPii.Person fake = SyntheticPii.person();
        String message = SyntheticPii.demoPrefix("customer-service", "PII_IN_LOGS")
                + "Saving delivery address for customer " + customerId + ": " + fake.name() + ", " + fake.phone() + ", "
                + SyntheticPii.address() + (java.util.concurrent.ThreadLocalRandom.current().nextBoolean()
                        ? ", Aadhaar " + SyntheticPii.aadhaar() + " for delivery verification" : "");
        log.info("{}", message);
        groundTruth.record("PII_IN_LOGS", PiiTypes.of(message, true, true), "customer:" + customerId,
                "customer-service.log", log.getName(), message, "Delivery address written to the application log");
    }

    private Address ownedAddress(Long customerId, Long addressId) {
        return addresses.findByIdAndCustomerId(addressId, customerId)
                .orElseThrow(() -> ApiException.notFound("Address not found"));
    }

    // ---------- wishlist ----------

    @Transactional(readOnly = true)
    public List<Long> wishlist(Long customerId) {
        return wishlist.findByCustomerIdOrderByAddedAtDesc(customerId).stream()
                .map(WishlistItem::getProductId)
                .toList();
    }

    @Transactional
    public List<Long> addToWishlist(Long customerId, Long productId) {
        if (productId == null || productId <= 0) {
            throw ApiException.badRequest("Product ID must be positive");
        }
        if (wishlist.findByCustomerIdAndProductId(customerId, productId).isEmpty()) {
            if (wishlist.countByCustomerId(customerId) >= MAX_WISHLIST) {
                throw ApiException.badRequest("Your wishlist is full");
            }
            wishlist.save(new WishlistItem(customerId, productId));
        }
        return wishlist(customerId);
    }

    @Transactional
    public List<Long> removeFromWishlist(Long customerId, Long productId) {
        wishlist.findByCustomerIdAndProductId(customerId, productId).ifPresent(wishlist::delete);
        return wishlist(customerId);
    }
}
