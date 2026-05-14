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

    // Query 1: Get all orders for this user
    const ordersResult = await db.query(
        'SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
    );
    const orders = ordersResult.rows;

    // // Get full order details for each order (N+1 query pattern)
    // For each order, we fetch the items, then for each item, the menu item details.
    const fullOrders = [];
    
    for (const order of orders) {
        // Query 1+N: Get items for this order
        const itemsResult = await db.query(
            'SELECT * FROM order_items WHERE order_id = $1',
            [order.id]
        );
        const items = itemsResult.rows;
        
        const detailedItems = [];
        for (const item of items) {
            // Query 1+N+M: Get menu details for this item
            const menuResult = await db.query(
                'SELECT * FROM menu_items WHERE id = $1',
                [item.menu_item_id]
            );
            detailedItems.push({
                ...item,
                menu_item: menuResult.rows[0]
            });
        }
        
        fullOrders.push({
            ...order,
            items: detailedItems
        });
    }

    res.json({
        user_id: userId,
        total_orders: orders.length,
        orders: fullOrders
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
            'INSERT INTO orders (user_id, restaurant_id, total, status) VALUES ($1, $2, $3, $4) RETURNING *',
            [userId, restaurant_id, total, 'pending']
        );
        const orderId = orderResult.rows[0].id;

        // 3. Add order items
        for (const item of items) {
            await db.query(
                'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES ($1, $2, $3, $4)',
                [orderId, item.menu_item_id, item.quantity, item.price]
            );
        }

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
    getOrderHistory,
    createOrder,
    getOrderById
};
