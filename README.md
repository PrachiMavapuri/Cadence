# Cadence — Team Project & Task Management System

Cadence is a production-style full-stack team project and task management web application built with **React**, **JavaScript (ES Modules & JSX)**, **Node.js**, **Express.js**, **MySQL**, **JWT + bcrypt**, **Zod**, and **Socket.IO**.

---

## Architecture Overview

```
├── server/
│   ├── config/         # Environment & runtime configuration
│   ├── db/             # MySQL connection pool, schema, transactions, and seed data
│   ├── middleware/     # JWT auth, RBAC authorization, Zod validation, centralized error handler
│   ├── validators/     # Shared Zod schemas for body, params, and query parameters
│   ├── services/       # Business logic, permission checks, activity auditing, dashboard aggregates
│   ├── controllers/    # HTTP request/response orchestration
│   ├── routes/         # REST API route definitions
│   ├── tests/          # Automated backend API integration tests (node:test)
│   └── app.js          # Express app factory
├── server.js           # HTTP + Socket.IO + Vite/SPA entrypoint on port 3000
├── vite.config.js      # Vite configuration
├── src/
│   ├── components/     # Reusable UI primitives, layout shell, auth guards, error boundary
│   ├── context/        # AuthContext (JWT + silent refresh), SocketContext, ToastContext
│   ├── lib/            # Axios client (auto-refresh retry queue) & Zod form validators
│   └── pages/          # Routed pages: Login, Register, Dashboard, Projects, Tasks, Team, Profile, 404
├── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Features & Business Rules

### Authentication & Role-Based Access Control (RBAC)
- **Local Email/Password**: `bcrypt` password hashing (10 rounds), short-lived JWT access tokens (`15m`), and rotating `httpOnly` refresh tokens (`7d`).
- **Google Authentication**: Server-side OAuth 2.0 authorization-code flow with CSRF state validation, client-secret code exchange, Google ID-token verification, and `httpOnly` refresh cookies.
- **Roles**:
  - **Admin**: Full access across all projects, tasks, team directory, role promotions/demotions, and account activation/deactivation.
  - **Manager**: Create/edit/delete projects, add/remove project members, reassign tasks, and view team workload summaries.
  - **Member**: View assigned/member projects, create tasks, update their own tasks, post comments, and manage their profile.

### Project & Task Workflow Enforcement
- **Project Membership Guard**: Tasks can only be assigned to active members of that task's project (`400 ASSIGNEE_NOT_PROJECT_MEMBER`).
- **Member Reassignment Guard**: Only `Manager` or `Admin` users can reassign tasks to another teammate (`403 FORBIDDEN`).
- **Completion Validation Rule**: A task cannot transition to `Completed` unless it has an assigned user and a description of at least 10 characters, and `Cancelled` tasks cannot jump directly to `Completed` (`422 COMPLETION_RULE_FAILED`).
- **Safe Project Deletion**: Deleting a project executes inside a database transaction, cleanly removing dependent tasks, comments, memberships, and activity logs.
- **Immutable Activity History**: Task creation, assignment, status transitions, priority updates, edits, and comments automatically append immutable audit entries.
- **Real-Time Updates & Optimistic Kanban**: Drag-and-drop Kanban columns update optimistically with automatic rollback on backend rejection, synchronized across connected clients via Socket.IO.

---

## Frontend Routes

| Route | Description | Access |
| --- | --- | --- |
| `/login` | Email/password, Google, & demo role login | Public |
| `/register` | New user registration with Zod validation | Public |
| `/dashboard` | KPI summary, status/priority distribution, upcoming tasks, team summary | Authenticated |
| `/projects` | Searchable, filterable, sortable, paginated projects list | Authenticated |
| `/projects/new` | Create project form with member assignment | Authenticated |
| `/projects/:id` | Project overview, member management, List & Drag-and-Drop Kanban board | Authenticated (Member+) |
| `/projects/:id/edit` | Edit project settings and members | Owner / Manager / Admin |
| `/tasks/new` | Create task form with project-member filtered assignees | Authenticated |
| `/tasks/:id` | Task detail, inline status/assignment controls, comments & activity timeline | Authenticated |
| `/tasks/:id/edit` | Edit task details | Creator / Assignee / Manager / Admin |
| `/my-tasks` | Personal task queue with overdue filter & pagination | Authenticated |
| `/team` | Team directory, workload metrics, role & status controls | Manager / Admin |
| `/profile` | Personal details, portrait picker, and password change | Authenticated |
| `*` | 404 Not Found page | Public |

---

## REST API Reference

### Auth (`/api/auth`)
- `POST /api/auth/register` — Register a new user
- `POST /api/auth/login` — Authenticate with email and password
- `GET /api/auth/google` — Start Google OAuth sign-in
- `GET /api/auth/google/callback` — Complete the Google OAuth callback
- `POST /api/auth/refresh` — Rotate refresh token cookie and issue new access token
- `GET /api/auth/me` — Fetch authenticated user profile
- `PUT /api/auth/profile` — Update name, job title, avatar, or password
- `POST /api/auth/logout` — Revoke refresh token and clear session cookie

### Projects (`/api/projects`)
- `GET /api/projects` — List accessible projects (`page`, `limit`, `q`, `status`, `sortBy`, `sortOrder`)
- `POST /api/projects` — Create a project
- `GET /api/projects/:id` — Get project details, members, and task stats
- `PUT /api/projects/:id` — Update project details and members
- `DELETE /api/projects/:id` — Safely delete project and dependent records
- `POST /api/projects/:id/members` — Add project member (Manager/Admin)
- `DELETE /api/projects/:id/members/:userId` — Remove project member (Manager/Admin)

### Tasks (`/api/tasks`)
- `GET /api/tasks` — List accessible tasks (`page`, `limit`, `q`, `status`, `priority`, `projectId`, `assignedTo`, `overdue`, `sortBy`, `sortOrder`)
- `POST /api/tasks` — Create task
- `GET /api/tasks/:id` — Get task details
- `PUT /api/tasks/:id` — Update task
- `PATCH /api/tasks/:id/status` — Update task status / Kanban order
- `DELETE /api/tasks/:id` — Delete task
- `GET /api/tasks/:id/comments` — List task comments
- `POST /api/tasks/:id/comments` — Add task comment
- `GET /api/tasks/:id/activity` — Read immutable task activity history

### Dashboard, Users & Export
- `GET /api/dashboard/summary` — Live KPI metrics, status/priority counts, upcoming tasks, team summary
- `GET /api/users` — List workspace users
- `PATCH /api/users/:id/role` — Update user role (Admin only)
- `PATCH /api/users/:id/status` — Activate/deactivate account (Admin only)

---

## Local Setup & Running

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment**:
   ```powershell
   Copy-Item .env.example .env
   ```
   Set the `MYSQL_*` values (host, port, user, password, database name) in `.env`.
   The database and all tables are created automatically on first start, and
   multi-statement changes run inside MySQL transactions so project and task
   updates stay consistent. Any MySQL 8 or MariaDB 10.5+ server works.
   `docker compose up --build` starts a bundled MySQL 8 container. Docker Compose
   passes the Google OAuth settings from `.env` to the app container.

   The app seeds the demo workspace on first startup when the database is empty.

   Integration tests create and drop a temporary database (`cadence_test_*`) on
   the MySQL server configured in `.env`, so the MySQL user needs permission to
   create databases.

   Create a Google OAuth **Web application** client in Google Cloud Console. Add
   `http://localhost:3000/api/auth/google/callback` as an authorized redirect URI,
   then set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`. Keep the
   client secret server-side; do not add it to frontend variables. Set
   `GOOGLE_REDIRECT_URI` to the exact redirect URI registered with Google.

3. **Start development server** (Express API + Socket.IO + Vite on port `3000`):
   ```bash
   npm run dev
   ```

4. **Run automated backend integration tests**:
   ```bash
   npm test
   ```

5. **Build and run in production**:
   ```bash
   npm run build
   npm start
   ```

6. **Run with Docker** (starts MySQL and the app):
   ```bash
   docker compose up --build
   ```

---

## Seeded Demo Credentials

| Role | Email | Password |
| --- | --- | --- |
| **Admin** | `admin@cadence.dev` | `Password123!` |
| **Manager** | `manager@cadence.dev` | `Password123!` |
| **Member** | `member@cadence.dev` | `Password123!` |
