"use strict";

const itemsContainer = document.querySelector("#checkout-items");
const emptyCart = document.querySelector("#checkout-empty");
const subtotal = document.querySelector("#checkout-subtotal");
const paymentTotal = document.querySelector("#payment-total");
const submitButton = document.querySelector("#pay-demo-button");
const successPanel = document.querySelector("#demo-success");
const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

let products = [];

function formatPrice(paise) {
  return currency.format(paise / 100);
}

function updateCheckout() {
  const cart = window.Rivora.readCart();
  const contents = cart.flatMap((item) => {
    const product = products.find((entry) => entry.id === item.id);
    return product ? [{ ...product, quantity: item.quantity }] : [];
  });
  const total = contents.reduce((sum, item) => sum + item.pricePaise * item.quantity, 0);

  itemsContainer.replaceChildren(...contents.map((item) => {
    const article = document.createElement("article");
    article.className = "checkout-item";
    const art = document.createElement("div");
    art.className = "checkout-item-art";
    const image = document.createElement("img");
    image.src = "assets/rivora-bottle.svg";
    image.alt = "";
    art.append(image);

    const details = document.createElement("div");
    const heading = document.createElement("h3");
    heading.textContent = item.name;
    const unitPrice = document.createElement("p");
    unitPrice.textContent = `${formatPrice(item.pricePaise)} each`;
    const quantity = document.createElement("div");
    quantity.className = "checkout-quantity";

    const decrement = document.createElement("button");
    decrement.type = "button";
    decrement.dataset.changeQuantity = "-1";
    decrement.dataset.productId = item.id;
    decrement.setAttribute("aria-label", `Remove one ${item.name}`);
    decrement.textContent = "−";
    const count = document.createElement("span");
    count.textContent = String(item.quantity);
    const increment = document.createElement("button");
    increment.type = "button";
    increment.dataset.changeQuantity = "1";
    increment.dataset.productId = item.id;
    increment.setAttribute("aria-label", `Add one ${item.name}`);
    increment.textContent = "+";
    quantity.append(decrement, count, increment);
    details.append(heading, unitPrice, quantity);

    const lineTotal = document.createElement("strong");
    lineTotal.className = "checkout-item-total";
    lineTotal.textContent = formatPrice(item.pricePaise * item.quantity);
    article.append(art, details, lineTotal);
    return article;
  }));

  emptyCart.hidden = contents.length > 0;
  itemsContainer.hidden = contents.length === 0;
  subtotal.textContent = formatPrice(total);
  paymentTotal.textContent = formatPrice(total);
  submitButton.disabled = contents.length === 0;
}

itemsContainer.addEventListener("click", (event) => {
  const button = event.target.closest("[data-change-quantity]");
  if (!button) return;
  const cart = window.Rivora.readCart();
  const product = cart.find((item) => item.id === button.dataset.productId);
  if (!product) return;

  const change = Number(button.dataset.changeQuantity);
  if (change < 0 && product.quantity === 1) {
    window.Rivora.saveCart(cart.filter((item) => item.id !== product.id));
  } else if (change > 0 && product.quantity < 99) {
    product.quantity += 1;
    window.Rivora.saveCart(cart);
  } else if (change < 0) {
    product.quantity -= 1;
    window.Rivora.saveCart(cart);
  } else {
    window.Rivora.showToast("That’s the maximum demo quantity for this pick.");
  }
  updateCheckout();
});

submitButton.addEventListener("click", async () => {
  const cart = window.Rivora.readCart();
  if (!cart.length) return;

  submitButton.disabled = true;
  submitButton.textContent = "Preparing your demo…";
  const visitorId = window.Rivora.getVisitorId();
  try {
    let reference = `RVR-DEMO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    if (visitorId) {
      void window.Rivora.trackDemoEvent("checkout_start");
      const response = await fetch("/api/demo-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ visitorId, items: cart.map(({ id, quantity }) => ({ id, quantity })) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The demo checkout could not be recorded.");
      reference = result.reference;
    }

    window.Rivora.saveCart([]);
    document.querySelector(".checkout-page").hidden = true;
    document.querySelector("#demo-reference").textContent = reference;
    successPanel.hidden = false;
    successPanel.focus();
  } catch (error) {
    console.error("RIVORA demo checkout failed.", error);
    window.Rivora.showToast(error.message);
    submitButton.textContent = "Try demo checkout again →";
  } finally {
    updateCheckout();
  }
});

async function loadProducts() {
  try {
    const response = await fetch("/api/products");
    if (!response.ok) throw new Error(`The product list could not be loaded (${response.status}).`);
    const result = await response.json();
    products = result.products;
    updateCheckout();

    if (window.Rivora.readCart().length) {
      void window.Rivora.trackDemoEvent("checkout_start");
    }
  } catch (error) {
    console.error("RIVORA could not prepare the demo checkout.", error);
    submitButton.disabled = true;
    window.Rivora.showToast("The demo checkout could not load. Please refresh and try again.");
  }
}

void loadProducts();
