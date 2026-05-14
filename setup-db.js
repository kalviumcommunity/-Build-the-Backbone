#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

async function runMigrations() {
  let pool;
  try {
    console.log('📦 Starting database setup...');
    
    // Try multiple connection strategies
    const connectionConfigs = [
      { host: 'localhost', port: 5432, user: 'postgres', password: 'postgres', database: 'postgres' },
      { host: '127.0.0.1', port: 5432, user: 'postgres', password: '', database: 'postgres' },
      { host: 'localhost', port: 5432, user: process.env.USERNAME || 'postgres', password: '', database: 'postgres' },
    ];

    let maintenancePool;
    let connected = false;

    for (const config of connectionConfigs) {
      try {
        console.log(`🔗 Trying connection as ${config.user}@${config.host}...`);
        maintenancePool = new Pool(config);
        await maintenancePool.query('SELECT NOW()');
        console.log(`✅ Connected as ${config.user}`);
        connected = true;
        break;
      } catch (err) {
        console.log(`❌ Failed:  ${err.message}`);
        if (maintenancePool) await maintenancePool.end();
      }
    }

    if (!connected) {
      throw new Error('Could not connect to PostgreSQL with any configuration. Please ensure PostgreSQL is running and update .env with correct credentials.');
    }

    // Try to create database if it doesn't exist
    try {
      console.log('📚 Creating/checking quickbite database...');
      await maintenancePool.query('CREATE DATABASE quickbite');
      console.log('✅ Database created');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('✅ Database quickbite already exists');
      } else {
        console.log('⚠️  Warning:', err.message);
      }
    }

    await maintenancePool.end();

    // Connect to quickbite database
    const dbConfigs = [
      { host: 'localhost', port: 5432, user: 'postgres', password: 'postgres', database: 'quickbite' },
      { host: '127.0.0.1', port: 5432, user: 'postgres', password: '', database: 'quickbite' },
    ];

    for (const config of dbConfigs) {
      try {
        console.log(`\n🔗 Connecting to quickbite database as ${config.user}...`);
        pool = new Pool(config);
        await pool.query('SELECT NOW()');
        console.log('✅ Connected to quickbite');
        break;
      } catch (err) {
        if (pool) await pool.end();
        pool = null;
      }
    }

    if (!pool) {
      throw new Error('Could not connect to quickbite database');
    }

    // Read and execute migration files
    const migrationFiles = [
      'migrations/001_create_tables.sql',
      'migrations/002_seed_data.sql',
    ];

    for (const migrationFile of migrationFiles) {
      const filePath = path.join(__dirname, migrationFile);
      if (!fs.existsSync(filePath)) {
        console.log(`⚠️  Skipping ${migrationFile} - file not found`);
        continue;
      }
      
      const sql = fs.readFileSync(filePath, 'utf-8');
      
      console.log(`\n⚙️  Running ${migrationFile}...`);
      await pool.query(sql);
      console.log(`✅ Completed ${migrationFile}`);
    }

    console.log('\n✨ Database setup complete!');
    console.log('📊 Schema and seed data ready for performance testing');
    
  } catch (err) {
    console.error('\n❌ Database setup failed:', err.message);
    console.log('\n📝 Troubleshooting:');
    console.log('   1. Ensure PostgreSQL is running');
    console.log('   2. Check your PostgreSQL password');
    console.log('   3. Update DATABASE_URL in .env:');
    console.log('      DATABASE_URL=postgres://user:password@localhost:5432/quickbite');
    console.log('\n   Or try this command:');
    console.log('      psql -U postgres -c "ALTER ROLE postgres WITH PASSWORD \'postgres\';"');
    process.exit(1);
  } finally {
    if (pool) {
      await pool.end();
    }
  }
}

runMigrations();
