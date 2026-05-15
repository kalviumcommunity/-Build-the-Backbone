require('dotenv').config();

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const fs = require('fs');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const lines = fs
    .readFileSync('users.csv', 'utf8')
    .trim()
    .split(/\r?\n/)
    .slice(1);

  const hash = await bcrypt.hash('password123', 12);

  for (const line of lines) {
    const [email] = line.split(',');
    const found = await pool.query('SELECT id FROM users WHERE email = $1', [email]);

    if (found.rowCount > 0) {
      await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hash, email]);
    } else {
      await pool.query(
        'INSERT INTO users (name, email, password, phone) VALUES ($1, $2, $3, $4)',
        [email.split('@')[0], email, hash, null]
      );
    }
  }

  await pool.end();
  console.log('users.csv credentials synced');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
