"use strict";

const VISITOR_KEY = "rivora-demo-visitor";
const CONSENT_KEY = "rivora-analytics-consent";
const CART_KEY = "rivora-cart-v1";
const currentPage = document.body.dataset.page || "home";

function readCart() {
  try {
    const items = JSON.parse(window.localStorage.getItem(CART_KEY) || "[]");
    if (!Array.isArray(items)) return [];
    return items.filter((item) =>
      item &&
      typeof item.id === "string" &&
      Number.isInteger(item.quantity) &&
      item.quantity > 0 &&
      item.quantity <= 99,
    );
  } catch (error) {
    console.warn("RIVORA could not read the demo shopping bag.", error);
    return [];
  }
}

function getVisitorId() {
  try {
    if (window.localStorage.getItem(CONSENT_KEY) !== "yes") return null;
    let visitorId = window.localStorage.getItem(VISITOR_KEY);
    if (!visitorId) {
      visitorId = window.crypto.randomUUID();
      window.localStorage.setItem(VISITOR_KEY, visitorId);
    }
    return visitorId;
  } catch (error) {
    console.warn("RIVORA anonymous demo analytics are unavailable in this browser.", error);
    return null;
  }
}

function trackDemoEvent(eventType, productId = null, page = currentPage) {
  if (page === "manage") return Promise.resolve(false);
  const visitorId = getVisitorId();
  if (!visitorId) return Promise.resolve(false);

  return fetch("/api/events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ visitorId, eventType, productId, page }),
    keepalive: true,
  }).then(async (response) => {
    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      console.warn("RIVORA could not record anonymous demo analytics.", result.error || response.statusText);
      return false;
    }
    return true;
  }).catch((error) => {
    console.warn("RIVORA could not reach the demo analytics endpoint.", error);
    return false;
  });
}

function saveCart(cart) {
  try {
    window.localStorage.setItem(CART_KEY, JSON.stringify(cart));
    updateBagCount();
    return true;
  } catch (error) {
    console.error("RIVORA could not save the demo shopping bag.", error);
    showToast("Your browser could not save the bag. Check its site-storage settings.");
    return false;
  }
}

function updateBagCount() {
  const count = readCart().reduce((total, item) => total + item.quantity, 0);
  const label = `Open your bag, ${count} ${count === 1 ? "item" : "items"}`;
  for (const badge of document.querySelectorAll(".bag-count")) badge.textContent = String(count);
  for (const button of document.querySelectorAll(".bag-button")) button.setAttribute("aria-label", label);
}

let toastTimer = 0;
function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2400);
}

function trackVisibleProducts() {
  for (const card of document.querySelectorAll("[data-product-id]:not([hidden])")) {
    const bounds = card.getBoundingClientRect();
    const isVisible = bounds.bottom > 0 && bounds.top < window.innerHeight &&
      bounds.right > 0 && bounds.left < window.innerWidth;
    if (!isVisible) continue;
    void trackDemoEvent("product_view", card.dataset.productId);
  }
}

window.Rivora = {
  cartKey: CART_KEY,
  currentPage,
  getVisitorId,
  readCart,
  saveCart,
  showToast,
  trackDemoEvent,
  trackVisibleProducts,
};

updateBagCount();
document.querySelectorAll("[data-nav]").forEach((link) => {
  if (link.dataset.nav === currentPage) link.setAttribute("aria-current", "page");
});
document.querySelectorAll("[data-year]").forEach((year) => {
  year.textContent = String(new Date().getFullYear());
});

const menuToggle = document.querySelector("#menu-toggle");
const navigation = document.querySelector("#primary-navigation");
menuToggle?.addEventListener("click", () => {
  const isOpen = !navigation.classList.contains("is-open");
  navigation.classList.toggle("is-open", isOpen);
  menuToggle.setAttribute("aria-expanded", String(isOpen));
  menuToggle.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
});

navigation?.addEventListener("click", (event) => {
  if (!event.target.closest("a")) return;
  navigation.classList.remove("is-open");
  menuToggle?.setAttribute("aria-expanded", "false");
  menuToggle?.setAttribute("aria-label", "Open menu");
});

const headerSearch = document.querySelector("#header-search");
headerSearch?.querySelector("button")?.addEventListener("click", (event) => {
  if (window.innerWidth > 760) return;
  event.preventDefault();
  const isOpen = headerSearch.classList.toggle("is-open");
  if (isOpen) document.querySelector("#site-search").focus();
});

headerSearch?.addEventListener("submit", (event) => {
  event.preventDefault();
  const query = document.querySelector("#site-search").value.trim();
  const parameters = new URLSearchParams();
  if (query) parameters.set("q", query);
  window.location.href = `shop.html${parameters.size ? `?${parameters}` : ""}`;
});

document.querySelectorAll("[data-contact]").forEach((link) => {
  link.addEventListener("click", () => void trackDemoEvent("contact_click"));
});

const consentNotice = document.querySelector("#consent-notice");
function acceptAnalytics() {
  try {
    window.localStorage.setItem(CONSENT_KEY, "yes");
    getVisitorId();
    consentNotice.hidden = true;
    void trackDemoEvent("page_view");
    trackVisibleProducts();
  } catch (error) {
    console.error("RIVORA could not save your analytics choice.", error);
    showToast("Your browser could not save this choice.");
  }
}

function declineAnalytics() {
  try {
    window.localStorage.setItem(CONSENT_KEY, "no");
    consentNotice.hidden = true;
  } catch (error) {
    console.error("RIVORA could not save your analytics choice.", error);
    showToast("Your browser could not save this choice.");
  }
}

document.querySelector("#accept-analytics")?.addEventListener("click", acceptAnalytics);
document.querySelector("#decline-analytics")?.addEventListener("click", declineAnalytics);
document.querySelector("#change-analytics-choice")?.addEventListener("click", () => {
  try {
    window.localStorage.removeItem(CONSENT_KEY);
    window.localStorage.removeItem(VISITOR_KEY);
    if (consentNotice) consentNotice.hidden = false;
  } catch (error) {
    console.error("RIVORA could not reset your analytics choice.", error);
    showToast("Your browser could not reset this choice.");
  }
});

if (consentNotice) {
  let consent = null;
  try {
    consent = window.localStorage.getItem(CONSENT_KEY);
  } catch (error) {
    console.warn("RIVORA could not read the analytics choice.", error);
  }
  if (consent === "yes" && currentPage !== "manage") {
    void trackDemoEvent("page_view");
  } else if (consent === "no" || currentPage === "manage") {
    consentNotice.hidden = true;
  } else {
    consentNotice.hidden = false;
  }
}
