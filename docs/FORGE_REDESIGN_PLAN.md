# FORGE Redesign Plan — Complete Specification

> This document is a theoretical blueprint. No code. Every page, button, role, and flow is described so the full picture is clear before implementation begins.

---

## Table of Contents

1. [Role Definitions & Permissions Matrix](#1-role-definitions--permissions-matrix)
2. [What Gets Removed](#2-what-gets-removed)
3. [What Gets Added](#3-what-gets-added)
4. [What Gets Changed](#4-what-gets-changed)
5. [Page-by-Page Specification (Admin)](#5-page-by-page-specification-admin)
6. [Page-by-Page Specification (Employee)](#6-page-by-page-specification-employee)
7. [Ticket System — Full Spec](#7-ticket-system--full-spec)
8. [Online/Working Tracking System](#8-onlineworking-tracking-system)
9. [Project Detail — Three Tabs Spec](#9-project-detail--three-tabs-spec)
10. [Onboarding Flow — Redesigned](#10-onboarding-flow--redesigned)
11. [User Generation by Admin](#11-user-generation-by-admin)
12. [Navigation & Sidebar Changes](#12-navigation--sidebar-changes)
13. [Database Schema Changes](#13-database-schema-changes)
14. [Additional Recommendations](#14-additional-recommendations)
15. [Migration Checklist](#15-migration-checklist)

---

## 1. Role Definitions & Permissions Matrix

### Two Roles: ADMIN and EMPLOYEE (rename MEMBER → EMPLOYEE)

There is also a sub-role within projects: **PROJECT LEAD** — an employee designated by admin when creating a project. A project lead has extra powers *within that specific project* but is still an employee everywhere else.

### Full Permissions Matrix

| Capability | ADMIN | EMPLOYEE | PROJECT LEAD (within their project) |
|---|---|---|---|
| **Dashboard** | See company-wide stats, all projects summary, all employee work status, total hours today | See only their own assigned projects, their own hours today, their own tasks | Same as Employee (dashboard is personal) |
| **Projects — View** | See ALL projects in the company | See ONLY projects they are assigned to | Same as Employee |
| **Projects — Create** | YES | NO | NO |
| **Projects — Edit** | YES (any project) | NO | Only their assigned project's Overview tab |
| **Projects — Delete/Archive** | YES | NO | NO |
| **Project Overview Tab — Edit** | YES | NO | YES (they fill in description, links, team info) |
| **Project Tasks Tab — Create Tasks** | YES | NO | YES (assign tasks to project members) |
| **Project Tasks Tab — View Tasks** | Only tasks assigned to them (but admin sees all) | Only tasks assigned to them | Sees all tasks in their project |
| **Project Tasks Tab — Mark Done** | YES (any task) | Only their own assigned tasks | YES (any task in their project) |
| **Project Updates Tab — Chat** | YES | YES (only in projects they belong to) | YES |
| **Team Members — View List** | See all names + clickable profiles | See all names ONLY (no clickable profiles) | Same as Employee |
| **Team Members — Click Profile** | YES → sees full detail page | NO → names only, no links | NO |
| **Member Profile Detail** | See: projects assigned, daily hours for last 7 days, total hours per day, work done log | Not accessible to employees | Not accessible |
| **Tickets — Raise** | YES | YES | YES |
| **Tickets — View** | All tickets across company | All tickets across company (to help others) | Same as Employee |
| **Tickets — Accept/Help** | YES | YES | YES |
| **Working Status** | Sees who is WORKING/NOT WORKING | Sees only their own status | Same as Employee |
| **Time Tracking — View Own** | YES | YES | YES |
| **Time Tracking — View Others** | YES (via member profiles) | NO | NO |
| **Onboarding — Generate User** | YES | NO | NO |
| **Onboarding — Accept New Users** | YES | NO | NO |
| **Onboarding — Assign to Project** | YES | NO | NO |
| **Notifications** | YES | YES (limited to their scope) | YES |

---

## 2. What Gets Removed

### Completely Removed Features

| Feature | Where It Exists Now | Why Remove |
|---|---|---|
| **Standup System** | `/dashboard/standup` page, `StandupEntry` model, `StandupForm`, `StandupList`, `StandupColumn`, `AdminDigest`, `ProjectPillSelector`, `/api/standups/*` routes | User requirement #4 — no use for standups |
| **Blocker System** | `/dashboard/blockers` page, `Blocker` model, `BlockerCard`, `BlockerDetailPanel`, `RaiseBlockerModal`, `AdminBlockerDashboard`, `BlockerColumn`, `/api/blockers/*` routes, `BlockerThread` model | User requirement #4 — replaced by Ticket system |
| **User Status Modes** (ACTIVE, FOCUS, AVAILABLE, IN_MEETING, OFFLINE) | `UserStatus` enum, status selector in sidebar, `/api/users/me/status` | User requirement #5 — only WORKING / NOT_WORKING |
| **Handoff System** | `HandoffNote` model, `HandoffComposer`, `HandoffInbox`, `/api/handoffs/*` | Not mentioned in requirements, adds complexity |
| **Availability Windows** | `AvailabilityWindow` model, `AvailabilityPanel`, `TeamAvailabilityView`, `/api/availability/*` | Replaced by simpler working/not-working tracking |
| **Old Onboarding Checklist** | `OnboardingProgress` model, `MemberChecklist`, `TemplateEditorPanel`, `TaskCheckItem` | Replaced by new approval-based onboarding flow |
| **Public Registration** | `/api/auth/register` open endpoint | User requirement #10 — only admin generates credentials |
| **Standup Reminder Notifications** | `STANDUP_REMINDER` notification type | Standup removed |
| **Blocker Notifications** | `BLOCKER_RAISED`, `BLOCKER_HELP_OFFERED`, `BLOCKER_RESOLVED` types | Blocker removed, replaced by ticket notifications |

### Files/Folders to Delete

```
Pages:
- /app/(dashboard)/standup/           (entire folder)
- /app/(dashboard)/blockers/          (entire folder)

Components:
- /components/standup/                (entire folder)
- /components/blockers/               (entire folder)
- /components/handoffs/               (entire folder)
- /components/availability/           (entire folder)
- /components/onboarding/MemberChecklist.tsx
- /components/onboarding/TaskCheckItem.tsx
- /components/onboarding/TemplateEditorPanel.tsx
- /components/dashboard/StandupColumn.tsx
- /components/dashboard/BlockerColumn.tsx

API Routes:
- /app/api/standups/                  (entire folder)
- /app/api/blockers/                  (entire folder)
- /app/api/handoffs/                  (entire folder)
- /app/api/availability/              (entire folder)
- /app/api/auth/register/             (replace with admin-only generation)
```

### Database Models to Drop

```
- StandupEntry
- Blocker
- BlockerThread
- HandoffNote
- AvailabilityWindow
- OnboardingProgress (replaced with new OnboardingRequest)
```

### Enums to Remove/Change

```
- UserStatus: ACTIVE, FOCUS, AVAILABLE, IN_MEETING, OFFLINE → replace with WORKING, NOT_WORKING
- BlockerStatus: entire enum removed
- AvailabilityType: entire enum removed
- NotificationType: remove BLOCKER_*, STANDUP_*, HANDOFF_* → add TICKET_*
```

---

## 3. What Gets Added

| New Feature | Purpose |
|---|---|
| **Ticket System** | Replace blockers — anyone raises help tickets, anyone can accept and resolve |
| **Time Tracking** | Track login/logout durations per user per day |
| **Working/Not Working Status** | Simple binary status based on login state |
| **Admin User Generation** | Admin generates email + password for new users |
| **Approval-Based Onboarding** | New users appear in admin's onboarding queue for approval + project assignment |
| **Project Lead Role** | Per-project designation by admin at project creation |
| **Member Detail View (Admin)** | Full work history, daily hours, project assignments |
| **Differentiated Dashboards** | Completely different layouts for admin vs employee |

---

## 4. What Gets Changed

| Existing Feature | Change |
|---|---|
| **Dashboard** | Admin: complete redesign with company overview. Employee: personal-only view |
| **Sidebar Navigation** | Different links for admin vs employee. Remove standup, blockers. Add tickets |
| **Team Members Page** | Admin: clickable names → detail view. Employee: names only, no links |
| **Projects Page** | Employee sees only their projects. Admin sees all |
| **Project Detail** | Restructure into 3 tabs: Overview, Tasks, Updates (with project lead powers) |
| **Onboarding Page** | Admin: user generation + approval queue. Employee: no access |
| **Notifications** | Remove blocker/standup types. Add ticket types |
| **Login Flow** | On login → set WORKING status + start time tracking session |
| **Logout Flow** | On logout → set NOT_WORKING status + close time tracking session |

---

## 5. Page-by-Page Specification (Admin)

### 5A. Admin Dashboard (`/dashboard`)

**Purpose:** Bird's-eye view of the entire company's work status right now.

**Layout:**

```
┌─────────────────────────────────────────────────────┐
│  FORGE — Admin Dashboard              [Bell] [User] │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌──────────┐ │
│  │ Total   │ │ Working │ │  Not    │ │  Open    │ │
│  │ Members │ │  Now    │ │ Working │ │ Tickets  │ │
│  │   12    │ │    8    │ │    4    │ │    3     │ │
│  └─────────┘ └─────────┘ └─────────┘ └──────────┘ │
│                                                     │
│  ACTIVE PROJECTS                    [View All →]    │
│  ┌─────────────────────────────────────────────┐   │
│  │ Project Alpha  │ 5 members │ 12 tasks open  │   │
│  │ Project Beta   │ 3 members │  4 tasks open  │   │
│  │ Project Gamma  │ 7 members │  8 tasks open  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  WHO'S WORKING NOW                                  │
│  ┌─────────────────────────────────────────────┐   │
│  │ 🟢 Alice (Project Alpha)    2h 34m today    │   │
│  │ 🟢 Bob (Project Beta)       1h 12m today    │   │
│  │ 🔴 Charlie                  — offline —     │   │
│  │ 🟢 Diana (Project Alpha)    3h 05m today    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  RECENT TICKETS                     [View All →]    │
│  ┌─────────────────────────────────────────────┐   │
│  │ "CSS layout broken" — Alice — Project Alpha │   │
│  │ "API timeout issue" — Bob — Project Beta    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ONBOARDING QUEUE                                   │
│  ┌─────────────────────────────────────────────┐   │
│  │ Eve (eve@company.com) — Awaiting Approval   │   │
│  │               [Accept & Assign Project]      │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**Stat Cards (top row):**
- Total Members — count of all users
- Working Now — count of users with status WORKING
- Not Working — count of users with status NOT_WORKING
- Open Tickets — count of unresolved tickets

**Active Projects Section:**
- Lists all ACTIVE projects
- Shows member count and open task count per project
- "View All" links to `/dashboard/projects`
- Each row clickable → goes to project detail

**Who's Working Now:**
- Shows all employees with their current status (green dot = WORKING, red dot = NOT_WORKING)
- Shows which project they're primarily on
- Shows hours logged today so far
- Auto-refreshes every 60 seconds

**Recent Tickets:**
- Last 5 open tickets
- Shows ticket title, who raised it, which project
- "View All" links to `/dashboard/tickets`

**Onboarding Queue:**
- Shows users with `isOnboarding: true` who haven't been approved yet
- Admin can click "Accept & Assign Project" → modal opens with project selector
- Once accepted, user gets assigned to a project and `isOnboarding` becomes `false`

---

### 5B. Admin Projects Page (`/dashboard/projects`)

**Purpose:** See and manage ALL projects in the company.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  PROJECTS                          [+ New Project]  │
├─────────────────────────────────────────────────────┤
│  Filter: [All ▾] [Active ▾] [Search...]            │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Project Alpha     ACTIVE    5 members       │   │
│  │ Lead: Alice       Deadline: Apr 30, 2026    │   │
│  ├─────────────────────────────────────────────┤   │
│  │ Project Beta      ON_HOLD   3 members       │   │
│  │ Lead: Bob         Deadline: May 15, 2026    │   │
│  ├─────────────────────────────────────────────┤   │
│  │ Project Gamma     ACTIVE    7 members       │   │
│  │ Lead: Charlie     Deadline: Jun 1, 2026     │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

**"+ New Project" Button (Admin only):**
Opens `CreateProjectModal` with fields:
- Project Name (required)
- Description (required)
- Deadline (date picker)
- Priority (LOW / MEDIUM / HIGH / CRITICAL)
- **Project Lead** (dropdown of all employees — NEW FIELD)
- Initial Members (multi-select of employees)
- Project Links (URL fields — repo, design, docs)

**Each Project Row:**
- Clickable → goes to `/dashboard/projects/[id]`
- Shows: name, status badge, member count, lead name, deadline

**Filters:**
- Status: All / Active / On Hold / Completed / Archived
- Search by project name
- Sort by: deadline, name, recently updated

---

### 5C. Admin Team Members Page (`/dashboard/people`)

**Purpose:** Admin sees all team members and can click into detailed profiles.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  TEAM MEMBERS                                       │
├─────────────────────────────────────────────────────┤
│  [Search...]  [Filter: All ▾]                       │
│                                                     │
│  ┌──────────────────────────────────┐               │
│  │ 🟢 Alice Johnson    WORKING     │  ← clickable  │
│  │    Project Alpha    2h 34m      │               │
│  ├──────────────────────────────────┤               │
│  │ 🔴 Bob Smith        NOT WORKING │  ← clickable  │
│  │    Project Beta     0h 00m      │               │
│  ├──────────────────────────────────┤               │
│  │ 🟢 Charlie Brown    WORKING     │  ← clickable  │
│  │    Project Gamma    4h 12m      │               │
│  └──────────────────────────────────┘               │
└─────────────────────────────────────────────────────┘
```

**When Admin Clicks a Member → Member Detail Page/Panel:**

```
┌─────────────────────────────────────────────────────┐
│  ← Back to Team                                     │
│                                                     │
│  ALICE JOHNSON                                      │
│  alice@company.com          Role: Employee          │
│  Status: 🟢 WORKING        Today: 2h 34m           │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  ASSIGNED PROJECTS                                  │
│  • Project Alpha (Lead)                             │
│  • Project Gamma (Member)                           │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  LAST 7 DAYS — WORK HOURS                           │
│  ┌─────────────────────────────────────────────┐   │
│  │ Mon Apr 28  │ 7h 42m  │ ████████████████░  │   │
│  │ Tue Apr 29  │ 8h 15m  │ █████████████████  │   │
│  │ Wed Apr 30  │ 6h 03m  │ ██████████████░░░  │   │
│  │ Thu May 01  │ 8h 00m  │ █████████████████  │   │
│  │ Fri May 02  │ 5h 30m  │ ████████████░░░░░  │   │
│  │ Sat May 03  │ 0h 00m  │ ░░░░░░░░░░░░░░░░░  │   │
│  │ Sun May 04  │ 0h 00m  │ ░░░░░░░░░░░░░░░░░  │   │
│  └─────────────────────────────────────────────┘   │
│  TOTAL THIS WEEK: 35h 30m                           │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  RECENT TASKS COMPLETED                             │
│  • "Fix login redirect" — Project Alpha — Apr 30   │
│  • "Update API docs" — Project Gamma — Apr 29      │
│  • "Setup CI pipeline" — Project Alpha — Apr 28    │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  TICKETS RAISED: 2    TICKETS HELPED: 5             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**What Admin Sees in Member Detail:**
1. **Header**: Name, email, role, current status, hours today
2. **Assigned Projects**: List of all projects with their role (Lead/Member)
3. **Last 7 Days Work Hours**: Bar chart or table showing each day's logged hours with total
4. **Recent Tasks Completed**: Last 10 tasks marked DONE, with project name and date
5. **Ticket Stats**: How many tickets they raised, how many they helped resolve

---

### 5D. Admin Tickets Page (`/dashboard/tickets`)

*(See Section 7 for full ticket system spec)*

### 5E. Admin Onboarding Page (`/dashboard/onboarding`)

*(See Section 10 for full onboarding spec)*

---

## 6. Page-by-Page Specification (Employee)

### 6A. Employee Dashboard (`/dashboard`)

**Purpose:** Personal workspace showing only what matters to this employee.

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  FORGE — My Workspace                [Bell] [User]  │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Welcome back, Alice!                               │
│  Status: 🟢 WORKING          Today: 2h 34m         │
│                                                     │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐              │
│  │ My Open │ │ My      │ │ Tickets │              │
│  │  Tasks  │ │Projects │ │ Raised  │              │
│  │    5    │ │    2    │ │    1    │              │
│  └─────────┘ └─────────┘ └─────────┘              │
│                                                     │
│  MY PROJECTS                                        │
│  ┌─────────────────────────────────────────────┐   │
│  │ Project Alpha  │ 3 tasks assigned to me     │   │
│  │ Project Gamma  │ 2 tasks assigned to me     │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  MY UPCOMING TASKS                                  │
│  ┌─────────────────────────────────────────────┐   │
│  │ □ Fix login redirect    Due: Apr 30  HIGH   │   │
│  │ □ Update user profile   Due: May 2   MEDIUM │   │
│  │ □ Write unit tests      Due: May 5   LOW    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  MY RECENT TICKETS                                  │
│  ┌─────────────────────────────────────────────┐   │
│  │ "CSS layout broken" — OPEN — Apr 3          │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Key Differences from Admin Dashboard:**
- NO company-wide stats
- NO "who's working now" section
- NO onboarding queue
- Shows only THEIR projects, THEIR tasks, THEIR tickets
- Greeting with their name
- Personal hours tracked today
- Simple stat cards: their open tasks, their projects, their tickets

---

### 6B. Employee Projects Page (`/dashboard/projects`)

**Purpose:** See ONLY projects they are assigned to.

```
┌─────────────────────────────────────────────────────┐
│  MY PROJECTS                                        │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Project Alpha     ACTIVE                    │   │
│  │ 3 tasks assigned to you    Lead: Alice      │   │
│  ├─────────────────────────────────────────────┤   │
│  │ Project Gamma     ACTIVE                    │   │
│  │ 2 tasks assigned to you    Lead: Charlie    │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  (No "New Project" button — employees can't create) │
└─────────────────────────────────────────────────────┘
```

**Differences:**
- NO "New Project" button
- Only shows projects where this employee is a member
- Shows their personal task count per project
- Each row clickable → project detail (same 3-tab view, but limited editing)

---

### 6C. Employee Team Members Page (`/dashboard/people`)

**Purpose:** Employee can see names of team members but NOTHING else.

```
┌─────────────────────────────────────────────────────┐
│  TEAM                                               │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Alice Johnson                                      │
│  Bob Smith                                          │
│  Charlie Brown                                      │
│  Diana Prince                                       │
│  Eve Williams                                       │
│                                                     │
│  (Names only. Not clickable. No status. No details) │
└─────────────────────────────────────────────────────┘
```

**Differences from Admin:**
- NO status indicators (no green/red dots)
- NO clickable names (no profile access)
- NO hours or project info shown
- NO filters needed — just a simple name list
- NO search (optional — could add name search only)
- Employee cannot see any other employee's profile, hours, projects, or details

---

### 6D. Employee Tickets Page (`/dashboard/tickets`)

*(See Section 7 — employees have full ticket access)*

### 6E. Employee Profile (`/dashboard/profile`)

**Purpose:** Employee can view their own profile only.

```
┌─────────────────────────────────────────────────────┐
│  MY PROFILE                                         │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Name: Alice Johnson                                │
│  Email: alice@company.com                           │
│  Role: Employee                                     │
│                                                     │
│  Today: 2h 34m                                      │
│                                                     │
│  MY PROJECTS                                        │
│  • Project Alpha (Lead)                             │
│  • Project Gamma (Member)                           │
│                                                     │
│  THIS WEEK'S HOURS                                  │
│  Mon: 7h 42m | Tue: 8h 15m | Wed: 6h 03m           │
│  Thu: 8h 00m | Fri: 2h 34m                          │
│  Total: 32h 34m                                     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

## 7. Ticket System — Full Spec

### What Is a Ticket?

A ticket is a **help request**. Any user (admin or employee) can raise a ticket saying "I'm stuck on something, I need help." Other team members browse open tickets and if they can help, they accept it. Once accepted, the ticket is marked as completed.

### Ticket Lifecycle

```
OPEN  →  ACCEPTED (helper assigned)  →  COMPLETED
```

That's it. Three states. Simple.

### Ticket Data Model

```
Ticket:
  id            — unique identifier
  title         — short description ("CSS grid not working")
  description   — detailed explanation of the problem
  projectId     — which project this relates to
  raisedById    — the user who created the ticket
  helperId      — the user who accepted it (null until accepted)
  status        — OPEN / ACCEPTED / COMPLETED
  createdAt     — when it was raised
  acceptedAt    — when someone accepted it (null until then)
  completedAt   — when it was marked complete (null until then)
```

### Ticket Page Layout (Same for Admin & Employee)

```
┌─────────────────────────────────────────────────────┐
│  TICKETS                          [+ Raise Ticket]  │
├─────────────────────────────────────────────────────┤
│  [Open (3)]  [Accepted (2)]  [Completed (15)]       │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ "CSS grid layout broken in dashboard"       │   │
│  │  Raised by: Alice  │  Project: Alpha        │   │
│  │  Posted: 2 hours ago                        │   │
│  │                          [I Can Help]        │   │
│  ├─────────────────────────────────────────────┤   │
│  │ "API returns 500 on user update"            │   │
│  │  Raised by: Bob    │  Project: Beta         │   │
│  │  Posted: 5 hours ago                        │   │
│  │                          [I Can Help]        │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

### "Raise Ticket" Modal

When user clicks "+ Raise Ticket":

```
┌─────────────────────────────────────────┐
│  RAISE A TICKET                    [X]  │
│                                         │
│  Title:                                 │
│  [________________________________]     │
│                                         │
│  Project:                               │
│  [Select project ▾]                     │
│  (only shows projects user belongs to)  │
│                                         │
│  Describe your issue:                   │
│  [________________________________]     │
│  [________________________________]     │
│  [________________________________]     │
│  (What are you stuck on? What have      │
│   you tried? What do you need?)         │
│                                         │
│              [Submit Ticket]            │
└─────────────────────────────────────────┘
```

### Ticket Detail View (when clicked)

```
┌─────────────────────────────────────────────────────┐
│  ← Back to Tickets                                  │
│                                                     │
│  "CSS grid layout broken in dashboard"              │
│  Status: OPEN                                       │
│                                                     │
│  Raised by: Alice Johnson                           │
│  Project: Project Alpha                             │
│  Posted: Apr 3, 2026 at 2:15 PM                     │
│                                                     │
│  DESCRIPTION                                        │
│  The CSS grid on the dashboard page is not           │
│  rendering correctly on mobile. I've tried           │
│  adjusting breakpoints but the sidebar overlaps      │
│  the main content area. Need help with responsive    │
│  grid layout.                                       │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │            [I Can Help]                      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### "I Can Help" Button Behavior

1. User clicks "I Can Help"
2. Confirmation: "Are you sure you want to accept this ticket?"
3. On confirm:
   - `status` → ACCEPTED
   - `helperId` → current user
   - `acceptedAt` → now
   - Notification sent to ticket raiser: "Bob has accepted your ticket!"
4. Ticket moves to "Accepted" tab
5. The ticket raiser and helper can now see each other on the ticket

### Completing a Ticket

Once accepted, the ticket shows:
```
  Accepted by: Bob Smith
  Accepted: Apr 3, 2026 at 3:00 PM

  [Mark as Completed]    (visible to both raiser and helper)
```

When "Mark as Completed" is pressed:
- `status` → COMPLETED
- `completedAt` → now
- Moves to "Completed" tab
- Notification to both parties

### Rules

- A user CANNOT accept their own ticket
- Once accepted by someone, no one else can accept it
- Only the ticket raiser or the helper can mark it as completed
- All users (admin + employee) see ALL tickets (to maximize help potential)
- Completed tickets remain visible in the "Completed" tab as history

---

## 8. Online/Working Tracking System

### How It Works

**The concept is simple:**
- When a user **logs in** → their status becomes **WORKING** and a time tracking session begins
- When a user **logs out** → their status becomes **NOT_WORKING** and the time tracking session ends
- The system records total working hours per user per day

### Data Model

```
UserStatus enum: WORKING, NOT_WORKING  (replaces old 5-status enum)

WorkSession:
  id          — unique identifier
  userId      — who this session belongs to
  date        — the calendar date (YYYY-MM-DD)
  loginAt     — timestamp when user logged in
  logoutAt    — timestamp when user logged out (null if still active)
  duration    — calculated minutes (logoutAt - loginAt), null if still active

DailyWorkLog:
  id          — unique identifier
  userId      — who this log belongs to
  date        — the calendar date (YYYY-MM-DD)
  totalMinutes — sum of all WorkSession durations for this user on this date
```

### Flow

**Login:**
1. User submits email + password
2. Authentication succeeds
3. System creates a new `WorkSession` record: `{ userId, date: today, loginAt: now }`
4. User's `currentStatus` is set to `WORKING`
5. Dashboard shows green "WORKING" indicator

**Logout:**
1. User clicks logout
2. System finds their active `WorkSession` (where `logoutAt` is null)
3. Sets `logoutAt` to now
4. Calculates `duration` = logoutAt - loginAt
5. Updates `DailyWorkLog` for today: adds this session's duration to `totalMinutes`
6. User's `currentStatus` is set to `NOT_WORKING`

**Edge Cases:**
- **Browser closes without logout**: A background job (or next login) should detect abandoned sessions and close them. Options:
  - Heartbeat ping every 5 minutes. If no ping for 15 minutes, auto-close session.
  - On next login, if there's an unclosed session from before, close it with the last heartbeat time as logoutAt.
- **Multiple logins in one day**: Multiple `WorkSession` records for the same day. `DailyWorkLog.totalMinutes` is the sum of all.
- **Midnight crossing**: If user logs in at 11 PM and logs out at 1 AM, split into two sessions: one for each date.

### Where This Data Is Shown

| Location | Who Sees It | What's Shown |
|---|---|---|
| Admin Dashboard | Admin | Green/red dots per member + today's hours |
| Admin Member Detail | Admin | Last 7 days daily hours + weekly total |
| Employee Dashboard | Employee | Their own hours today |
| Employee Profile | Employee | Their own weekly hours breakdown |

---

## 9. Project Detail — Three Tabs Spec

When you click on a project (from projects list), you see this:

```
┌─────────────────────────────────────────────────────┐
│  ← Projects                                         │
│                                                     │
│  PROJECT ALPHA                        Status: ACTIVE│
│  Lead: Alice Johnson                                │
│                                                     │
│  [Overview]  [Tasks]  [Updates]                      │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  (Tab content appears here)                         │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Tab 1: Overview

**Who Can Edit:** Project Lead + Admin only
**Who Can View:** All project members + Admin

**Content:**

```
┌─────────────────────────────────────────────────────┐
│  OVERVIEW                              [Edit] (*)   │
│                                                     │
│  DESCRIPTION                                        │
│  This project is building the new customer portal   │
│  with real-time dashboards and reporting. We are     │
│  targeting Q2 2026 for initial release.              │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  TEAM MEMBERS                                       │
│  • Alice Johnson (Lead)                             │
│  • Bob Smith                                        │
│  • Diana Prince                                     │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  PROJECT LINKS                                      │
│  • Repository: github.com/company/alpha             │
│  • Design: figma.com/file/alpha-design              │
│  • Docs: notion.so/alpha-docs                       │
│                                                     │
│  ─────────────────────────────────────────────────  │
│  DETAILS                                            │
│  Priority: HIGH                                     │
│  Deadline: Apr 30, 2026                              │
│  Created: Jan 15, 2026                               │
│  Status: ACTIVE                                     │
│                                                     │
└─────────────────────────────────────────────────────┘

(*) Edit button visible only to Project Lead and Admin
```

**Edit Mode (Project Lead / Admin):**
- Description: rich text or multiline input
- Project Links: add/remove URL fields with labels
- Team Members: add/remove (Admin only — Lead can suggest but Admin approves member changes)
- Priority and Deadline: editable
- Status: changeable (Admin only)

---

### Tab 2: Tasks

**Who Can Create Tasks:** Project Lead + Admin
**Who Can View:** All project members see tasks assigned to them. Project Lead + Admin see ALL tasks.
**Who Can Mark Done:** Only the assignee of that task (or Project Lead / Admin)

**Layout:**

```
┌─────────────────────────────────────────────────────┐
│  TASKS                              [+ New Task] (*) │
│                                                     │
│  Filter: [All ▾] [My Tasks ▾] [Status ▾]           │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ □ Fix login redirect                        │   │
│  │   Assigned to: Alice, Bob                   │   │
│  │   Deadline: Apr 30    Priority: HIGH        │   │
│  │   Status: IN_PROGRESS                       │   │
│  ├─────────────────────────────────────────────┤   │
│  │ □ Write API documentation                   │   │
│  │   Assigned to: Diana                        │   │
│  │   Deadline: May 5     Priority: MEDIUM      │   │
│  │   Status: TODO                              │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  (*) + New Task visible only to Lead/Admin          │
└─────────────────────────────────────────────────────┘
```

**"+ New Task" Modal (Project Lead / Admin):**

```
┌─────────────────────────────────────────┐
│  CREATE TASK                       [X]  │
│                                         │
│  Task Name:                             │
│  [________________________________]     │
│                                         │
│  Description:                           │
│  [________________________________]     │
│  [________________________________]     │
│                                         │
│  Expected Output:        (NEW FIELD)    │
│  [________________________________]     │
│  (What does "done" look like?)          │
│                                         │
│  Deadline:                              │
│  [Date picker]                          │
│                                         │
│  Priority:                              │
│  [LOW ▾ / MEDIUM / HIGH / CRITICAL]     │
│                                         │
│  Assign to:                             │
│  [Multi-select project members]         │
│                                         │
│              [Create Task]              │
└─────────────────────────────────────────┘
```

**Task Detail (when clicked):**

```
┌─────────────────────────────────────────────────────┐
│  ← Back to Tasks                                    │
│                                                     │
│  "Fix login redirect"                               │
│  Status: IN_PROGRESS     [Mark as Done]             │
│                                                     │
│  Description:                                       │
│  The login page redirects to /dashboard even when    │
│  the user hasn't completed onboarding. Fix the       │
│  redirect logic to check onboarding status.          │
│                                                     │
│  Expected Output:                                   │
│  Login should redirect to /onboarding if user        │
│  hasn't been approved, and /dashboard if they have.  │
│                                                     │
│  Assigned to: Alice, Bob                            │
│  Deadline: Apr 30, 2026                              │
│  Priority: HIGH                                     │
│  Created by: Alice (Lead)                           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

---

### Tab 3: Updates

**Who Can Post:** ALL project members + ALL admins
**Who Can View:** ALL project members + ALL admins

**Purpose:** This is a chat/discussion board for the project. Anyone in the project can post messages, share links, ask questions, give updates.

**Layout:**

```
┌─────────────────────────────────────────────────────┐
│  UPDATES                                            │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Alice (Lead) — Apr 3, 3:15 PM               │   │
│  │ Pushed the new auth flow to staging.          │   │
│  │ Please test: https://staging.company.com      │   │
│  ├─────────────────────────────────────────────┤   │
│  │ Bob — Apr 3, 2:00 PM                         │   │
│  │ Found a bug in the redirect. Working on fix.  │   │
│  ├─────────────────────────────────────────────┤   │
│  │ Admin (Admin) — Apr 2, 5:00 PM               │   │
│  │ Client wants to see a demo by Friday.         │   │
│  │ Let's prioritize the dashboard.               │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │ Type a message...                    [Send]  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Reverse chronological (newest first) or chronological (oldest first — configurable)
- Messages show: author name, role badge (Lead/Admin), timestamp, message content
- Support for plain text + links (URLs auto-linkified)
- No file uploads for now (keep simple)
- All admins can see and post in ALL project update channels, even if they're not project members

---

## 10. Onboarding Flow — Redesigned

### The New Flow

**Step 1: Admin Generates Credentials**
- Admin goes to `/dashboard/onboarding`
- Clicks "Generate New User"
- Selects role: Admin or Employee
- System auto-generates:
  - Email (admin enters it or system generates from name)
  - Temporary password (random, secure)
- Credentials are saved to database with `isOnboarding: true`
- Admin copies and gives credentials to the new person (verbally, email, etc.)

**Step 2: New User Logs In**
- New user goes to login page
- Enters credentials given by admin
- System sees `isOnboarding: true`
- Redirects to a **waiting page**: "Your account is pending approval. Please wait for an admin to approve you."
- User appears in admin's onboarding queue

**Step 3: Admin Approves**
- Admin sees the new user in the onboarding queue (dashboard or onboarding page)
- Admin clicks "Accept"
- Modal opens with:
  - Assign to project(s) (multi-select)
  - Confirm role (can change if needed)
- Admin clicks "Approve"
- `isOnboarding` → `false`
- User is now a full member

**Step 4: User Gains Access**
- On next page load (or auto-refresh), the waiting page detects approval
- User is redirected to their dashboard
- They can now access all features appropriate to their role

### Onboarding Page Layout (Admin Only)

```
┌─────────────────────────────────────────────────────┐
│  ONBOARDING                    [+ Generate User]    │
├─────────────────────────────────────────────────────┤
│                                                     │
│  PENDING APPROVAL                                   │
│  ┌─────────────────────────────────────────────┐   │
│  │ Eve Williams                                │   │
│  │ eve@company.com                             │   │
│  │ Role: Employee                              │   │
│  │ Created: Apr 3, 2026                         │   │
│  │           [Accept & Assign]  [Reject]        │   │
│  ├─────────────────────────────────────────────┤   │
│  │ Frank Davis                                 │   │
│  │ frank@company.com                           │   │
│  │ Role: Employee                              │   │
│  │ Created: Apr 2, 2026                         │   │
│  │           [Accept & Assign]  [Reject]        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  RECENTLY APPROVED                                  │
│  ┌─────────────────────────────────────────────┐   │
│  │ Grace Lee — Approved Apr 1 — Project Alpha  │   │
│  │ Henry Wu  — Approved Mar 28 — Project Beta  │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### "Generate User" Modal

```
┌─────────────────────────────────────────┐
│  GENERATE NEW USER                 [X]  │
│                                         │
│  Full Name:                             │
│  [________________________________]     │
│                                         │
│  Email:                                 │
│  [________________________________]     │
│                                         │
│  Role:                                  │
│  ( ) Admin                              │
│  ( ) Employee                           │
│                                         │
│              [Generate]                 │
│                                         │
│  ─────────────────────────────────────  │
│  (After generation:)                    │
│                                         │
│  ✓ User Created!                        │
│  Email: eve@company.com                 │
│  Password: xK9#mP2$vL7n                │
│                                         │
│  [Copy Credentials]  [Done]             │
│                                         │
└─────────────────────────────────────────┘
```

**Important:** The generated password is shown ONCE. Admin copies it. It's never shown again. The user should be encouraged to change their password (future feature, not in scope now).

---

## 11. User Generation by Admin

This is tightly coupled with onboarding (Section 10) but here's the specific technical flow:

### API: `POST /api/admin/generate-user`

**Request:**
```
{
  name: "Eve Williams",
  email: "eve@company.com",
  role: "EMPLOYEE" | "ADMIN"
}
```

**Server Logic:**
1. Verify caller is ADMIN
2. Check email doesn't already exist
3. Generate random secure password (16 chars, mixed case + numbers + symbols)
4. Hash password with bcrypt
5. Create User record: `{ name, email, passwordHash, role, isOnboarding: true, currentStatus: NOT_WORKING }`
6. Return: `{ email, temporaryPassword }` (plain text password returned ONCE)

**Security:**
- Only ADMIN can call this endpoint
- Password is generated server-side (never from client)
- Plain text password is returned in response ONCE and never stored
- The hash is what's stored in the database

---

## 12. Navigation & Sidebar Changes

### Admin Sidebar

```
◆  DASHBOARD        → /dashboard
□  PROJECTS         → /dashboard/projects
○  TEAM             → /dashboard/people
⊞  TICKETS          → /dashboard/tickets
◈  ONBOARDING       → /dashboard/onboarding
```

### Employee Sidebar

```
◆  DASHBOARD        → /dashboard
□  MY PROJECTS      → /dashboard/projects
○  TEAM             → /dashboard/people
⊞  TICKETS          → /dashboard/tickets
◎  MY PROFILE       → /dashboard/profile
```

### What Changed

| Old | New |
|---|---|
| STANDUP link | REMOVED |
| BLOCKERS link | REPLACED with TICKETS |
| ONBOARDING (admin only — same) | ONBOARDING (admin only — redesigned) |
| No profile link | MY PROFILE (employee only) |

### Status Selector in Sidebar

**Old:** Dropdown with 5 statuses (Active, Focus, Available, In Meeting, Offline)
**New:** REMOVED. Status is automatic. WORKING when logged in, NOT_WORKING when logged out. No manual control.

---

## 13. Database Schema Changes

### Models to ADD

```prisma
enum UserStatus {
  WORKING
  NOT_WORKING
}

enum TicketStatus {
  OPEN
  ACCEPTED
  COMPLETED
}

model Ticket {
  id            String       @id @default(cuid())
  title         String
  description   String
  projectId     String
  project       Project      @relation(fields: [projectId], references: [id])
  raisedById    String
  raisedBy      User         @relation("TicketsRaised", fields: [raisedById], references: [id])
  helperId      String?
  helper        User?        @relation("TicketsHelped", fields: [helperId], references: [id])
  status        TicketStatus @default(OPEN)
  createdAt     DateTime     @default(now())
  acceptedAt    DateTime?
  completedAt   DateTime?
}

model WorkSession {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  date      DateTime @db.Date
  loginAt   DateTime
  logoutAt  DateTime?
  duration  Int?          // minutes
}

model DailyWorkLog {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  date         DateTime @db.Date
  totalMinutes Int      @default(0)

  @@unique([userId, date])
}
```

### Fields to ADD to existing models

```prisma
// Project model — add:
  leadId    String?
  lead      User?    @relation("ProjectLead", fields: [leadId], references: [id])
  links     Json?    // array of { label: string, url: string }

// Task model — add:
  expectedOutput  String?   // what "done" looks like
```

### Models to REMOVE

```
StandupEntry, Blocker, BlockerThread, HandoffNote, AvailabilityWindow, OnboardingProgress
```

### Enums to CHANGE

```
UserStatus:    ACTIVE, FOCUS, AVAILABLE, IN_MEETING, OFFLINE  →  WORKING, NOT_WORKING
Remove:        BlockerStatus, AvailabilityType
Add:           TicketStatus (OPEN, ACCEPTED, COMPLETED)
Update:        NotificationType — remove BLOCKER_*, STANDUP_*, HANDOFF_*
                                — add TICKET_RAISED, TICKET_ACCEPTED, TICKET_COMPLETED
```

---

## 14. Additional Recommendations

These are things not explicitly in your 10 requirements but that make sense given the redesign:

### 14A. Password Change

Since admin generates passwords, employees should be able to change their password after first login. Add a "Change Password" option in the profile page or user dropdown.

### 14B. Session Heartbeat

For accurate time tracking, implement a heartbeat system:
- Frontend sends a ping to `/api/heartbeat` every 5 minutes
- Server updates a `lastSeenAt` timestamp on the user
- If no heartbeat for 15 minutes, auto-close the work session
- This handles browser crashes, lost internet, etc.

### 14C. Notification Types (Updated)

```
TICKET_RAISED       — "Alice raised a ticket in Project Alpha"
TICKET_ACCEPTED     — "Bob accepted your ticket"
TICKET_COMPLETED    — "Your ticket has been marked complete"
TASK_ASSIGNED       — "You've been assigned a new task"
TASK_COMPLETED      — "Alice completed a task"
PROJECT_ANNOUNCEMENT — "New message in Project Alpha updates"
ONBOARDING_APPROVED — "Your account has been approved!"
```

### 14D. Admin Activity Log

Consider adding a simple activity log visible only to admins showing recent actions across the platform:
- "Alice logged in"
- "Bob raised a ticket"
- "Charlie completed 3 tasks"
- "Eve was approved and added to Project Alpha"

This gives admin a real-time feed without having to check individual member profiles. (Optional — can be added later)

### 14E. Project Lead Transfer

Admin should be able to change the project lead after creation. Add an "Change Lead" button in the project overview (admin only).

### 14F. Employee Can See Their Own Hours

Even though employees can't see others' profiles, they should see their own work hours clearly on their dashboard and profile page. This is already covered in sections 6A and 6E.

### 14G. Waiting Page for Onboarding Users

When a user with `isOnboarding: true` logs in, they should see a clean, friendly waiting page:
```
┌─────────────────────────────────────────────────────┐
│                                                     │
│         Welcome to FORGE, Eve!                      │
│                                                     │
│         Your account is being set up.               │
│         An admin will approve your access            │
│         shortly.                                    │
│                                                     │
│         [Refresh Status]                            │
│                                                     │
│         (Auto-refreshes every 30 seconds)           │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### 14H. Confirmation Dialogs

Add confirmation dialogs for destructive or significant actions:
- "Accept this ticket?" — before accepting a help ticket
- "Mark ticket as completed?" — before closing
- "Approve this user?" — before onboarding approval
- "Delete this project?" — admin project deletion
- "Remove member from project?" — admin member removal

### 14I. Responsive Design

The current app has mobile navigation. The redesign should maintain mobile support:
- Dashboard: single column on mobile, cards stack vertically
- Projects: full-width cards on mobile
- Tickets: same layout works on mobile
- Team: simple name list is already mobile-friendly

---

## 15. Migration Checklist

This is the order of implementation:

### Phase 1: Database & Cleanup
- [ ] Update Prisma schema (remove old models, add new ones, change enums)
- [ ] Run migration
- [ ] Remove all standup-related files (pages, components, API routes)
- [ ] Remove all blocker-related files
- [ ] Remove handoff-related files
- [ ] Remove availability-related files
- [ ] Remove old onboarding checklist files
- [ ] Remove old status selector component
- [ ] Clean up notification types

### Phase 2: Core Systems
- [ ] Implement WorkSession + DailyWorkLog models and API
- [ ] Update login flow to create work sessions and set WORKING status
- [ ] Update logout flow to close sessions and set NOT_WORKING status
- [ ] Implement heartbeat system
- [ ] Add Project Lead field to projects
- [ ] Add expectedOutput field to tasks
- [ ] Add links field to projects

### Phase 3: Ticket System
- [ ] Create Ticket model + API routes (CRUD)
- [ ] Build ticket page UI
- [ ] Build "Raise Ticket" modal
- [ ] Build ticket detail view
- [ ] Implement "I Can Help" / accept flow
- [ ] Implement "Mark Completed" flow
- [ ] Add ticket notifications

### Phase 4: Admin User Generation & Onboarding
- [ ] Build admin user generation API
- [ ] Build "Generate User" modal
- [ ] Build onboarding approval queue
- [ ] Build "Accept & Assign" modal
- [ ] Build waiting page for onboarding users
- [ ] Remove old registration endpoint

### Phase 5: Dashboard Redesign
- [ ] Build new Admin Dashboard layout
- [ ] Build new Employee Dashboard layout
- [ ] Add working/not-working indicators
- [ ] Add daily hours display

### Phase 6: Page Redesign
- [ ] Redesign Projects page (admin vs employee views)
- [ ] Redesign Project Detail (3 tabs: Overview, Tasks, Updates)
- [ ] Implement Project Lead editing permissions
- [ ] Redesign Team Members page (admin: clickable profiles; employee: names only)
- [ ] Build Admin Member Detail view (hours, tasks, projects)
- [ ] Build Employee Profile page
- [ ] Add password change functionality

### Phase 7: Navigation & Polish
- [ ] Update sidebar navigation (different for admin/employee)
- [ ] Remove status selector from sidebar
- [ ] Update notification system
- [ ] Add confirmation dialogs
- [ ] Test all role-based access controls
- [ ] Responsive design verification

---

## Summary of Key Decisions

1. **Two roles only**: ADMIN and EMPLOYEE. Project Lead is a per-project designation, not a separate role.
2. **Status is automatic**: WORKING on login, NOT_WORKING on logout. No manual status changes.
3. **Time tracking is session-based**: Each login/logout pair creates a WorkSession. Daily totals are aggregated.
4. **Tickets replace blockers**: Simpler 3-state lifecycle. Everyone can see and help.
5. **No standups, no blockers, no handoffs, no availability windows**: Removed entirely.
6. **Admin generates all user accounts**: No public registration. Admin creates credentials.
7. **Onboarding = approval gate**: New users wait for admin approval before accessing the platform.
8. **Employee isolation**: Employees see only their own data. They cannot view other members' profiles, hours, or projects.
9. **Project Lead has limited power**: Can edit overview and create tasks within their project only. Cannot create projects or manage members across the platform.
10. **Updates tab is a chat**: Real-time-like messaging within each project for all members and admins.
