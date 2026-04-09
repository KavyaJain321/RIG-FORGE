# Rig Forge — Manual QA Checklist
> Test with two browser profiles: one logged in as **ADMIN**, one as **EMPLOYEE**

---

## SETUP BEFORE TESTING
- [ ] App running at `localhost:3000`
- [ ] DB seeded with: 1 Admin user, 2+ Employee users
- [ ] Open DevTools → Network tab (watch for 4xx/5xx responses)
- [ ] Open DevTools → Console (watch for JS errors)

---

## 1. LANDING PAGE `/`
- [ ] Smoke animation renders without flickering
- [ ] All 3 taglines visible, no excessive spacing
- [ ] "ENTER RIG FORGE" button navigates to `/login`
- [ ] **Edge:** Visiting `/` while already logged in → should redirect to `/dashboard`

---

## 2. AUTH — LOGIN `/login`

### Happy Path
- [ ] Login with valid ADMIN credentials → redirects to `/dashboard`
- [ ] Login with valid EMPLOYEE credentials → redirects to `/dashboard`
- [ ] Login with a **pending/onboarding** user → redirects to `/pending` page

### Edge Cases
- [ ] Wrong password → shows "Invalid email or password" (NOT which field is wrong)
- [ ] Non-existent email → same generic error (no user enumeration)
- [ ] Empty email field → form-level validation fires, no API call
- [ ] Empty password field → form-level validation fires
- [ ] Email with capital letters (e.g. `Admin@FORGE.com`) → should still log in (lowercased server-side)
- [ ] SQL injection in email field → should fail gracefully, no 500
- [ ] Very long password (500+ chars) → should fail gracefully
- [ ] Double-click submit → only one request sent (button disabled on submit)
- [ ] Pressing Enter key in password field → submits form

### Session
- [ ] After login, `forge-token` cookie is set (httpOnly, check Application tab)
- [ ] Navigating to `/login` while logged in → redirects to `/dashboard`

---

## 3. AUTH — LOGOUT
- [ ] Clicking logout → clears cookie and redirects to `/login`
- [ ] After logout, pressing browser Back → cannot access `/dashboard` (redirected to `/login`)
- [ ] `/api/auth/me` after logout → returns 401

---

## 4. MIDDLEWARE / ROUTE PROTECTION
- [ ] Visiting `/dashboard` without cookie → redirected to `/login`
- [ ] Visiting `/dashboard/projects` without cookie → redirected to `/login`
- [ ] Visiting `/dashboard/onboarding` as EMPLOYEE → should show 403/redirect or empty state, not crash
- [ ] Calling `GET /api/admin/onboarding/pending` as EMPLOYEE → 403
- [ ] Calling `POST /api/admin/generate-user` as EMPLOYEE → 403
- [ ] Calling `DELETE` on any route that doesn't exist → 404 or 405, not 500
- [ ] Expired/tampered JWT cookie → redirected to `/login`

---

## 5. PENDING PAGE `/pending`
- [ ] Onboarding user sees correct waiting message
- [ ] Logout button works
- [ ] **Edge:** Approved user manually navigating to `/pending` → should redirect to `/dashboard`

---

## 6. DASHBOARD `/dashboard`

### Admin View
- [ ] Admin stats render (total users, active projects, open tickets, etc.)
- [ ] No employee-specific panels shown

### Employee View
- [ ] Employee stats render (my tasks, my tickets, my projects)
- [ ] No admin-specific panels shown
- [ ] **Edge:** Dashboard with zero data (fresh employee) → empty states shown, no crash/NaN

---

## 7. ONBOARDING `/dashboard/onboarding` (ADMIN ONLY)

### Generate User
- [ ] "Generate User" modal opens
- [ ] Fill name + email → user created, temporary password shown
- [ ] **Edge:** Duplicate email → error shown, no duplicate user created
- [ ] **Edge:** Invalid email format → validation fires before submit
- [ ] **Edge:** Empty name → validation fires

### Approve / Reject
- [ ] Pending users list loads
- [ ] Approve user → user removed from pending list, user can now login to `/dashboard`
- [ ] Reject user → user removed from pending list, user cannot log in
- [ ] **Edge:** No pending users → empty state shown (not a blank/broken page)
- [ ] **Edge:** Approve same user twice (two tabs) → second approval handles gracefully

---

## 8. PROJECTS `/dashboard/projects`

### List View
- [ ] Projects list loads
- [ ] Filter by status (ACTIVE / ON_HOLD) works
- [ ] Search by name works
- [ ] **Edge:** No projects exist → empty state shown

### Create Project (ADMIN)
- [ ] "Create Project" modal opens
- [ ] Fill required fields (Name + Lead) → project created, appears in list
- [ ] Scroll works in modal (footer button always reachable) ← recently fixed
- [ ] Add project link → label + URL saved
- [ ] Add members → chips shown, saved on submit
- [ ] Set deadline → date saved
- [ ] **Edge:** Name left blank → "Project name is required" error
- [ ] **Edge:** No lead selected → "Project lead is required" error
- [ ] **Edge:** Name 101 chars → blocked by maxLength
- [ ] **Edge:** Description 501 chars → blocked by maxLength
- [ ] **Edge:** Add 6 links → "+ ADD LINK" button disappears at 5
- [ ] **Edge:** Double-click "CREATE PROJECT" → only one project created
- [ ] **Edge:** Close modal mid-fill, reopen → form is reset/empty

### Project Detail `/dashboard/projects/[id]`
- [ ] Overview tab loads (lead, status, priority, deadline, members)
- [ ] Tasks tab loads
- [ ] Updates/thread tab loads
- [ ] Members tab loads
- [ ] **Edge:** Invalid project ID in URL → 404 or redirect, not crash

---

## 9. TASKS (inside Project Detail)

### Create Task
- [ ] Create task modal opens from Tasks tab
- [ ] Fill title + assignee → task appears in list
- [ ] **Edge:** Title blank → validation error
- [ ] **Edge:** No assignee → allowed or validated (check spec)

### Update Task
- [ ] Change status (TODO → IN_PROGRESS → DONE) → updates correctly
- [ ] **Edge:** EMPLOYEE updating task not assigned to them → check if blocked or allowed (by design)

### Filters
- [ ] Filter by status (TODO / IN_PROGRESS / DONE) works
- [ ] Filter by assignee works
- [ ] **Edge:** All filters active with no matches → empty state, not crash

---

## 10. TICKETS `/dashboard/tickets`

### List View
- [ ] Tickets load
- [ ] Filter by status works
- [ ] **Edge:** No tickets → empty state

### Raise Ticket (EMPLOYEE)
- [ ] "Raise Ticket" modal opens
- [ ] Fill title + description → ticket created, status = OPEN
- [ ] **Edge:** Title blank → validation error
- [ ] **Edge:** Very long title (200+ chars) → check maxLength

### Ticket Lifecycle
- [ ] EMPLOYEE raises ticket (OPEN)
- [ ] Another EMPLOYEE accepts it (ACCEPTED) — or ADMIN
- [ ] Acceptor marks it complete (COMPLETED)
- [ ] **Edge:** Raiser tries to accept their own ticket → should be blocked
- [ ] **Edge:** Cancel a COMPLETED ticket → should be blocked
- [ ] **Edge:** Accept an already-ACCEPTED ticket (two users race) → second one gets error

### Ticket Detail `/dashboard/tickets/[id]`
- [ ] Thread loads
- [ ] Post a comment → appears immediately
- [ ] **Edge:** Empty comment submitted → should not post

---

## 11. DAILY LOG

- [ ] Log entry form appears on dashboard or profile
- [ ] Submit a work summary for today → saved
- [ ] Resubmit same day → updates (upsert), not duplicates
- [ ] **Edge:** Submit empty summary → validation error or blocked
- [ ] **Edge:** Locked log → cannot be edited (if lock logic exists)

---

## 12. REPORTS `/dashboard/reports`

- [ ] Reports list loads
- [ ] "Generate Report" for current week → creates snapshot
- [ ] **Edge:** Generate report for same week twice → updates or shows error, no duplicate
- [ ] Report detail `/dashboard/reports/[weekId]` → renders correctly
- [ ] **Edge:** Invalid weekId in URL → 404 or redirect, not crash
- [ ] EMPLOYEE sees only their own report data
- [ ] ADMIN can see all employees' report data

---

## 13. PEOPLE `/dashboard/people`

- [ ] All employees listed
- [ ] Search/filter by name works
- [ ] Click member → shows detail (status, projects, tasks)
- [ ] WORKING / NOT_WORKING status badge correct
- [ ] **Edge:** No employees → empty state

---

## 14. PROFILE `/dashboard/profile`

### Update Profile
- [ ] Name change → saved, reflected in topbar/avatar
- [ ] Avatar URL change → avatar updates
- [ ] **Edge:** Name left blank → validation error

### Change Password
- [ ] Current password → New password → Confirm → success
- [ ] **Edge:** Wrong current password → error shown
- [ ] **Edge:** New password ≠ Confirm → error before API call
- [ ] **Edge:** New password same as current → allowed or flagged (check spec)
- [ ] **Edge:** New password too short (< 8 chars) → validation error

---

## 15. NOTIFICATIONS

- [ ] Notification bell shows unread count badge
- [ ] Opening bell → dropdown lists notifications
- [ ] Click notification → navigates to relevant page
- [ ] "Mark all read" → badge disappears, all items dimmed
- [ ] Mark single notification read → only that one marked
- [ ] **Edge:** Zero notifications → empty state in dropdown
- [ ] **Edge:** 50+ notifications → list scrollable, no layout break

---

## 16. THREADS / COMMENTS

- [ ] Post message in project thread → appears instantly
- [ ] Post message in task thread → appears instantly
- [ ] **Edge:** Empty message submitted → blocked
- [ ] **Edge:** Very long message (1000+ chars) → check if truncated or allowed
- [ ] Messages show correct author name + timestamp
- [ ] **Edge:** Two users posting simultaneously → both messages appear, correct order

---

## 17. HEARTBEAT / PRESENCE

- [ ] After login, user status = WORKING in People page
- [ ] `/api/heartbeat` called periodically (check Network tab, ~every 30s)
- [ ] **Edge:** Heartbeat called when logged out → 401, not crash

---

## 18. RESPONSIVE / UI

- [ ] Dashboard usable at 1024px width
- [ ] Dashboard usable at 768px (tablet)
- [ ] Mobile nav shows at small screen
- [ ] Modals scrollable on small viewports (Create Project fix applies)
- [ ] No horizontal scroll on any main page

---

## 19. ERROR & NETWORK RESILIENCE

- [ ] Kill DB / stop server mid-session → app shows error message, doesn't white-screen
- [ ] API returns 500 → user sees friendly error, not raw JSON
- [ ] Network offline → toast/error shown
- [ ] Refresh page mid-form → form clears (expected), no crash

---

## 20. SECURITY SPOT CHECKS

- [ ] `forge-token` cookie is `httpOnly` (cannot be read by JS in console)
- [ ] EMPLOYEE cannot access `/api/admin/*` routes (test with curl/Postman)
- [ ] User A cannot edit User B's profile (`PUT /api/users/me/profile` uses token identity)
- [ ] User A cannot read User B's password hash (no endpoint exposes it)
- [ ] XSS: Enter `<script>alert(1)</script>` in project name → rendered as text, not executed

---

## QUICK ROLE MATRIX

| Feature | ADMIN | EMPLOYEE |
|---|---|---|
| Generate users | ✅ | ❌ |
| Approve/reject onboarding | ✅ | ❌ |
| View onboarding page | ✅ | ❌ (redirect/403) |
| Create project | ✅ | ❌ (check) |
| View all projects | ✅ | own/member only? |
| Raise ticket | ✅ | ✅ |
| Accept ticket | ✅ | ✅ |
| View all reports | ✅ | own only |
| View all people | ✅ | ✅ |
| Change own password | ✅ | ✅ |

---

*Last updated: 2026-04-06*
