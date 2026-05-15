#!/usr/bin/env node
/**
 * Seed runner using node-postgres (pg) client
 * Loads initial data into the database
 */

require('dotenv').config()
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function runSeed() {
  const client = await pool.connect()

  try {
    console.log('🌱 Starting database seed...\n')

    const seedFile = path.join(__dirname, 'migrations', '002_seed_data.sql')
    if (!fs.existsSync(seedFile)) {
      throw new Error('Seed file not found: migrations/002_seed_data.sql')
    }
    const sql = fs.readFileSync(seedFile, 'utf-8')

    console.log('⏳ Inserting test data (1,000 users, 100 restaurants, 5,000+ orders)...')
    await client.query(sql)
    console.log('✅ Seed data inserted successfully\n')

    // Verify data was inserted
    const userCount = await client.query('SELECT COUNT(*) FROM users')
    const restaurantCount = await client.query('SELECT COUNT(*) FROM restaurants')
    const orderCount = await client.query('SELECT COUNT(*) FROM orders')

    console.log('📊 Database Stats:')
    console.log(`   Users: ${userCount.rows[0].count}`)
    console.log(`   Restaurants: ${restaurantCount.rows[0].count}`)
    console.log(`   Orders: ${orderCount.rows[0].count}`)
    console.log('\n✨ Seed completed successfully!')

    process.exit(0)
  } catch (err) {
    console.error('Seed failed:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runSeed()
