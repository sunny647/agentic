// user.js
const { queryDB } = require('./postgressdb');
const bcrypt = require('bcrypt');

async function findUserByEmail(email) {
  const res = await queryDB('SELECT * FROM users WHERE email = $1', [email]);
  return res.rows[0] || null;
}

async function findUserById(id) {
  const res = await queryDB('SELECT * FROM users WHERE id = $1', [id]);
  return res.rows[0] || null;
}

async function createUser({ email, password }) {
  const password_hash = await bcrypt.hash(password, 10);
  const res = await queryDB(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
    [email, password_hash]
  );
  return res.rows[0];
}

async function createOrUpdateGoogleUser(profile, accessToken, refreshToken) {
  const email = profile.emails[0].value;
  let user = await findUserByEmail(email);
  if (user) {
    await queryDB(
      'UPDATE users SET google_id = $1, google_access_token = $2, google_refresh_token = $3 WHERE id = $4',
      [profile.id, accessToken, refreshToken, user.id]
    );
    user = await findUserById(user.id);
    return user;
  } else {
    const res = await queryDB(
      'INSERT INTO users (email, google_id, google_access_token, google_refresh_token) VALUES ($1, $2, $3, $4) RETURNING *',
      [email, profile.id, accessToken, refreshToken]
    );
    return res.rows[0];
  }
}

module.exports = {
  findUserByEmail,
  findUserById,
  createUser,
  createOrUpdateGoogleUser
};
