# Rig Forge

> Internal workforce intelligence and project operations platform for RIG 360 Media.

Rig Forge is a full-stack team management system — track projects, manage tasks, raise support tickets, monitor live team presence, onboard members, and generate daily reports. Built for fast-moving teams that can't let anything slip through.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS |
| Database | PostgreSQL |
| ORM | Prisma 5 |
| Auth | JWT (httpOnly cookies) |
| State | Zustand |
| Realtime | Socket.io |
| Package Manager | pnpm |

---

## Features

- **Project Tracking** — Create and manage projects with leads, members, deadlines, priority, and status
- **Task Management** — Assign tasks per project with status tracking (TODO → IN_PROGRESS → DONE)
- **Support Tickets** — Raise, accept, and resolve issues; lifecycle enforced (OPEN → ACCEPTED → COMPLETED)
- **Live Presence** — Real-time heartbeat showing who is actively working
- **Team Onboarding** — Admin generates user credentials → user logs in → admin approves/rejects
- **Daily Reports** — Auto-generated weekly reports per employee with daily work logs
- **Notifications** — In-app notification system for all key events
- **Thread Comments** — Per-project and per-task message threads
- **Role-Based Access** — ADMIN and EMPLOYEE roles with strict middleware enforcement

---

## Roles

| Role | Capabilities |
|---|---|
| **ADMIN** | Full access — manage users, projects, onboarding, reports, all tickets |
| **EMPLOYEE** | Own projects, tasks, tickets, daily logs, and profile |

---

## Project Structure

```
forge/
├── app/
│   ├── (auth)/              # Login & pending pages
│   ├── api/                 # All API routes
│   │   ├── admin/           # Admin-only endpoints
│   │   ├── auth/            # Login, logout, me
│   │   ├── projects/        # Projects CRUD
│   │   ├── tasks/           # Task management
│   │   ├── tickets/         # Ticket lifecycle
│   │   ├── notifications/   # Notification system
│   │   ├── daily-log/       # Daily work logs
│   │   ├── reports/         # Weekly report generation
│   │   ├── threads/         # Project & task threads
│   │   └── users/           # User profile management
│   ├── dashboard/           # All dashboard pages
│   └── page.tsx             # Landing page
├── components/              # Reusable UI components
├── hooks/                   # Custom React hooks
├── lib/                     # Utilities, auth, DB client
├── prisma/                  # Schema & migrations
├── store/                   # Zustand state stores
└── middleware.ts            # Route protection
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- PostgreSQL (local or hosted)

### 1. Clone the repository

```bash
git clone https://github.com/RIG-360-MEDIA/RIG-FORGE.git
cd RIG-FORGE
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env
```

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/forge_db"
DIRECT_URL="postgresql://user:password@localhost:5432/forge_db"

# Auth
JWT_SECRET="your-long-random-secret"
JWT_EXPIRES_IN="7d"

# Session
COOKIE_NAME="forge-token"
COOKIE_SECURE="false"

# App
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### 4. Set up the database

```bash
pnpm db:push        # Push schema to database
pnpm db:generate    # Generate Prisma client
```

### 5. Run the development server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Database Scripts

```bash
pnpm db:push       # Sync schema to DB (no migration files)
pnpm db:generate   # Regenerate Prisma client after schema changes
pnpm db:studio     # Open Prisma Studio (visual DB browser)
```

---

## Team Accounts

All team members have been seeded. Default password for all accounts: `Forge@2026`

| Role | Name | Email |
|---|---|---|
| **ADMIN** | Pranavv | pranavv@rigforge.com |
| EMPLOYEE | Abhyam | abhyam@rigforge.com |
| EMPLOYEE | Rhadesh | rhadesh@rigforge.com |
| EMPLOYEE | Sumit | sumit@rigforge.com |
| EMPLOYEE | Kavya | kavya@rigforge.com |
| EMPLOYEE | Yash | yash@rigforge.com |
| EMPLOYEE | Daksh | daksh@rigforge.com |
| EMPLOYEE | Ahmed | ahmed@rigforge.com |
| EMPLOYEE | Kashvi | kashvi@rigforge.com |
| EMPLOYEE | Sudipta | sudipta@rigforge.com |
| EMPLOYEE | Shubham | shubham@rigforge.com |
| EMPLOYEE | Krishn | krishn@rigforge.com |
| EMPLOYEE | Pankaj | pankaj@rigforge.com |
| EMPLOYEE | Utkarsh | utkarsh@rigforge.com |
| EMPLOYEE | Rohun | rohun@rigforge.com |

> Members should change their password after first login via **Profile → Change Password**.

---

## Active Projects

OSINT · CC · Corruptx · Childsafe · Drone Mapping · Kashmir · Vanishing Voices · TCH · Imagery · DNL · Repositories · Belavida · Windlass · Social Media Posting · Stance · Video Editing · Integration · News Prism

---

## API Overview

| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Authenticate user |
| POST | `/api/auth/logout` | Clear session |
| GET | `/api/auth/me` | Get current user |
| GET | `/api/projects` | List projects |
| POST | `/api/projects` | Create project |
| GET | `/api/projects/[id]` | Project detail |
| POST | `/api/tasks` | Create task |
| GET | `/api/tickets` | List tickets |
| POST | `/api/tickets` | Raise ticket |
| POST | `/api/tickets/[id]/accept` | Accept ticket |
| POST | `/api/tickets/[id]/complete` | Complete ticket |
| GET | `/api/notifications` | List notifications |
| PATCH | `/api/notifications/read-all` | Mark all read |
| POST | `/api/daily-log` | Submit daily log |
| GET | `/api/reports` | List weekly reports |
| POST | `/api/reports/generate` | Generate report |
| PATCH | `/api/users/me/profile` | Update profile |
| PATCH | `/api/users/me/password` | Change password |
| POST | `/api/heartbeat` | Update presence |
| GET | `/api/admin/onboarding/pending` | Pending users (admin) |
| POST | `/api/admin/generate-user` | Create user (admin) |
| POST | `/api/admin/onboarding/approve/[id]` | Approve user (admin) |
| DELETE | `/api/admin/onboarding/reject/[id]` | Reject user (admin) |

---

## Onboarding Flow

```
Admin generates user (name + email)
        ↓
System creates account with temp password
        ↓
User logs in → redirected to /pending
        ↓
Admin approves or rejects from /dashboard/onboarding
        ↓
Approved → user redirected to /dashboard
```

---

## Ticket Lifecycle

```
OPEN → (accepted by different user) → ACCEPTED → COMPLETED
OPEN → CANCELLED  (only raiser can cancel, only while OPEN)
```

> A user cannot accept their own ticket.

---

## Environment Notes

- `COOKIE_SECURE` should be `true` in production (requires HTTPS)
- `JWT_SECRET` must be a strong random string in production
- `DATABASE_URL` and `DIRECT_URL` should point to the same DB (required by Prisma with Supabase/PgBouncer setups)

---

## License

Internal use only — RIG 360 Media. Unauthorized access is prohibited.
