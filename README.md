# RIG Forge

Internal workforce, project, and communication platform for RIG 360 Media.

RIG Forge combines project and task management, a native chat, an AI assistant (Forgie), and integrations with WhatsApp and Google Workspace into a single operational surface for the team.

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Tech Stack](#tech-stack)
5. [Getting Started](#getting-started)
6. [Environment Variables](#environment-variables)
7. [Available Scripts](#available-scripts)
8. [Project Structure](#project-structure)
9. [Roles and Access](#roles-and-access)
10. [Deployment](#deployment)
11. [Security](#security)
12. [License](#license)

## Overview

RIG Forge is a full-stack Next.js application backed by PostgreSQL (Supabase). It exposes a web dashboard, over one hundred API routes, and a set of scheduled jobs that keep the team informed. Two auxiliary services deploy separately: a WhatsApp bridge (Baileys) and a Cloudflare Worker fronting the media bucket on R2.

## Features

### Work Management

* Project and task lifecycle with leads, members, deadlines, priority, and status.
* Ticket workflow (`OPEN`, `ACCEPTED`, `COMPLETED`, `CANCELLED`) with role guards.
* Per-project and per-task comment threads with visibility scopes.

### Communication

* Native chat: direct messages and groups.
* Reactions, replies, pins, polls, mentions, read receipts, disappearing messages.
* Media attachments (image, file, audio) with private signed URLs.
* Group invites, block list, starred messages.

### Forgie (AI Assistant)

* Multi-provider LLM routing across Groq, Gemini, Cerebras, and an optional local vLLM instance.
* Tool calling over Projects, Tasks, People, Tickets, GitHub, Google (Calendar, Meet, Drive, Contacts, Gmail), and internal NAS.
* All AI-triggered write actions are HMAC-gated by the UI and logged to an audit table.
* Streaming responses using the Vercel AI SDK.

### Integrations

* Google Workspace: per-user OAuth for Calendar, Meet, Drive, Contacts, and Gmail.
* WhatsApp: inbound messages routed through the bridge into the same Forgie pipeline; outbound reply supported.
* GitHub: repository listing and assistive queries.

### Operations

* AI-drafted daily logs at 18:00 IST, approved by the user.
* Standup digest generated at 09:00 IST and delivered per user by Forgie.
* Weekly reports aggregated per employee and per project.
* Web Push notifications with per-tab suppression.
* Presence tracking through periodic heartbeat.
* Hidden developer dashboard gated by an email allow list.

### Access Control

* Role-based access: `SUPER_ADMIN`, `ADMIN`, `EMPLOYEE`.
* Optional `CustomRole` with fine-grained capability keys.
* Multi-tenant scoping enforced by a Prisma extension over AsyncLocalStorage.

## Architecture

```
                        ┌───────────────────────┐
                        │   Cron Schedulers     │
                        │  (cron-job.org / GA)  │
                        └──────────┬────────────┘
                                   │  x-cron-secret
                                   ▼
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│  Cloudflare      │        │                  │        │  Supabase        │
│  Worker + R2     │◀──────▶│   Next.js App    │◀──────▶│  Postgres        │
│  (chat media)    │  HMAC  │   (Render)       │        │  Storage         │
└──────────────────┘        │                  │        │  Realtime        │
                            └────┬─────────┬───┘        └──────────────────┘
                                 │         │
                        Baileys  │         │  LLM APIs
                                 ▼         ▼
                        ┌──────────────┐  ┌────────────────────────┐
                        │  WhatsApp    │  │  Groq / Gemini /       │
                        │  Bridge      │  │  Cerebras / local vLLM │
                        │  (Render)    │  │                        │
                        └──────────────┘  └────────────────────────┘
```

Key design notes:

* **Multi-tenancy** is enforced in the application layer. Every tenant table carries `organizationId`. A Prisma extension in `lib/db.ts` reads the current organization from AsyncLocalStorage and scopes list, aggregate, and bulk operations. Single-record operations by cuid are intentionally unscoped.
* **Chat realtime** uses Supabase Realtime with Postgres Row Level Security. The client obtains a per-user JWT from `/api/chat/realtime-token`, signed with `SUPABASE_JWT_SECRET`. Prisma bypasses RLS because it connects as the table owner; RLS is the boundary for non-Prisma clients.
* **Media** is stored in a private R2 bucket, fronted by a Cloudflare Worker that verifies HMAC-signed URLs before proxying GET, PUT, and DELETE. This works around SNI blocking on some ISPs.
* **AI writes** are never executed directly by the model. The assistant proposes an action, the UI renders a confirmation card, the user approves, and the server verifies an HMAC token before executing.

## Tech Stack

| Layer            | Technology                                              |
| ---------------- | ------------------------------------------------------- |
| Framework        | Next.js 14 (App Router)                                 |
| Language         | TypeScript                                              |
| Styling          | Tailwind CSS                                            |
| Database         | PostgreSQL (Supabase)                                   |
| ORM              | Prisma 5                                                |
| Auth             | JWT in httpOnly cookies                                 |
| Client State     | Zustand                                                 |
| Chat Realtime    | Supabase Realtime with Postgres RLS                     |
| Media            | Cloudflare Worker in front of Cloudflare R2             |
| AI SDK           | Vercel AI SDK (Groq, Gemini, OpenAI-compatible drivers) |
| WhatsApp         | Baileys (separate Node service)                         |
| Push             | Web Push (VAPID)                                        |
| Package Manager  | pnpm                                                    |
| Deployment       | Render, Cloudflare, Supabase                            |

## Getting Started

### Prerequisites

* Node.js 20 or newer
* pnpm (`npm install -g pnpm`)
* PostgreSQL database (Supabase recommended)

### Installation

```bash
git clone https://github.com/RIG-360-MEDIA/RIG-FORGE.git
cd RIG-FORGE
pnpm install
```

### Database Setup

```bash
pnpm db:push        # Sync the Prisma schema to the database
pnpm db:generate    # Generate the Prisma client
```

Optionally seed an initial admin (creates `admin@forge.dev` / `Admin1234!`; rotate immediately):

```bash
pnpm tsx prisma/seed.ts
```

### Running Locally

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.example` to `.env` and populate the required keys. Values below are illustrative.

### Required

```env
DATABASE_URL="postgresql://user:pass@host:6543/postgres?pgbouncer=true"
DIRECT_URL="postgresql://user:pass@host:5432/postgres"

JWT_SECRET="use-a-32-plus-char-random-string"
JWT_EXPIRES_IN="7d"

SESSION_COOKIE_NAME="forge_session"
SESSION_COOKIE_SECURE="false"

PORT="3000"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"

CRON_SECRET="min-8-char-random"
```

### Forgie (AI Assistant)

```env
ASSISTANT_ENABLED="true"
GROQ_API_KEYS=""
GEMINI_API_KEYS=""
CEREBRAS_API_KEYS=""
ASSISTANT_PROVIDER_ORDER="groq,gemini,cerebras"
GROQ_MODEL="llama-3.3-70b-versatile"
GEMINI_MODEL="gemini-flash-latest"
CEREBRAS_MODEL="gpt-oss-120b"
ASSISTANT_USER_MSG_PER_HOUR="30"
```

### Optional Integrations

```env
GITHUB_TOKEN=""
GITHUB_ORG=""

GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
GOOGLE_REDIRECT_URI="http://localhost:3000/api/auth/google/callback"

WA_BRIDGE_URL=""
WA_BRIDGE_SECRET=""
RIGFORGE_WA_SECRET=""

SUPABASE_JWT_SECRET=""

NEXT_PUBLIC_VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:ops@example.com"

DEV_DASHBOARD_EMAILS=""
DEV_INSTANCES="[]"
```

## Available Scripts

| Command            | Description                                     |
| ------------------ | ----------------------------------------------- |
| `pnpm dev`         | Start the Next.js development server            |
| `pnpm build`       | Generate Prisma client and build for production |
| `pnpm start`       | Run the production server on `$PORT`            |
| `pnpm lint`        | Lint the codebase                               |
| `pnpm db:push`     | Push the Prisma schema to the database          |
| `pnpm db:generate` | Regenerate the Prisma client                    |
| `pnpm db:studio`   | Open Prisma Studio (visual DB browser)          |

## Project Structure

```
rig-forge/
├── app/
│   ├── (auth)/               Login and pending pages
│   ├── api/                  Route handlers
│   │   ├── admin/            User, role, and onboarding management
│   │   ├── assistant/        Forgie messages, tools, action execution
│   │   ├── auth/             Session and Google OAuth
│   │   ├── chat/             Conversations, messages, media, invites
│   │   ├── cron/             Scheduled endpoints (require x-cron-secret)
│   │   ├── github/           GitHub integration
│   │   ├── google/           Gmail, Drive, Contacts, Meet, diagnostics
│   │   ├── projects/         Projects and members
│   │   ├── tasks/            Task management
│   │   ├── tickets/          Ticket lifecycle
│   │   └── whatsapp/         Inbound webhook from the bridge
│   └── dashboard/            Application UI
├── components/               Feature-grouped React components
├── lib/                      Auth, DB, assistant, chat, google, whatsapp, storage
├── prisma/                   schema.prisma, seed.ts, and RLS SQL
├── whatsapp-bridge/          Standalone Baileys service
├── worker/                   Cloudflare Worker for R2 media
├── scripts/                  Admin and maintenance scripts
├── docs/                     Design specs and deployment notes
├── tests/e2e/                Playwright tests
├── store/                    Zustand stores
├── hooks/                    Custom React hooks
└── middleware.ts             Edge authentication and route protection
```

## Roles and Access

| Role          | Capabilities                                                      |
| ------------- | ----------------------------------------------------------------- |
| `SUPER_ADMIN` | Everything, including custom role management                      |
| `ADMIN`       | All operational features except super-admin-only settings         |
| `EMPLOYEE`    | Own work, assigned projects, tickets, daily logs, and chat        |
| Custom Role   | Any subset of 13 fine-grained capability keys                     |

Capability keys include `members.view`, `projects.manage`, `assistant.admin`, `whatsapp.send`, and others defined in `lib/permissions.ts`. Access to the developer dashboard (`/dashboard/dev`) is gated separately by `DEV_DASHBOARD_EMAILS`.

### Onboarding Flow

```
1. Admin creates a user (name + email) with a temporary password.
2. User logs in and is redirected to /pending.
3. Admin approves the user in /dashboard/onboarding.
4. User is forced to change the password on next login.
```

### Ticket Lifecycle

```
OPEN -> ACCEPTED -> COMPLETED     (raiser cannot accept own ticket)
OPEN -> CANCELLED                 (only the raiser, only while OPEN)
```

## Deployment

Three services need to be deployed independently.

### Web Application

* Platform: Render (web service).
* Build: `pnpm install && pnpm db:generate && pnpm build`.
* Start: `pnpm start`.
* Health check: `/api/health`.
* Node version: 20.11.1 or newer.
* Secrets managed in the Render dashboard.

### WhatsApp Bridge

* Platform: Render (separate web service).
* Root: `whatsapp-bridge/`.
* Health check: `/health`.
* Shares the same Postgres database (persists Baileys authentication state).

### Media Worker

* Platform: Cloudflare Workers.
* Root: `worker/`.
* Configuration in `worker/wrangler.toml`.
* Requires `R2_SIGNING_SECRET` and an R2 bucket binding.

### Scheduled Jobs

Endpoints under `/api/cron/*` are triggered externally by cron-job.org or GitHub Actions. All requests must include the header `x-cron-secret: $CRON_SECRET`.

Additional deployment details are documented in `docs/FORGIE_DEPLOYMENT.md`.

## Security

* `JWT_SECRET` must be a strong random string in any non-development environment. Placeholder values leave every session forgeable.
* Never commit real values in `.env`. The `.env.example` file contains only illustrative placeholders.
* Prisma connects as the table owner and bypasses Postgres RLS. RLS is the security boundary for any non-Prisma client (Supabase JS with an anon key, Realtime, REST). Enable RLS with `scripts/enable-rls.mjs`.
* `tempPassword` and Google OAuth tokens are currently stored in plaintext. An encrypted-column migration is planned.
* Cron endpoints are publicly reachable and rely on `CRON_SECRET` for authentication.
* The `chat-media` bucket must be private in production and served through the `/api/chat/media/[...path]` proxy.

## License

Internal use only. Copyright RIG 360 Media. Unauthorized access is prohibited.
