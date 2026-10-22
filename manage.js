"use strict";

const loginForm = document.querySelector("#dashboard-login");
const passwordInput = document.querySelector("#dashboard-password");
const loginHelp = document.querySelector("#login-help");
const loginError = document.querySelector("#login-error");
const dashboardContent = document.querySelector("#dashboard-content");
const loginButton = loginForm.querySelector('button[type="submit"]');
const numberFormat = new Intl.NumberFormat("en-IN");

function setLoginError(message) {
  loginError.textContent = message;
  loginError.hidden = !message;
}

function displayDashboard(metrics) {
  document.querySelector("#metric-visitors").textContent = numberFormat.format(metrics.totals.visitors || 0);
  document.querySelector("#metric-product-visitors").textContent = numberFormat.format(metrics.totals.productVisitors || 0);
  document.querySelector("#metric-cart-visitors").textContent = numberFormat.format(metrics.totals.cartVisitors || 0);
  document.querySelector("#metric-checkout-visitors").textContent = numberFormat.format(metrics.totals.checkoutVisitors || 0);
  document.querySelector("#metric-demo-orders").textContent = numberFormat.format(metrics.totals.orders || 0);
  document.querySelector("#metric-contact-visitors").textContent = numberFormat.format(metrics.totals.contactVisitors || 0);

  const table = document.querySelector("#product-metrics");
  if (metrics.products.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "Products will appear here as soon as the collection is explored.";
    row.append(cell);
    table.replaceChildren(row);
  } else {
    table.replaceChildren(...metrics.products.map((product) => {
      const row = document.createElement("tr");
      for (const value of [
        product.name,
        numberFormat.format(product.viewers || 0),
        numberFormat.format(product.cartVisitors || 0),
        numberFormat.format(product.demoBuyers || 0),
      ]) {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    }));
  }

  const dailyBody = document.querySelector("#daily-metrics");
  if (metrics.daily.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "No opted-in activity yet.";
    row.append(cell);
    dailyBody.replaceChildren(row);
  } else {
    dailyBody.replaceChildren(...metrics.daily.map((day) => {
      const row = document.createElement("tr");
      const date = document.createElement("td");
      const parsed = new Date(`${day.date}T00:00:00`);
      date.textContent = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(parsed);
      row.append(date);
      for (const value of [day.visitors, day.cartVisitors, day.checkoutVisitors]) {
        const cell = document.createElement("td");
        cell.textContent = numberFormat.format(value || 0);
        row.append(cell);
      }
      return row;
    }));
  }

  loginForm.hidden = true;
  dashboardContent.hidden = false;
}

async function loadDashboard() {
  const response = await fetch("/api/admin/dashboard");
  const result = await response.json();
  if (response.status === 503) {
    loginHelp.textContent = result.error;
    return false;
  }
  if (response.status === 401) return false;
  if (!response.ok) throw new Error(result.error || "Could not load the owner dashboard.");
  displayDashboard(result);
  return true;
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setLoginError("");
  loginButton.disabled = true;
  loginButton.textContent = "Signing in…";

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: passwordInput.value }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Sign-in failed.");
    passwordInput.value = "";
    await loadDashboard();
  } catch (error) {
    setLoginError(error.message);
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Sign in";
  }
});

document.querySelector("#sign-out").addEventListener("click", async () => {
  try {
    const response = await fetch("/api/admin/logout", { method: "POST" });
    if (!response.ok) throw new Error("Sign-out could not be completed.");
    dashboardContent.hidden = true;
    loginForm.hidden = false;
  } catch (error) {
    console.error("RIVORA could not sign out.", error);
    setLoginError(error.message);
  }
});

void loadDashboard().catch((error) => {
  console.error("RIVORA could not load the owner dashboard.", error);
  setLoginError(error.message);
});
