const db = require('../db');
const emailService = require('../lib/emailService');

/**
 * Get Order History for the authenticated user.
 * 
 * [PLANTED PERFORMANCE PROBLEM 1]
 * This function exhibits a severe N+1 query problem. Instead of a single JOIN,
 * it fetches orders, then items, then menu details in a nested loop.
 * Performance will degrade exponentially as orders increase.
 */
const getOrderHistory = async (req, res) => {
    const userId = req.user.id;

    console.log(`[Order Controller] Fetching history for User #${userId}`);

    const ordersResult = await db.query(
        `SELECT
            o.id,
            o.user_id,
            o.restaurant_id,
            o.total,
            o.status,
            o.created_at,
            COALESCE(
                json_agg(
                    json_build_object(
                        'id', oi.id,
                        'menu_item_id', oi.menu_item_id,
                        'quantity', oi.quantity,
                        'unit_price', oi.unit_price,
                        'menu_item', json_build_object(
                            'id', mi.id,
                            'restaurant_id', mi.restaurant_id,
                            'category_id', mi.category_id,
                            'name', mi.name,
                            'description', mi.description,
                            'price', mi.price,
                            'available', mi.available
                        )
                    )
                    ORDER BY oi.id
                ) FILTER (WHERE oi.id IS NOT NULL),
                '[]'::json
            ) AS items
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
         WHERE o.user_id = $1
         GROUP BY o.id
         ORDER BY o.created_at DESC`,
        [userId]
    );

    res.json({
        user_id: userId,
        total_orders: ordersResult.rows.length,
        orders: ordersResult.rows
    });
};

/**
 * Create a new order.
 * 
 * [PLANTED PERFORMANCE PROBLEM 2]
 * Synchronous Email sending. The response is blocked by a simulated 
 * SMTP delay in every order creation.
 */
const createOrder = async (req, res) => {
    const { restaurant_id, items, delivery_fee } = req.body;
    const userId = req.user.id;

    if (!items || items.length === 0) {
        return res.status(400).json({ error: 'No items in order' });
    }

    // Wrap in a simple transaction behavior (manual in pg-pool is a bit different, but using individual queries for now)
    try {
        // 1. Calculate total
        let total = 0;
        for (const item of items) {
            total += item.price * item.quantity;
        }
        total += delivery_fee;

        // 2. Create the order
        const orderResult = await db.query(
            'INSERT INTO orders (user_id, restaurant_id, total) VALUES ($1, $2, $3) RETURNING *',
            [userId, restaurant_id, total]
        );
        const orderId = orderResult.rows[0].id;

        // 3. Add order items in a single batch insert
        const orderItemValues = items
            .map((item, index) => {
                const base = index * 4;
                return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`;
            })
            .join(', ');
        const orderItemParams = items.flatMap((item) => [
            orderId,
            item.menu_item_id,
            item.quantity,
            item.price,
        ]);

        await db.query(
            `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price)
             VALUES ${orderItemValues}`,
            orderItemParams
        );

        // // Send confirmation email before responding
        // [PLANTED PROBLEM]: This will block for 300-800ms
        await emailService.sendConfirmation(orderId, req.user.email);

        res.status(201).json({
            message: 'Order created successfully!',
            order_id: orderId
        });

    } catch (err) {
        console.error('Error creating order:', err);
        res.status(500).json({ error: 'Failed to create order' });
    }
};

const getOrderById = async (req, res) => {
    const { id } = req.params;
    const userId = req.user.id;

    const result = await db.query(
        'SELECT * FROM orders WHERE id = $1 AND user_id = $2',
        [id, userId]
    );

    if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
    }

    res.json(result.rows[0]);
};

module.exports = {
    create: createOrder,
    getOrderHistory,
    createOrder,
    getOrderById
};
