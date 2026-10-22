"use strict";

const productGrid = document.querySelector("[data-products]");
const isFeatured = productGrid.dataset.products === "featured";
const productCount = document.querySelector("#product-count");
let products = [];
let activeFilter = "all";
const cartFeedbackTimers = new WeakMap();
const searchQuery = new URLSearchParams(window.location.search).get("q")?.trim().toLocaleLowerCase() || "";
const productObserver = typeof IntersectionObserver === "undefined"
  ? null
  : new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && !entry.target.hidden) {
        void window.Rivora.trackDemoEvent("product_view", entry.target.dataset.productId);
      }
    }
  }, { threshold: 0.35 });

const badgeCopy = {
  bottle: "THE FIRST SIP",
  lemon: "BRIGHT & ZESTY",
  strawberry: "SWEET & SOFT",
  mango: "A TROPICAL TREAT",
};

function createProductCard(product) {
  const card = document.createElement("article");
  card.className = `product-card${searchQuery ? " search-match" : ""}`;
  card.dataset.productId = product.id;
  card.dataset.category = product.category;
  card.dataset.search = `${product.name} ${product.description} ${product.category}`.toLocaleLowerCase();

  const art = document.createElement("div");
  art.className = `product-art product-art--${product.visualKey}`;
  const badge = document.createElement("span");
  badge.className = "product-badge";
  badge.textContent = badgeCopy[product.visualKey] || "MEET YOUR FRESH";
  const bottle = document.createElement("img");
  bottle.className = "product-bottle";
  bottle.src = "assets/rivora-bottle.svg";
  bottle.alt = "";
  bottle.loading = "lazy";
  const cartCount = document.createElement("span");
  cartCount.className = "product-cart-count";
  cartCount.hidden = true;
  cartCount.setAttribute("aria-hidden", "true");
  const addFeedback = document.createElement("span");
  addFeedback.className = "cart-add-feedback";
  addFeedback.setAttribute("aria-hidden", "true");
  const cartStatus = document.createElement("span");
  cartStatus.className = "visually-hidden cart-add-status";
  cartStatus.setAttribute("aria-live", "polite");
  art.append(badge, bottle, cartCount, addFeedback);

  const info = document.createElement("div");
  info.className = "product-card-info";
  const titleRow = document.createElement("div");
  titleRow.className = "product-title-row";
  const name = document.createElement("h2");
  name.textContent = product.name;
  const price = document.createElement("span");
  price.className = "product-price";
  price.textContent = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(product.pricePaise / 100);
  titleRow.append(name, price);

  const description = document.createElement("p");
  description.textContent = product.description;
  const addButton = document.createElement("button");
  addButton.className = "add-button";
  addButton.type = "button";
  addButton.dataset.addProduct = product.id;
  addButton.append(document.createTextNode("Add to your bag"));
  const plus = document.createElement("span");
  plus.setAttribute("aria-hidden", "true");
  plus.textContent = "+";
  addButton.append(plus);
  info.append(titleRow, description, addButton, cartStatus);
  card.append(art, info);
  return card;
}

function updateProductCartIndicators() {
  const quantities = new Map(window.Rivora.readCart().map((item) => [item.id, item.quantity]));
  for (const card of productGrid.querySelectorAll(".product-card")) {
    const quantity = quantities.get(card.dataset.productId) || 0;
    const badge = card.querySelector(".product-cart-count");
    badge.hidden = quantity === 0;
    badge.textContent = quantity ? `IN BAG · ${quantity}` : "";
  }
}

function showCartAddition(card, product, quantity) {
  const badge = card.querySelector(".product-cart-count");
  const feedback = card.querySelector(".cart-add-feedback");
  badge.hidden = false;
  badge.textContent = `IN BAG · ${quantity}`;
  card.querySelector(".cart-add-status").textContent =
    `${product.name}: added one to your bag. ${quantity} ${quantity === 1 ? "item" : "items"} in bag.`;

  feedback.classList.remove("is-visible");
  feedback.textContent = "+1";
  void feedback.offsetWidth;
  feedback.classList.add("is-visible");

  const previousTimer = cartFeedbackTimers.get(card);
  if (previousTimer) window.clearTimeout(previousTimer);
  cartFeedbackTimers.set(card, window.setTimeout(() => {
    feedback.classList.remove("is-visible");
  }, 1050));
}

function applyFilters() {
  let visibleCount = 0;
  for (const card of productGrid.querySelectorAll(".product-card")) {
    const matchesCategory = activeFilter === "all" || card.dataset.category === activeFilter;
    const matchesSearch = !searchQuery || card.dataset.search.includes(searchQuery);
    card.hidden = !matchesCategory || !matchesSearch;
    if (!card.hidden) visibleCount += 1;
  }
  if (productCount) {
    productCount.textContent = searchQuery
      ? `${visibleCount} ${visibleCount === 1 ? "match" : "matches"} for “${searchQuery}”`
      : `${visibleCount} thoughtful little picks`;
  }
  let emptyMessage = productGrid.querySelector(".empty-message");
  if (visibleCount === 0 && !emptyMessage) {
    emptyMessage = document.createElement("p");
    emptyMessage.className = "empty-message";
    productGrid.append(emptyMessage);
  }
  if (emptyMessage) {
    emptyMessage.textContent = searchQuery
      ? "No products match that search. Try a different flavour."
      : "No products are available in this category right now.";
    emptyMessage.hidden = visibleCount > 0;
  }
  window.Rivora.trackVisibleProducts();
}

function addProductToCart(productId, card) {
  const product = products.find((item) => item.id === productId);
  if (!product) {
    window.Rivora.showToast("That product is not available right now.");
    return;
  }
  const cart = window.Rivora.readCart();
  const existing = cart.find((item) => item.id === productId);
  if (existing) {
    if (existing.quantity >= 99) {
      window.Rivora.showToast("That’s the maximum demo quantity for this pick.");
      return;
    }
    existing.quantity += 1;
  } else {
    cart.push({ id: productId, quantity: 1 });
  }
  if (window.Rivora.saveCart(cart)) {
    void window.Rivora.trackDemoEvent("add_to_cart", productId);
    showCartAddition(card, product, existing ? existing.quantity : 1);
  }
}

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) throw new Error(`The product list could not be loaded (${response.status}).`);
    const result = await response.json();
    if (!Array.isArray(result.products)) throw new Error("The product list was not valid.");

    products = isFeatured ? result.products.slice(0, 3) : result.products;
    productGrid.replaceChildren(...products.map(createProductCard));
    updateProductCartIndicators();
    if (isFeatured && products.length < result.products.length) {
      const seeAllCard = document.createElement("a");
      seeAllCard.className = "see-all-card";
      seeAllCard.href = "shop.html";
      seeAllCard.innerHTML = '<span>Find your<br><em>next favourite.</em></span><span class="see-all-arrow" aria-hidden="true">↗</span>';
      productGrid.append(seeAllCard);
    }

    if (productObserver) {
      for (const card of productGrid.querySelectorAll(".product-card")) {
        productObserver.observe(card);
      }
    }

    if (!isFeatured && searchQuery) {
      const searchInput = document.querySelector("#site-search");
      if (searchInput) searchInput.value = new URLSearchParams(window.location.search).get("q") || "";
    }
    applyFilters();
  } catch (error) {
    console.error("RIVORA could not load products from the database.", error);
    const message = document.createElement("p");
    message.className = "empty-message";
    message.textContent = "The collection could not be loaded. Please refresh this page.";
    productGrid.replaceChildren(message);
  }
}

productGrid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add-product]");
  if (addButton) addProductToCart(addButton.dataset.addProduct, addButton.closest(".product-card"));
});

for (const filterButton of document.querySelectorAll("[data-filter]")) {
  filterButton.addEventListener("click", () => {
    activeFilter = filterButton.dataset.filter;
    for (const button of document.querySelectorAll("[data-filter]")) {
      const isActive = button === filterButton;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    }
    applyFilters();
  });
}

void loadProducts();
