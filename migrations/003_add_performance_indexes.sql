-- 003_add_performance_indexes.sql

-- This index speeds up user-specific order history lookups by avoiding a full scan of orders.
CREATE INDEX IF NOT EXISTS idx_orders_user_id_created_at ON orders(user_id, created_at DESC);

-- This index speeds up order item lookups for each order when building order history.
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- This index speeds up restaurant menu lookups by filtering menu items by restaurant faster.
CREATE INDEX IF NOT EXISTS idx_menu_items_restaurant_id ON menu_items(restaurant_id);