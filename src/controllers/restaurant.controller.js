const db = require('../db');
const redis = require('../lib/redis');
const { invalidateRestaurantCache } = require('../lib/cacheInvalidation');

/**
 * Get List of Restaurants with filters.
 * 
 * [PLANTED PERFORMANCE PROBLEM 3]
 * Missing indexes on WHERE and JOIN columns in the database.
 * This query will scan the full table even with a simple city filter.
 */
const listRestaurants = async (req, res) => {
    const { city } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const sort = req.query.sort || 'rating';
    const offset = (page - 1) * limit;

    // Cache key must be deterministic and include all pagination params.
    const key = `restaurants:city=${city || 'all'}:page=${page}:limit=${limit}:sort=${sort}`;

    try {
        const cached = await redis.get(key);
        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json(JSON.parse(cached));
        }
    } catch (err) {
        console.error('[Redis] get error:', err.message);
        // fallthrough to DB query on Redis errors
    }

    let queryStr = 'SELECT * FROM restaurants';
    const params = [];

    // Whitelist sortable columns to avoid SQL injection via ORDER BY.
    const sortMap = {
        rating: 'id',
        name: 'name',
        city: 'city',
        created_at: 'created_at'
    };
    const sortColumn = sortMap[sort] || 'id';

    if (city) {
        queryStr += ' WHERE city = $1';
        params.push(city);
        queryStr += ` ORDER BY ${sortColumn} LIMIT $2 OFFSET $3`;
        params.push(limit, offset);
    } else {
        queryStr += ` ORDER BY ${sortColumn} LIMIT $1 OFFSET $2`;
        params.push(limit, offset);
    }

    const result = await db.query(queryStr, params);

    const payload = {
        total: result.rowCount,
        restaurants: result.rows
    };

    try {
        // Cache for 5 minutes
        await redis.setex(key, 300, JSON.stringify(payload));
    } catch (err) {
        console.error('[Redis] setex error:', err.message);
    }

    res.set('X-Cache', 'MISS');
    res.json(payload);
};

// Backward-compatible alias used by existing route wiring.
const getRestaurants = listRestaurants;

/**
 * Get Restaurant Menu items with category details.
 * 
 * [PLANTED PERFORMANCE PROBLEM 4]
 * N+1 for category details inside a loop.
 */
const getMenu = async (req, res) => {
    const { id } = req.params;

    console.log(`[Restaurant Controller] Fetching menu for Restaurant #${id}`);

    const menuItemsResult = await db.query(
        `SELECT
            mi.id,
            mi.restaurant_id,
            mi.category_id,
            mi.name,
            mi.description,
            mi.price,
            mi.available,
            COALESCE(c.name, 'Uncategorized') AS category
         FROM menu_items mi
         LEFT JOIN categories c ON c.id = mi.category_id
         WHERE mi.restaurant_id = $1
           AND mi.available = TRUE
         ORDER BY mi.id`,
        [id]
    );

    res.json({
        restaurant_id: id,
        menu: menuItemsResult.rows
    });
};

const getHealth = async (req, res) => {
    try {
        await db.query('SELECT 1');
        res.json({ status: 'UP', database: 'connected' });
    } catch (err) {
        res.status(503).json({ status: 'DOWN', database: 'disconnected' });
    }
};

const createRestaurant = async (req, res) => {
    const { name, city, cuisine_type = null, description = null, active = true } = req.body;

    const result = await db.query(
        `INSERT INTO restaurants (name, city, cuisine_type, description, active)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [name, city, cuisine_type, description, active]
    );

    await invalidateRestaurantCache(result.rows[0].city);
    res.status(201).json(result.rows[0]);
};

const updateRestaurant = async (req, res) => {
    const { id } = req.params;
    const { name, city, cuisine_type = null, description = null, active = true } = req.body;

    const currentResult = await db.query(
        'SELECT city FROM restaurants WHERE id = $1',
        [id]
    );

    if (currentResult.rowCount === 0) {
        return res.status(404).json({ error: 'Restaurant not found' });
    }

    const previousCity = currentResult.rows[0].city;

    const result = await db.query(
        `UPDATE restaurants
         SET name = $1,
             city = $2,
             cuisine_type = $3,
             description = $4,
             active = $5
         WHERE id = $6
         RETURNING *`,
        [name, city, cuisine_type, description, active, id]
    );

    if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Restaurant not found' });
    }

    await invalidateRestaurantCache(previousCity);
    if (result.rows[0].city !== previousCity) {
        await invalidateRestaurantCache(result.rows[0].city);
    }

    res.json(result.rows[0]);
};

const deleteRestaurant = async (req, res) => {
    const { id } = req.params;

    const result = await db.query(
        'DELETE FROM restaurants WHERE id = $1 RETURNING city',
        [id]
    );

    if (result.rowCount === 0) {
        return res.status(404).json({ error: 'Restaurant not found' });
    }

    await invalidateRestaurantCache(result.rows[0].city);
    res.status(204).send();
};

module.exports = {
    listRestaurants,
    getRestaurants,
    getMenu,
    getHealth,
    createRestaurant,
    updateRestaurant,
    deleteRestaurant
};
