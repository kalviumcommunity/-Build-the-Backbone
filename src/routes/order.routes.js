const express = require('express');

const authenticate = require('../middleware/auth.middleware');
const orderRateLimit = require('../middleware/rateLimiter.middleware');
const orderController = require('../controllers/order.controller');

const router = express.Router();

router.post('/orders', authenticate, orderRateLimit, orderController.create);
router.get('/orders/history', authenticate, orderController.getOrderHistory);
router.get('/orders/:id', authenticate, orderController.getOrderById);

module.exports = router;