'use strict';

const { AsyncLocalStorage } = require('async_hooks');

const ENABLED = process.env.LOG_QUERIES === 'true';
const als = new AsyncLocalStorage();

/**
 * Static method for other modules (like db/index.js) to increment the count
 * in the current request context.
 */
const increment = () => {
  if (!ENABLED) return;
  const store = als.getStore();
  if (store) store.count += 1;
};

/**
 * Middleware: attach
 * 
 * Provides an isolated context for each request using AsyncLocalStorage.
 * Stores the start time and a query counter.
 */
const attach = (req, res, next) => {
  if (!ENABLED) return next();

  const store = {
    count: 0,
    start: Date.now(),
    url: `${req.method} ${req.originalUrl}`
  };

  // Run the rest of the request within this context
  als.run(store, () => {
    // Store reference in res.locals just in case a manual check is needed
    res.locals.__queryStore = store;
    next();
  });
};

/**
 * Middleware: report
 * 
 * Hooks into the 'finish' event to log metrics for the query.
 * Must be mounted at the end of the middleware chain (or after routes).
 */
const report = (req, res, next) => {
  if (!ENABLED) return next();

  res.on('finish', () => {
    const store = res.locals.__queryStore;
    if (!store) return;

    const elapsed = Date.now() - store.start;
    const count   = store.count;
    const label   = count === 1 ? 'query' : 'queries';

    // Colour-code by severity to make regressions obvious in terminal.
    const colour =
      count === 0 ? '\x1b[90m'    // grey  — no queries
      : count <= 3 ? '\x1b[32m'   // green — healthy (O(log N) indexed)
      : count <= 10 ? '\x1b[33m'  // amber — watch this
      : '\x1b[31m';               // red   — N+1 suspect

    console.log(
      `${colour}[QueryCount] ${store.url} → ${count} ${label} in ${elapsed}ms\x1b[0m`,
    );
  });

  next();
};

module.exports = { attach, report, increment, ENABLED };
