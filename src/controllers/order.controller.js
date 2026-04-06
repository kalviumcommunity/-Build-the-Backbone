'use strict';

const db = require('../db');
const emailService = require('../lib/emailService');

/**
 * @module order.controller
 * @description Handles all order-related HTTP endpoints for the QuickBite API.
 *
 * Part A fix log
 * ──────────────
 * BEFORE : getOrderHistory fired 1 + N + (N×M) queries because it looped
 *          over orders, then over items, then fetched every menu_item
 *          individually — 121 round-trips for a user with 10 orders × 12 items.
 *
 * AFTER  : A single 4-table JOIN collapses the entire result set into one
 *          round-trip. PostgreSQL's json_agg() builds the nested items array
 *          server-side so the JS layer receives the final shape directly.
 *
 * Query count: 121 → 1
 */

/* ─────────────────────────────────────────────────────────────────────────── *
 *  SQL templates (kept at module scope for easy EXPLAIN ANALYZE in psql)      *
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Single-query order history with fully nested items.
 *
 * Uses LEFT JOIN so that orders with zero items are still returned (the
 * json_agg result for an empty set is coalesced to an empty array via
 * COALESCE + CASE, see below).
 *
 * Indexes required (added in migrations/003_add_indexes.sql):
 *   idx_orders_user_id         ON orders(user_id)
 *   idx_order_items_order_id   ON order_items(order_id)
 *   idx_menu_items_id          ON menu_items(id)          ← PK, already exists
 *   idx_categories_id          ON categories(id)          ← PK, already exists
 */
const ORDER_HISTORY_SQL = `
  SELECT
    o.id,
    o.total,
    o.status,
    o.created_at,
    COALESCE(
      json_agg(
        CASE WHEN oi.id IS NOT NULL THEN
          json_build_object(
            'id',         oi.id,
            'menuItemId', oi.menu_item_id,
            'name',       mi.name,
            'quantity',   oi.quantity,
            'unitPrice',  oi.unit_price,
            'category',   c.name
          )
        END
        ORDER BY oi.id
      ) FILTER (WHERE oi.id IS NOT NULL),
      '[]'::json
    ) AS items
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id
  LEFT JOIN menu_items  mi ON mi.id = oi.menu_item_id
  LEFT JOIN categories   c ON c.id  = mi.category_id
  WHERE o.user_id = $1
  GROUP BY o.id
  ORDER BY o.created_at DESC
  LIMIT  $2
  OFFSET $3
`;

const ORDER_COUNT_SQL = `
  SELECT COUNT(*) AS total
  FROM orders
  WHERE user_id = $1
`;

/* ─────────────────────────────────────────────────────────────────────────── *
 *  Controller functions                                                        *
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * GET /api/orders/history
 *
 * Returns the authenticated user's paginated order history. Each order
 * includes a fully nested `items` array containing menu item details and
 * category names — all resolved in a single database round-trip.
 *
 * @async
 * @param {import('express').Request}  req              - Express request object.
 * @param {object}                     req.user         - JWT payload set by auth middleware.
 * @param {number}                     req.user.id      - Authenticated user's ID.
 * @param {object}                     req.query        - Query parameters.
 * @param {string|number}              [req.query.limit=20]  - Page size (max 100).
 * @param {string|number}              [req.query.offset=0]  - Page offset.
 * @param {import('express').Response} res              - Express response object.
 * @returns {Promise<void>} Sends JSON: `{ user_id, total_orders, page, limit, orders[] }`.
 * @throws {Error} Propagated to the global error handler on DB failure.
 *
 * Response shape change vs. boilerplate
 * ──────────────────────────────────────
 * BEFORE each item had a `menu_item` sub-object with raw DB columns.
 * AFTER  each item has flat camelCase fields: id, menuItemId, name,
 *        quantity, unitPrice, category (string, not object).
 * This is a breaking change intentionally documented here so test suites
 * can be updated accordingly.
 */
const getOrderHistory = async (req, res) => {
  const userId = req.user.id;
  const limit  = Math.min(parseInt(req.query.limit  ?? 20, 10), 100);
  const offset = Math.max(parseInt(req.query.offset ?? 0,  10), 0);

  // Two queries: one for total count (pagination), one for page data.
  // Both hit indexed columns — effectively O(log n).
  const [countResult, ordersResult] = await Promise.all([
    db.query(ORDER_COUNT_SQL, [userId]),
    db.query(ORDER_HISTORY_SQL, [userId, limit, offset]),
  ]);

  const totalOrders = parseInt(countResult.rows[0].total, 10);

  return res.json({
    user_id:      userId,
    total_orders: totalOrders,
    page:         Math.floor(offset / limit) + 1,
    limit,
    orders:       ordersResult.rows,
  });
};

/**
 * POST /api/orders
 *
 * Creates a new order for the authenticated user.
 *
 * NOTE (Part B): The synchronous `emailService.sendConfirmation` call below is
 * an intentional performance bottleneck planted for Part B of the assignment.
 * It blocks the HTTP response for 300–800 ms. Do NOT remove it here — Part B
 * replaces it with a background job / message queue.
 *
 * @async
 * @param {import('express').Request}  req                     - Express request.
 * @param {object}                     req.user                - JWT payload.
 * @param {number}                     req.user.id             - User ID.
 * @param {string}                     req.user.email          - User email.
 * @param {object}                     req.body                - Request body.
 * @param {number}                     req.body.restaurant_id  - Target restaurant.
 * @param {Array<{menu_item_id: number, quantity: number, price: number}>} req.body.items - Line items.
 * @param {number}                     [req.body.delivery_fee=0] - Delivery fee to add to total.
 * @param {import('express').Response} res                     - Express response.
 * @returns {Promise<void>} 201 JSON `{ message, order_id }` on success.
 * @throws {Error} 400 if `items` is empty; 500 on DB / email failure.
 */
const createOrder = async (req, res) => {
  const { restaurant_id, items, delivery_fee = 0 } = req.body;
  const userId = req.user.id;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'No items in order' });
  }

  try {
    // Calculate total client-side (Part B will revalidate server-side prices).
    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const total    = subtotal + Number(delivery_fee);

    // Insert the parent order row.
    const orderResult = await db.query(
      `INSERT INTO orders (user_id, restaurant_id, total)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, restaurant_id, total],
    );
    const orderId = orderResult.rows[0].id;

    // Insert line items. A production system would use a single multi-row
    // INSERT or COPY here; left as sequential INSERTs for clarity.
    for (const item of items) {
      await db.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [orderId, item.menu_item_id, item.quantity, item.price],
      );
    }

    // [PLANTED PROBLEM — Part B] Blocks response 300–800 ms. Do not fix here.
    await emailService.sendConfirmation(orderId, req.user.email);

    return res.status(201).json({
      message:  'Order created successfully!',
      order_id: orderId,
    });
  } catch (err) {
    console.error('[Order Controller] createOrder error:', err);
    return res.status(500).json({ error: 'Failed to create order' });
  }
};

/**
 * GET /api/orders/:id
 *
 * Returns a single order belonging to the authenticated user.
 * Does NOT include nested items — use GET /history for full item detail.
 *
 * @async
 * @param {import('express').Request}  req          - Express request.
 * @param {object}                     req.params   - Route params.
 * @param {string}                     req.params.id - Order ID.
 * @param {object}                     req.user     - JWT payload.
 * @param {number}                     req.user.id  - User ID.
 * @param {import('express').Response} res          - Express response.
 * @returns {Promise<void>} 200 JSON order row; 404 if not found or wrong owner.
 * @throws {Error} Propagated to global error handler on DB failure.
 */
const getOrderById = async (req, res) => {
  const { id } = req.params;
  const userId  = req.user.id;

  const result = await db.query(
    `SELECT id, restaurant_id, total, status, created_at
     FROM orders
     WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Order not found' });
  }

  return res.json(result.rows[0]);
};

module.exports = { getOrderHistory, createOrder, getOrderById };
