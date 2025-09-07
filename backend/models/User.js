const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, required: true },
  password: { type: String }, // Not required for Google users
  googleId: { type: String },
  name: { type: String },
  createdAt: { type: Date, default: Date.now }
});

userSchema.pre('save', async function(next) {
  if (this.isModified('password') && this.password) {
    this.password = await bcrypt.hash(this.password, 10);
  }
  next();
});

userSchema.methods.comparePassword = function(candidate) {
  if (!this.password) return false;
  return bcrypt.compare(candidate, this.password);
};

module.exports = mongoose.model('User', userSchema);
