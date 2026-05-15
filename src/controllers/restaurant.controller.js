const db = require('../db');
const redis = require('../lib/redis');

const CACHE_TTL = 300;

const buildCacheKey = (query) => {
    const city = query.city || 'all';
    const limit = parseInt(query.limit, 10) || 20;
    const offset = parseInt(query.offset, 10) || 0;

    return `restaurants:city=${city}:limit=${limit}:offset=${offset}`;
};

/**
 * Get List of Restaurants with filters.
 * 
 * [PLANTED PERFORMANCE PROBLEM 3]
 * Missing indexes on WHERE and JOIN columns in the database.
 * This query will scan the full table even with a simple city filter.
 */
const getRestaurants = async (req, res) => {
    const cacheKey = buildCacheKey(req.query);
    const { city, limit = 20, offset = 0 } = req.query;

    try {
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                res.set('X-Cache', 'HIT');
                return res.json(JSON.parse(cached));
            }
        } catch (cacheErr) {
            console.error('[Cache] Read failed, falling back to DB:', cacheErr.message);
        }

        let queryStr = 'SELECT * FROM restaurants';
        const params = [];

        if (city) {
            queryStr += ' WHERE city = $1';
            params.push(city);
            queryStr += ' LIMIT $2 OFFSET $3';
            params.push(limit, offset);
        } else {
            queryStr += ' LIMIT $1 OFFSET $2';
            params.push(limit, offset);
        }

        const result = await db.query(queryStr, params);
        const data = {
            total: result.rowCount,
            restaurants: result.rows
        };

        try {
            await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(data));
        } catch (cacheErr) {
            console.error('[Cache] Write failed (non-fatal):', cacheErr.message);
        }

        res.set('X-Cache', 'MISS');
        return res.json(data);
    } catch (err) {
        return res.status(500).json({ error: 'Failed to fetch restaurants' });
    }
};

/**
 * Get Restaurant Menu items with category details.
 * 
 * FIXED: This function now uses a single JOIN query with json_agg
 * instead of fetching items and then categories in a loop (N+1).
 * Single query regardless of menu item count.
 */
const getMenu = async (req, res) => {
    const { id } = req.params;

    console.log(`[Restaurant Controller] Fetching menu for Restaurant #${id}`);

    // Single query with category details aggregated in
    // No separate queries needed for category lookups
    const result = await db.query(`
        SELECT
            mi.id,
            mi.restaurant_id,
            mi.name,
            mi.description,
            mi.price,
            mi.available,
            json_build_object(
                'id', c.id,
                'name', c.name
            ) AS category
        FROM menu_items mi
        LEFT JOIN categories c ON c.id = mi.category_id
        WHERE mi.restaurant_id = $1 AND mi.available = TRUE
        ORDER BY mi.name
    `, [id]);

    const menuItems = result.rows;

    res.json({
        restaurant_id: id,
        menu: menuItems
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

module.exports = {
    getRestaurants,
    getMenu,
    getHealth,
    buildCacheKey
};
