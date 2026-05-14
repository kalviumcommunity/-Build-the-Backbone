const db = require('./src/db');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  try {
    const migrationFile = path.join(__dirname, 'migrations', '003_add_performance_indexes.sql');
    const sql = fs.readFileSync(migrationFile, 'utf-8');
    
    // Split by semicolon to handle multiple statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));
      // Remove comment lines from each statement
      const cleanStatements = statements.map(stmt => {
        return stmt
          .split('\n')
          .filter(line => !line.trim().startsWith('--'))
          .join('\n')
          .trim();
      }).filter(s => s);
      // Alternative: Extract lines that contain CREATE INDEX
      const statements = sql
        .split(';')
        .map(s => {
          // Keep only lines that have actual SQL (not just comments)
          return s
            .split('\n')
            .filter(line => {
              const trimmed = line.trim();
              return trimmed && !trimmed.startsWith('--');
            })
            .join('\n')
            .trim();
        })
        .filter(s => s.length > 0);
      console.log(`\n🔧 Running migration: 003_add_performance_indexes.sql`);
      console.log(`📋 Found ${statements.length} index creation statements\n`);
    
      for (const statement of statements) {
      try {
        console.log(`Executing: ${statement.substring(0, 60)}...`);
        await db.query(statement);
        console.log(`✅ Index created successfully\n`);
      } catch (err) {
        console.error(`❌ Error: ${err.message}\n`);
      }
    }
      const finalStatements = sql
        .split(';')
        .map(s => {
          return s
            .split('\n')
            .filter(line => {
              const trimmed = line.trim();
              return trimmed && !trimmed.startsWith('--');
            })
            .join('\n')
            .trim();
        })
        .filter(s => s.length > 0);
    
      console.log(`\n🔧 Running migration: 003_add_performance_indexes.sql`);
      console.log(`📋 Found ${finalStatements.length} index creation statements\n`);
    
      for (const statement of finalStatements) {
        try {
          console.log(`Executing: ${statement.substring(0, 60)}...`);
          await db.query(statement);
          console.log(`✅ Index created successfully\n`);
        } catch (err) {
          console.error(`❌ Error: ${err.message}\n`);
        }
      }
    
      console.log('✨ Migration complete!');
      process.exit(0);
    } catch (err) {
      console.error('Migration failed:', err.message);
      process.exit(1);
    }
  }

runMigration();
