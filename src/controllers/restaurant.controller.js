const db = require('../db');
const redis = require('../lib/redis');
const { invalidateRestaurantCache } = require('../lib/cacheInvalidation');

const CACHE_TTL_SECONDS = 300;

const buildRestaurantsCacheKey = (query) => {
    const city = query.city || 'all';
    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 20;
    const sort = query.sort || 'rating';

    return `restaurants:city=${city}:page=${page}:limit=${limit}:sort=${sort}`;
};

/**
 * Get List of Restaurants with filters.
 * 
 * [PLANTED PERFORMANCE PROBLEM 3]
 * Missing indexes on WHERE and JOIN columns in the database.
 * This query will scan the full table even with a simple city filter.
 */
const getRestaurants = async (req, res) => {
    const cacheKey = buildRestaurantsCacheKey(req.query);

    try {
        const cached = await redis.get(cacheKey);

        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json(JSON.parse(cached));
        }

        const { city, limit = 20, offset = 0 } = req.query;

        let queryStr = 'SELECT * FROM restaurants';
        const params = [];

        if (city) {
            queryStr += ' WHERE city = $1';
            params.push(city);
            queryStr += ` LIMIT $2 OFFSET $3`;
            params.push(limit, offset);
        } else {
            queryStr += ` LIMIT $1 OFFSET $2`;
            params.push(limit, offset);
        }

        const result = await db.query(queryStr, params);
        const data = {
            total: result.rowCount,
            restaurants: result.rows
        };

        await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(data));
        res.set('X-Cache', 'MISS');
        return res.json(data);
    } catch (err) {
        console.error('[Restaurants Cache] Falling back to DB:', err.message);

        const { city, limit = 20, offset = 0 } = req.query;

        let queryStr = 'SELECT * FROM restaurants';
        const params = [];

        if (city) {
            queryStr += ' WHERE city = $1';
            params.push(city);
            queryStr += ` LIMIT $2 OFFSET $3`;
            params.push(limit, offset);
        } else {
            queryStr += ` LIMIT $1 OFFSET $2`;
            params.push(limit, offset);
        }

        const result = await db.query(queryStr, params);

        res.set('X-Cache', 'MISS');
        return res.json({
            total: result.rowCount,
            restaurants: result.rows
        });
    }
};

/**
 * Get Restaurant Menu items with category details.
 * 
 * [STEP 5 FIX]
 * Replaced N+1 loop pattern with efficient single JOIN query.
 * Before: 1 + N queries (menu_items → categories)
 * After: 1 query (JOIN with categories)
 */
const getMenu = async (req, res) => {
    const { id } = req.params;

    console.log(`[Restaurant Controller] Fetching menu for Restaurant #${id}`);

    // Single JOIN query - replaces: Query 1 (menu_items) + N queries (categories)
    const result = await db.query(`
        SELECT
            mi.id,
            mi.name,
            mi.description,
            mi.price,
            mi.category_id,
            mi.restaurant_id,
            c.id AS category_id_full,
            c.name AS category_name,
            c.restaurant_id AS category_restaurant_id
        FROM menu_items mi
        LEFT JOIN categories c ON c.id = mi.category_id
        WHERE mi.restaurant_id = $1
        ORDER BY mi.id
    `, [id]);

    const populatedMenu = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        category_id: row.category_id,
        restaurant_id: row.restaurant_id,
        category: row.category_name ? {
            id: row.category_id_full,
            name: row.category_name,
            restaurant_id: row.category_restaurant_id
        } : { name: 'Uncategorized' }
    }));

    res.json({
        restaurant_id: id,
        menu: populatedMenu
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
    const { name, city, cuisine_type, description, active = true } = req.body;

    if (!name || !city) {
        return res.status(400).json({ error: 'Name and city are required' });
    }

    try {
        const result = await db.query(
            `INSERT INTO restaurants (name, city, cuisine_type, description, active)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [name, city, cuisine_type || null, description || null, active]
        );

        await invalidateRestaurantCache(result.rows[0].city);

        return res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('[Restaurant Controller] Create failed:', err.message);
        return res.status(500).json({ error: 'Failed to create restaurant' });
    }
};

const updateRestaurant = async (req, res) => {
    const { id } = req.params;
    const { name, city, cuisine_type, description, active } = req.body;

    try {
        const existing = await db.query('SELECT * FROM restaurants WHERE id = $1', [id]);

        if (existing.rows.length === 0) {
            return res.status(404).json({ error: 'Restaurant not found' });
        }

        const current = existing.rows[0];
        const result = await db.query(
            `UPDATE restaurants
             SET name = COALESCE($1, name),
                 city = COALESCE($2, city),
                 cuisine_type = COALESCE($3, cuisine_type),
                 description = COALESCE($4, description),
                 active = COALESCE($5, active)
             WHERE id = $6
             RETURNING *`,
            [name || null, city || null, cuisine_type || null, description || null, typeof active === 'boolean' ? active : null, id]
        );

        await invalidateRestaurantCache(current.city);
        if (result.rows[0].city !== current.city) {
            await invalidateRestaurantCache(result.rows[0].city);
        }

        return res.json(result.rows[0]);
    } catch (err) {
        console.error('[Restaurant Controller] Update failed:', err.message);
        return res.status(500).json({ error: 'Failed to update restaurant' });
    }
};

const deleteRestaurant = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await db.query(
            'DELETE FROM restaurants WHERE id = $1 RETURNING city',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Restaurant not found' });
        }

        await invalidateRestaurantCache(result.rows[0].city);

        return res.status(204).send();
    } catch (err) {
        console.error('[Restaurant Controller] Delete failed:', err.message);
        return res.status(500).json({ error: 'Failed to delete restaurant' });
    }
};

module.exports = {
    getRestaurants,
    getMenu,
    getHealth,
    createRestaurant,
    updateRestaurant,
    deleteRestaurant
};
