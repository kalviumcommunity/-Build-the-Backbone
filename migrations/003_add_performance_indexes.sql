-- 003_add_performance_indexes.sql
-- Performance indexes to eliminate Seq Scans identified in EXPLAIN ANALYZE

-- Justification: Eliminates Seq Scan on orders table filtering by user_id in getOrderHistory endpoint
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);

-- Justification: Enables fast descending sort by created_at after filtering by user_id in order history queries
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(user_id, created_at DESC);

-- Justification: Eliminates Seq Scan on order_items table filtering by order_id when fetching items for each order
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- Justification: Eliminates Seq Scan on menu_items table filtering by restaurant_id when fetching menu for a restaurant
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant ON menu_items(restaurant_id);
