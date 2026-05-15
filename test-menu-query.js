const db = require('./src/db');

(async () => {
  try {
    const result = await db.query(`
      SELECT
          mi.id,
          mi.name,
          mi.description,
          mi.price,
          mi.category_id,
          mi.restaurant_id,
          c.id AS category_id_full,
          c.name AS category_name,
          c.restaurant_id AS category_restaurant_id
      FROM menu_items mi
      LEFT JOIN categories c ON c.id = mi.category_id
      WHERE mi.restaurant_id = $1
      ORDER BY mi.id
    `, [1]);
    console.log('✅ Query succeeded, rows:', result.rowCount);
    if (result.rows.length > 0) console.log('Sample row:', result.rows[0]);
  } catch(e) {
    console.error('❌ Error:', e.message);
  }
  process.exit(0);
})();
