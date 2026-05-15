const { AsyncLocalStorage } = require('async_hooks');

const requestContextStorage = new AsyncLocalStorage();

/**
 * Middleware to set up request context for query counting.
 * Use this middleware early in the Express app initialization.
 */
const requestContextMiddleware = (req, res, next) => {
  const context = {
    queryCount: 0,
    startTime: Date.now()
  };
  
  requestContextStorage.run(context, () => {
    res.on('finish', () => {
      if (context.queryCount > 5) {
        const duration = Date.now() - context.startTime;
        console.warn(
          `[QUERY COUNT] ${req.method} ${req.path} → ${context.queryCount} DB queries (${duration}ms total)`
        );
      }
    });
    next();
  });
};

/**
 * Get the current request context (for query counting, etc.)
 */
const getRequestContext = () => {
  return requestContextStorage.getStore();
};

/**
 * Increment the query count in the current request context
 */
const incrementQueryCount = () => {
  const context = getRequestContext();
  if (context) {
    context.queryCount++;
  }
};

module.exports = {
  requestContextMiddleware,
  getRequestContext,
  incrementQueryCount
};
