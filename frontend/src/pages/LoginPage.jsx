import React, { useState } from 'react';
import { loginWithEmail, loginWithGoogle } from '../services/authService';
import './LoginPage.css';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginWithEmail(email, password);
      // Redirect or show success
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
      // Redirect or show success
      window.location.href = '/dashboard';
    } catch (err) {
      setError(err.message || 'Google login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <form className="login-form" onSubmit={handleEmailLogin}>
        <h2>Sign in to Sprint Pilot</h2>
        {error && <div className="login-error">{error}</div>}
        <label htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoComplete="username"
        />
        <label htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          autoComplete="current-password"
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
        <div className="login-divider">or</div>
        <button
          type="button"
          className="google-login-btn"
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          {loading ? 'Signing in...' : 'Sign in with Google'}
        </button>
      </form>
    </div>
  );
};

export default LoginPage;
