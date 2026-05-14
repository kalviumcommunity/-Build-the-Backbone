const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = {
  /**
   * Execute a SQL query.
   * Logs duration and query text if LOG_QUERIES is set.
   * Increments request query counter if available.
   */
  async query(text, params) {
    const start = Date.now();
    try {
      // Increment query counter on current request if available
      if (global._currentRequest && global._currentRequest._queryCount !== undefined) {
        global._currentRequest._queryCount++;
      }

      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      
      if (process.env.LOG_QUERIES === 'true') {
        console.log('[DB Query]', {
          text: text.replace(/\s+/g, ' ').trim().substring(0, 80) + (text.length > 80 ? '...' : ''),
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
  pool
};
