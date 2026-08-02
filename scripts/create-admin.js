const bcrypt = require('bcryptjs');
const db = require('../src/db');

async function main() {
  const name = process.env.ADMIN_NAME || 'Administrador';
  const phone = process.env.ADMIN_PHONE || '11999999999';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const passwordHash = await bcrypt.hash(password, 10);

  await db.execute(
    `INSERT INTO users (name, phone, password_hash, role)
     VALUES (?, ?, ?, 'admin')
     ON DUPLICATE KEY UPDATE
       name = VALUES(name),
       password_hash = VALUES(password_hash),
       role = 'admin',
       active = 1`,
    [name, phone, passwordHash]
  );

  console.log(`Admin criado/atualizado: ${name} (${phone})`);
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
