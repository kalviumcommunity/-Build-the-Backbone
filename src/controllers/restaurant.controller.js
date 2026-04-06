'use strict';

const db = require('../db');

/**
 * @module restaurant.controller
 * @description Handles restaurant listing, menu retrieval, and health checks.
 *
 * Part A fix log
 * ──────────────
 * BEFORE : getMenu fired 1 + N queries — one to load menu_items, then one
 *          SELECT per item to resolve its category name. For a menu with
 *          20 items this produced 21 round-trips.
 *
 * AFTER  : A single JOIN query resolves the category in the same round-trip.
 *          json_build_object packages the category as a structured sub-object
 *          so the response shape is richer and forwards-compatible.
 *
 * Query count: 21 → 1
 *
 * Column fix: `is_available` corrected to `available` (matches schema).
 */

/* ─────────────────────────────────────────────────────────────────────────── *
 *  SQL templates                                                               *
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * Single-query menu fetch with category resolved via JOIN.
 *
 * Indexes required (added in migrations/003_add_indexes.sql):
 *   idx_menu_items_restaurant_id  ON menu_items(restaurant_id)
 *   idx_menu_items_category_id    ON menu_items(category_id)
 */
const MENU_SQL = `
  SELECT
    mi.id,
    mi.name,
    mi.description,
    mi.price,
    mi.available,
    json_build_object(
      'id',   c.id,
      'name', c.name
    ) AS category
  FROM menu_items mi
  JOIN categories c ON c.id = mi.category_id
  WHERE mi.restaurant_id = $1
    AND mi.available = true
  ORDER BY c.name, mi.name
`;

/* ─────────────────────────────────────────────────────────────────────────── *
 *  Controller functions                                                        *
 * ─────────────────────────────────────────────────────────────────────────── */

/**
 * GET /api/restaurants
 *
 * Returns a paginated list of restaurants, optionally filtered by city.
 *
 * @async
 * @param {import('express').Request}  req              - Express request.
 * @param {object}                     req.query        - Query parameters.
 * @param {string}                     [req.query.city] - Optional city filter.
 * @param {string|number}              [req.query.limit=20]  - Page size (max 100).
 * @param {string|number}              [req.query.offset=0]  - Page offset.
 * @param {import('express').Response} res              - Express response.
 * @returns {Promise<void>} JSON `{ total, restaurants[] }`.
 * @throws {Error} Propagated to global error handler on DB failure.
 */
const getRestaurants = async (req, res) => {
  const city   = req.query.city?.trim() ?? null;
  const limit  = Math.min(parseInt(req.query.limit  ?? 20, 10), 100);
  const offset = Math.max(parseInt(req.query.offset ?? 0,  10), 0);

  let queryStr;
  let params;

  if (city) {
    queryStr = `
      SELECT id, name, city, cuisine_type, description, active, created_at
      FROM restaurants
      WHERE city = $1
      ORDER BY name
      LIMIT $2 OFFSET $3
    `;
    params = [city, limit, offset];
  } else {
    queryStr = `
      SELECT id, name, city, cuisine_type, description, active, created_at
      FROM restaurants
      ORDER BY name
      LIMIT $1 OFFSET $2
    `;
    params = [limit, offset];
  }

  const result = await db.query(queryStr, params);

  return res.json({
    total:       result.rowCount,
    restaurants: result.rows,
  });
};

/**
 * GET /api/restaurants/:id/menu
 *
 * Returns all available menu items for a restaurant, each decorated with a
 * structured `category` object. Resolves in a single DB round-trip via JOIN.
 *
 * Response shape
 * ──────────────
 * BEFORE (boilerplate):
 *   { restaurant_id, menu: [{ ...raw_columns, category: "Burgers" }] }
 *
 * AFTER (fixed):
 *   { restaurant_id, total_items, menu: [{ id, name, description, price,
 *     available, category: { id, name } }] }
 *
 * Items are sorted by category name then item name so the client can render
 * grouped menus without additional sorting.
 *
 * @async
 * @param {import('express').Request}  req           - Express request.
 * @param {object}                     req.params    - Route params.
 * @param {string}                     req.params.id - Restaurant ID.
 * @param {import('express').Response} res           - Express response.
 * @returns {Promise<void>} JSON `{ restaurant_id, total_items, menu[] }`.
 * @throws {Error} Propagated to global error handler on DB failure.
 */
const getMenu = async (req, res) => {
  const restaurantId = parseInt(req.params.id, 10);

  if (Number.isNaN(restaurantId)) {
    return res.status(400).json({ error: 'Invalid restaurant ID' });
  }

  const result = await db.query(MENU_SQL, [restaurantId]);

  return res.json({
    restaurant_id: restaurantId,
    total_items:   result.rowCount,
    menu:          result.rows,
  });
};

/**
 * GET /api/health
 *
 * Liveness + readiness probe. Performs a trivial DB round-trip to confirm
 * the connection pool is healthy.
 *
 * @async
 * @param {import('express').Request}  req - Express request.
 * @param {import('express').Response} res - Express response.
 * @returns {Promise<void>} 200 `{ status: 'UP' }` or 503 `{ status: 'DOWN' }`.
 */
const getHealth = async (req, res) => {
  try {
    await db.query('SELECT 1');
    return res.json({ status: 'UP', database: 'connected' });
  } catch (err) {
    console.error('[Health] DB check failed:', err.message);
    return res.status(503).json({ status: 'DOWN', database: 'disconnected' });
  }
};

module.exports = { getRestaurants, getMenu, getHealth };
