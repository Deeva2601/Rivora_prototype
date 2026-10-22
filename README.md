# RIVORA

A responsive storefront concept for RIVORA reusable hydration bottles, built with plain HTML, CSS and browser JavaScript, a small Node.js server, and SQLite. Product details and indicative prices are stored in the database; the pages are separate routes for Home, Shop, How it works, Our story, Contact and the test checkout.

## Run locally

Use Node.js 22.13 or newer. The project uses Node’s built-in SQLite module; there are no runtime dependencies to install.

```powershell
Copy-Item .env.example .env
```

Open `.env` and replace `ADMIN_PASSWORD` with a private password that is at least 16 characters long. Then run:

```powershell
npm start
```

Open `http://localhost:3000`. The owner dashboard is at `http://localhost:3000/manage.html`. The database is created and seeded automatically in `data/rivora.sqlite` on first start.

## Demo checkout and analytics

- UPI and card options are visual, test-only examples. Checkout does not accept payment details, charge money, or fulfil orders.
- The test checkout stores a simulated order and selected products, never personal or payment details.
- Visitors must opt in before anonymous analytics are recorded. The database holds a random browser ID and page, product, bag, checkout and demo-order events so the owner can see purchase interest. It does not store names, emails, phone numbers, addresses or IP addresses.
- `manage.html` shows aggregate unique visitors, products that attracted attention, bag additions, checkout starts and simulated checkouts. Its password is set only on the server in `.env`.
- Contact email and telephone numbers end in `.example` / are explicitly marked as sample details. Replace them before a real launch.

## Public demo deployment

The included `render.yaml` describes a free Node.js web service for a live demo. In Render, connect the GitHub repository as a Blueprint, supply a private `ADMIN_PASSWORD` in the service’s environment variables, then deploy. Free services can sleep when idle, and their local SQLite database is temporary: analytics and demo checkouts can reset after a restart, redeploy or service spin-down. This option avoids a paid plan and persistent storage, but is only suitable for a presentation demo.

Set a strong, private dashboard password before publishing the URL. This is a low-traffic prototype suitable for a presentation—not a hardened, high-availability commerce platform.

Before accepting real sales, confirm the actual product and pricing, add real business contact and delivery/returns information, select a payment provider, implement and verify server-side payment confirmation and order fulfilment, and review privacy, security and applicable business requirements. Do not enable live payment or collect customer details through this demo checkout.
