-- migrations/003_add_indexes.sql
-- Part A — Performance Fix: Add missing indexes on all FK / filter columns.
--
-- These indexes were intentionally omitted in 001_create_tables.sql as planted
-- performance problems. Running this migration is the first step of Part A.
--
-- Run with:
--   psql $DATABASE_URL -f migrations/003_add_indexes.sql
--
-- Idempotent: every CREATE INDEX uses IF NOT EXISTS.

BEGIN;

-- ── orders ─────────────────────────────────────────────────────────────────
-- Supports: WHERE user_id = $1 in ORDER_HISTORY_SQL and ORDER_COUNT_SQL
CREATE INDEX IF NOT EXISTS idx_orders_user_id
  ON orders (user_id);

-- Composite index for the paginated history query (user_id + sort column).
-- PostgreSQL can use this for both the WHERE filter AND the ORDER BY without
-- a separate sort step.
CREATE INDEX IF NOT EXISTS idx_orders_user_id_created_at
  ON orders (user_id, created_at DESC);

-- Supports: restaurant_id FK lookups and restaurant-level analytics.
CREATE INDEX IF NOT EXISTS idx_orders_restaurant_id
  ON orders (restaurant_id);

-- ── order_items ─────────────────────────────────────────────────────────────
-- Critical: drives the JOIN in ORDER_HISTORY_SQL.
-- Without this index every json_agg requires a Seq Scan on the full table.
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON order_items (order_id);

-- Supports: menu_item_id FK lookups (JOIN to menu_items).
CREATE INDEX IF NOT EXISTS idx_order_items_menu_item_id
  ON order_items (menu_item_id);

-- ── menu_items ──────────────────────────────────────────────────────────────
-- Supports: WHERE restaurant_id = $1 in MENU_SQL
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id
  ON menu_items (restaurant_id);

-- Supports: JOIN categories c ON c.id = mi.category_id
CREATE INDEX IF NOT EXISTS idx_menu_items_category_id
  ON menu_items (category_id);

-- Partial index: only index available items — reduces index size and keeps
-- write overhead low for items that get toggled off.
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_available
  ON menu_items (restaurant_id)
  WHERE available = true;

-- ── categories ──────────────────────────────────────────────────────────────
-- Supports: WHERE restaurant_id = $1 category lookups.
CREATE INDEX IF NOT EXISTS idx_categories_restaurant_id
  ON categories (restaurant_id);

-- ── reviews ─────────────────────────────────────────────────────────────────
-- Supports: WHERE restaurant_id = $1 review aggregation queries.
CREATE INDEX IF NOT EXISTS idx_reviews_restaurant_id
  ON reviews (restaurant_id);

CREATE INDEX IF NOT EXISTS idx_reviews_user_id
  ON reviews (user_id);

-- ── restaurants ─────────────────────────────────────────────────────────────
-- Supports: WHERE city = $1 in getRestaurants (case-sensitive equality).
CREATE INDEX IF NOT EXISTS idx_restaurants_city
  ON restaurants (city);

COMMIT;

-- Verify: run \d orders in psql after migration to confirm indexes appear.
