const db = require('../db');
const emailQueue = require('../queues/email.queue');

/**
 * Get Order History for the authenticated user.
 * 
 * FIXED: This function now uses a single JOIN query with json_agg
 * instead of the N+1 pattern. This reduces 1 + N + N*M queries
 * down to a single query, regardless of order count.
 */
const getOrderHistory = async (req, res) => {
    const userId = req.user.id;
    const limit = parseInt(req.query.limit) || 20;
    const offset = parseInt(req.query.offset) || 0;

    console.log(`[Order Controller] Fetching history for User #${userId}`);

    // Single query with json_agg aggregation
    // This combines orders, order_items, and menu_items into nested JSON
    // in a single database round-trip.
    const result = await db.query(`
        SELECT
            o.id,
            o.restaurant_id,
            o.total,
            o.status,
            o.created_at,
            json_agg(
                json_build_object(
                    'id', oi.id,
                    'menuItemId', oi.menu_item_id,
                    'quantity', oi.quantity,
                    'unitPrice', oi.unit_price,
                    'subtotal', (oi.unit_price * oi.quantity),
                    'menuItem', json_build_object(
                        'id', mi.id,
                        'name', mi.name,
                        'description', mi.description,
                        'price', mi.price
                    )
                )
            ) AS items
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        LEFT JOIN menu_items mi ON mi.id = oi.menu_item_id
        WHERE o.user_id = $1
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT $2 OFFSET $3
    `, [userId, limit, offset]);

    const orders = result.rows;

    res.json({
        user_id: userId,
        total_orders: orders.length,
        orders: orders
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
            'INSERT INTO orders (user_id, restaurant_id, total_amount, delivery_fee) VALUES ($1, $2, $3, $4) RETURNING *',
            [userId, restaurant_id, total, delivery_fee]
        );
        const orderId = orderResult.rows[0].id;

        // 3. Add order items
        for (const item of items) {
            await db.query(
                'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal) VALUES ($1, $2, $3, $4, $5)',
                [orderId, item.menu_item_id, item.quantity, item.price, item.price * item.quantity]
            );
        }

        try {
            await emailQueue.add('send-confirmation', {
                orderId,
                userEmail: req.user.email,
                orderData: {
                    id: orderId,
                    restaurant_id,
                    total,
                    delivery_fee
                }
            });
        } catch (queueErr) {
            console.error('[Order Controller] Failed to enqueue confirmation email:', queueErr.message);
        }

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
    getOrderHistory,
    createOrder,
    getOrderById
};
