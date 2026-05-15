const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Will be injected after app initialization
let queryCountStorage = null;

function setQueryCountStorage(storage) {
  queryCountStorage = storage;
}

module.exports = {
  /**
   * Execute a SQL query.
   * Logs duration and query text if LOG_QUERIES is set.
   * Increments req._queryCount if within request context.
   */
  async query(text, params) {
    const start = Date.now();
    try {
      const res = await pool.query(text, params);
      const duration = Date.now() - start;
      
      // Increment query count if in request context
      if (queryCountStorage) {
        const req = queryCountStorage.getStore();
        if (req && typeof req._queryCount === 'number') {
          req._queryCount++;
        }
      }
      
      if (process.env.LOG_QUERIES === 'true') {
        console.log('[DB Query]', {
          text: text.replace(/\s+/g, ' ').trim().substring(0, 80),
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
  setQueryCountStorage
};
