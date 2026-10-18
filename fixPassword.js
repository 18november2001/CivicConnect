'use strict';

const bcrypt = require('bcryptjs'); // or 'bcrypt'
const db = require('./src/config/database');

async function fix() {
  try {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash('password', salt);

    await db.query(
      `UPDATE users 
       SET password_hash = $1 
       WHERE email IN ('citizen@civicconnect.gov.za', 'admin@civicconnect.gov.za');`,
      [hash]
    );

    console.log('✓ Passwords updated with clean bcrypt hash!');
    process.exit(0);
  } catch (err) {
    console.error('Update failed:', err);
    process.exit(1);
  }
}

fix();