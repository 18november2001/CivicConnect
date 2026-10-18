const db = require('./src/config/database');
 
async function inspectSchema() {
  try {
    // 1. List all public tables
    const tables = await db.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('Tables:', tables.rows.map(r => r.table_name));
 
    // 2. List columns for any table with 'request' or 'service' in its name
    const columns = await db.query(`
      SELECT table_name, column_name, ordinal_position, data_type 
      FROM information_schema.columns 
      WHERE table_schema = 'public' 
        AND (table_name ILIKE '%request%' OR table_name ILIKE '%service%')
      ORDER BY table_name, ordinal_position;
    `);
    console.table(columns.rows);
 
    process.exit(0);
  } catch (err) {
    console.error('Error reading schema:', err);
    process.exit(1);
  }
}
 
inspectSchema();
 
