"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const http = require("node:http");
const { DatabaseSync } = require("node:sqlite");

const ROOT = __dirname;
if (fs.existsSync(path.join(ROOT, ".env"))) {
  process.loadEnvFile(path.join(ROOT, ".env"));
}

const DATA_DIRECTORY = path.resolve(ROOT, "data");
const DATABASE_PATH = path.resolve(process.env.DATABASE_PATH || path.join(DATA_DIRECTORY, "rivora.sqlite"));
const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const ADMIN_COOKIE = "rivora_admin";
const SESSION_LENGTH_MS = 8 * 60 * 60 * 1000;
const MAX_REQUEST_BYTES = 12 * 1024;
const PAGE_IDS = new Set(["home", "shop", "how-it-works", "about", "contact", "payment", "privacy", "manage"]);
const EVENT_TYPES = new Set([
  "page_view",
  "product_view",
  "add_to_cart",
  "checkout_start",
  "demo_order",
  "contact_click",
]);
const rateLimits = new Map();

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be a valid TCP port.");
}

if (ADMIN_PASSWORD && ADMIN_PASSWORD.length < 16) {
  throw new Error("ADMIN_PASSWORD must contain at least 16 characters.");
}

fs.mkdirSync(path.dirname(DATABASE_PATH), { recursive: true });

const database = new DatabaseSync(DATABASE_PATH);
database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
database.exec(fs.readFileSync(path.join(ROOT, "db", "schema.sql"), "utf8"));
database.exec(fs.readFileSync(path.join(ROOT, "db", "seed.sql"), "utf8"));

const publicFiles = new Set([
  "index.html",
  "shop.html",
  "how-it-works.html",
  "about.html",
  "contact.html",
  "payment.html",
  "privacy.html",
  "manage.html",
  "styles.css",
  "script.js",
  "shop.js",
  "how-it-works.js",
  "payment.js",
  "manage.js",
  "favicon.svg",
]);
const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
]);

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, statusCode, message) {
  sendJson(response, statusCode, { error: message });
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = "";
    request.setEncoding("utf8");

    let settled = false;
    request.on("data", (chunk) => {
      if (settled) return;
      data += chunk;
      if (Buffer.byteLength(data, "utf8") > MAX_REQUEST_BYTES) {
        settled = true;
        reject(Object.assign(new Error("The request is too large."), { statusCode: 413 }));
        request.resume();
      }
    });

    request.on("error", (error) => {
      if (!settled) reject(error);
    });
    request.on("end", () => {
      if (settled) return;
      if (!data) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(data));
      } catch {
        reject(Object.assign(new Error("The request body must be valid JSON."), { statusCode: 400 }));
      }
    });
  });
}

function checkRateLimit(request, key, limit, windowMs) {
  const now = Date.now();
  const address = request.socket.remoteAddress || "unknown";
  const identity = `${key}:${address}`;
  const existing = rateLimits.get(identity);
  const current = existing && now < existing.resetAt ? existing : { count: 0, resetAt: now + windowMs };
  current.count += 1;
  rateLimits.set(identity, current);
  return current.count <= limit;
}

function cleanRateLimits() {
  const now = Date.now();
  for (const [key, entry] of rateLimits) {
    if (entry.resetAt <= now) rateLimits.delete(key);
  }
}

const rateLimitCleanup = setInterval(cleanRateLimits, 60_000);
rateLimitCleanup.unref();

function validVisitorId(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function insertEvent({ visitorId, eventType, page, productId = null }) {
  database.prepare(`
    INSERT INTO analytics_events (visitor_id, event_type, page, product_id)
    VALUES (?, ?, ?, ?)
    ON CONFLICT DO NOTHING
  `).run(visitorId, eventType, page, productId);
}

function adminSignature(expiresAt) {
  return crypto.createHmac("sha256", ADMIN_PASSWORD).update(expiresAt).digest("base64url");
}

function hasAdminSession(request) {
  if (!ADMIN_PASSWORD) return false;

  const cookies = request.headers.cookie || "";
  const cookie = cookies.split(";").map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_COOKIE}=`));
  if (!cookie) return false;

  const [expiresAt, providedSignature] = cookie.slice(ADMIN_COOKIE.length + 1).split(".");
  const expiry = Number(expiresAt);
  if (!Number.isSafeInteger(expiry) || expiry <= Date.now() || !providedSignature) return false;

  const expected = Buffer.from(adminSignature(expiresAt));
  const provided = Buffer.from(providedSignature);
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected);
}

function setAdminCookie(response) {
  const expiresAt = String(Date.now() + SESSION_LENGTH_MS);
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "set-cookie",
    `${ADMIN_COOKIE}=${expiresAt}.${adminSignature(expiresAt)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_LENGTH_MS / 1000}${secure}`,
  );
}

function clearAdminCookie(response) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  response.setHeader(
    "set-cookie",
    `${ADMIN_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`,
  );
}

function isSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return false;

  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function requireAdmin(request, response) {
  if (!ADMIN_PASSWORD) {
    sendError(response, 503, "Set ADMIN_PASSWORD in .env to enable the owner dashboard.");
    return false;
  }

  if (!hasAdminSession(request)) {
    sendError(response, 401, "Please sign in again to view store analytics.");
    return false;
  }

  return true;
}

function getDashboardMetrics() {
  const total = database.prepare(`
    SELECT
      COUNT(DISTINCT CASE WHEN event_type = 'page_view' AND page = 'home' THEN visitor_id END) AS visitors,
      COUNT(DISTINCT CASE WHEN event_type = 'product_view' THEN visitor_id END) AS productVisitors,
      COUNT(DISTINCT CASE WHEN event_type = 'add_to_cart' THEN visitor_id END) AS cartVisitors,
      COUNT(DISTINCT CASE WHEN event_type = 'checkout_start' THEN visitor_id END) AS checkoutVisitors,
      COUNT(DISTINCT CASE WHEN event_type = 'contact_click' THEN visitor_id END) AS contactVisitors
    FROM analytics_events
  `).get();

  const productMetrics = database.prepare(`
    SELECT
      p.id, p.name,
      COUNT(DISTINCT CASE WHEN e.event_type = 'product_view' THEN e.visitor_id END) AS viewers,
      COUNT(DISTINCT CASE WHEN e.event_type = 'add_to_cart' THEN e.visitor_id END) AS cartVisitors,
      COUNT(DISTINCT CASE WHEN e.event_type = 'demo_order' THEN e.visitor_id END) AS demoBuyers,
      COALESCE((SELECT SUM(oi.quantity) FROM demo_order_items oi WHERE oi.product_id = p.id), 0) AS demoUnits
    FROM products p
    LEFT JOIN analytics_events e ON e.product_id = p.id
    WHERE p.active = 1
    GROUP BY p.id
    ORDER BY p.category, p.name
  `).all();

  const orderStats = database.prepare(`
    SELECT COUNT(*) AS orders, COALESCE(SUM(total_paise), 0) AS totalPaise
    FROM demo_orders
  `).get();

  const dailyMetrics = database.prepare(`
    SELECT
      date(created_at) AS date,
      COUNT(DISTINCT CASE WHEN event_type = 'page_view' AND page = 'home' THEN visitor_id END) AS visitors,
      COUNT(DISTINCT CASE WHEN event_type = 'add_to_cart' THEN visitor_id END) AS cartVisitors,
      COUNT(DISTINCT CASE WHEN event_type = 'checkout_start' THEN visitor_id END) AS checkoutVisitors
    FROM analytics_events
    WHERE created_at >= datetime('now', '-13 days')
    GROUP BY date(created_at)
    ORDER BY date(created_at)
  `).all();

  return {
    totals: { ...total, ...orderStats },
    products: productMetrics,
    daily: dailyMetrics,
  };
}

function sendFile(request, response, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Page not found.");
      return;
    }

    response.writeHead(200, {
      "content-type": contentTypes.get(path.extname(filePath)) || "application/octet-stream",
      "cache-control": [".html", ".css", ".js"].includes(path.extname(filePath))
        ? "no-cache"
        : "public, max-age=3600",
    });
    response.end(content);
  });
}

function sendPage(request, response, fileName, pageTemplates) {
  fs.readFile(path.join(ROOT, fileName), "utf8", (error, page) => {
    if (error) {
      console.error(`Could not read ${fileName}:`, error);
      sendError(response, 500, "This page could not be loaded.");
      return;
    }

    const html = page
      .replace("<!-- SITE_HEADER -->", pageTemplates.header)
      .replace("<!-- SITE_FOOTER -->", pageTemplates.footer);
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
    response.end(html);
  });
}

function normalizeProducts() {
  return database.prepare(`
    SELECT id, name, description, price_paise AS pricePaise, category, visual_key AS visualKey
    FROM products
    WHERE active = 1
    ORDER BY CASE category WHEN 'bottles' THEN 0 ELSE 1 END, name
  `).all();
}

async function handleRequest(request, response, pageTemplates) {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  let requestPath;
  try {
    requestPath = decodeURIComponent(url.pathname);
  } catch {
    sendError(response, 400, "This URL is not valid.");
    return;
  }

  if (request.method === "GET" && requestPath === "/api/products") {
    sendJson(response, 200, { products: normalizeProducts() });
    return;
  }

  if (request.method === "POST" && requestPath === "/api/events") {
    if (!checkRateLimit(request, "events", 300, 60_000)) {
      sendError(response, 429, "Please slow down and try again.");
      return;
    }

    const body = await readJson(request);
    if (!validVisitorId(body.visitorId) || !EVENT_TYPES.has(body.eventType) || !PAGE_IDS.has(body.page)) {
      sendError(response, 400, "The anonymous demo-analytics event is not valid.");
      return;
    }

    const productId = body.productId === undefined || body.productId === null ? null : body.productId;
    const needsProduct = body.eventType === "product_view" || body.eventType === "add_to_cart";
    if ((needsProduct && typeof productId !== "string") || (!needsProduct && productId !== null && body.eventType !== "demo_order")) {
      sendError(response, 400, "This demo-analytics event has an invalid product.");
      return;
    }

    if (productId && !database.prepare("SELECT 1 FROM products WHERE id = ? AND active = 1").get(productId)) {
      sendError(response, 400, "The selected product does not exist.");
      return;
    }

    insertEvent({ visitorId: body.visitorId, eventType: body.eventType, page: body.page, productId });
    sendJson(response, 202, { recorded: true });
    return;
  }

  if (request.method === "POST" && requestPath === "/api/demo-orders") {
    if (!checkRateLimit(request, "demo-orders", 20, 60_000)) {
      sendError(response, 429, "Please wait a moment before trying the demo again.");
      return;
    }

    const body = await readJson(request);
    if (!validVisitorId(body.visitorId) || !Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) {
      sendError(response, 400, "The demo bag is not valid.");
      return;
    }

    const requestedItems = new Map();
    for (const item of body.items) {
      if (
        !item ||
        typeof item.id !== "string" ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 99
      ) {
        sendError(response, 400, "A demo item or quantity is not valid.");
        return;
      }
      requestedItems.set(item.id, (requestedItems.get(item.id) || 0) + item.quantity);
    }

    const items = [];
    for (const [id, quantity] of requestedItems) {
      if (quantity > 99) {
        sendError(response, 400, "A product quantity cannot exceed 99.");
        return;
      }
      const product = database.prepare(`
        SELECT id, name, price_paise AS pricePaise
        FROM products WHERE id = ? AND active = 1
      `).get(id);
      if (!product) {
        sendError(response, 400, "A product in this demo bag is no longer available.");
        return;
      }
      items.push({ ...product, quantity });
    }

    const totalPaise = items.reduce((sum, item) => sum + item.pricePaise * item.quantity, 0);
    const reference = `RVR-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
    database.exec("BEGIN IMMEDIATE");
    try {
      const result = database.prepare(`
        INSERT INTO demo_orders (reference, visitor_id, total_paise)
        VALUES (?, ?, ?)
      `).run(reference, body.visitorId, totalPaise);
      const orderId = Number(result.lastInsertRowid);
      const insertItem = database.prepare(`
        INSERT INTO demo_order_items (order_id, product_id, product_name, unit_price_paise, quantity)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        insertItem.run(orderId, item.id, item.name, item.pricePaise, item.quantity);
      }
      for (const item of items) {
        insertEvent({ visitorId: body.visitorId, eventType: "demo_order", page: "payment", productId: item.id });
      }
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }

    sendJson(response, 201, { reference, recorded: true, totalPaise });
    return;
  }

  if (request.method === "POST" && requestPath === "/api/admin/login") {
    if (!checkRateLimit(request, "admin-login", 8, 15 * 60_000)) {
      sendError(response, 429, "Too many sign-in attempts. Please wait and try again later.");
      return;
    }
    if (!ADMIN_PASSWORD) {
      sendError(response, 503, "Set ADMIN_PASSWORD in .env to enable the owner dashboard.");
      return;
    }

    const body = await readJson(request);
    if (typeof body.password !== "string" || body.password.length > 256) {
      sendError(response, 400, "Enter your dashboard password.");
      return;
    }
    const supplied = crypto.createHmac("sha256", "RIVORA-ADMIN-CHECK").update(body.password).digest();
    const expected = crypto.createHmac("sha256", "RIVORA-ADMIN-CHECK").update(ADMIN_PASSWORD).digest();
    if (!crypto.timingSafeEqual(supplied, expected)) {
      sendError(response, 401, "That password did not match.");
      return;
    }

    setAdminCookie(response);
    sendJson(response, 200, { signedIn: true });
    return;
  }

  if (request.method === "POST" && requestPath === "/api/admin/logout") {
    if (!isSameOrigin(request)) {
      sendError(response, 403, "The sign-out request must come from this website.");
      return;
    }
    clearAdminCookie(response);
    sendJson(response, 200, { signedOut: true });
    return;
  }

  if (request.method === "GET" && requestPath === "/api/admin/dashboard") {
    if (!requireAdmin(request, response)) return;
    sendJson(response, 200, getDashboardMetrics());
    return;
  }

  if (request.method === "GET" && requestPath === "/") {
    sendPage(request, response, "index.html", pageTemplates);
    return;
  }

  if (request.method === "GET" && publicFiles.has(requestPath.slice(1))) {
    const fileName = requestPath.slice(1);
    if (fileName.endsWith(".html")) {
      sendPage(request, response, fileName, pageTemplates);
    } else {
      sendFile(request, response, path.join(ROOT, fileName));
    }
    return;
  }

  const assetPath = requestPath.startsWith("/assets/") ? requestPath : "";
  if (request.method === "GET" && assetPath) {
    const candidate = path.resolve(ROOT, `.${assetPath.replaceAll("/", path.sep)}`);
    const safeRoot = path.resolve(ROOT, "assets");
    const normalizedCandidate = candidate.toLowerCase();
    const normalizedRoot = safeRoot.toLowerCase();
    if (!normalizedCandidate.startsWith(`${normalizedRoot}${path.sep}`)) {
      sendError(response, 404, "File not found.");
      return;
    }

    const extension = path.extname(candidate).toLowerCase();
    if (![".svg", ".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
      sendError(response, 404, "File not found.");
      return;
    }
    if (extension === ".png") contentTypes.set(".png", "image/png");
    if (extension === ".jpg" || extension === ".jpeg") contentTypes.set(extension, "image/jpeg");
    if (extension === ".webp") contentTypes.set(extension, "image/webp");
    sendFile(request, response, candidate);
    return;
  }

  if (request.method !== "GET" && request.method !== "POST") {
    response.setHeader("allow", "GET, POST");
    sendError(response, 405, "This request method is not supported.");
    return;
  }

  sendError(response, 404, "Page not found.");
}

const pageTemplates = {
  header: fs.readFileSync(path.join(ROOT, "templates", "header.html"), "utf8"),
  footer: fs.readFileSync(path.join(ROOT, "templates", "footer.html"), "utf8"),
};

const server = http.createServer((request, response) => {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "content-security-policy",
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
  );

  handleRequest(request, response, pageTemplates).catch((error) => {
    if (response.headersSent || response.destroyed) return;
    if (error.statusCode) {
      sendError(response, error.statusCode, error.message);
      return;
    }
    console.error("RIVORA request failed:", error);
    sendError(response, 500, "Something went wrong. Please try again.");
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`RIVORA demo storefront listening on port ${PORT}.`);
  console.log(`SQLite database: ${DATABASE_PATH}`);
  if (!ADMIN_PASSWORD) {
    console.warn("Set ADMIN_PASSWORD in .env to use the private analytics dashboard.");
  }
});

function closeServer() {
  server.close(() => {
    database.close();
    process.exit(0);
  });
}

process.on("SIGINT", closeServer);
process.on("SIGTERM", closeServer);
