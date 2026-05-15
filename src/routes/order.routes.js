const express = require('express')

const authenticate = require('../middleware/auth.middleware')
const rateLimiter = require('../middleware/rateLimiter.middleware')
const orderController = require('../controllers/order.controller')

const router = express.Router()

const orderRateLimit = rateLimiter({
  maxRequests: 10,
  windowMs: 60 * 1000,
  keyFn: (req) => `user:${req.user.id}:orders`
})

router.post('/orders', authenticate, orderRateLimit, orderController.createOrder)
router.get('/orders/history', authenticate, orderController.getOrderHistory)
router.get('/orders/:id', authenticate, orderController.getOrderById)

module.exports = router