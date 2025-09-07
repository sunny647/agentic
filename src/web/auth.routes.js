// auth.routes.js
const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { queryDB } = require('../db/postgressdb');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = new OAuth2Client(GOOGLE_CLIENT_ID);

// Helper: create JWT
function createToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '7d' });
}

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Missing email or password.' });
  try {
    const userRows = await queryDB('SELECT * FROM users WHERE email = $1', [email]);
    if (!userRows[0]) return res.status(401).json({ error: 'Invalid credentials.' });
    const user = userRows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials.' });
    const token = createToken(user);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Server error.' });
  }
});

// GET /api/auth/google
router.get('/google', (req, res) => {
  const redirectUri = encodeURIComponent(process.env.GOOGLE_REDIRECT_URI);
  const scope = encodeURIComponent('openid email profile');
  const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${redirectUri}&response_type=code&scope=${scope}`;
  res.redirect(url);
});

// GET /api/auth/google/callback
router.get('/google/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');
  try {
    const { tokens } = await client.getToken({ code, redirect_uri: process.env.GOOGLE_REDIRECT_URI });
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    const email = payload.email;
    // Upsert user
    let userRows = await queryDB('SELECT * FROM users WHERE email = $1', [email]);
    let user;
    if (!userRows[0]) {
      const insert = await queryDB('INSERT INTO users (email, google_id, name) VALUES ($1, $2, $3) RETURNING *', [email, payload.sub, payload.name]);
      user = insert[0];
    } else {
      user = userRows[0];
    }
    const token = createToken(user);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax' });
    res.redirect('/');
  } catch (err) {
    res.status(500).send('Google authentication failed.');
  }
});

// GET /api/auth/logout
router.get('/logout', (req, res) => {
  res.clearCookie('token');
  res.redirect('/login');
});

// GET /api/auth/me
router.get('/me', async (req, res) => {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const userRows = await queryDB('SELECT id, email, name FROM users WHERE id = $1', [decoded.id]);
    if (!userRows[0]) return res.status(404).json({ error: 'User not found.' });
    res.json({ user: userRows[0] });
  } catch (err) {
    res.status(401).json({ error: 'Invalid token.' });
  }
});

module.exports = router;
