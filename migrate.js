#!/usr/bin/env node
/**
 * Migration runner using node-postgres (pg) client
 * Allows running migrations without psql CLI installed
 */

require('dotenv').config()
const { Pool } = require('pg')
const fs = require('fs')
const path = require('path')

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

async function runMigrations() {
  const client = await pool.connect()

  try {
    const migrationDir = path.join(__dirname, 'migrations')
    const migrationFile = process.argv[2] || '001_create_tables.sql'
    const filePath = path.join(migrationDir, migrationFile)

    console.log('🚀 Starting database migrations...\n')

    if (!fs.existsSync(filePath)) {
      throw new Error(`Migration file not found: ${migrationFile}`)
    }

    const sql = fs.readFileSync(filePath, 'utf-8')

    console.log(`⏳ Running migration: ${migrationFile}`)
    try {
      await client.query(sql)
      console.log(`✅ ${migrationFile} completed\n`)
    } catch (err) {
      console.error(`❌ Error in ${migrationFile}:`, err.message)
      throw err
    }

    console.log('✨ Migration completed successfully!')
    process.exit(0)
  } catch (err) {
    console.error('Migration failed:', err)
    process.exit(1)
  } finally {
    await client.end()
  }
}

runMigrations()
