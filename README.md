# SprintPilot

SprintPilot is a modular, multi-agent pipeline for automated story decomposition, estimation, code generation, and testing, orchestrated via LangGraph and powered by LLMs.

## Features
- Automated story enrichment, decomposition, estimation, code & test generation
- Modular agent pipeline (LangGraph)
- Centralized logging
- Web UI for story input
- **User authentication with email/password and Google Sign-In**

## Authentication Flow

SprintPilot supports secure login via email/password and Google OAuth:

1. **Login Form**: Users can log in using their email/password or Google account from `/login`.
2. **Email/Password**: Credentials are validated server-side. Passwords are hashed with bcrypt. JWT session cookie is set on success.
3. **Google Sign-In**: Redirects to Google OAuth. On success, user is upserted in the database and JWT session cookie is set.
4. **Session Management**: JWT is stored in an HTTP-only cookie. `/api/auth/me` returns current user info if authenticated.
5. **Logout**: `/api/auth/logout` clears the session cookie.

### API Endpoints
- `POST /api/auth/login` — Login with email/password
- `GET /api/auth/google` — Start Google OAuth
- `GET /api/auth/google/callback` — Google OAuth callback
- `GET /api/auth/logout` — Logout
- `GET /api/auth/me` — Get current user info

### Database
- Users are stored in the `users` table (see `src/db/migrations/001_create_users.sql`).

## Setup
1. Create a Postgres database and run the migration in `src/db/migrations/001_create_users.sql`.
2. Set environment variables:
   - `DATABASE_URL` (Postgres connection string)
   - `JWT_SECRET` (for JWT signing)
   - `GOOGLE_CLIENT_ID` and `GOOGLE_REDIRECT_URI` (for Google OAuth)
3. Build frontend assets for login (`login.bundle.js`).
4. Start the server and visit `/login` to authenticate.

---

For more details, see code in `src/web/auth.routes.js` and `src/web/components/LoginForm.js`.
