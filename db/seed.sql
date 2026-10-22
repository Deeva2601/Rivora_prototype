INSERT INTO products (id, name, description, price_paise, category, visual_key)
VALUES
  ('starter-bottle', 'RIVORA Twist Bottle', 'Your reusable bottle with the signature two-flavour twist cap.', 9900, 'bottles', 'bottle'),
  ('lemon-zest', 'Lemon Zest', 'A bright, zesty flavour for fresh starts and sunny afternoons.', 3900, 'refills', 'lemon'),
  ('strawberry-bliss', 'Strawberry Bliss', 'A soft, sweet berry flavour for feel-good hydration.', 3900, 'refills', 'strawberry'),
  ('mango-magic', 'Mango Magic', 'A tropical little pick-me-up, whenever you need one.', 3900, 'refills', 'mango')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  description = excluded.description,
  price_paise = excluded.price_paise,
  category = excluded.category,
  visual_key = excluded.visual_key,
  active = 1;
