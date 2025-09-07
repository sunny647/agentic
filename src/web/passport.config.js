// passport.config.js
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const bcrypt = require('bcrypt');
const { findUserByEmail, findUserById, createOrUpdateGoogleUser } = require('../db/user');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await findUserById(id);
    done(null, user);
  } catch (err) {
    done(err);
  }
});

passport.use(new LocalStrategy({ usernameField: 'email' }, async (email, password, done) => {
  try {
    const user = await findUserByEmail(email);
    if (!user) return done(null, false, { message: 'Incorrect email or password.' });
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return done(null, false, { message: 'Incorrect email or password.' });
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const user = await createOrUpdateGoogleUser(profile, accessToken, refreshToken);
    return done(null, user);
  } catch (err) {
    return done(err);
  }
}));
