import React, { useState } from 'react';
import LoginForm from '../components/LoginForm';

const LoginPage = () => {
  const [error, setError] = useState(null);

  const handleLogin = async (email, password) => {
    setError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok && data.token) {
        localStorage.setItem('token', data.token);
        window.location.href = '/';
      } else {
        setError(data.error || 'Login failed.');
      }
    } catch (e) {
      setError('Login failed.');
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = '/api/auth/google';
  };

  return (
    <div className="login-page">
      <LoginForm onLogin={handleLogin} onGoogleLogin={handleGoogleLogin} error={error} />
    </div>
  );
};

export default LoginPage;
