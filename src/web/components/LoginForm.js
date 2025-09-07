import React, { useState } from 'react';

const LoginForm = ({ onLogin, onGoogleLogin, error }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState(null);

  const validate = () => {
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      setFormError('Please enter a valid email address.');
      return false;
    }
    if (!password || password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return false;
    }
    setFormError(null);
    return true;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) {
      onLogin(email, password);
    }
  };

  return (
    <div className="login-form-container">
      <form onSubmit={handleSubmit}>
        <h2>Login</h2>
        <div>
          <label>Email:</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label>Password:</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
        </div>
        {(formError || error) && (
          <div className="error-message">{formError || error}</div>
        )}
        <button type="submit">Login</button>
      </form>
      <div className="divider">or</div>
      <button className="google-login-btn" onClick={onGoogleLogin}>
        <img src="/google_logo.png" alt="Google" style={{width:20, marginRight:8}} />
        Sign in with Google
      </button>
    </div>
  );
};

export default LoginForm;
