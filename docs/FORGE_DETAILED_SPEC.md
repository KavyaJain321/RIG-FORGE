# FORGE — Detailed Design Specification (Complete)
> No code. This is the full theoretical blueprint — every page, every button, every user state, every flow, every edge case explained in full detail.

---

## TABLE OF CONTENTS

1. [The Two Roles — Deep Definition](#1-the-two-roles--deep-definition)
2. [The Project Lead Sub-Role](#2-the-project-lead-sub-role)
3. [Login Page & Authentication Flow](#3-login-page--authentication-flow)
4. [The Waiting/Pending Page (New Users)](#4-the-waitingpending-page-new-users)
5. [Sidebar & Navigation — Per Role](#5-sidebar--navigation--per-role)
6. [ADMIN — Dashboard Page](#6-admin--dashboard-page)
7. [ADMIN — Projects Page](#7-admin--projects-page)
8. [ADMIN — Project Detail (3 Tabs)](#8-admin--project-detail-3-tabs)
9. [ADMIN — Team Members Page](#9-admin--team-members-page)
10. [ADMIN — Member Detail View](#10-admin--member-detail-view)
11. [ADMIN — Tickets Page](#11-admin--tickets-page)
12. [ADMIN — Onboarding Page](#12-admin--onboarding-page)
13. [EMPLOYEE — Dashboard Page](#13-employee--dashboard-page)
14. [EMPLOYEE — Projects Page](#14-employee--projects-page)
15. [EMPLOYEE — Project Detail (3 Tabs)](#15-employee--project-detail-3-tabs)
16. [EMPLOYEE — Team Members Page](#16-employee--team-members-page)
17. [EMPLOYEE — Tickets Page](#17-employee--tickets-page)
18. [EMPLOYEE — My Profile Page](#18-employee--my-profile-page)
19. [Ticket System — Complete Lifecycle](#19-ticket-system--complete-lifecycle)
20. [Working/Not Working Status System](#20-workingnot-working-status-system)
21. [Time Tracking — How It Works](#21-time-tracking--how-it-works)
22. [Project Detail — Overview Tab (Full)](#22-project-detail--overview-tab-full)
23. [Project Detail — Tasks Tab (Full)](#23-project-detail--tasks-tab-full)
24. [Project Detail — Updates Tab (Full)](#24-project-detail--updates-tab-full)
25. [Onboarding Flow — Complete Step by Step](#25-onboarding-flow--complete-step-by-step)
26. [Admin User Generation — Full Flow](#26-admin-user-generation--full-flow)
27. [Notifications System — Every Type](#27-notifications-system--every-type)
28. [Database Schema Changes — Full Detail](#28-database-schema-changes--full-detail)
29. [What Gets Removed — Full List](#29-what-gets-removed--full-list)
30. [Edge Cases & Rules](#30-edge-cases--rules)

---

## 1. The Two Roles — Deep Definition

### ADMIN

An admin is someone with full visibility and control over the entire company workspace. There can be multiple admins. Admins are created either by other admins (via user generation in onboarding) or as the first seed user.

**What an admin fundamentally is:**
- They can see EVERYTHING across ALL projects, ALL employees, ALL tickets
- They control who joins the platform (they generate credentials)
- They control who joins which project (they approve onboarding and assign projects)
- They create all projects and designate who leads them
- They are the only people who can see individual employee work hours and history
- They see the company's health from a bird's eye view at all times

**What an admin is NOT:**
- They are not necessarily in every project (they can be added as members to specific projects if needed, but by default they have read access to all projects without being listed as a member)
- They don't control individual tasks day-to-day — that's the project lead's job
- They are not a developer/worker by default — they are a manager/operator

**Admin Access Summary:**
- Dashboard: Company-wide view (all members, all projects, all working status, all tickets, all hours)
- Projects: All projects visible, can create/archive/edit any
- Team Members: Full directory, can click any name to see their full profile
- Tickets: All tickets visible, can raise tickets, can accept tickets, can complete tickets
- Onboarding: Full control — generate users, approve/reject pending users, assign to projects

---

### EMPLOYEE

An employee is someone who works on specific assigned projects. They can only see and interact with what is directly relevant to them.

**What an employee fundamentally is:**
- They only see projects they have been added to by admin
- They can raise tickets asking for help from anyone in the company
- They can browse all open tickets and help others
- They can only see team member names — no one else's profiles, hours, or projects
- They have no administrative powers whatsoever
- They can only see their own hours and history on their personal profile page

**What an employee is NOT:**
- They cannot create projects
- They cannot see other employees' hours, tasks done, or project assignments
- They cannot approve or reject anyone
- They cannot generate users

**Employee Access Summary:**
- Dashboard: Personal workspace (their tasks, their projects, their hours, their tickets)
- Projects: Only their assigned projects are visible
- Team Members: Can see everyone's names but nothing else
- Tickets: Can see all tickets companywide and help anyone, can raise their own
- Profile: Can see their own hours and project assignments only

---

## 2. The Project Lead Sub-Role

A Project Lead is NOT a third role in the system. Their database role stays as EMPLOYEE. The "lead" designation is stored per project (Project has a `leadId` field). This means:

- A person can be a lead on one project and a regular member on another
- Being a project lead gives you extra editing powers only WITHIN that project
- Everywhere else in the app (dashboard, team members, tickets) they behave exactly like a regular employee

### What Project Lead Can Do (within their own project ONLY):

**In Overview Tab:**
- Edit the project description
- Add and update project links (repository, design files, docs, etc.)
- They CANNOT add or remove project members — only admin can do that
- They CANNOT change project status (ACTIVE/ON HOLD/COMPLETED) — only admin

**In Tasks Tab:**
- Create new tasks and assign them to any project member
- Edit any existing task in the project
- Mark any task as done (not just their own)
- Delete tasks (soft delete — mark as removed)
- See ALL tasks in the project, not just their own assigned tasks

**In Updates Tab:**
- Post messages just like any other member
- Their messages show a "(Lead)" badge next to their name so the team knows

**What Project Lead CANNOT Do:**
- Create projects
- See other employees' profiles
- See company-wide stats
- Access the onboarding page
- Generate users
- Edit projects they are NOT the lead of (they behave as regular employee in those)

---

## 3. Login Page & Authentication Flow

### What the Login Page Looks Like

The login page is the only public page. No registration form exists — users cannot self-register.

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│                    FORGE                            │
│              Team Operations Platform               │
│                                                     │
│  ─────────────────────────────────────────────────  │
│                                                     │
│  Email Address                                      │
│  ┌─────────────────────────────────────────────┐   │
│  │  your.name@company.com                      │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  Password                                           │
│  ┌───────────────────────────────────────── 👁 ┐   │
│  │  ••••••••••••                               │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │              Sign In                        │   │
│  └─────────────────────────────────────────────┘   │
│                                                     │
│  (No "Register" link. No "Forgot password" yet)     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**The 👁 icon** — toggles password visibility between dots and plain text. Currently exists, keep it.

**Error states on the login form:**
- Wrong email: "No account found with this email."
- Wrong password: "Incorrect password. Please try again."
- Empty fields: "Please enter your email and password."
- User is pending onboarding approval: Does NOT show error. Instead redirects to the waiting page.
- Account deleted/inactive: "This account is no longer active. Contact your admin."

### What Happens Immediately After Login (Server Side):

1. Server validates email + password
2. If valid, server checks `isOnboarding` flag on the user
3. If `isOnboarding = true` → redirect to `/pending` (waiting page, described in Section 4)
4. If `isOnboarding = false` → proceed normally:
   a. Create a `WorkSession` record for today with `loginAt = now`
   b. Set user's `currentStatus = WORKING`
   c. Issue JWT token cookie
   d. Redirect based on role:
      - ADMIN → `/dashboard`
      - EMPLOYEE → `/dashboard`
      - (Both roles go to same URL but see completely different content)

---

## 4. The Waiting/Pending Page (New Users)

When a newly created user logs in for the first time, they are in `isOnboarding: true` state. They cannot access the dashboard. They see this page:

```
┌─────────────────────────────────────────────────────┐
│                    FORGE                            │
│                                                     │
│                                                     │
│           Welcome to FORGE, [Name]!                 │
│                                                     │
│     ┌─────────────────────────────────────────┐    │
│     │          ⏳                              │    │
│     │                                         │    │
│     │  Your account is pending approval.      │    │
│     │                                         │    │
│     │  An admin will review and approve        │    │
│     │  your access shortly. Once approved,    │    │
│     │  you'll be automatically redirected     │    │
│     │  to your workspace.                     │    │
│     │                                         │    │
│     └─────────────────────────────────────────┘    │
│                                                     │
│           [Refresh Status]                          │
│                                                     │
│     Auto-checks every 30 seconds...                │
│                                                     │
│     ─────────────────────────────────────────────   │
│     Not you? [Log out]                             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

**Behavior:**
- This page auto-polls `/api/auth/me` every 30 seconds
- When `isOnboarding` changes to `false` (admin approved them), the page automatically detects this and redirects them to `/dashboard` without any manual action needed
- "Refresh Status" button is a manual trigger for the same poll — for impatient users
- "Log out" link lets them sign out and return to the login page
- No sidebar, no navigation — just this simple screen
- The URL is `/pending` — if a non-pending user tries to access `/pending`, they are redirected to `/dashboard`
- If a pending user tries to access `/dashboard` directly, middleware catches it and redirects them to `/pending`

---

## 5. Sidebar & Navigation — Per Role

### Admin Sidebar

```
┌──────────────────┐
│   FORGE          │
│   ── ── ──       │
│                  │
│  ◆ Dashboard     │   → /dashboard
│  □ Projects      │   → /dashboard/projects
│  ○ Team          │   → /dashboard/people
│  ⊞ Tickets       │   → /dashboard/tickets
│  ◈ Onboarding    │   → /dashboard/onboarding
│                  │
│  ── ── ──        │
│                  │
│  [Avatar]        │
│  Admin Name      │
│  🟢 WORKING      │   (display only — auto status)
│  [Log Out]       │
│                  │
│  🔔 Bell (3)     │   (notification count badge)
└──────────────────┘
```

**Active states:** The current page's link gets highlighted (bold text, different background or left border accent).

**Status display:** Shows "🟢 WORKING" or "🔴 NOT WORKING" as plain text — NOT a dropdown. It cannot be manually changed. It just reflects current login state.

**Bell icon:** Shows count of unread notifications. Clicking it opens a dropdown panel.

---

### Employee Sidebar

```
┌──────────────────┐
│   FORGE          │
│   ── ── ──       │
│                  │
│  ◆ Dashboard     │   → /dashboard
│  □ My Projects   │   → /dashboard/projects
│  ○ Team          │   → /dashboard/people
│  ⊞ Tickets       │   → /dashboard/tickets
│  ◎ My Profile    │   → /dashboard/profile
│                  │
│  ── ── ──        │
│                  │
│  [Avatar]        │
│  Employee Name   │
│  🟢 WORKING      │   (display only — cannot change)
│  [Log Out]       │
│                  │
│  🔔 Bell (1)     │
└──────────────────┘
```

**Key differences:**
- "My Projects" instead of "Projects" (subtle rename, same URL)
- "My Profile" instead of no profile link
- NO "Onboarding" link — that page doesn't exist for employees, middleware blocks it too
- Status is still displayed but is NOT interactive (no dropdown, no selector)

### Mobile Navigation (Bottom Bar)

On mobile, the sidebar collapses into a bottom navigation bar:

**Admin mobile bar:**
```
[◆ Home] [□ Projects] [○ Team] [⊞ Tickets] [◈ More]
```
"More" expands to show: Onboarding, Log Out, Profile

**Employee mobile bar:**
```
[◆ Home] [□ Projects] [○ Team] [⊞ Tickets] [◎ Me]
```
"Me" shows their profile

---

## 6. ADMIN — Dashboard Page

**URL:** `/dashboard`
**Who sees it:** ADMIN role
**Purpose:** Complete company overview at a glance. Know who is working, what's happening, what needs attention.

### Full Page Layout

```
┌─────────────────────────────────────────────────────────────┐
│  SIDEBAR   │           MAIN CONTENT                        │
│            │                                               │
│  ◆ Dash    │  FORGE Command Center          🔄 Refresh     │
│  □ Proj    │  Friday, April 4, 2026                        │
│  ○ Team    │                                               │
│  ⊞ Tickets │  ┌─────────┐ ┌─────────┐ ┌────────┐ ┌──────┐│
│  ◈ Onboard │  │  Total  │ │Working  │ │  Not   │ │Open  ││
│            │  │Members  │ │  Now    │ │Working │ │Ticket││
│  ── ── ──  │  │   14    │ │  9      │ │   5    │ │  3   ││
│            │  └─────────┘ └─────────┘ └────────┘ └──────┘│
│  [Avatar]  │                                               │
│  Admin     │  ─────────────────────────────────────────── │
│  🟢 WORK   │                                               │
│  [Log Out] │  WHO'S WORKING RIGHT NOW                      │
│            │                                               │
│  🔔(3)     │  ┌──────────────────────────────────────────┐│
│            │  │ 🟢 Alice Johnson     2h 34m today        ││
│            │  │    Project Alpha (Lead)        [View →]  ││
│            │  ├──────────────────────────────────────────┤│
│            │  │ 🟢 Bob Smith         1h 12m today        ││
│            │  │    Project Beta                [View →]  ││
│            │  ├──────────────────────────────────────────┤│
│            │  │ 🔴 Charlie Brown     — not working —     ││
│            │  │    Project Gamma                [View →]  ││
│            │  ├──────────────────────────────────────────┤│
│            │  │ 🟢 Diana Prince      3h 05m today        ││
│            │  │    Project Alpha               [View →]  ││
│            │  ├──────────────────────────────────────────┤│
│            │  │ 🟢 Eve Williams      0h 45m today        ││
│            │  │    Project Gamma               [View →]  ││
│            │  └──────────────────────────────────────────┘│
│            │                                               │
│            │  ─────────────────────────────────────────── │
│            │                                               │
│            │  ACTIVE PROJECTS                [View All →] │
│            │                                               │
│            │  ┌──────────────────────────────────────────┐│
│            │  │ Project Alpha    ACTIVE                  ││
│            │  │ Lead: Alice  │ 5 members │ 4 open tasks  ││
│            │  ├──────────────────────────────────────────┤│
│            │  │ Project Beta     ACTIVE                  ││
│            │  │ Lead: Bob    │ 3 members │ 7 open tasks  ││
│            │  ├──────────────────────────────────────────┤│
│            │  │ Project Gamma    ACTIVE                  ││
│            │  │ Lead: Charlie│ 6 members │ 2 open tasks  ││
│            │  └──────────────────────────────────────────┘│
│            │                                               │
│            │  ─────────────────────────────────────────── │
│            │                                               │
│            │  OPEN TICKETS                   [View All →] │
│            │                                               │
│            │  ┌──────────────────────────────────────────┐│
│            │  │ "CSS grid broken in dashboard"           ││
│            │  │  Alice → Project Alpha → 2 hours ago     ││
│            │  ├──────────────────────────────────────────┤│
│            │  │ "API returns 500 on profile update"      ││
│            │  │  Bob → Project Beta → 5 hours ago        ││
│            │  ├──────────────────────────────────────────┤│
│            │  │ "Docker build fails on M1 Mac"           ││
│            │  │  Eve → Project Gamma → 1 day ago         ││
│            │  └──────────────────────────────────────────┘│
│            │                                               │
│            │  ─────────────────────────────────────────── │
│            │                                               │
│            │  PENDING ONBOARDING              [Go →]      │
│            │                                               │
│            │  ┌──────────────────────────────────────────┐│
│            │  │ Frank Davis — frank@co.com  PENDING      ││
│            │  │ Created: Apr 3, 2026     [Accept] [Skip] ││
│            │  └──────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Each Section Explained in Detail

**Top Stat Cards (4 cards):**

Card 1 — Total Members
- Shows the count of ALL users in the system (ADMIN + EMPLOYEE combined)
- Clicking this card navigates to `/dashboard/people` (team page)
- Does not update in real time — refreshes with the page or when 🔄 is clicked

Card 2 — Working Now
- Shows count of users whose `currentStatus = WORKING`
- Includes both admins and employees
- Green background or green number to indicate "good/active"
- Clicking this card navigates to `/dashboard/people` with filter pre-set to "Working"

Card 3 — Not Working
- Shows count of users whose `currentStatus = NOT_WORKING`
- Muted color or red number
- Clicking navigates to `/dashboard/people` with filter pre-set to "Not Working"

Card 4 — Open Tickets
- Shows count of tickets with `status = OPEN`
- If count > 0, shows with an orange/red accent to draw attention
- Clicking navigates to `/dashboard/tickets` with filter pre-set to "Open"

**🔄 Refresh Button (top right of content area):**
- Manually re-fetches all dashboard data
- Shows a spinning animation while loading
- Also shows "Last updated: 2 minutes ago" text next to it
- Data auto-refreshes every 60 seconds silently in the background

**Who's Working Right Now section:**
- Lists ALL employees (and other admins) in the company
- Each row shows:
  - Status dot: 🟢 for WORKING, 🔴 for NOT_WORKING
  - Full name
  - Hours logged today (e.g., "2h 34m today") — if NOT_WORKING, shows "— not working —"
  - Primary project they're assigned to (if multiple projects, show the first one or the one where they are lead)
  - [View →] button — clicking it goes to that employee's full detail profile page
- NOT_WORKING employees are shown below WORKING employees (working first, then offline)
- This section shows ALL members, not just a few. If there are 50 employees, all 50 are listed here
- No pagination needed for typical team sizes, but could add scroll

**Active Projects section:**
- Shows only ACTIVE status projects (not ON_HOLD, COMPLETED, ARCHIVED)
- Shows max 5 projects here; "View All →" goes to full projects page
- Each row is clickable and goes to the project detail page
- Shows: project name, status badge, lead name, member count, open task count
- "Open tasks" = tasks with status TODO or IN_PROGRESS

**Open Tickets section:**
- Shows the 3 most recently raised OPEN tickets
- Each item shows: ticket title (truncated if long), who raised it, which project, how long ago
- "View All →" goes to the full tickets page with Open filter active
- Each ticket item is clickable and goes to that ticket's detail

**Pending Onboarding section:**
- ONLY shows if there are users with `isOnboarding = true`
- If no one is pending, this section is hidden entirely (doesn't show an empty state)
- Each pending user shows: name, email, when they were created
- [Accept] button → opens the Accept & Assign modal (described in Section 12)
- [Skip] button → dismisses this user from the dashboard queue but they still appear on the full Onboarding page. "Skip" just means "I'll handle this later from the Onboarding page"
- "Go →" link → goes to full `/dashboard/onboarding` page

---

## 7. ADMIN — Projects Page

**URL:** `/dashboard/projects`
**Who sees it:** ADMIN
**Purpose:** View, manage, and create all company projects

### Full Page Layout

```
┌──────────────────────────────────────────────────────────┐
│  PROJECTS                              [+ New Project]   │
│                                                          │
│  ┌─────────┐ ┌─────────┐ ┌──────────┐ ┌─────────────┐  │
│  │  All    │ │ Active  │ │ On Hold  │ │  Completed   │  │
│  │  (8)    │ │  (5)    │ │   (1)    │ │    (2)       │  │
│  └─────────┘ └─────────┘ └──────────┘ └─────────────┘  │
│                                                          │
│  [Search projects...    ]  [Sort: Newest ▾]             │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Project Alpha                                    │   │
│  │ Status: ACTIVE  │  Priority: HIGH                │   │
│  │ Lead: Alice Johnson  │  5 members                │   │
│  │ Deadline: Apr 30, 2026  │  4 tasks open          │   │
│  │                                          [Open →]│   │
│  ├──────────────────────────────────────────────────┤   │
│  │ Project Beta                                     │   │
│  │ Status: ACTIVE  │  Priority: MEDIUM              │   │
│  │ Lead: Bob Smith  │  3 members                    │   │
│  │ Deadline: May 15, 2026  │  7 tasks open          │   │
│  │                                          [Open →]│   │
│  ├──────────────────────────────────────────────────┤   │
│  │ Project Gamma                                    │   │
│  │ Status: ON_HOLD │  Priority: LOW                 │   │
│  │ Lead: Charlie   │  6 members                     │   │
│  │ Deadline: Jun 1, 2026  │  2 tasks open           │   │
│  │                                          [Open →]│   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### "[+ New Project]" Button

ONLY visible to ADMIN. Clicking it opens a modal.

**Create Project Modal:**
```
┌──────────────────────────────────────────────┐
│  CREATE NEW PROJECT                     [X]  │
│                                              │
│  Project Name  *                             │
│  [________________________________]          │
│                                              │
│  Description  *                              │
│  [________________________________]          │
│  [________________________________]          │
│  [________________________________]          │
│  (Explain what this project is about)        │
│                                              │
│  Project Lead  *                             │
│  [Select an employee ▾]                      │
│  (This person can edit project details       │
│   and create/assign tasks)                   │
│                                              │
│  Team Members                                │
│  [Select members ▾] (multi-select)           │
│  ┌──────────────────────────────────────┐    │
│  │ ✓ Alice Johnson    ✓ Bob Smith       │    │
│  │ ✓ Diana Prince     □ Eve Williams    │    │
│  └──────────────────────────────────────┘    │
│  (Note: Project Lead is auto-added           │
│   as a member when selected above)           │
│                                              │
│  Deadline                                    │
│  [Date picker ▾]                             │
│                                              │
│  Priority                                    │
│  ( ) LOW   (●) MEDIUM   ( ) HIGH   ( ) CRITICAL │
│                                              │
│  Project Links  (optional)                   │
│  Label: [Repository]  URL: [____________]    │
│  Label: [Design]      URL: [____________]    │
│  Label: [Docs]        URL: [____________]    │
│  [+ Add another link]                        │
│                                              │
│  [Cancel]           [Create Project]         │
└──────────────────────────────────────────────┘
```

**Validation on Create:**
- Project Name: required, min 3 characters
- Description: required, min 10 characters
- Project Lead: required — must select someone
- Deadline: optional but recommended (shows warning if not set)
- Members: optional at creation — can add later in project detail
- Links: completely optional

**After creation:**
- Modal closes
- Project appears at top of the list
- User is navigated to the new project's detail page automatically
- Notification is sent to the selected Project Lead: "You've been made the lead of [Project Name]"
- Notification is sent to all selected members: "You've been added to [Project Name]"

### Filter Tabs

- **All (8)** — shows every project regardless of status
- **Active (5)** — only ACTIVE projects
- **On Hold (1)** — only ON_HOLD projects
- **Completed (2)** — only COMPLETED or ARCHIVED projects
- Numbers in parentheses are live counts

### Sort Options

- Newest First (default)
- Oldest First
- By Deadline (soonest first)
- By Name (A-Z)
- By Priority (highest first)
- By Most Open Tasks

### Search

- Searches project name in real time as you type
- No search button needed — filters as you type
- If no results: "No projects match your search."

### Each Project Row

Every project row is fully clickable (the whole card) or has [Open →] at the right. Both do the same thing: go to project detail page. The row shows all key info at a glance.

---

## 8. ADMIN — Project Detail (3 Tabs)

*(See Sections 22, 23, 24 for each tab's complete detail — admin has full access to all three)*

Admin-specific differences in project detail:
- Can change project status (ACTIVE / ON_HOLD / COMPLETED / ARCHIVED) via a dropdown in the header
- Can change the project lead via "Change Lead" button in Overview tab
- Can add and remove members from the project
- Can edit and delete any task regardless of assignee
- Can see ALL tasks, not just their own
- Has an [Edit Project] button in the top-right of the project header that opens a modal to change name, description, deadline, priority

---

## 9. ADMIN — Team Members Page

**URL:** `/dashboard/people`
**Who sees it:** ADMIN
**Purpose:** See all employees, their current status, and access their detailed profiles

### Full Page Layout

```
┌──────────────────────────────────────────────────────────┐
│  TEAM MEMBERS                                            │
│                                                          │
│  [Search by name...  ]   [Filter: All ▾]                │
│                                                          │
│  Filter options: All / Working Now / Not Working / Admin │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │                 WORKING NOW  (9)                   │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ 🟢 Alice Johnson                                  │  │
│  │    Employee  │  Project Alpha (Lead)  │  2h 34m   │  │
│  │                                    [View Profile] │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ 🟢 Bob Smith                                      │  │
│  │    Employee  │  Project Beta         │  1h 12m   │  │
│  │                                    [View Profile] │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ 🟢 Charlie Brown                                  │  │
│  │    Admin     │  (All Projects)       │  3h 45m   │  │
│  │                                    [View Profile] │  │
│  ├────────────────────────────────────────────────────┤  │
│                    ... more rows ...                     │
│  ├────────────────────────────────────────────────────┤  │
│  │               NOT WORKING  (5)                    │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ 🔴 Diana Prince                                   │  │
│  │    Employee  │  Project Alpha        │  0h 00m   │  │
│  │                                    [View Profile] │  │
│  ├────────────────────────────────────────────────────┤  │
│  │ 🔴 Eve Williams                                   │  │
│  │    Employee  │  Project Gamma        │  0h 00m   │  │
│  │                                    [View Profile] │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Filter Dropdown Options

- **All** — shows everyone
- **Working Now** — only `currentStatus = WORKING`
- **Not Working** — only `currentStatus = NOT_WORKING`
- **Admins Only** — only users with `role = ADMIN`
- **Employees Only** — only users with `role = EMPLOYEE`

### Search

- Searches by full name in real time
- Case insensitive

### Each Member Row Shows

- Status dot (green = WORKING, red = NOT_WORKING)
- Full name
- Role badge (Employee or Admin)
- Primary project and their role in it (Lead or just member)
- Hours logged today so far
- [View Profile] button

### [View Profile] Button

ONLY present on admin's view of this page. When admin clicks it, they are navigated to `/dashboard/people/[userId]` — the full member detail page. (See Section 10)

---

## 10. ADMIN — Member Detail View

**URL:** `/dashboard/people/[userId]`
**Who can access:** ADMIN only (employees get 403 if they try to navigate here directly)
**Purpose:** Admin's full view of a single employee's work history, projects, and stats

### Full Page Layout

```
┌──────────────────────────────────────────────────────────┐
│  ← Back to Team                                          │
│                                                          │
│  ┌───────┐  ALICE JOHNSON                                │
│  │ [Pic] │  alice@company.com                            │
│  │       │  Role: Employee          Joined: Jan 15, 2026 │
│  └───────┘  Status: 🟢 WORKING      Today: 2h 34m       │
│                                                          │
│  ────────────────────────────────────────────────────── │
│                                                          │
│  ASSIGNED PROJECTS                                       │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Project Alpha        Lead          ACTIVE        │   │
│  │ Project Gamma        Member        ACTIVE        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ────────────────────────────────────────────────────── │
│                                                          │
│  WORK HOURS — LAST 7 DAYS                                │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Day         │  Hours   │  Bar                    │   │
│  ├─────────────┼──────────┼─────────────────────────┤   │
│  │ Mon Mar 30  │  7h 42m  │ ████████████████████░   │   │
│  │ Tue Mar 31  │  8h 15m  │ █████████████████████   │   │
│  │ Wed Apr  1  │  6h 03m  │ ████████████████░░░░░   │   │
│  │ Thu Apr  2  │  8h 00m  │ █████████████████████   │   │
│  │ Fri Apr  3  │  5h 30m  │ ██████████████░░░░░░░   │   │
│  │ Sat Apr  4  │  0h 00m  │ ░░░░░░░░░░░░░░░░░░░░░   │   │
│  │ Sun Apr  5  │  0h 00m  │ ░░░░░░░░░░░░░░░░░░░░░   │   │
│  ├─────────────┴──────────┴─────────────────────────┤   │
│  │ TOTAL THIS WEEK:  35h 30m                        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ────────────────────────────────────────────────────── │
│                                                          │
│  TASKS COMPLETED — THIS WEEK                             │
│  ┌──────────────────────────────────────────────────┐   │
│  │ ✓ Fix login redirect         Project Alpha  Apr 3│   │
│  │ ✓ Update API docs            Project Gamma  Apr 2│   │
│  │ ✓ Setup CI pipeline          Project Alpha  Apr 1│   │
│  │ ✓ Write unit tests for auth  Project Alpha  Mar 31│  │
│  │ ✓ Code review: PR #47        Project Gamma  Mar 30│  │
│  └──────────────────────────────────────────────────┘   │
│  [View All Completed Tasks ▾]  (expands older ones)      │
│                                                          │
│  ────────────────────────────────────────────────────── │
│                                                          │
│  TICKETS                                                 │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Tickets Raised: 3       Tickets Helped: 7        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Each Section Explained

**Header Block:**
- Avatar (initials if no photo)
- Full name, email, role, joined date
- Current status (WORKING/NOT_WORKING with color dot)
- Hours logged today so far (live — pulls from today's WorkSession)

**Assigned Projects:**
- Lists every project this user is a member of
- Shows their role: "Lead" or "Member"
- Shows project status
- Each row is clickable by the admin → goes to that project's detail page

**Work Hours — Last 7 Days:**
- Shows every day for the past 7 days (including weekends)
- Hours column shows h and m format
- Bar is a visual proportion (full bar = 9 hours, partial fills proportionally)
- Days with 0 hours show empty bar (dashes or gray)
- Total at the bottom shows sum of all 7 days
- This data comes from `DailyWorkLog` table

**Tasks Completed — This Week:**
- Shows tasks with `status = DONE` that this user is the assignee of
- Shows: task name, which project it's in, and what date it was marked done
- Default shows current week's completed tasks
- "View All" expands to show older completed tasks (maybe paginated by week)

**Tickets:**
- Simple count: how many tickets they raised vs how many they helped with
- No detail here — just counts for quick understanding

---

## 11. ADMIN — Tickets Page

**URL:** `/dashboard/tickets`
**Who sees it:** ADMIN and EMPLOYEE (same URL, both can access)
**Purpose:** See all help tickets, raise tickets, help others

*(See Section 19 for the complete Ticket System lifecycle. The admin version of this page is identical to the employee version — tickets are visible to everyone. The only admin-specific thing: admin can see a "Raised by" across all users, not just their own team.)*

---

## 12. ADMIN — Onboarding Page

**URL:** `/dashboard/onboarding`
**Who sees it:** ADMIN only (employees get redirected if they try to access)
**Purpose:** Manage the pipeline of new users entering the platform

### Full Page Layout

```
┌──────────────────────────────────────────────────────────┐
│  ONBOARDING                          [+ Generate User]   │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  PENDING APPROVAL  (2)                                   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Frank Davis                                      │   │
│  │ frank@company.com         Role: Employee         │   │
│  │ Account created: Apr 3, 2026 — 2 days ago        │   │
│  │ Last login attempt: Apr 4, 2026 at 9:15 AM       │   │
│  │                                                  │   │
│  │         [Accept & Assign Project]  [Reject]      │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ Grace Lee                                        │   │
│  │ grace@company.com         Role: Admin            │   │
│  │ Account created: Apr 4, 2026 — Today             │   │
│  │ Last login attempt: Apr 4, 2026 at 10:00 AM      │   │
│  │                                                  │   │
│  │         [Accept & Assign Project]  [Reject]      │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  RECENTLY APPROVED  (last 10)                            │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Henry Wu      Approved Apr 2 → Project Beta      │   │
│  │ Iris Wang     Approved Mar 28 → Project Alpha    │   │
│  │ Jack Brown    Approved Mar 15 → Project Gamma    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### [+ Generate User] Button

Clicking this opens the Generate User modal:

```
┌──────────────────────────────────────────────┐
│  GENERATE NEW USER                      [X]  │
│                                              │
│  Full Name  *                                │
│  [________________________________]          │
│                                              │
│  Email Address  *                            │
│  [________________________________]          │
│  (This will be their login email)            │
│                                              │
│  Role  *                                     │
│  (●) Employee  — can work on projects        │
│  ( ) Admin     — can manage the workspace    │
│                                              │
│  ────────────────────────────────────────    │
│                                              │
│              [Generate Credentials]          │
└──────────────────────────────────────────────┘
```

After clicking "Generate Credentials":

```
┌──────────────────────────────────────────────┐
│  GENERATE NEW USER                      [X]  │
│                                              │
│  ✅ User Created Successfully!               │
│                                              │
│  ────────────────────────────────────────    │
│                                              │
│  Share these credentials with Frank Davis:   │
│                                              │
│  Email:     frank@company.com                │
│  Password:  xK9#mP2$vL7n                    │
│  [📋 Copy All]                               │
│                                              │
│  ⚠ This password will NOT be shown again.   │
│    Copy it now and give it to the user.      │
│                                              │
│  ────────────────────────────────────────    │
│                                              │
│  The user will appear in Pending Approval    │
│  after they log in for the first time.       │
│                                              │
│              [Done]                          │
└──────────────────────────────────────────────┘
```

### [Accept & Assign Project] Button

When admin clicks this on a pending user:

```
┌──────────────────────────────────────────────┐
│  APPROVE FRANK DAVIS                    [X]  │
│                                              │
│  Role: Employee (set at creation)            │
│                                              │
│  Assign to Project(s)  *                     │
│  [Select projects ▾]   (multi-select)        │
│  ┌──────────────────────────────────────┐    │
│  │ □ Project Alpha                      │    │
│  │ □ Project Beta                       │    │
│  │ ✓ Project Gamma                      │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  Note: You can change project assignment     │
│  later from inside the project.              │
│                                              │
│  [Cancel]         [Approve & Welcome]        │
└──────────────────────────────────────────────┘
```

After clicking "Approve & Welcome":
- `isOnboarding` → `false`
- User added as member to selected projects
- User's pending page auto-redirects them to dashboard
- Notification sent to user: "Your account has been approved! Welcome to FORGE."

### [Reject] Button

Shows a simple confirmation:
```
"Are you sure you want to reject Frank Davis?
This will delete their account permanently."
[Cancel] [Yes, Reject]
```

If rejected, the user's account is deleted from the database. If they try to log in again, they'll get "No account found with this email."

---

## 13. EMPLOYEE — Dashboard Page

**URL:** `/dashboard`
**Who sees it:** EMPLOYEE role
**Purpose:** Personal workspace — what do I need to do today?

### Full Page Layout

```
┌──────────────────────────────────────────────────────────┐
│  SIDEBAR   │           MAIN CONTENT                      │
│            │                                             │
│  ◆ Dash    │  Good morning, Alice! 👋                    │
│  □ Projects│  Friday, April 4, 2026                      │
│  ○ Team    │                                             │
│  ⊞ Tickets │  Status: 🟢 WORKING      Today: 2h 34m     │
│  ◎ Profile │                                             │
│            │  ─────────────────────────────────────────  │
│  ── ── ──  │                                             │
│            │  ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  [Avatar]  │  │  My Open │ │   My     │ │  My Open │   │
│  Alice     │  │  Tasks   │ │ Projects │ │ Tickets  │   │
│  🟢 WORK   │  │    5     │ │    2     │ │    1     │   │
│  [Log Out] │  └──────────┘ └──────────┘ └──────────┘   │
│            │                                             │
│  🔔(1)     │  ─────────────────────────────────────────  │
│            │                                             │
│            │  MY PROJECTS                  [View All →]  │
│            │                                             │
│            │  ┌──────────────────────────────────────┐  │
│            │  │ Project Alpha    ACTIVE               │  │
│            │  │ Your role: Lead │ 3 tasks for you    │  │
│            │  │                            [Open →]  │  │
│            │  ├──────────────────────────────────────┤  │
│            │  │ Project Gamma    ACTIVE               │  │
│            │  │ Your role: Member │ 2 tasks for you  │  │
│            │  │                            [Open →]  │  │
│            │  └──────────────────────────────────────┘  │
│            │                                             │
│            │  ─────────────────────────────────────────  │
│            │                                             │
│            │  MY UPCOMING TASKS                          │
│            │                                             │
│            │  ┌──────────────────────────────────────┐  │
│            │  │ □ Fix login redirect    Apr 30  HIGH │  │
│            │  │   Project Alpha                      │  │
│            │  ├──────────────────────────────────────┤  │
│            │  │ □ Update user profile   May 2  MEDIUM│  │
│            │  │   Project Gamma                      │  │
│            │  ├──────────────────────────────────────┤  │
│            │  │ □ Write unit tests      May 5   LOW  │  │
│            │  │   Project Alpha                      │  │
│            │  └──────────────────────────────────────┘  │
│            │                                             │
│            │  ─────────────────────────────────────────  │
│            │                                             │
│            │  MY RECENT TICKETS                          │
│            │                                             │
│            │  ┌──────────────────────────────────────┐  │
│            │  │ "CSS grid broken"   OPEN   Apr 3     │  │
│            │  │  Project Alpha                       │  │
│            │  └──────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### Differences from Admin Dashboard

| Section | Admin | Employee |
|---|---|---|
| Greeting | None | Personal greeting with name |
| Stat Cards | Total Members, Working Now, Not Working, Open Tickets | My Open Tasks, My Projects, My Open Tickets |
| Who's Working | Shows ALL employees with hours | NOT PRESENT |
| Active Projects | Shows ALL company projects | Shows ONLY their projects |
| Open Tickets | Latest company-wide tickets | Only their raised tickets |
| Onboarding Queue | Shows pending users | NOT PRESENT |

**My Open Tasks section:**
- Shows tasks assigned to this user with status TODO or IN_PROGRESS
- Sorted by deadline (soonest first)
- Shows: task name, deadline date, priority badge, which project it's from
- Clicking a task goes directly to the Tasks tab of that project with the task detail panel open
- "Overdue" tasks (deadline passed, not done) are shown in red with "OVERDUE" badge

**My Upcoming Tasks** — same as My Open Tasks, just the label used on dashboard.

**My Projects section:**
- Only projects where this user is a member or lead
- Shows their role in each project
- Shows how many tasks are assigned to them in that project specifically
- [Open →] goes to the project detail

**My Recent Tickets:**
- Tickets they personally raised
- Up to 3 shown, with status and date
- Clicking goes to ticket detail

---

## 14. EMPLOYEE — Projects Page

**URL:** `/dashboard/projects`
**Who sees it:** EMPLOYEE

```
┌──────────────────────────────────────────────────────────┐
│  MY PROJECTS                                             │
│                                                          │
│  (No "+ New Project" button. No filter tabs for status.) │
│  (Only shows their assigned projects)                    │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Project Alpha                ACTIVE              │   │
│  │ Your role: Lead                                  │   │
│  │ Lead: You  │  5 members  │  3 tasks for you      │   │
│  │ Deadline: Apr 30, 2026                           │   │
│  │                                          [Open →]│   │
│  ├──────────────────────────────────────────────────┤   │
│  │ Project Gamma                ACTIVE              │   │
│  │ Your role: Member                                │   │
│  │ Lead: Charlie  │  6 members  │  2 tasks for you  │   │
│  │ Deadline: Jun 1, 2026                            │   │
│  │                                          [Open →]│   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  If no projects assigned:                                │
│  ┌──────────────────────────────────────────────────┐   │
│  │  You haven't been added to any projects yet.    │   │
│  │  Contact your admin to get assigned.             │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

**Key differences from Admin projects page:**
- Heading says "MY PROJECTS" not "PROJECTS"
- No "+ New Project" button
- No status filter tabs (they see all their projects regardless of status)
- Each row shows "Your role: Lead / Member" to make it personal
- Shows tasks assigned to them per project, not total open tasks

---

## 15. EMPLOYEE — Project Detail (3 Tabs)

*(See Sections 22, 23, 24 for full tab details)*

**Employee-specific differences:**
- If they are NOT the project lead:
  - Overview tab: read-only (no edit button)
  - Tasks tab: sees only their assigned tasks (filtered automatically), no "+ New Task" button
  - Updates tab: can post messages and read all messages
- If they ARE the project lead:
  - Overview tab: can edit description and links
  - Tasks tab: sees ALL tasks, has "+ New Task" button, can assign to anyone in project
  - Updates tab: messages show "(Lead)" badge
- In both cases:
  - They CANNOT change project status, priority, deadline, or project name
  - They CANNOT add/remove members
  - They CANNOT delete the project

---

## 16. EMPLOYEE — Team Members Page

**URL:** `/dashboard/people`
**Who sees it:** EMPLOYEE

```
┌──────────────────────────────────────────────────────────┐
│  TEAM                                                    │
│                                                          │
│  [Search by name...]                                     │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │  Alice Johnson                                   │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  Bob Smith                                       │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  Charlie Brown                                   │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  Diana Prince                                    │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  Eve Williams                                    │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  Frank Davis                                     │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  Total: 14 team members                                  │
└──────────────────────────────────────────────────────────┘
```

**Absolute rules for employee view:**
- ONLY names. Nothing else.
- No status dots (green/red)
- No role labels (Employee/Admin)
- No hours
- No project info
- No [View Profile] button
- Names are NOT clickable links
- Names are displayed alphabetically (A-Z by first name)
- The search only searches names, nothing else
- You CANNOT navigate to another employee's profile from this page as an employee — it's architecturally blocked

**Why this exists at all:**
So employees know who is on their team for context — they might want to mention someone in a ticket, or know who to contact outside the app. The list simply confirms who exists.

---

## 17. EMPLOYEE — Tickets Page

*(Same as Section 19 — Ticket System — the UI is identical for admin and employee. Only difference: when raising a ticket, the project dropdown for an employee only shows projects they are assigned to.)*

---

## 18. EMPLOYEE — My Profile Page

**URL:** `/dashboard/profile`
**Who sees it:** EMPLOYEE only (admins don't need a separate profile page — they see their info in the sidebar area, and they can view any member's profile via the team page)

```
┌──────────────────────────────────────────────────────────┐
│  MY PROFILE                                              │
│                                                          │
│  ┌───────┐  ALICE JOHNSON                                │
│  │ [Pic] │  alice@company.com                            │
│  │       │  Role: Employee                               │
│  └───────┘  Member since: January 15, 2026               │
│                                                          │
│  Status: 🟢 WORKING      Today so far: 2h 34m           │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  MY PROJECTS                                             │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Project Alpha    Lead    ACTIVE                  │   │
│  │ Project Gamma    Member  ACTIVE                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  MY HOURS THIS WEEK                                      │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Mon Apr 28   7h 42m                              │   │
│  │ Tue Apr 29   8h 15m                              │   │
│  │ Wed Apr 30   6h 03m                              │   │
│  │ Thu May 01   8h 00m                              │   │
│  │ Fri May 02   2h 34m  (today, still counting)    │   │
│  │ Sat May 03   0h 00m                              │   │
│  │ Sun May 04   0h 00m                              │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ TOTAL THIS WEEK:  32h 34m                        │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  ACCOUNT                                                 │
│  [Change Password]                                       │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Notes:**
- Employee can ONLY see their own data here
- They can see their own hours because it's motivating and self-awareness helps productivity
- "Change Password" is present here — since admin gave them a generated password, they should change it to something personal. This opens a simple modal: Current Password / New Password / Confirm New Password

---

## 19. Ticket System — Complete Lifecycle

### The Concept

A ticket = "I need help." It is not a bug report. It is not a task. It is a personal request to any willing person in the company: "I am stuck on this. Can someone help me?"

### Ticket Statuses

```
OPEN ──────────────→ ACCEPTED ──────────────→ COMPLETED
  ↑                     (helper               (either person
(raised)                 assigned)              marks done)
```

Only 3 states. No escalation, no reassignment. Keep it simple.

### Full Tickets Page Layout

```
┌──────────────────────────────────────────────────────────┐
│  TICKETS                              [+ Raise Ticket]   │
│                                                          │
│  ┌──────────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │  Open    │ │   Accepted   │ │     Completed       │  │
│  │   (3)    │ │    (2)       │ │      (27)           │  │
│  └──────────┘ └──────────────┘ └────────────────────┘  │
│                                                          │
│  [Search tickets...]   [Filter by Project: All ▾]       │
│                                                          │
│  ── OPEN TICKETS ───────────────────────────────────── │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ CSS grid broken in dashboard                     │   │
│  │ Raised by: Alice Johnson                         │   │
│  │ Project: Alpha                                   │   │
│  │ Posted: 2 hours ago                              │   │
│  │                                  [I Can Help →]  │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ API returns 500 on profile update                │   │
│  │ Raised by: Bob Smith                             │   │
│  │ Project: Beta                                    │   │
│  │ Posted: 5 hours ago                              │   │
│  │                                  [I Can Help →]  │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ Docker build fails on M1 Mac                     │   │
│  │ Raised by: Eve Williams                          │   │
│  │ Project: Gamma                                   │   │
│  │ Posted: 1 day ago                                │   │
│  │                                  [I Can Help →]  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**Special rule:** If you are the one who raised a ticket, the "[I Can Help →]" button is NOT shown for your own ticket (you can't help yourself). Instead it shows:
```
[Your Ticket]    [Cancel Ticket]
```

**[Cancel Ticket]** — allows the ticket raiser to remove their own open ticket if the problem got resolved on their own or is no longer relevant. This moves it to a CANCELLED state (optional 4th state) or simply deletes it. Let's say it gets a soft-delete state called "CANCELLED."

### Ticket Detail Page

When any ticket card is clicked (or [I Can Help →] is clicked), you go to the ticket detail:

**State 1: OPEN — Viewing someone else's ticket**
```
┌──────────────────────────────────────────────────────────┐
│  ← Back to Tickets                                       │
│                                                          │
│  "CSS grid broken in dashboard"                          │
│                                                          │
│  Status: ● OPEN                                          │
│                                                          │
│  Raised by: Alice Johnson                                │
│  Project: Project Alpha                                  │
│  Raised: April 3, 2026 at 2:15 PM  (2 hours ago)        │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  DESCRIPTION                                             │
│  The CSS grid on the main dashboard page is not          │
│  rendering correctly on mobile screens. I've tried        │
│  adjusting the grid-template-columns breakpoints and      │
│  the gap property but the sidebar still overlaps the     │
│  main content area below 768px. I need help figuring      │
│  out what's wrong with the responsive layout.            │
│                                                          │
│  In which project: Project Alpha                         │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │                                                  │   │
│  │  Can you help with this?                         │   │
│  │                                                  │   │
│  │              [Yes, I Can Help]                   │   │
│  │                                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

**After clicking [Yes, I Can Help]:**

Confirmation dialog:
```
┌──────────────────────────────────────┐
│  Confirm                             │
│                                      │
│  By accepting this ticket, you're    │
│  committing to help Alice with:      │
│                                      │
│  "CSS grid broken in dashboard"      │
│                                      │
│  [Cancel]    [Yes, I'll Help]        │
└──────────────────────────────────────┘
```

On confirm:
- Ticket `status` → ACCEPTED
- Ticket `helperId` → current user
- Ticket `acceptedAt` → now
- Notification to Alice: "Bob Smith accepted your ticket and is ready to help!"
- Page refreshes to show ACCEPTED state

**State 2: ACCEPTED — Viewing from raiser's perspective (Alice)**
```
│  Status: ● ACCEPTED                                      │
│                                                          │
│  Raised by: You (Alice Johnson)                          │
│  Accepted by: Bob Smith                                  │
│  Accepted: April 3, 2026 at 3:00 PM                     │
│                                                          │
│  [Description as before]                                 │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  Bob Smith is helping you.                               │
│  Once the issue is resolved, mark it as complete.        │
│                                                          │
│  [Mark as Completed]                                     │
│                                                          │
│  (Or if the issue is still not solved:)                  │
│  [Cancel — Issue Not Resolved]                           │
```

**State 2: ACCEPTED — Viewing from helper's perspective (Bob)**
```
│  Status: ● ACCEPTED                                      │
│                                                          │
│  Raised by: Alice Johnson                                │
│  You accepted this: April 3, 2026 at 3:00 PM            │
│                                                          │
│  [Description as before]                                 │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  You're helping Alice.                                   │
│  Once you've provided help, mark it as complete.         │
│                                                          │
│  [Mark as Completed]                                     │
```

**[Mark as Completed] — from either person:**
- Shows confirmation: "Mark this ticket as completed?"
- On confirm:
  - `status` → COMPLETED
  - `completedAt` → now
  - Notification to the OTHER person: "Your ticket has been marked as completed!"
  - Ticket moves to Completed tab

**State 3: COMPLETED**
```
│  Status: ● COMPLETED                                     │
│                                                          │
│  Raised by: Alice Johnson                                │
│  Helped by: Bob Smith                                    │
│  Raised: Apr 3 at 2:15 PM                               │
│  Accepted: Apr 3 at 3:00 PM  (45 min to accept)         │
│  Completed: Apr 3 at 4:30 PM (1h 30m to resolve)        │
│                                                          │
│  [Description as before]                                 │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  ✅ This ticket has been resolved.                       │
│                                                          │
│  (No buttons — completed tickets are read-only)          │
```

### [+ Raise Ticket] Modal

```
┌──────────────────────────────────────────────┐
│  RAISE A HELP TICKET                    [X]  │
│                                              │
│  Title  *                                    │
│  [________________________________]          │
│  (Keep it short — what's the problem?)       │
│                                              │
│  Which Project is this about?  *             │
│  [Select project ▾]                          │
│  (Admin sees all projects)                   │
│  (Employee sees only their assigned projects)│
│                                              │
│  Describe your issue  *                      │
│  [________________________________]          │
│  [________________________________]          │
│  [________________________________]          │
│  [________________________________]          │
│  Tip: mention what you've already tried,     │
│  what error you're seeing, and what you      │
│  need from the helper.                       │
│                                              │
│  [Cancel]          [Submit Ticket]           │
└──────────────────────────────────────────────┘
```

Validation:
- Title: required, min 5 chars, max 100 chars
- Project: required — must pick one
- Description: required, min 20 chars (encourages detail)

After submission:
- Ticket appears in OPEN tab
- Notification sent to ALL users: "Alice Johnson raised a new ticket: [title]"
  - (Broadcast to everyone so anyone can help)

### Rules Summary

| Rule | Detail |
|---|---|
| Can't help yourself | [I Can Help] button not shown on your own tickets |
| One helper only | Once someone accepts, no one else can accept |
| Either party can complete | Raiser or helper can mark it done |
| Completed tickets are permanent | Cannot be re-opened or edited after completion |
| Cancelled tickets | Raiser can cancel an OPEN ticket before it's accepted |
| All tickets visible to all | Both admin and employee see all tickets |

---

## 20. Working/Not Working Status System

### The Two States

```
WORKING      = User is currently logged in to FORGE
NOT_WORKING  = User has logged out or was never logged in today
```

That's the entire status system. There is no focus mode, no in-meeting, no available, no custom status. Just are they on the platform right now or not.

### How Status Changes

| Event | Status Change |
|---|---|
| User logs in | → WORKING |
| User clicks Logout | → NOT_WORKING |
| Session heartbeat stops (15 min timeout) | → NOT_WORKING |
| Server closes abandoned session | → NOT_WORKING |

### Where Status is Displayed

| Location | What it shows |
|---|---|
| Admin Dashboard — "Who's Working" section | Green/Red dot + name + hours |
| Admin Team Members page | Green/Red dot per row |
| Admin Member Detail page | Status + today's hours in header |
| Sidebar (own status) | "🟢 WORKING" or "🔴 NOT WORKING" as text below name |
| Employee Dashboard (own status only) | "Status: 🟢 WORKING" + "Today: Xh Ym" |
| Employee Profile page | Status + today's hours |

### Important: Status Cannot Be Manually Changed

There is NO dropdown, NO selector, NO button to change your status. It is automatic. You log in → working. You log out → not working. This is intentional and by design.

---

## 21. Time Tracking — How It Works

### The System

Every time a user logs in, a `WorkSession` is created. Every time they log out, the session is closed and the duration is calculated. A `DailyWorkLog` keeps the running total per user per day.

### WorkSession Model

```
Each WorkSession represents ONE login-logout pair:

id          — unique ID
userId      — whose session
date        — the calendar date (e.g., 2026-04-04)
loginAt     — timestamp: when they logged in
logoutAt    — timestamp: when they logged out (NULL while active)
duration    — integer: minutes between login and logout (NULL while active)
```

### DailyWorkLog Model

```
One record per user per day — sums all sessions for that day:

id           — unique ID
userId       — whose log
date         — the calendar date
totalMinutes — sum of all WorkSession durations for this user on this date

Unique constraint: one record per (userId, date) pair
```

### How Totals Are Calculated

Example: Alice logs in twice on April 4:
- Session 1: Login 9:00 AM → Logout 12:30 PM = 210 minutes
- Session 2: Login 1:30 PM → Logout 5:00 PM = 210 minutes
- DailyWorkLog for April 4 = 420 minutes = 7h 00m

### How "Today's Hours" is Calculated (Live)

When showing "today: 2h 34m":
1. Fetch Alice's `DailyWorkLog` for today → get `totalMinutes`
2. Check if there's an active `WorkSession` (logoutAt = NULL) → get current session minutes = `now - loginAt`
3. Display = `totalMinutes + currentSessionMinutes`

This means the hours counter ticks up in real time as long as the user is logged in.

### Heartbeat System

Problem: What if a user closes their browser without clicking logout?

Solution: Every 5 minutes, the frontend sends a silent ping to `POST /api/heartbeat`. The server updates `lastSeenAt` on the user's active WorkSession. A background job (or on next login) checks for sessions where `logoutAt = NULL` and `lastSeenAt > 15 minutes ago` and auto-closes them with `logoutAt = lastSeenAt`.

This means:
- If Alice closes her laptop at 5 PM without logging out, her session will be auto-closed at 5:15 PM (last heartbeat + 15 min buffer)
- Her total today will be accurate to within 15 minutes

### Where Time Data is Shown

**"Today's Hours" — shown as:**
- "2h 34m today" (admin dashboard, team page)
- "Today so far: 2h 34m" (employee dashboard)
- "Today: 2h 34m" (employee profile, member detail)

**"Last 7 Days" — shown in:**
- Admin Member Detail page (per-day bar chart)
- Employee Profile page (per-day list)

**Weekly Total — shown as:**
- "TOTAL THIS WEEK: 35h 30m"

### What About Admins?

Admins' time is also tracked in exactly the same way. The admin dashboard shows their own hours in the sidebar (or could show at the top of the page). If another admin views their profile (from team page), they see the same detail view as for employees.

---

## 22. Project Detail — Overview Tab (Full)

**URL:** `/dashboard/projects/[id]` (defaults to Overview tab)
**Visible to:** All project members + all admins

### Layout (Read Mode — for regular members)

```
┌──────────────────────────────────────────────────────────┐
│  ← Projects                                              │
│                                                          │
│  PROJECT ALPHA                                           │
│  Lead: Alice Johnson   │   Status: ACTIVE   │  Priority: HIGH │
│  Deadline: Apr 30, 2026                                  │
│                                                          │
│  [Overview]  [Tasks]  [Updates]                          │
│  ────────────  ← active tab has underline or bold ────   │
│                                                          │
│  DESCRIPTION                                             │
│  Building the new customer portal with real-time         │
│  dashboards and reporting features. Target release is    │
│  Q2 2026 with an initial beta for top-tier clients.      │
│  The portal will support OAuth login, CSV exports, and   │
│  customizable widgets per customer account.              │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  TEAM MEMBERS                                            │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 👑 Alice Johnson    Lead     🟢 Working           │   │
│  │ ○  Bob Smith        Member   🔴 Not Working       │   │
│  │ ○  Diana Prince     Member   🟢 Working           │   │
│  │ ○  Frank Davis      Member   🟢 Working           │   │
│  │ ○  Grace Lee        Member   🔴 Not Working       │   │
│  └──────────────────────────────────────────────────┘   │
│  (Admin also sees [Add Member] and [Remove] buttons)     │
│  (Regular members just see the list — no buttons)        │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  PROJECT LINKS                                           │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 📁 Repository    github.com/company/alpha  [→]   │   │
│  │ 🎨 Design        figma.com/file/alpha      [→]   │   │
│  │ 📖 Docs          notion.so/alpha-docs      [→]   │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  DETAILS                                                 │
│  Status: ACTIVE        Priority: HIGH                    │
│  Created: Jan 15, 2026  Deadline: Apr 30, 2026           │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### Edit Mode (Project Lead / Admin Only)

When Project Lead or Admin clicks [Edit Overview]:

The description area becomes a text input, links become editable URL fields, etc.

```
│  DESCRIPTION  [Save Changes] [Cancel]                    │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Building the new customer portal with real-time  │   │
│  │ dashboards... (editable text)                    │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  PROJECT LINKS                                           │
│  Label: [Repository]  URL: [github.com/company/alpha]    │
│  Label: [Design]      URL: [figma.com/file/alpha  ]      │
│  Label: [Docs]        URL: [notion.so/alpha-docs  ]      │
│  [+ Add Link]                                            │
│                                                          │
│  (Admin-only section visible to admin only:)             │
│  Status: [ACTIVE ▾]  Priority: [HIGH ▾]                  │
│  Deadline: [Apr 30, 2026 ▾]                              │
│  Project Lead: [Alice Johnson ▾]  [Change Lead]          │
│  [+ Add Member]                                          │
```

### Team Member Status Indicators

In the team members list on the Overview tab:
- 🟢 or 🔴 shows real-time working status
- This is visible to ALL project members (so you know who's online in your team)
- Exception: employee cannot see PROJECT members' status elsewhere (like on the Team page), BUT within a project's overview, everyone can see who's currently working in THAT project. This is a deliberate exception to help team collaboration.

---

## 23. Project Detail — Tasks Tab (Full)

**Visible to all project members and admin**

### Layout for Project Lead/Admin (full view)

```
┌──────────────────────────────────────────────────────────┐
│  [Overview]  [Tasks ●]  [Updates]                        │
│                                      [+ New Task]        │
│                                                          │
│  [All ▾] [My Tasks] [Todo] [In Progress] [Done]          │
│  [Search tasks...]                                       │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ TODO                                             │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ □ Write unit tests for auth module               │   │
│  │   Assigned to: Alice, Bob                        │   │
│  │   Deadline: May 5   │  Priority: LOW             │   │
│  │   Created by: Alice (Lead)                       │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ □ Update API documentation                       │   │
│  │   Assigned to: Diana                             │   │
│  │   Deadline: May 8   │  Priority: MEDIUM          │   │
│  │   Created by: Alice (Lead)                       │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ IN PROGRESS                                      │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ ◑ Fix login redirect                             │   │
│  │   Assigned to: Alice                             │   │
│  │   Deadline: Apr 30  │  Priority: HIGH  ⚠ DUE    │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ DONE                                             │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ ✓ Setup CI pipeline                              │   │
│  │   Completed by: Bob  │  Apr 2                    │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Layout for Regular Employee (filtered view)

```
│  (No [+ New Task] button)                                │
│  (Filter shows only: [My Tasks ●] [Done])                │
│  (Only tasks assigned to this employee are shown)        │
│                                                          │
│  MY TASKS                                                │
│  ┌──────────────────────────────────────────────────┐   │
│  │ □ Fix login redirect              Due: Apr 30    │   │
│  │   Status: IN PROGRESS   Priority: HIGH           │   │
│  │                              [Mark as Done]      │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ □ Write unit tests for auth       Due: May 5     │   │
│  │   Status: TODO          Priority: LOW            │   │
│  │                              [Mark as Done]      │   │
│  └──────────────────────────────────────────────────┘   │
```

### Task Detail Panel (opens when a task is clicked)

Both employee and lead/admin can click a task to see its detail. The panel slides in from the right side of the screen (or opens as a full panel below on mobile):

```
┌────────────────────────────────────────────┐
│  TASK DETAIL                          [X]  │
│                                            │
│  Fix login redirect                        │
│                                            │
│  Status:  [IN_PROGRESS ▾]  (editable by    │
│            assignee + lead + admin)        │
│                                            │
│  Priority: HIGH                            │
│  Deadline: April 30, 2026  ⚠ Due today!   │
│                                            │
│  Assigned to:                              │
│  Alice Johnson  (you)                      │
│                                            │
│  Created by: Alice Johnson (Lead)          │
│  Created: April 1, 2026                    │
│                                            │
│  ────────────────────────────────────────  │
│                                            │
│  DESCRIPTION                               │
│  The login page redirects to /dashboard    │
│  even when the user hasn't completed       │
│  onboarding. Fix the redirect logic to     │
│  check the isOnboarding flag.              │
│                                            │
│  ────────────────────────────────────────  │
│                                            │
│  EXPECTED OUTPUT          (NEW FIELD)      │
│  After fix: a user with isOnboarding=true  │
│  should be redirected to /pending page,    │
│  not /dashboard. All existing users        │
│  should not be affected.                   │
│                                            │
│  ────────────────────────────────────────  │
│                                            │
│  [Mark as Done]  (assignee + lead + admin) │
│                                            │
│  (Admin and Lead also see:)                │
│  [Edit Task]  [Delete Task]                │
│                                            │
└────────────────────────────────────────────┘
```

### Status Change on Task

When assignee (or lead/admin) changes status:
- Click the [Status ▾] dropdown
- Options: TODO → IN_PROGRESS → DONE
- DONE sends a notification to the project lead: "Alice marked 'Fix login redirect' as Done"
- DONE tasks show checkmark and move to Done section
- Undoing to a previous status is allowed (DONE → IN_PROGRESS if someone made a mistake)

### Overdue Indicators

If `deadline < today` and status ≠ DONE:
- Show ⚠ or red text "OVERDUE" next to the task
- On admin's member detail, overdue tasks show differently from on-time completions

### [+ New Task] Modal

Visible only to Project Lead and Admin:

```
┌──────────────────────────────────────────────┐
│  NEW TASK                               [X]  │
│                                              │
│  Task Name  *                                │
│  [________________________________]          │
│                                              │
│  Description  *                              │
│  [________________________________]          │
│  [________________________________]          │
│                                              │
│  Expected Output  *                          │
│  [________________________________]          │
│  [________________________________]          │
│  (What does "done" look like? Be specific.)  │
│                                              │
│  Assign to  *                                │
│  [Multi-select project members ▾]            │
│  (Can assign to multiple people)             │
│                                              │
│  Deadline  *                                 │
│  [Date picker]                               │
│                                              │
│  Priority  *                                 │
│  ( ) LOW  (●) MEDIUM  ( ) HIGH  ( ) CRITICAL │
│                                              │
│  [Cancel]            [Create Task]           │
└──────────────────────────────────────────────┘
```

After creation:
- Task appears in the Tasks list under TODO
- Notification sent to all assignees: "You've been assigned a task: [Task Name] in Project Alpha"

---

## 24. Project Detail — Updates Tab (Full)

**Who can post:** ALL project members + ALL admins
**Who can read:** ALL project members + ALL admins
**Purpose:** Chat-like discussion board for this specific project

### Layout

```
┌──────────────────────────────────────────────────────────┐
│  [Overview]  [Tasks]  [Updates ●]                        │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │                                                  │   │
│  │  Admin Name  (Admin)        Apr 2, 5:00 PM       │   │
│  │  Client wants to see a demo by Friday.           │   │
│  │  Let's prioritize the dashboard over the         │   │
│  │  export feature this week.                       │   │
│  │                                                  │   │
│  ├──────────────────────────────────────────────────┤   │
│  │                                                  │   │
│  │  Bob Smith                  Apr 3, 2:00 PM       │   │
│  │  Found a bug in the redirect. Working on it.     │   │
│  │                                                  │   │
│  ├──────────────────────────────────────────────────┤   │
│  │                                                  │   │
│  │  Alice Johnson  (Lead)      Apr 3, 3:15 PM       │   │
│  │  Pushed the new auth flow to staging. Please     │   │
│  │  review and test:                                │   │
│  │  https://staging.company.com/auth                │   │
│  │  cc Bob, Diana — can you check on your machines? │   │
│  │                                                  │   │
│  ├──────────────────────────────────────────────────┤   │
│  │                                                  │   │
│  │  Diana Prince               Apr 3, 3:45 PM       │   │
│  │  Tested on Chrome + Safari. Looks good! Small    │   │
│  │  visual glitch on Firefox — logged it as a task. │   │
│  │                                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Write a message...                       [Send]  │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### Message Features

**Author badge system:**
- (Admin) badge next to admin names — gold/orange color
- (Lead) badge next to project lead's name — blue/teal color
- Regular members have no badge — just their name

**Links:**
- Any URL in a message is automatically detected and turned into a clickable hyperlink
- The text "https://staging.company.com/auth" becomes a blue clickable link

**Message ordering:**
- Newest messages at the BOTTOM (like a chat — you scroll down to see latest)
- On page load, auto-scrolls to the bottom

**Send message:**
- Pressing Enter sends (Shift+Enter for new line in message)
- Or click [Send] button
- Empty messages cannot be sent
- Max 1000 characters per message

**No file uploads** — keep it simple. Links can be pasted for external resources.

**No reactions, no threading, no replies** — this is a flat feed. One conversation per project. Simple.

**Who sees this tab:**
- All project members see the full conversation
- All admins see the full conversation even if they're not in the project's member list
- New members added to the project can see all historical messages from before they joined

---

## 25. Onboarding Flow — Complete Step by Step

### Full Journey: From Admin Creating a User to Employee Working

**Step 1: Admin creates a user**
1. Admin goes to `/dashboard/onboarding`
2. Clicks [+ Generate User]
3. Fills in: Name, Email, Role (Admin or Employee)
4. Clicks [Generate Credentials]
5. Server creates user with `isOnboarding: true`, `currentStatus: NOT_WORKING`
6. Server generates random 16-character password (uppercase + lowercase + numbers + symbols)
7. Server hashes and stores the password
8. Modal shows the plain-text password ONCE
9. Admin copies credentials and gives them to the new person
10. Modal closes; user appears in "Pending Approval" list

**Step 2: New user logs in for the first time**
1. New person goes to login page
2. Enters email + generated password
3. Login succeeds
4. Server checks: `isOnboarding = true`
5. Server does NOT create a WorkSession yet (they haven't been approved)
6. Server does NOT set status to WORKING (they're not active yet)
7. Server issues a LIMITED JWT token (can only access `/pending` page)
8. User is redirected to `/pending`

**Step 3: User waits on pending page**
1. User sees the friendly waiting screen
2. Auto-polls every 30 seconds
3. Admin sees the user in their Pending Approval list on the onboarding page
4. Admin also sees a notification: "Frank Davis has logged in and is awaiting approval"

**Step 4: Admin approves**
1. Admin clicks [Accept & Assign Project] on Frank's card
2. Modal opens showing project selection
3. Admin selects one or more projects
4. Admin clicks [Approve & Welcome]
5. Server: sets Frank's `isOnboarding = false`
6. Server: adds Frank as a member to selected projects
7. Server: sends notification to Frank: "Your account has been approved! Welcome to FORGE."
8. Server: updates Frank's JWT to full-access token (or forces re-login)

**Step 5: User gains access**
1. Frank's pending page detects approval (via the 30-second poll or instant push)
2. Frank is redirected to `/dashboard`
3. Frank sees the employee dashboard for the first time
4. His projects appear, his tasks (if any have been assigned) appear
5. From this point, he is a normal employee

**Alternative — Step 4B: Admin rejects**
1. Admin clicks [Reject] on Frank's card
2. Confirmation: "Delete Frank's account permanently?"
3. Admin confirms
4. Frank's account is deleted
5. If Frank's page tries to poll, he gets an "account not found" response
6. Frank sees: "Your account request has been declined. Contact your admin for details."
7. Frank is then shown a [Return to Login] button

---

## 26. Admin User Generation — Full Flow

### Why Admin-Only?

No one can self-register. The FORGE platform is for managed teams where admin controls who has access. This prevents unauthorized people from joining the workspace.

### Password Generation Rules

The generated password must be:
- 16 characters long
- At least 2 uppercase letters
- At least 2 lowercase letters
- At least 2 numbers
- At least 2 symbols (e.g., #, $, !, @, %)
- Randomly generated server-side using a cryptographically secure random function
- NEVER derived from the user's name or email

Example: `xK9#mP2$vL7n!Qr4`

### After Generation — What Admin Does

The modal shows the credentials. Admin has three options:
1. **[Copy All]** — copies "Email: frank@co.com / Password: xK9#mP2$vL7n" to clipboard
2. **Read them out loud** and have user type them on their end
3. **Screenshot or write them down** and hand deliver

There is no "email credentials to user" feature in scope right now. Admin handles the distribution manually.

### What If Admin Forgets to Copy the Password?

Too late. The password is shown ONCE and never again. If the admin loses it, they'll need to delete the user and create a new one. Admin should take care to copy before closing the modal.

### Can Admins Reset Passwords?

Not yet in this scope. If needed in future, admin would have a "Reset Password" button on the member detail page that generates a new temp password. For now, the employee's [Change Password] button on their profile handles password updates after first login.

---

## 27. Notifications System — Every Type

### Where Notifications Appear

1. **Bell icon** in the sidebar — shows a count badge of unread notifications
2. **Dropdown panel** — clicking the bell shows a list of recent notifications
3. Each notification has: icon, title, body, timestamp, read/unread state

### Notification Types

| Type | Trigger | Who Gets It | Message |
|---|---|---|---|
| `TICKET_RAISED` | Someone raises a new ticket | Everyone in the company | "[Alice] raised a new ticket: [title]" |
| `TICKET_ACCEPTED` | Someone accepts your ticket | Ticket raiser only | "[Bob] accepted your ticket: [title]" |
| `TICKET_COMPLETED` | Ticket marked complete | Both raiser and helper | "Ticket resolved: [title]" |
| `TICKET_CANCELLED` | Raiser cancels their ticket | Helper only (if already accepted) | "[Alice] cancelled the ticket you were helping with" |
| `TASK_ASSIGNED` | New task created and assigned to you | Assignees | "New task assigned: [task name] in [Project]" |
| `TASK_DONE` | Assignee marks their task done | Project Lead + Admin | "[Alice] completed: [task name]" |
| `PROJECT_MEMBER_ADDED` | Admin adds you to a project | New member | "You've been added to [Project Name]" |
| `PROJECT_LEAD_ASSIGNED` | Admin makes you lead of a project | New lead | "You've been made Lead of [Project Name]" |
| `PROJECT_UPDATE` | Someone posts in Updates tab | All project members + admins | "[Alice] posted in [Project Name] updates" |
| `ONBOARDING_APPROVED` | Admin approves a pending user | The new user | "Your account has been approved! Welcome." |
| `ONBOARDING_PENDING` | New user logs in for first time | All admins | "[Frank] is awaiting account approval" |

### Notification Dropdown Panel

```
┌────────────────────────────────────┐
│  NOTIFICATIONS        [Mark All ✓] │
│                                    │
│  ● Bob accepted your ticket        │
│    "CSS grid broken"               │
│    2 minutes ago                   │
│  ─────────────────────────────── │
│  ○ New task assigned to you       │
│    "Fix login redirect" — Alpha    │
│    3 hours ago                     │
│  ─────────────────────────────── │
│  ○ Alice posted in Alpha updates   │
│    Yesterday at 3:15 PM            │
│  ─────────────────────────────── │
│                                    │
│            [View All →]            │
└────────────────────────────────────┘
```

- ● = unread (filled dot)
- ○ = read (empty dot or gray)
- Clicking a notification marks it as read and navigates to the relevant page (e.g., clicking ticket notification goes to that ticket)
- "Mark All ✓" marks all as read without navigating anywhere
- "View All →" goes to a full notifications history page

---

## 28. Database Schema Changes — Full Detail

### Models to ADD

**Ticket:**
```
id            — String (cuid, primary key)
title         — String (max 100 chars)
description   — String (text, required)
projectId     — String (foreign key → Project)
raisedById    — String (foreign key → User)
helperId      — String? (nullable, foreign key → User)
status        — TicketStatus (OPEN default)
createdAt     — DateTime (auto)
acceptedAt    — DateTime? (nullable)
completedAt   — DateTime? (nullable)
cancelledAt   — DateTime? (nullable)
```

**WorkSession:**
```
id        — String (cuid, primary key)
userId    — String (foreign key → User)
date      — Date (calendar date only, no time)
loginAt   — DateTime
logoutAt  — DateTime? (nullable while active)
lastSeen  — DateTime? (heartbeat timestamp)
duration  — Int? (minutes, calculated on logout)
```

**DailyWorkLog:**
```
id           — String (cuid, primary key)
userId       — String (foreign key → User)
date         — Date
totalMinutes — Int (default 0)
Unique index: (userId, date) — only one record per user per day
```

### Fields to ADD to Existing Models

**Project:**
```
leadId    — String? (foreign key → User, the project lead)
links     — Json? (array: [{ label: "Repository", url: "https://..." }])
```

**Task:**
```
expectedOutput — String? (what "done" looks like)
```

**User:**
```
Change: currentStatus from old UserStatus enum to new UserStatus enum
Remove: statusText (not needed with binary working/not working)
Remove: workStart, workEnd (not needed — replaced by actual tracking)
Remove: timezone (can add back later if needed)
```

### Enums to CHANGE

**UserStatus (replace completely):**
```
Old: ACTIVE, FOCUS, AVAILABLE, IN_MEETING, OFFLINE
New: WORKING, NOT_WORKING
```

**Add TicketStatus:**
```
OPEN, ACCEPTED, COMPLETED, CANCELLED
```

**Add to NotificationType:**
```
TICKET_RAISED
TICKET_ACCEPTED
TICKET_COMPLETED
TICKET_CANCELLED
TASK_DONE
PROJECT_UPDATE
ONBOARDING_APPROVED
ONBOARDING_PENDING
PROJECT_MEMBER_ADDED
PROJECT_LEAD_ASSIGNED
```

**Remove from NotificationType:**
```
BLOCKER_RAISED
BLOCKER_HELP_OFFERED
BLOCKER_RESOLVED
STANDUP_REMINDER
HANDOFF_RECEIVED
```

### Models to REMOVE

```
StandupEntry      — standups removed
Blocker           — replaced by Ticket
BlockerThread     — removed with Blocker
HandoffNote       — handoffs removed
AvailabilityWindow — availability removed
OnboardingProgress — replaced with new simple isOnboarding flag approach
```

---

## 29. What Gets Removed — Full List

### Pages (entire folders deleted)

| Route | Reason |
|---|---|
| `/app/(dashboard)/standup/` | Standups removed |
| `/app/(dashboard)/blockers/` | Replaced by Tickets |

### API Routes (entire folders deleted)

| Route | Reason |
|---|---|
| `/app/api/standups/` | Standups removed |
| `/app/api/blockers/` | Replaced by tickets |
| `/app/api/handoffs/` | Handoffs removed |
| `/app/api/availability/` | Availability removed |
| `/app/api/auth/register/` | Replaced by admin generation |

### Components (files/folders deleted)

| Path | Reason |
|---|---|
| `/components/standup/` | Standups removed |
| `/components/blockers/` | Replaced |
| `/components/handoffs/` | Handoffs removed |
| `/components/availability/` | Availability removed |
| `/components/onboarding/MemberChecklist.tsx` | New onboarding flow |
| `/components/onboarding/TaskCheckItem.tsx` | New onboarding flow |
| `/components/onboarding/TemplateEditorPanel.tsx` | New onboarding flow |
| `/components/dashboard/StandupColumn.tsx` | Standups removed |
| `/components/dashboard/BlockerColumn.tsx` | Replaced |
| `/components/dashboard/StatBar.tsx` | Redesigned — new stat cards |
| `/components/dashboard/MemberView.tsx` | Replaced by new Employee Dashboard |
| `/components/people/` — detail panel for blockers/standups | Stripped down |

### Sidebar Links Removed

| Link | Reason |
|---|---|
| STANDUP | Page removed |
| BLOCKERS | Replaced by TICKETS |

### Status Selector UI

- Remove the status dropdown in the sidebar/topbar
- Remove all references to old statuses (FOCUS, AVAILABLE, IN_MEETING, ACTIVE, OFFLINE)

---

## 30. Edge Cases & Rules

### Ticket Edge Cases

| Scenario | Behavior |
|---|---|
| User tries to accept own ticket | Button not shown — "Your Ticket" label instead |
| Two people try to accept same ticket simultaneously | First one wins (optimistic lock on server), second gets "This ticket was just accepted by someone else" |
| Ticket raiser gets their problem solved before anyone accepts | They can cancel the ticket (Cancel button on their own open tickets) |
| Helper accepts but can't actually help | No "un-accept" button. They should communicate in the Updates tab or direct message, then the raiser can cancel/reopen. For now: mark as completed anyway and they can raise a new ticket |
| Admin raises a ticket | Treated exactly like an employee's ticket — anyone can help |

### Time Tracking Edge Cases

| Scenario | Behavior |
|---|---|
| User logs in and immediately logs out | Session recorded (even 1 minute counts) |
| Browser crashes, no logout | Heartbeat timeout (15 min) auto-closes session |
| User changes computer mid-day | Second login on new computer creates a new WorkSession for the same day — both sessions add to the daily total |
| Admin checks hours for a day with no login | DailyWorkLog shows 0 minutes (or no record exists, displayed as "0h 00m") |
| User works exactly at midnight crossing | Session is split: minutes before midnight count for Day 1, minutes after midnight count for Day 2 |

### Onboarding Edge Cases

| Scenario | Behavior |
|---|---|
| Admin generates user but never shares the credentials | User just exists in DB with isOnboarding=true, never logs in, stays in pending queue forever |
| Admin accidentally closes the Generate modal before copying password | Password is lost. Admin must reject and re-generate the user. No recovery |
| Same email generated twice | Server returns error: "Email already in use" |
| Pending user tries to access /dashboard directly | Middleware redirects them to /pending |
| Approved user's pending page is still open in another tab | On next poll, detects isOnboarding=false, auto-redirects |

### Project Lead Edge Cases

| Scenario | Behavior |
|---|---|
| Project lead is removed from the project | Admin must assign a new lead before removing them. Or admin becomes the de-facto lead (system assigns admin as lead) |
| Project lead leaves the company (account deleted) | Admin is auto-assigned as temporary lead. Admin should assign a real lead |
| Lead tries to add a new member to their project | NOT allowed. Only admin can add members. Lead can only see who's in the team |
| Lead tries to access another project they're not a member of | They see it as a regular employee — read-only if member, no access if not a member |

### Navigation/Access Edge Cases

| Scenario | Behavior |
|---|---|
| Employee tries to access /dashboard/onboarding | Middleware returns 403 or redirects to /dashboard |
| Employee tries to access /dashboard/people/[userId] (another user) | Server returns 403 Forbidden |
| Employee tries to access a project they're not a member of | Server returns 404 (not just 403 — we don't even confirm the project exists to them) |
| User's JWT expires mid-session | Next API call returns 401, frontend redirects to login page, session is auto-closed |

---

## 31. Daily Working Progress — How, When, and Where

### What This Is

A Daily Log is a short personal note each employee writes at the end of their working day explaining what they worked on. It is **not** a standup (those are removed). It is not structured or forced. It is a simple free-text field — a habit, not a chore — that answers one question: **"What did I do today?"**

This gives admins visibility into what each person actually worked on day-to-day, and gives employees a record of their own output they can look back on. The data feeds directly into the Sunday weekly report.

---

### The Primary Trigger — Logout Prompt

The most natural moment to write the daily log is when the employee ends their day and clicks **Log Out**.

**Flow:**

1. Employee clicks [Log Out] in the sidebar
2. Instead of immediately logging out, a **modal appears**:

```
┌──────────────────────────────────────────────────────┐
│  END OF DAY — Friday, April 4, 2026             [X]  │
│                                                      │
│  You worked for  6h 12m  today. 💪                   │
│                                                      │
│  What did you work on today?                         │
│  ┌──────────────────────────────────────────────┐   │
│  │                                              │   │
│  │  Fixed the login redirect bug, reviewed      │   │
│  │  Bob's PR for the API changes, started       │   │
│  │  writing unit tests for the auth module.     │   │
│  │                                              │   │
│  └──────────────────────────────────────────────┘   │
│  (max 500 characters)                                │
│                                                      │
│  Anything worth noting? (optional)                   │
│  ┌──────────────────────────────────────────────┐   │
│  │  Waiting on design review for the profile    │   │
│  │  page mockups before I can continue.         │   │
│  └──────────────────────────────────────────────┘   │
│  (max 300 characters)                                │
│                                                      │
│  [Skip & Log Out]          [Save & Log Out]          │
└──────────────────────────────────────────────────────┘
```

**"Save & Log Out":**
- Saves the DailyLog entry for today with both fields
- Closes the active WorkSession (sets logoutAt = now)
- Sets status to NOT_WORKING
- Redirects to the login page

**"Skip & Log Out":**
- No log is saved for today
- Session closes normally
- Employee is logged out
- Tomorrow, the admin's weekly report will show that day as "No log written" (not a penalty, just visible)

**[X] Close button / pressing Escape:**
- Treats the same as "Skip & Log Out" — closes session, no log saved

---

### The Secondary Entry Point — Dashboard

An employee shouldn't have to log out just to write or update their log. On their **employee dashboard**, there is a persistent section:

```
┌──────────────────────────────────────────────────────┐
│  TODAY'S LOG               Friday, April 4           │
│                                                      │
│  (If not yet written:)                               │
│  ┌──────────────────────────────────────────────┐   │
│  │  What are you working on today?              │   │
│  │  [Click to write your daily log...]          │   │
│  └──────────────────────────────────────────────┘   │
│                        [Write Log]                   │
│                                                      │
│  (If already written today:)                         │
│  ┌──────────────────────────────────────────────┐   │
│  │  Fixed login redirect, reviewed Bob's PR,    │   │
│  │  started auth unit tests.                    │   │
│  └──────────────────────────────────────────────┘   │
│                        [Edit]                        │
└──────────────────────────────────────────────────────┘
```

- If today's log is NOT yet written → shows a placeholder prompt + [Write Log] button
- If today's log IS already written → shows the text with an [Edit] button
- Clicking [Write Log] or [Edit] opens the same modal (without the logout action — just save or cancel)
- The log can be edited anytime until **midnight of that day** — after midnight it becomes read-only (locked)

---

### Daily Log Data Model

```
DailyLog:
  id            — String (cuid, primary key)
  userId        — String (foreign key → User)
  date          — Date (calendar date, e.g. 2026-04-04)
  workSummary   — String (what they worked on, max 500 chars)
  notes         — String? (optional extra notes, max 300 chars)
  createdAt     — DateTime (first time they wrote it)
  updatedAt     — DateTime (last time they edited it)
  isLocked      — Boolean (true after midnight of that date)

  Unique index: (userId, date) — one log per person per day
```

---

### Who Can See Daily Logs

| Person | What they see |
|---|---|
| The employee themselves | Their own logs on their Profile page — full history, all past days |
| Admin | Every employee's log in the Member Detail page — shown next to each day's hours |
| Other employees | CANNOT see anyone else's daily log |
| Project Lead | Can only see their own log — same as regular employee |

---

### Where Logs Appear in the UI

**On the Employee's Own Profile Page:**

Below the "My Hours This Week" section, add:

```
MY DAILY LOGS — THIS WEEK

  Mon Apr 28   7h 42m
  "Completed the API documentation, fixed two bugs from
   QA feedback, pushed hotfix to staging."

  Tue Apr 29   8h 15m
  "Worked on new onboarding UI, had sync with design team,
   updated task statuses in project board."

  Wed Apr 30   6h 03m
  "Reviewed 3 PRs, merged 2. Wrote tests for the profile
   update endpoint. Left early for appointment."
   Notes: "Need to finish test coverage tomorrow."

  Thu May 01   8h 00m
  "Finished test coverage for profile endpoint. Started
   work on dashboard layout fixes."

  Fri May 02   2h 34m  (today — still editable)
  [No log yet — Write today's log]

  Sat May 03   0h 00m
  (Weekend — no log expected)

  Sun May 04   0h 00m
  (Weekend — no log expected)
```

**On the Admin's Member Detail Page:**

The hours bar chart rows expand to include the log text:

```
│ Mon Apr 28  │  7h 42m  │ ████████████████████░  │
│  "Completed API docs, fixed two bugs, hotfix to staging."  │
├─────────────┼──────────┼────────────────────────┤
│ Tue Apr 29  │  8h 15m  │ █████████████████████  │
│  "Onboarding UI, design sync, updated task statuses."      │
├─────────────┼──────────┼────────────────────────┤
│ Wed Apr 30  │  6h 03m  │ ████████████████░░░░░  │
│  "Reviewed PRs, wrote tests for profile update endpoint."  │
│  Notes: "Need to finish test coverage tomorrow."           │
├─────────────┼──────────┼────────────────────────┤
│ Fri May 02  │  2h 34m  │ ████████░░░░░░░░░░░░░  │
│  (No log written)                                          │
```

Days with no log show "(No log written)" in italics — not alarming, just informational.

---

### Reminders

If an employee is WORKING (logged in) and it is past **6:00 PM** and they have NOT written today's log, a soft notification appears in their notification bell:

```
Notification: "Don't forget to write today's log before you log out."
```

This is a one-time notification per day — does not repeat every hour. It's a nudge, not a nag.

If they are in a timezone other than the server default, the 6 PM nudge is based on the server time for now (timezone handling is future scope).

---

### Rules for Daily Logs

| Rule | Detail |
|---|---|
| One log per person per day | Can only create one — subsequent saves overwrite/update the same record |
| Editable until midnight | After midnight the `isLocked` flag is set to true and the entry becomes read-only |
| Completely optional | No penalty for skipping. Shown as "No log written" to admin. |
| Weekends show no prompt | The logout modal and the 6 PM reminder do NOT appear on Saturday or Sunday (no nagging on weekends) |
| Character limits | workSummary max 500 chars. Notes max 300 chars. Encourages brevity. |
| Admin cannot write logs for employees | Admin can only read them. Only the employee can write their own log. |

---

## 32. Weekly Report — Admin's Sunday Summary

### What This Is

Every **Sunday at 11:00 PM**, the system automatically generates a **Weekly Work Report** covering the previous Monday–Sunday for every employee. This report is available inside FORGE as a dedicated page and also triggers a notification for all admins.

This is not emailed (no email system in scope). It lives entirely within the app. Admins see a notification, click it, and get the full report.

---

### When It Generates

- **Trigger:** Every Sunday at 11:00 PM server time
- **Covers:** The 7 days from that Monday to that Sunday (Mon–Sun)
- **Generated for:** Every user who was active (had any WorkSession or any log) during that week
- **Stored:** The report is saved in the database so admins can access past weeks' reports anytime

---

### How Admin Is Notified

On Sunday at 11:00 PM, every admin receives a notification:

```
🔔 Notification:
  "Weekly Report is ready — Week of Apr 28 – May 4, 2026"
  [View Report →]
```

Clicking "View Report →" navigates to `/dashboard/reports/[weekId]`.

---

### The Reports Page — Where All Reports Live

**URL:** `/dashboard/reports`
**Who can access:** ADMIN only

```
┌──────────────────────────────────────────────────────────┐
│  WEEKLY REPORTS                                          │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Week of Apr 28 – May 4, 2026          [View →]   │   │
│  │ Generated: Sunday May 4 at 11:00 PM              │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ Week of Apr 21 – Apr 27, 2026         [View →]   │   │
│  │ Generated: Sunday Apr 27 at 11:00 PM             │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ Week of Apr 14 – Apr 20, 2026         [View →]   │   │
│  │ Generated: Sunday Apr 20 at 11:00 PM             │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  (Oldest reports at the bottom — newest at top)          │
└──────────────────────────────────────────────────────────┘
```

---

### The Individual Weekly Report Page

**URL:** `/dashboard/reports/[weekId]`

```
┌──────────────────────────────────────────────────────────┐
│  ← All Reports                                           │
│                                                          │
│  WEEKLY REPORT                                           │
│  Week of Monday Apr 28 – Sunday May 4, 2026              │
│  Generated: Sunday May 4 at 11:00 PM                     │
│                                                          │
│  COMPANY SUMMARY                                         │
│  ┌──────────────────────────────────────────────────┐   │
│  │ Total employees this week:     12                │   │
│  │ Total hours logged (company):  387h 15m          │   │
│  │ Average hours per person:      32h 17m           │   │
│  │ Tasks completed this week:     47                │   │
│  │ Tickets raised:                8                 │   │
│  │ Tickets resolved:              7                 │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ─────────────────────────────────────────────────────── │
│                                                          │
│  INDIVIDUAL BREAKDOWN                                    │
│                                                          │
│  [Search employee...]   [Sort: By Hours ▾]               │
│                                                          │
│  ▼ ALICE JOHNSON (Employee — Project Alpha Lead)         │
│  ┌──────────────────────────────────────────────────┐   │
│  │                                                  │   │
│  │  HOURS                                           │   │
│  │  Mon Apr 28   7h 42m                             │   │
│  │  Tue Apr 29   8h 15m                             │   │
│  │  Wed Apr 30   6h 03m                             │   │
│  │  Thu May  1   8h 00m                             │   │
│  │  Fri May  2   5h 30m                             │   │
│  │  Sat May  3   0h 00m                             │   │
│  │  Sun May  4   0h 00m                             │   │
│  │  ─────────────────────────────────────────────  │   │
│  │  TOTAL:   35h 30m                               │   │
│  │                                                  │   │
│  │  TASKS COMPLETED (5)                             │   │
│  │  ✓ Fix login redirect          Apr 30  Alpha    │   │
│  │  ✓ Update API docs             Apr 29  Gamma    │   │
│  │  ✓ Setup CI pipeline           Apr 28  Alpha    │   │
│  │  ✓ Write auth unit tests       May  1  Alpha    │   │
│  │  ✓ Code review: PR #47         Apr 28  Gamma    │   │
│  │                                                  │   │
│  │  TASKS IN PROGRESS (2)                           │   │
│  │  ◑ Dashboard layout fixes      Due May 5  HIGH  │   │
│  │  ◑ Profile page update         Due May 8  MED   │   │
│  │                                                  │   │
│  │  OVERDUE TASKS (1)                               │   │
│  │  ⚠ Auth module refactor       Was Apr 27  HIGH  │   │
│  │                                                  │   │
│  │  TICKETS                                         │   │
│  │  Raised: 1   ("CSS grid broken" — COMPLETED)    │   │
│  │  Helped: 2   (Bob's Docker issue, Eve's API bug) │   │
│  │                                                  │   │
│  │  DAILY LOGS                                      │   │
│  │  Mon Apr 28:                                     │   │
│  │  "Completed API docs, fixed two QA bugs,         │   │
│  │   pushed hotfix to staging."                     │   │
│  │                                                  │   │
│  │  Tue Apr 29:                                     │   │
│  │  "Worked on onboarding UI, design sync,          │   │
│  │   updated all task statuses."                    │   │
│  │                                                  │   │
│  │  Wed Apr 30:                                     │   │
│  │  "Reviewed 3 PRs, merged 2. Wrote tests for      │   │
│  │   profile endpoint."                             │   │
│  │  Notes: "Need to finish coverage tomorrow."      │   │
│  │                                                  │   │
│  │  Thu May 1:                                      │   │
│  │  "Finished test coverage. Started dashboard       │   │
│  │   layout fixes for mobile."                      │   │
│  │                                                  │   │
│  │  Fri May 2:                                      │   │
│  │  "Dashboard layout 60% done. Ran into CSS        │   │
│  │   grid issue — raised a ticket, Bob helped."     │   │
│  │                                                  │   │
│  │  Sat/Sun:  (Weekend — no log)                    │   │
│  │                                                  │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ▶ BOB SMITH (Employee — Project Beta)    [Expand]       │
│  ▶ CHARLIE BROWN (Employee — Project Gamma) [Expand]     │
│  ▶ DIANA PRINCE (Employee — Project Alpha) [Expand]      │
│  ...                                                     │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

### Report Layout Explained Section by Section

**Company Summary (top of report):**
- Total active employees that week (anyone who logged in at least once)
- Total hours across the entire company
- Average hours per person (company total ÷ employee count)
- Total tasks completed across all projects
- Total tickets raised and resolved that week

**Individual Breakdown (one card per employee):**

Each employee card is **collapsed by default** (▶ shows a one-line summary). Clicking expands it (▼) to show the full detail. This keeps the page readable when you have 20+ employees — admin can scan summaries and only expand people they want to look at in detail.

**Collapsed (one-line) view:**
```
▶ ALICE JOHNSON    35h 30m    5 tasks done    1 overdue    [Expand]
```

This tells admin at a glance: Alice worked 35.5 hours, completed 5 tasks, has 1 overdue item. They can decide if they want to read more.

**Expanded view contains (in order):**
1. **Hours** — per-day breakdown + weekly total
2. **Tasks Completed** — every task marked DONE during this week with project and date
3. **Tasks In Progress** — tasks still open at week end (not a problem, just visible)
4. **Overdue Tasks** — tasks whose deadline passed during the week but were NOT completed (highlighted in orange/red — these need attention)
5. **Tickets** — how many they raised and how many others they helped
6. **Daily Logs** — full text of what they wrote each working day, in order Mon–Fri. Weekends not shown (they typically won't log on weekends). Days with no log show "(No log written)"

---

### Sort Options on Individual Breakdown

Admin can sort the employee cards by:
- **By Hours — Most to Least** (default): Highest hour employees shown first
- **By Hours — Least to Most**: Surface anyone who worked significantly less
- **By Name (A–Z)**: Alphabetical
- **By Tasks Completed**: Most productive (by task count) first
- **By Overdue Tasks**: Employees with the most overdue tasks shown first (to spot problems)

---

### Navigation in the Sidebar (Admin Only)

Add Reports to the admin sidebar:

```
◆  DASHBOARD        → /dashboard
□  PROJECTS         → /dashboard/projects
○  TEAM             → /dashboard/people
⊞  TICKETS          → /dashboard/tickets
📊 REPORTS          → /dashboard/reports       ← NEW
◈  ONBOARDING       → /dashboard/onboarding
```

Reports link is ADMIN ONLY. Employee sidebar does not have this link. If an employee navigates to `/dashboard/reports` directly, middleware blocks them with 403.

---

### WeeklyReport Data Model

Rather than regenerating from scratch every time the page loads, the report is pre-generated and stored:

```
WeeklyReport:
  id            — String (cuid, primary key)
  weekStart     — Date (the Monday of that week)
  weekEnd       — Date (the Sunday of that week)
  generatedAt   — DateTime (when the job ran)
  snapshot      — Json (the full compiled report data, stored as JSON)

  Index: weekStart (to look up reports by week)
```

**Why store as JSON snapshot?**
Because employee data can change after the report is generated (tasks can be deleted, users removed). The snapshot preserves exactly what was true at the moment of generation — so past reports are historically accurate and don't shift retroactively.

---

### How the Sunday Report Job Works

This is a **scheduled background job** (cron job) that runs every Sunday at 11:00 PM:

```
Step 1: Determine the week range (last Monday to today/Sunday)

Step 2: For each active employee in the system:
  a. Fetch their DailyWorkLog records for Mon–Sun → total hours
  b. Fetch their WorkSession records for each day → per-day hours
  c. Fetch their DailyLog records for Mon–Fri → daily notes
  d. Fetch their Tasks marked DONE this week (completedAt within Mon–Sun)
  e. Fetch their Tasks with status TODO/IN_PROGRESS (still open at week end)
  f. Fetch their Tasks that are OVERDUE (deadline < Sunday, status ≠ DONE)
  g. Fetch Tickets they raised this week
  h. Fetch Tickets they helped resolve this week

Step 3: Compile all data into a structured JSON snapshot

Step 4: Save WeeklyReport record to database

Step 5: Send notification to all ADMIN users:
  "Weekly Report ready — Week of [Mon date] – [Sun date]"
```

---

### What If No One Worked That Week?

If a week had zero activity (e.g. company holiday week), the report is still generated but shows:

```
COMPANY SUMMARY
Total employees this week: 0 active
Total hours logged: 0h 00m
(No activity recorded this week)
```

The individual breakdown section is empty. The report is still saved for the archive.

---

### What If the Cron Job Misses (Server Down)?

If the server is down on Sunday at 11 PM and the job doesn't run, two recovery options:

1. **Auto-retry:** The job checks on Monday morning at startup: "Did last Sunday's report generate?" If not, it generates it then.
2. **Manual trigger:** Admin has a [Generate Report] button on the Reports page for the current/last week — for cases where auto-generation failed.

---

### Daily Log Edge Cases Specific to Reports

| Scenario | What Report Shows |
|---|---|
| Employee never wrote any logs this week | Each day shows "(No log written)" — no penalty, just transparent |
| Employee wrote a log then edited it before midnight | Report uses the final saved version at the time of generation |
| Employee wrote a log AFTER midnight (forgot, next-day edit) | `isLocked = true` after midnight — the log for that day is locked and the report captures whatever was written before midnight. If nothing was written before midnight, shows "No log written" |
| Employee joined mid-week (just approved via onboarding) | Their card appears in the report showing only days from their approval date onward |
| Employee was deleted before Sunday | Their data is NOT included in the new report (they're gone). Past reports that include them remain unchanged (snapshot) |
