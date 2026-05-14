const db = require('../db');

/**
 * Get List of Restaurants with filters.
 * 
 * [PLANTED PERFORMANCE PROBLEM 3]
 * Missing indexes on WHERE and JOIN columns in the database.
 * This query will scan the full table even with a simple city filter.
 */
const getRestaurants = async (req, res) => {
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

    res.json({
        total: result.rowCount,
        restaurants: result.rows
    });
};

/**
 * Get Restaurant Menu items with category details.
 * 
 * [FIXED: N+1 Query Problem]
 * Replaced loop-based fetching with a single JOIN query.
 * Eliminated N database queries (one per menu item) and reduced to 1.
 */
const getMenu = async (req, res) => {
    const { id } = req.params;

    console.log(`[Restaurant Controller] Fetching menu for Restaurant #${id}`);

    // Single query with JOIN to categories - eliminates N+1
    const result = await db.query(`
        SELECT
            mi.id,
            mi.restaurant_id,
            mi.category_id,
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
        ORDER BY mi.category_id, mi.name
    `, [id]);

    const menuItems = result.rows;

    res.json({
        restaurant_id: id,
        total_items: menuItems.length,
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
    getHealth
};
