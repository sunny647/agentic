// Login form logic
const loginForm = document.getElementById('loginForm');
const loginResult = document.getElementById('loginResult');

loginForm.addEventListener('submit', async function(e) {
  e.preventDefault();
  loginResult.style.display = 'block';
  loginResult.innerHTML = '<div class="spinner" role="status" aria-live="polite" aria-label="Loading"></div>';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  // Basic input validation
  if (!email || !password) {
    loginResult.innerHTML = '<div class="error-message">Email and password are required.</div>';
    return;
  }
  // Email format validation
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    loginResult.innerHTML = '<div class="error-message">Please enter a valid email address.</div>';
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      loginResult.innerHTML = '<div class="success-message">Login successful! Redirecting...</div>';
      setTimeout(() => {
        window.location.href = '/';
      }, 1200);
    } else {
      loginResult.innerHTML = `<div class="error-message">${data.message || 'Login failed. Please try again.'}</div>`;
    }
  } catch (err) {
    loginResult.innerHTML = '<div class="error-message">Server error. Please try again later.</div>';
  }
});
