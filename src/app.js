const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
require('express-async-errors');

const authController = require('./controllers/auth.controller');
const restaurantController = require('./controllers/restaurant.controller');
const orderRoutes = require('./routes/order.routes');
const db = require('./db');

const app = express();

// Store current request in async context
let currentRequest = null;

// Middleware
app.use(express.json());
app.use(cors());
app.use(morgan('dev'));

// Query counting middleware
app.use((req, res, next) => {
  req._queryCount = 0;
  currentRequest = req;
  
  res.on('finish', () => {
    if (req._queryCount > 5) {
      console.log(
        `[QUERY COUNT] ${req.method} ${req.path} → ${req._queryCount} queries`
      );
    }
    currentRequest = null;
  });
  
  next();
});

// Export for db to use
app.getCurrentRequest = () => currentRequest;

// Register app getter with db for query tracking
db.setAppGetter(() => app);

// Public Routes
app.get('/api/health', restaurantController.getHealth);
app.post('/api/auth/register', authController.register);
app.post('/api/auth/login', authController.login);
app.get('/api/restaurants', restaurantController.listRestaurants);
app.get('/api/restaurants/:id/menu', restaurantController.getMenu);

// Authenticated Routes
app.use('/api', orderRoutes);

// Error Handling Middleware
app.use((err, req, res, next) => {
    console.error('[Global Error]', err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
