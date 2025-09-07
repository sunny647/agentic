// login.jsx
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import LoginForm from './components/LoginForm';

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async ({ email, password }) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (res.ok) {
        window.location.href = '/';
      } else {
        setError(data.error || 'Login failed.');
      }
    } catch (err) {
      setError('Network error.');
    } finally {
      setLoading(false);
    }
  };

  return <LoginForm onLogin={handleLogin} loading={loading} error={error} />;
};

const root = createRoot(document.getElementById('root'));
root.render(<LoginPage />);
