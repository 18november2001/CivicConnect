'use strict';

const fs = require('fs');
const path = require('path');
const pool = require('./src/config/database');

async function executeSchema() {
  const schemaPath = path.join(__dirname, 'database', 'schema.sql');
  console.log(`Reading schema from: ${schemaPath}...`);

  try {
    const sql = fs.readFileSync(schemaPath, 'utf8');
    console.log('Applying schema to PostgreSQL database...');
    
    await pool.query(sql);
    
    console.log('✓ Database schema successfully executed and tables created!');
  } catch (err) {
    console.error('Failed to execute schema:', err.message);
  } finally {
    await pool.end();
  }
}

executeSchema();