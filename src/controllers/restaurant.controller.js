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

module.exports = {
    getRestaurants,
    getMenu,
    getHealth
};
