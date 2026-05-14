#!/usr/bin/env node
/**
 * EXPLAIN ANALYZE runner for performance profiling
 * Runs slow queries with EXPLAIN to identify missing indexes
 */

const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Queries to analyze
const queries = [
  {
    name: 'orders WHERE user_id = X (order history)',
    sql: 'EXPLAIN ANALYZE SELECT * FROM orders WHERE user_id = 1 ORDER BY created_at DESC LIMIT 20;'
  },
  {
    name: 'order_items WHERE order_id = X (single order)',
    sql: 'EXPLAIN ANALYZE SELECT * FROM order_items WHERE order_id = 1;'
  },
  {
    name: 'menu_items WHERE restaurant_id = X (menu fetch)',
    sql: 'EXPLAIN ANALYZE SELECT * FROM menu_items WHERE restaurant_id = 1;'
  },
  {
    name: 'categories WHERE id = X (category lookup)',
    sql: 'EXPLAIN ANALYZE SELECT * FROM categories WHERE id = 1;'
  },
  {
    name: 'restaurants with optional filter (list)',
    sql: 'EXPLAIN ANALYZE SELECT * FROM restaurants LIMIT 20;'
  }
];

async function runExplainAnalyze() {
  try {
    console.log('Running EXPLAIN ANALYZE on slow queries...\n');
    
    for (const query of queries) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`Query: ${query.name}`);
      console.log(`${'='.repeat(70)}`);
      
      const result = await pool.query(query.sql);
      
      // Print the plan
      result.rows.forEach(row => {
        console.log(row['QUERY PLAN']);
      });
    }
    
    await pool.end();
    console.log('\n✅ EXPLAIN ANALYZE complete. Copy the output above into PROFILING.md');
  } catch (err) {
    console.error('Error running EXPLAIN ANALYZE:', err);
    process.exit(1);
  }
}

runExplainAnalyze();
