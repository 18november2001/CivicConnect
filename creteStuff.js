const db = require('../config/Database');
 
let bcrypt;
try {
  bcrypt = require('bcryptjs');
} catch {
  try {
    bcrypt = require('bcrypt');
  } catch {
    bcrypt = null;
  }
}
 
async function createStaffUser() {
  try {
    let passwordHash;
 
    if (bcrypt) {
      passwordHash = await bcrypt.hash('Password123!', 10);
    } else {
      const existing = await db.query('SELECT password_hash FROM users LIMIT 1');
      if (existing.rows.length === 0) {
        throw new Error('No existing users found to copy password hash from.');
      }
      passwordHash = existing.rows[0].password_hash;
    }
 
    const email = 'staff@civicconnect.gov.za';
    const fullName = 'Municipal Staff';
    const role = 'Admin';
 
    const query = `
      INSERT INTO users (
        user_id,
        full_name,
        email,
        password_hash,
        role,
        created_at
      ) VALUES (
        gen_random_uuid(),
        $1,
        $2,
        $3,
        $4,
        NOW()
      )
      ON CONFLICT (email) 
      DO UPDATE SET 
        full_name = EXCLUDED.full_name,
        role = EXCLUDED.role,
        password_hash = EXCLUDED.password_hash
      RETURNING user_id, full_name, email, role;
    `;
 
    const result = await db.query(query, [fullName, email, passwordHash, role]);
    console.log('\n--- Staff Account Ready ---');
    console.log('Full Name:', result.rows[0].full_name);
    console.log('Email:    ', result.rows[0].email);
    console.log('Password: (Same as citizen password, or "Password123!")');
    console.log('Role:     ', result.rows[0].role);
    console.log('---------------------------\n');
 
    process.exit(0);
  } catch (err) {
    console.error('Error creating staff user:', err);
    process.exit(1);
  }
}
 
createStaffUser();
 