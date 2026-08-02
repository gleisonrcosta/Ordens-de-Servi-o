const bcrypt = require('bcryptjs');
const db = require('../db');

async function findUserByPhone(phone) {
  const [rows] = await db.execute('SELECT * FROM users WHERE phone = ? AND active = 1', [phone]);
  return rows[0] || null;
}

async function verifyPassword(user, password) {
  return bcrypt.compare(password, user.password_hash);
}

async function createUser({ name, phone, password, role = 'user' }) {
  const passwordHash = await bcrypt.hash(password, 10);
  const [result] = await db.execute(
    'INSERT INTO users (name, phone, password_hash, role) VALUES (?, ?, ?, ?)',
    [name, phone, passwordHash, role]
  );
  return result.insertId;
}

async function getUsers() {
  const [rows] = await db.execute(
    `SELECT id, name, phone, role, active, created_at, updated_at
     FROM users
     ORDER BY created_at DESC`
  );
  return rows;
}

async function getUserById(id) {
  const [rows] = await db.execute(
    `SELECT id, name, phone, role, active, created_at, updated_at
     FROM users
     WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function updateUser(id, { name, phone, password, role, active }) {
  const fields = ['name = ?', 'phone = ?', 'role = ?', 'active = ?'];
  const params = [name, phone, role, active ? 1 : 0];

  if (password) {
    const passwordHash = await bcrypt.hash(password, 10);
    fields.splice(2, 0, 'password_hash = ?');
    params.splice(2, 0, passwordHash);
  }

  params.push(id);
  await db.execute(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, params);
}

async function countActiveAdmins() {
  const [rows] = await db.execute(
    `SELECT COUNT(*) AS count
     FROM users
     WHERE role = 'admin' AND active = 1`
  );
  return Number(rows[0]?.count || 0);
}

async function deleteUser(id) {
  await db.execute('DELETE FROM users WHERE id = ?', [id]);
}

module.exports = {
  findUserByPhone,
  verifyPassword,
  createUser,
  getUsers,
  getUserById,
  updateUser,
  countActiveAdmins,
  deleteUser
};
