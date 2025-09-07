# Authentication Flow & User Data Handling

## Overview
SprintPilot supports secure login via email/password and Google OAuth. JWT tokens are used for session management.

## API Endpoints

### POST /api/auth/login
- **Body:** `{ email, password }`
- **Response:** `{ token }` on success, `{ error }` on failure

### GET /api/auth/google
- Redirects to Google OAuth consent screen.

### GET /api/auth/google/callback
- Handles Google OAuth callback. On success, redirects to frontend with JWT token.

## User Model (Postgres)
- `id`: serial primary key
- `email`: unique, required
- `password_hash`: bcrypt hash (nullable for Google-only users)
- `google_id`: unique (nullable)
- `name`: display name
- `created_at`: timestamp

## Authentication Logic
- **Email/Password:**
  - User submits credentials to `/api/auth/login`.
  - Credentials are validated, password is checked with bcrypt.
  - On success, JWT is issued.
- **Google OAuth:**
  - User is redirected to Google consent.
  - On callback, user is found/created in DB, JWT is issued.

## JWT Session
- JWT is returned to client and should be stored (e.g., localStorage).
- JWT is required for authenticated API requests.

## Error Handling
- Invalid credentials or OAuth errors return `{ error }` with appropriate message.

## Security
- Passwords are hashed with bcrypt.
- JWT secret is stored in env (`JWT_SECRET`).
- Google OAuth credentials are stored in env (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
