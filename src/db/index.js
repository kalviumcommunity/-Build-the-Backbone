const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

let getAppInstance = null;

module.exports = {
  /**
   * Execute a SQL query.
   * Logs duration and query text if LOG_QUERIES is set.
   */
  async query(text, params) {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      
      // Increment query count on current request if available
      if (getAppInstance) {
        try {
          const app = getAppInstance();
          if (app && typeof app.getCurrentRequest === 'function') {
            const req = app.getCurrentRequest();
            if (req && req._queryCount !== undefined) {
              req._queryCount++;
            }
          }
        } catch (e) {
          // Silently ignore if app/request not available
        }
      }
      
      if (process.env.LOG_QUERIES === 'true') {
        console.log('[DB Query]', {
          text: text.replace(/\s+/g, ' ').trim(),
          duration: `${duration}ms`,
          rows: res.rowCount,
        });
      }
      
      return res;
    } catch (err) {
      console.error('[DB Error]', err.stack);
      throw err;
    }
  },
  
  // Expose pool for transactions or advanced usage
  pool,
  
  // Set app instance getter for query tracking
  setAppGetter(getter) {
    getAppInstance = getter;
  }
};
