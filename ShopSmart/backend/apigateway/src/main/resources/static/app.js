
"use strict";

/* ==========================================
   SHOPSMART — INTERACTIVE FRONTEND
   Spring Boot API Gateway + Vanilla JavaScript
   ========================================== */

const API_BASE = "";
const PRODUCT_ENDPOINT = "/product-service/products";

const FALLBACK_IMAGE =
    "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=600&q=80";

const CATEGORY_IMAGES = {
    fashion: "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=500&q=80",
    clothing: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=500&q=80",
    electronics: "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=500&q=80",
    gadgets: "https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=500&q=80",
    beauty: "https://images.unsplash.com/photo-1596462502278-27bfdc403348?auto=format&fit=crop&w=500&q=80",
    home: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=500&q=80",
    footwear: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=500&q=80",
    books: "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=500&q=80",
    accessories: "https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=500&q=80",
    other: "https://images.unsplash.com/photo-1490312278390-ab64016e0aa9?auto=format&fit=crop&w=500&q=80"
};

const state = {
    products: [],
    cart: [],
    category: "All Products",
    search: "",
    sort: "featured",
    wishlist: new Set(),
    loading: true
};

const elements = {
    productGrid: document.getElementById("productGrid"),
    productCount: document.getElementById("productCount"),
    categoryList: document.getElementById("categoryList"),
    productTabs: document.getElementById("productTabs"),
    searchInput: document.getElementById("searchInput"),
    statusMessage: document.getElementById("statusMessage"),
    sortProducts: document.getElementById("sortProducts"),
    cartCount: document.getElementById("cartCount"),
    cartOverlay: document.getElementById("cartOverlay"),
    cartItems: document.getElementById("cartItems"),
    cartTotal: document.getElementById("cartTotal"),
    cartTitleCount: document.getElementById("cartTitleCount"),
    toast: document.getElementById("toast"),
    menuButton: document.getElementById("menuButton"),
    navLinks: document.getElementById("navLinks"),
    checkoutButton: document.getElementById("checkoutButton")
};

/* ---------- Helpers ---------- */

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function formatPrice(value) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}

function categoryImage(category) {
    const value = String(category || "").toLowerCase();

    const key = Object.keys(CATEGORY_IMAGES).find(item =>
        value.includes(item)
    );

    return CATEGORY_IMAGES[key || "other"];
}

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("show");

    clearTimeout(showToast.timeout);

    showToast.timeout = setTimeout(() => {
        elements.toast.classList.remove("show");
    }, 2600);
}

function normalizeProducts(data) {
    let items = [];

    if (Array.isArray(data)) {
        items = data;
    } else if (Array.isArray(data?.content)) {
        items = data.content;
    } else if (Array.isArray(data?.products)) {
        items = data.products;
    } else if (Array.isArray(data?.data)) {
        items = data.data;
    } else if (Array.isArray(data?.items)) {
        items = data.items;
    }

    return items.map((product, index) => ({
        id: product.id ?? product.productId ?? index + 1,
        name:
            product.name ??
            product.productName ??
            product.title ??
            "Unnamed product",
        category:
            product.category ??
            product.categoryName ??
            "Other",
        price: Number(product.price ?? product.sellingPrice ?? 0),
        oldPrice: Number(
            product.oldPrice ??
            product.mrp ??
            product.price ??
            product.sellingPrice ??
            0
        ),
        rating: Number(product.rating ?? 4.5),
        badge: product.badge ?? "",
        image:
            product.image ??
            product.imageUrl ??
            product.imageURL ??
            product.image_url ??
            FALLBACK_IMAGE,
        description: product.description ?? ""
    }));
}

/* ---------- Load real products ---------- */

async function loadProducts() {
    state.loading = true;

    elements.statusMessage.textContent = "Finding your favourites...";
    elements.productCount.textContent = "Connecting to ShopSmart...";
    elements.productGrid.innerHTML = `
        <div class="loading-card">
            <span class="loading-spinner"></span>
            Finding your favourites...
        </div>
        <div class="loading-card">
            <span class="loading-spinner"></span>
            A little shopping magic...
        </div>
        <div class="loading-card">
            <span class="loading-spinner"></span>
            Almost there...
        </div>
    `;

    try {
        const response = await fetch(
            `${API_BASE}${PRODUCT_ENDPOINT}`,
            {
                method: "GET",
                headers: {
                    Accept: "application/json"
                }
            }
        );

        if (!response.ok) {
            throw new Error(`Product API returned HTTP ${response.status}`);
        }

        const data = await response.json();
        state.products = normalizeProducts(data);
        state.loading = false;

        renderCategories();
        renderProductTabs();
        renderProducts();

        if (state.products.length === 0) {
            elements.statusMessage.textContent =
                "No products are available yet. Add products through Product Service.";
        }
    } catch (error) {
        state.loading = false;

        // Keep technical details in the developer console, not the UI.
        console.error("ShopSmart product loading failed:", error);

        elements.productCount.textContent = "Products unavailable";
        elements.statusMessage.textContent =
            "We couldn't load products. Check the API Gateway and Product Service.";

        elements.productGrid.innerHTML = `
            <div class="empty-products">
                <h3>Oops! The products couldn't load.</h3>
                <p>Make sure the API Gateway and Product Service are running.</p>
                <button class="primary-button" id="retryProducts" type="button">
                    Try again ↗
                </button>
            </div>
        `;
    }
}

/* ---------- Categories ---------- */

function getCategories() {
    return [
        "All Products",
        ...new Set(state.products.map(product => product.category))
    ];
}

function selectCategory(category) {
    state.category = category;
    renderCategories();
    renderProductTabs();
    renderProducts();
}

function renderCategories() {
    const categories = getCategories();

    elements.categoryList.innerHTML = categories.map((category, index) => `
        <button
            class="category-card ${state.category === category ? "active" : ""}"
            data-category="${escapeHTML(category)}"
            type="button"
            aria-pressed="${state.category === category}"
            style="animation: cardReveal .45s ${Math.min(index * 60, 360)}ms both">

            <div class="category-image">
                <img
                    src="${category === "All Products"
                        ? CATEGORY_IMAGES.fashion
                        : categoryImage(category)}"
                    alt="${escapeHTML(category)}"
                    loading="lazy">
            </div>

            <span class="category-name">${escapeHTML(
                category === "All Products" ? "All finds" : category
            )}</span>
            <span class="category-arrow" aria-hidden="true">↗</span>
        </button>
    `).join("");

    attachImageFallbacks(elements.categoryList);
}

function renderProductTabs() {
    elements.productTabs.innerHTML = getCategories().map(category => `
        <button
            class="product-tab ${state.category === category ? "active" : ""}"
            data-tab-category="${escapeHTML(category)}"
            type="button"
            aria-pressed="${state.category === category}">
            ${escapeHTML(category === "All Products" ? "All finds" : category)}
        </button>
    `).join("");
}

/* ---------- Search and sorting ---------- */

function getFilteredProducts() {
    const search = state.search.trim().toLowerCase();

    let products = state.products.filter(product => {
        const matchesCategory =
            state.category === "All Products" ||
            product.category === state.category;

        const searchableText = [
            product.name,
            product.category,
            product.description
        ].join(" ").toLowerCase();

        return matchesCategory && searchableText.includes(search);
    });

    switch (state.sort) {
        case "price-low":
            products.sort((a, b) => a.price - b.price);
            break;
        case "price-high":
            products.sort((a, b) => b.price - a.price);
            break;
        case "name":
            products.sort((a, b) => a.name.localeCompare(b.name));
            break;
        default:
            break;
    }

    return products;
}

/* ---------- Product cards ---------- */

function renderProducts() {
    const products = getFilteredProducts();

    elements.productCount.textContent =
        `${products.length} product${products.length === 1 ? "" : "s"} to explore`;

    elements.statusMessage.textContent = "";

    if (products.length === 0) {
        elements.productGrid.innerHTML = `
            <div class="empty-products">
                <h3>No products found ♡</h3>
                <p>Try another search or explore all our finds.</p>
                <button class="primary-button" id="resetFilters" type="button">
                    Show all products ↗
                </button>
            </div>
        `;
        return;
    }

    elements.productGrid.innerHTML = products.map((product, index) => {
        const liked = state.wishlist.has(String(product.id));
        const hasDiscount = product.oldPrice > product.price && product.price > 0;
        const discount = hasDiscount
            ? Math.round((1 - product.price / product.oldPrice) * 100)
            : 0;

        const rating = Number.isFinite(product.rating)
            ? Math.max(0, Math.min(5, product.rating))
            : 4.5;

        const badge = product.badge || (hasDiscount ? `${discount}% OFF` : "");

        return `
            <article class="product-card"
                style="animation-delay:${Math.min(index * 55, 350)}ms">

                <div class="product-image-wrap">
                    <img
                        src="${escapeHTML(product.image)}"
                        alt="${escapeHTML(product.name)}"
                        loading="lazy">

                    ${badge ? `
                        <span class="product-badge ${hasDiscount ? "sale" : ""}">
                            ${escapeHTML(badge)}
                        </span>
                    ` : ""}

                    <button
                        class="wishlist-button ${liked ? "liked" : ""}"
                        type="button"
                        data-wishlist="${escapeHTML(product.id)}"
                        aria-label="${liked ? "Remove from" : "Add to"} wishlist"
                        aria-pressed="${liked}">
                        ${liked ? "♥" : "♡"}
                    </button>
                </div>

                <div class="product-info">
                    <div class="product-category">
                        ${escapeHTML(product.category)}
                    </div>

                    <h3 class="product-name">${escapeHTML(product.name)}</h3>

                    ${product.description ? `
                        <p class="product-description">
                            ${escapeHTML(product.description)}
                        </p>
                    ` : ""}

                    <div class="product-rating" aria-label="Rating ${rating} out of 5">
                        <span aria-hidden="true">★</span>
                        <span class="rating-number">${rating.toFixed(1)} / 5</span>
                    </div>

                    <div class="product-price-row">
                        <strong class="product-price">
                            ${formatPrice(product.price)}
                        </strong>
                        ${hasDiscount ? `
                            <del class="product-old-price">
                                ${formatPrice(product.oldPrice)}
                            </del>
                        ` : ""}
                    </div>

                    <button
                        class="add-to-cart"
                        type="button"
                        data-add="${escapeHTML(product.id)}">
                        <span aria-hidden="true">＋</span>
                        Add to bag
                    </button>
                </div>
            </article>
        `;
    }).join("");

    attachImageFallbacks(elements.productGrid);
}

function attachImageFallbacks(container) {
    container.querySelectorAll("img").forEach(img => {
        img.addEventListener("error", () => {
            if (img.dataset.fallbackUsed) return;

            img.dataset.fallbackUsed = "true";
            img.src = FALLBACK_IMAGE;
        }, { once: true });
    });
}

/* ---------- Wishlist ---------- */

function toggleWishlist(productId) {
    const id = String(productId);

    if (state.wishlist.has(id)) {
        state.wishlist.delete(id);
        showToast("Removed from your wishlist.");
    } else {
        state.wishlist.add(id);
        showToast("Saved to your wishlist ♥");
    }

    renderProducts();
}

/* ---------- Shopping cart ---------- */

function addToCart(productId) {
    const product = state.products.find(
        item => String(item.id) === String(productId)
    );

    if (!product) {
        showToast("We couldn't find that product.");
        return;
    }

    const existing = state.cart.find(
        item => String(item.id) === String(productId)
    );

    if (existing) {
        existing.quantity += 1;
    } else {
        state.cart.push({ ...product, quantity: 1 });
    }

    renderCart();

    elements.cartCount.classList.remove("bump");
    void elements.cartCount.offsetWidth;
    elements.cartCount.classList.add("bump");

    showToast(`${product.name} added to your bag!`);
}

function updateQuantity(productId, change) {
    const item = state.cart.find(
        product => String(product.id) === String(productId)
    );

    if (!item) return;

    item.quantity += change;

    if (item.quantity <= 0) {
        state.cart = state.cart.filter(
            product => String(product.id) !== String(productId)
        );
    }

    renderCart();
}

function removeFromCart(productId) {
    state.cart = state.cart.filter(
        product => String(product.id) !== String(productId)
    );

    renderCart();
    showToast("Item removed from your bag.");
}

function renderCart() {
    const itemCount = state.cart.reduce(
        (total, item) => total + item.quantity, 0
    );

    const subtotal = state.cart.reduce(
        (total, item) => total + item.price * item.quantity, 0
    );

    elements.cartCount.textContent = itemCount;
    elements.cartTitleCount.textContent = `(${itemCount})`;
    elements.cartTotal.textContent = formatPrice(subtotal);

    if (state.cart.length === 0) {
        elements.cartItems.innerHTML = `
            <div class="empty-cart">
                <span class="empty-cart-icon">♡</span>
                <h3>Your bag is waiting.</h3>
                <p>Looks like you haven't found your favourites yet.</p>
                <button class="primary-button" id="continueShopping" type="button">
                    Explore products ↗
                </button>
            </div>
        `;
        return;
    }

    elements.cartItems.innerHTML = state.cart.map(item => `
        <article class="cart-item">
            <img src="${escapeHTML(item.image)}"
                 alt="${escapeHTML(item.name)}" loading="lazy">

            <div>
                <h3 class="cart-item-name">${escapeHTML(item.name)}</h3>
                <div class="cart-item-price">${formatPrice(item.price)}</div>

                <div class="quantity-control">
                    <button type="button"
                        data-quantity="-1"
                        data-id="${escapeHTML(item.id)}"
                        aria-label="Decrease quantity">−</button>

                    <span>${item.quantity}</span>

                    <button type="button"
                        data-quantity="1"
                        data-id="${escapeHTML(item.id)}"
                        aria-label="Increase quantity">+</button>
                </div>
            </div>

            <button class="remove-cart-item" type="button"
                data-remove="${escapeHTML(item.id)}">
                Remove
            </button>
        </article>
    `).join("");

    attachImageFallbacks(elements.cartItems);
}

function openCart() {
    elements.cartOverlay.classList.add("open");
    elements.cartOverlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("cart-open");
    elements.cartOverlay.querySelector(".close-cart").focus();
}

function closeCart() {
    elements.cartOverlay.classList.remove("open");
    elements.cartOverlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("cart-open");
}

/* ---------- Navigation and scroll animations ---------- */

function initializeScrollAnimations() {
    const sections = document.querySelectorAll(
        ".category-section, .featured-section, .editorial-section, .why-section, .newsletter-section"
    );

    sections.forEach(section => section.classList.add("reveal-on-scroll"));
    document.documentElement.classList.add("reveal-ready");

    if (!("IntersectionObserver" in window)) {
        sections.forEach(section => section.classList.add("in-view"));
        return;
    }

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add("in-view");
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.08 });

    sections.forEach(section => observer.observe(section));
}

function updateActiveNavigation() {
    const links = document.querySelectorAll(".nav-link");

    const sections = [...links]
        .map(link => document.querySelector(link.getAttribute("href")))
        .filter(Boolean);

    if (!("IntersectionObserver" in window)) return;

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;

            links.forEach(link => {
                link.classList.toggle(
                    "active",
                    link.getAttribute("href") === `#${entry.target.id}`
                );
            });
        });
    }, { rootMargin: "-25% 0px -65% 0px" });

    sections.forEach(section => observer.observe(section));
}

function closeMobileMenu() {
    elements.navLinks.classList.remove("open");
    elements.menuButton.setAttribute("aria-expanded", "false");
}

/* ---------- Events ---------- */

function initializeEvents() {
    elements.searchInput.addEventListener("input", event => {
        state.search = event.target.value;
        renderProducts();
    });

    elements.sortProducts.addEventListener("change", event => {
        state.sort = event.target.value;
        renderProducts();
    });

    elements.categoryList.addEventListener("click", event => {
        const button = event.target.closest("[data-category]");
        if (!button) return;

        selectCategory(button.dataset.category);
    });

    elements.productTabs.addEventListener("click", event => {
        const button = event.target.closest("[data-tab-category]");
        if (!button) return;

        selectCategory(button.dataset.tabCategory);
    });

    elements.productGrid.addEventListener("click", event => {
        const addButton = event.target.closest("[data-add]");
        const wishlistButton = event.target.closest("[data-wishlist]");

        if (addButton) {
            addToCart(addButton.dataset.add);
        }

        if (wishlistButton) {
            toggleWishlist(wishlistButton.dataset.wishlist);
        }
    });

    elements.productGrid.addEventListener("error", event => {
        if (event.target.tagName !== "IMG") return;
        if (event.target.dataset.fallbackUsed) return;

        event.target.dataset.fallbackUsed = "true";
        event.target.src = FALLBACK_IMAGE;
    }, true);

    elements.productGrid.addEventListener("click", event => {
        if (event.target.closest("#retryProducts")) {
            loadProducts();
        }

        if (event.target.closest("#resetFilters")) {
            state.search = "";
            state.category = "All Products";
            elements.searchInput.value = "";
            renderCategories();
            renderProductTabs();
            renderProducts();
        }
    });

    elements.cartItems.addEventListener("click", event => {
        const quantityButton = event.target.closest("[data-quantity]");
        const removeButton = event.target.closest("[data-remove]");

        if (quantityButton) {
            updateQuantity(
                quantityButton.dataset.id,
                Number(quantityButton.dataset.quantity)
            );
        }

        if (removeButton) {
            removeFromCart(removeButton.dataset.remove);
        }

        if (event.target.closest("#continueShopping")) {
            closeCart();
            document.getElementById("featured").scrollIntoView({
                behavior: "smooth"
            });
        }
    });

    document.getElementById("openCart").addEventListener("click", openCart);
    document.getElementById("cartButton").addEventListener("click", openCart);
    document.getElementById("closeCart").addEventListener("click", closeCart);
    document.getElementById("closeCartBackdrop").addEventListener("click", closeCart);

    document.addEventListener("keydown", event => {
        if (event.key === "Escape") closeCart();
    });

    elements.menuButton.addEventListener("click", () => {
        const isOpen = elements.navLinks.classList.toggle("open");
        elements.menuButton.setAttribute("aria-expanded", String(isOpen));
    });

    elements.navLinks.addEventListener("click", event => {
        if (event.target.closest("a")) closeMobileMenu();
    });

    document.getElementById("loadMoreButton").addEventListener("click", () => {
        document.getElementById("home").scrollIntoView({
            behavior: "smooth"
        });
    });

    elements.checkoutButton.addEventListener("click", () => {
        if (state.cart.length === 0) {
            showToast("Your bag is empty.");
            return;
        }

        showToast("Checkout isn't connected yet. We'll build the order flow next.");
    });
}

/* ---------- Start ShopSmart ---------- */

initializeEvents();
initializeScrollAnimations();
updateActiveNavigation();
renderCart();
loadProducts();
