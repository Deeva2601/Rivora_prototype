CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  category TEXT NOT NULL CHECK (category IN ('bottles', 'refills')),
  visual_key TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS analytics_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visitor_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (
    event_type IN ('page_view', 'product_view', 'add_to_cart', 'checkout_start', 'demo_order', 'contact_click')
  ),
  page TEXT NOT NULL,
  product_id TEXT REFERENCES products(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS demo_orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT NOT NULL UNIQUE,
  visitor_id TEXT NOT NULL,
  total_paise INTEGER NOT NULL CHECK (total_paise >= 0),
  status TEXT NOT NULL DEFAULT 'demo_only' CHECK (status = 'demo_only'),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS demo_order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES demo_orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT NOT NULL,
  unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0),
  quantity INTEGER NOT NULL CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS analytics_events_type_date_idx
  ON analytics_events(event_type, created_at);
CREATE INDEX IF NOT EXISTS analytics_events_product_type_idx
  ON analytics_events(product_id, event_type);
CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_visitor_event_idx
  ON analytics_events(visitor_id, event_type, page, ifnull(product_id, ''));
CREATE INDEX IF NOT EXISTS demo_orders_date_idx
  ON demo_orders(created_at);
