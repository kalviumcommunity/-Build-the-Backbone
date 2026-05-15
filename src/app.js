const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const { AsyncLocalStorage } = require('async_hooks');
require('express-async-errors');

const authController = require('./controllers/auth.controller');
const restaurantController = require('./controllers/restaurant.controller');
const orderController = require('./controllers/order.controller');
const authMiddleware = require('./middleware/auth.middleware');

// Query counting context
const queryCountStorage = new AsyncLocalStorage();

const app = express();

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan('dev'));

// Query Count Middleware (Step 3: Performance Profiling)
app.use((req, res, next) => {
  req._queryCount = 0;
  
  res.on('finish', () => {
    if (req._queryCount > 0) {
      console.log(
        `[QUERY COUNT] ${req.method} ${req.path} → ${req._queryCount} queries`
      );
    }
  });
  
  // Run rest of request within async context so db.js can access req
  return queryCountStorage.run(req, next);
});

// Public Routes
app.get('/api/health', restaurantController.getHealth);
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
app.get('/api/restaurants', restaurantController.getRestaurants);
app.post('/api/restaurants', restaurantController.createRestaurant);
app.get('/api/restaurants/:id/menu', restaurantController.getMenu);
app.put('/api/restaurants/:id', restaurantController.updateRestaurant);
app.delete('/api/restaurants/:id', restaurantController.deleteRestaurant);

// Authenticated Routes
app.use('/api/orders', authMiddleware);
app.post('/api/orders', orderController.createOrder);
app.get('/api/orders/history', orderController.getOrderHistory);
app.get('/api/orders/:id', orderController.getOrderById);

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('[Global Error]', err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
module.exports.queryCountStorage = queryCountStorage;
