/**
 * Query Counter Middleware
 * 
 * Tracks the number of database queries executed per request.
 * Logs warnings when a request exceeds the threshold (default: 10 queries).
 */

const queryCountMiddleware = (req, res, next) => {
  // Initialize query counter on request object
  req._queryCount = 0;

  // Listen for response finish to log stats
  res.on('finish', () => {
    if (req._queryCount > 10) {
      console.warn(
        `[SLOW] ${req.method} ${req.path} made ${req._queryCount} DB queries`
      );
    }
  });

  next();
};

module.exports = queryCountMiddleware;
