const { queryDB } = require('./postgressdb');
const bcrypt = require('bcrypt');

async function getUserByEmail(email) {
  const res = await queryDB('SELECT * FROM users WHERE email = $1', [email]);
  return res.rows[0];
}

async function createUser({ email, password, google_id, name }) {
  let password_hash = null;
  if (password) {
    password_hash = await bcrypt.hash(password, 10);
  }
  const res = await queryDB(
    'INSERT INTO users (email, password_hash, google_id, name) VALUES ($1, $2, $3, $4) RETURNING *',
    [email, password_hash, google_id || null, name || null]
  );
  return res.rows[0];
}

async function getUserByGoogleId(google_id) {
  const res = await queryDB('SELECT * FROM users WHERE google_id = $1', [google_id]);
  return res.rows[0];
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

module.exports = {
  getUserByEmail,
  createUser,
  getUserByGoogleId,
  verifyPassword
};
