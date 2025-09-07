export async function loginWithEmail(email, password) {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.message || 'Login failed');
  }
  return res.json();
}

export async function loginWithGoogle() {
  window.location.href = '/api/auth/google';
}
