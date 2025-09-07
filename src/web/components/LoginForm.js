// LoginForm.js
import React, { useState } from 'react';

const LoginForm = ({ onLogin, loading, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');

  const validate = () => {
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setFormError('Please enter a valid email address.');
      return false;
    }
    if (!password || password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return false;
    }
    setFormError('');
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validate()) return;
    onLogin({ email, password });
  };

  const handleGoogleSignIn = () => {
    window.location.href = '/api/auth/google';
  };

  return (
    <div className="login-form-container">
      <form onSubmit={handleSubmit}>
        <h2>Login to SprintPilot</h2>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          disabled={loading}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          disabled={loading}
        />
        <button type="submit" disabled={loading}>Login</button>
        <button type="button" onClick={handleGoogleSignIn} disabled={loading} className="google-btn">
          Sign in with Google
        </button>
        {formError && <div className="error">{formError}</div>}
        {error && <div className="error">{error}</div>}
        {loading && <div className="loading">Logging in...</div>}
      </form>
    </div>
  );
};

export default LoginForm;
