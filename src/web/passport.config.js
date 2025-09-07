const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { getUserByGoogleId, getUserByEmail, createUser } = require('../db/user');

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: '/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let user = await getUserByGoogleId(profile.id);
    if (!user) {
      // Try to find by email
      const email = profile.emails && profile.emails[0] && profile.emails[0].value;
      user = await getUserByEmail(email);
      if (user && !user.google_id) {
        // Link Google ID
        await require('../db/postgressdb').queryDB('UPDATE users SET google_id = $1 WHERE id = $2', [profile.id, user.id]);
        user.google_id = profile.id;
      } else if (!user) {
        // Create new user
        user = await createUser({
          email,
          google_id: profile.id,
          name: profile.displayName
        });
      }
    }
    return done(null, user);
  } catch (e) {
    return done(e);
  }
}));

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await require('../db/user').getUserByEmail(id);
    done(null, user);
  } catch (e) {
    done(e);
  }
});
