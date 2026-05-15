-- QuickBite: Indian Food Seed Data
-- 1,000 Users, 100 Restaurants, 5,000 Orders, 25,000+ Items

BEGIN;

-- 1. Users (1,000)
INSERT INTO users (name, email, password, phone)
SELECT 
    CASE (i % 10)
        WHEN 0 THEN 'Rahul Sharma' WHEN 1 THEN 'Anjali Gupta' WHEN 2 THEN 'Siddharth Iyer'
        WHEN 3 THEN 'Priya Nair' WHEN 4 THEN 'Vikram Singh' WHEN 5 THEN 'Nisha Reddy'
        WHEN 6 THEN 'Amit Patel' WHEN 7 THEN 'Deepika Rao' WHEN 8 THEN 'Arjun Kapur'
        ELSE 'Sonia Deshmukh'
    END || ' ' || i,
    'user' || i || '@example.in',
    '$2a$12$LNKT1ACN226k.7uOTCfBo.0Vur2GYUhpmYc8EQEc/DNMh8GldC3e.', -- 'password123'
    '98' || LPAD(i::text, 8, '0')
FROM generate_series(1, 1000) AS i;

-- 2. Restaurants (100)
INSERT INTO restaurants (name, city, cuisine_type, description)
SELECT 
    CASE (i % 5)
        WHEN 0 THEN 'The Curry Leaf' WHEN 1 THEN 'Spice Garden' 
        WHEN 2 THEN 'Dosa Hub' WHEN 3 THEN 'Tandoori Tales' 
        ELSE 'Punjab Express'
    END || ' #' || i,
    CASE (i % 5)
        WHEN 0 THEN 'Mumbai' WHEN 1 THEN 'Delhi' 
        WHEN 2 THEN 'Bangalore' WHEN 3 THEN 'Chennai' 
        ELSE 'Hyderabad'
    END,
    CASE (i % 4)
        WHEN 0 THEN 'North Indian' WHEN 1 THEN 'South Indian' 
        WHEN 2 THEN 'Indo-Chinese' ELSE 'Street Food'
    END,
    'Authentic Indian flavors served fresh daily.'
FROM generate_series(1, 100) AS i;

-- 3. Categories (5 per restaurant = 500)
INSERT INTO categories (name, restaurant_id)
SELECT 
    cat_name,
    r.id
FROM restaurants r,
LATERAL (VALUES ('Starters'), ('Main Course'), ('Breads'), ('Beverages'), ('Desserts')) AS c(cat_name);

-- 4. Menu Items (5-8 per category ~ 3000 items)
-- Creating a pool of Indian item names for each category
INSERT INTO menu_items (restaurant_id, category_id, name, description, price)
SELECT 
    c.restaurant_id,
    c.id,
    CASE c.name
        WHEN 'Starters' THEN CASE (k % 5) WHEN 0 THEN 'Paneer Tikka' WHEN 1 THEN 'Chicken 65' WHEN 2 THEN 'Hara Bhara Kabab' WHEN 3 THEN 'Samosa' ELSE 'Gobi Manchurian' END
        WHEN 'Main Course' THEN CASE (k % 5) WHEN 0 THEN 'Butter Chicken' WHEN 1 THEN 'Dal Makhani' WHEN 2 THEN 'Paneer Butter Masala' WHEN 3 THEN 'Chicken Biryani' ELSE 'Veg Pulao' END
        WHEN 'Breads' THEN CASE (k % 4) WHEN 0 THEN 'Butter Naan' WHEN 1 THEN 'Garlic Naan' WHEN 2 THEN 'Tandoori Roti' ELSE 'Lacha Paratha' END
        WHEN 'Beverages' THEN CASE (k % 4) WHEN 0 THEN 'Masala Chai' WHEN 1 THEN 'Lassi' WHEN 2 THEN 'Coffee' ELSE 'Fresh Lime Soda' END
        ELSE CASE (k % 3) WHEN 0 THEN 'Gulab Jamun' WHEN 1 THEN 'Rasmalai' ELSE 'Gajar Ka Halva' END
    END || ' (Item ' || k || ')',
    'Specialty item from our kitchen.',
    CASE c.name 
        WHEN 'Starters' THEN 150 + (k * 20)
        WHEN 'Main Course' THEN 250 + (k * 30)
        WHEN 'Breads' THEN 40 + (k * 10)
        WHEN 'Beverages' THEN 60 + (k * 15)
        ELSE 120 + (k * 25)
    END
FROM categories c,
generate_series(1, 6) AS k; -- 6 items per category

-- 5. Orders (5,000)
-- Distributed across 1000 users, approx 5 orders each.
INSERT INTO orders (user_id, restaurant_id, total, status)
SELECT 
    (i % 1000) + 1, -- user_id
    (i % 100) + 1,  -- restaurant_id
    0, -- placeholder, will update later
    CASE (i % 5)
        WHEN 0 THEN 'delivered' WHEN 1 THEN 'preparing' 
        WHEN 2 THEN 'confirmed' WHEN 3 THEN 'cancelled'
        ELSE 'pending'
    END
FROM generate_series(1, 5000) AS i;

-- 6. Order Items (approx 5-8 per order ~ 30,000 items)
-- This creates a massive table to ensure Seq Scans are slow.
INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
SELECT 
    o.id,
    m.id,
    (m.id % 3) + 1,
    m.price
FROM (SELECT id FROM orders) o
JOIN (SELECT id, restaurant_id, price FROM menu_items) m ON m.restaurant_id = ((o.id % 100) + 1)
WHERE m.id % 5 = 0; -- Select roughly 1/5th of menu items per order to simulate volume

-- 7. Update Order Totals
UPDATE orders o 
SET total = (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM order_items WHERE order_id = o.id);

-- 8. Reviews (2,000)
INSERT INTO reviews (user_id, restaurant_id, rating, comment)
SELECT 
    (i % 1000) + 1,
    (i % 100) + 1,
    (i % 5) + 1,
    CASE (i % 4)
        WHEN 0 THEN 'Amazing food and great service!'
        WHEN 1 THEN 'The flavors were authentic Indian.'
        WHEN 2 THEN 'Delayed delivery, but food was hot.'
        ELSE 'Definitely ordering again.'
    END
FROM generate_series(1, 2000) AS i;

COMMIT;
