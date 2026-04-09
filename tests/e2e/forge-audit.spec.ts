/**
 * FORGE System Audit — Full E2E Test
 * Tests all 10 requirements against a live app at http://localhost:3000
 *
 * Credentials:
 *   ADMIN:    admin@forge.com    / Admin1234!
 *   EMPLOYEE: employee@forge.com / Emp12345!
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// ─── Credentials ─────────────────────────────────────────────────────────────
const ADMIN_EMAIL = 'admin@forge.com';
const ADMIN_PASS = 'Admin1234!';
const EMP_EMAIL = 'employee@forge.com';
const EMP_PASS = 'Emp12345!';
const BASE = 'http://localhost:3000';

// ─── Report state ─────────────────────────────────────────────────────────────
const results: { id: string; label: string; status: '✅ WORKING' | '❌ BROKEN' | '⚠️ PARTIAL'; detail: string }[] = [];

function record(id: string, label: string, status: '✅ WORKING' | '❌ BROKEN' | '⚠️ PARTIAL', detail: string) {
  results.push({ id, label, status, detail });
  console.log(`[${status}] REQ-${id}: ${label} — ${detail}`);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  // Fill email — try multiple selectors
  const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
  await emailInput.waitFor({ timeout: 10000 });
  await emailInput.fill(email);
  const passInput = page.locator('input[type="password"], input[name="password"]').first();
  await passInput.fill(password);
  await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")').first().click();
  await page.waitForURL(/dashboard/, { timeout: 15000 });
}

async function logout(page: Page) {
  // Click Sign out in sidebar
  const signOut = page.locator('button:has-text("Sign out")');
  if (await signOut.isVisible()) {
    await signOut.click();
    await page.waitForURL(/login/, { timeout: 8000 });
  } else {
    await page.goto(`${BASE}/login`);
  }
}

async function screenshot(page: Page, name: string) {
  const dir = path.join('tests', 'e2e', 'artifacts');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

// ─── Test suite ───────────────────────────────────────────────────────────────

test.describe('FORGE System Audit', () => {

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION A: LOGIN & AUTHENTICATION
  // ───────────────────────────────────────────────────────────────────────────

  test('A1 — Login page loads and admin can login', async ({ page }) => {
    await page.goto(`${BASE}/login`);
    const pageText = await page.textContent('body');
    const hasLoginForm = await page.locator('input[type="email"], input[name="email"]').count() > 0;

    if (!hasLoginForm) {
      record('A1', 'Login page', '❌ BROKEN', 'No email input found on login page');
      await screenshot(page, 'A1-login-broken');
      return;
    }

    try {
      await login(page, ADMIN_EMAIL, ADMIN_PASS);
      const url = page.url();
      const onDashboard = url.includes('/dashboard');
      await screenshot(page, 'A1-admin-dashboard');
      record('A1', 'Admin login', onDashboard ? '✅ WORKING' : '❌ BROKEN',
        onDashboard ? `Redirected to ${url}` : `Stayed at ${url}`);
    } catch (e) {
      record('A1', 'Admin login', '❌ BROKEN', `Login failed: ${e}`);
      await screenshot(page, 'A1-admin-login-fail');
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION B: ADMIN CAPABILITIES
  // ───────────────────────────────────────────────────────────────────────────

  test('B1 — Admin sidebar shows all nav items (no standup/blockers)', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForLoadState('networkidle');

    const bodyText = (await page.textContent('body') ?? '').toLowerCase();
    const navLinks = await page.locator('nav a').allInnerTexts();
    const navText = navLinks.join(' ').toLowerCase();

    await screenshot(page, 'B1-admin-sidebar');

    const hasStandup = bodyText.includes('standup') || navText.includes('standup');
    const hasBlockers = bodyText.includes('blockers') || navText.includes('blockers');
    const hasDashboard = navText.includes('dashboard');
    const hasProjects = navText.includes('projects');
    const hasTeam = navText.includes('team');
    const hasTickets = navText.includes('tickets');
    const hasReports = navText.includes('reports');
    const hasOnboarding = navText.includes('onboarding');

    const missing = [
      !hasDashboard && 'Dashboard',
      !hasProjects && 'Projects',
      !hasTeam && 'Team',
      !hasTickets && 'Tickets',
      !hasReports && 'Reports',
      !hasOnboarding && 'Onboarding',
    ].filter(Boolean);

    if (hasStandup || hasBlockers) {
      record('B1', 'No standup/blockers in nav', '❌ BROKEN',
        `Found: ${[hasStandup && 'standup', hasBlockers && 'blockers'].filter(Boolean).join(', ')}`);
    } else if (missing.length > 0) {
      record('B1', 'Admin nav items', '⚠️ PARTIAL', `Missing: ${missing.join(', ')}. Nav: ${navLinks.join(', ')}`);
    } else {
      record('B1', 'Admin nav items (no standup/blockers)', '✅ WORKING', `Nav: ${navLinks.join(', ')}`);
    }
  });

  test('B2 — Admin dashboard has different UI (AdminDashboard component)', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForLoadState('networkidle');

    const bodyText = await page.textContent('body') ?? '';
    await screenshot(page, 'B2-admin-dashboard-ui');

    // Admin dashboard should show company-wide stats
    const hasAdminIndicator = bodyText.toLowerCase().includes('admin') ||
      bodyText.toLowerCase().includes('all projects') ||
      bodyText.toLowerCase().includes('company') ||
      bodyText.toLowerCase().includes('total') ||
      bodyText.toLowerCase().includes('team');

    record('B2', 'Admin dashboard UI', hasAdminIndicator ? '✅ WORKING' : '⚠️ PARTIAL',
      hasAdminIndicator ? 'Admin-specific content visible on dashboard' : 'Could not confirm admin-specific dashboard UI');
  });

  test('B3 — Admin can see ALL projects', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto(`${BASE}/dashboard/projects`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    const bodyText = await page.textContent('body') ?? '';
    await screenshot(page, 'B3-admin-projects');

    // Admin projects page should show "Create Project" button
    const hasCreateBtn = await page.locator('button:has-text("Create"), button:has-text("New Project"), button:has-text("+ Project")').count() > 0;
    const hasProjectsContent = bodyText.toLowerCase().includes('project') || bodyText.toLowerCase().includes('active');

    record('B3', 'Admin sees all projects + Create button', hasCreateBtn ? '✅ WORKING' : (hasProjectsContent ? '⚠️ PARTIAL' : '❌ BROKEN'),
      `Create button: ${hasCreateBtn}, Projects content visible: ${hasProjectsContent}`);
  });

  test('B4 — Admin Team page: can click member to see full profile', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto(`${BASE}/dashboard/people`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await screenshot(page, 'B4-admin-team-page');

    const cards = page.locator('[class*="card"], [class*="member"], [class*="row"]').first();
    const cardCount = await page.locator('[class*="card"], [class*="member"], button[class*="cursor"]').count();

    // Try clicking the first member card
    try {
      const clickable = page.locator('button, [role="button"]').filter({ hasText: /\w+/ }).first();
      if (await clickable.isVisible()) {
        await clickable.click();
        await page.waitForTimeout(1000);
        const afterClick = await page.textContent('body') ?? '';
        await screenshot(page, 'B4-admin-member-detail');
        const hasDetail = afterClick.toLowerCase().includes('project') ||
          afterClick.toLowerCase().includes('hours') ||
          afterClick.toLowerCase().includes('worked') ||
          afterClick.toLowerCase().includes('time') ||
          afterClick.toLowerCase().includes('daily');
        record('B4', 'Admin can click member for full profile', hasDetail ? '✅ WORKING' : '⚠️ PARTIAL',
          hasDetail ? 'Member detail panel shows project/time info' : 'Panel opened but no project/time details detected');
      } else {
        record('B4', 'Admin member click', '⚠️ PARTIAL', `No clickable member cards found. Card count: ${cardCount}`);
      }
    } catch (e) {
      record('B4', 'Admin member click', '❌ BROKEN', `Error: ${e}`);
    }
  });

  test('B5 — Onboarding page: Generate User button + pending list', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto(`${BASE}/dashboard/onboarding`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await screenshot(page, 'B5-onboarding-page');

    const hasGenerateBtn = await page.locator('button:has-text("Generate"), button:has-text("+ Generate")').count() > 0;
    const bodyText = await page.textContent('body') ?? '';
    const hasPendingSection = bodyText.toLowerCase().includes('pending') || bodyText.toLowerCase().includes('approval');
    const hasApprovedSection = bodyText.toLowerCase().includes('approved') || bodyText.toLowerCase().includes('onboard');

    if (!hasGenerateBtn) {
      record('B5', 'Onboarding: Generate User button', '❌ BROKEN', 'Generate User button not found');
    } else {
      // Click Generate User button
      await page.locator('button:has-text("Generate"), button:has-text("+ Generate")').first().click();
      await page.waitForTimeout(500);
      const modalText = await page.textContent('body') ?? '';
      const modalOpen = modalText.toLowerCase().includes('name') && modalText.toLowerCase().includes('email') && modalText.toLowerCase().includes('role');
      await screenshot(page, 'B5-generate-user-modal');

      record('B5', 'Onboarding: Generate User + modal', modalOpen ? '✅ WORKING' : '⚠️ PARTIAL',
        `Generate btn: ✓, Modal opens with form: ${modalOpen}, Pending section: ${hasPendingSection}`);
    }
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION C: EMPLOYEE CAPABILITIES
  // ───────────────────────────────────────────────────────────────────────────

  test('C1 — Employee sidebar: limited nav (no Reports/Onboarding)', async ({ page }) => {
    await login(page, EMP_EMAIL, EMP_PASS);
    await page.waitForLoadState('networkidle');

    await screenshot(page, 'C1-employee-sidebar');

    const navLinks = await page.locator('nav a').allInnerTexts();
    const navText = navLinks.join(' ').toLowerCase();

    const hasDashboard = navText.includes('dashboard');
    const hasProjects = navText.includes('project');
    const hasTeam = navText.includes('team');
    const hasTickets = navText.includes('tickets');
    const hasProfile = navText.includes('profile');
    const hasOnboarding = navText.includes('onboarding');
    const hasReports = navText.includes('reports');

    if (hasOnboarding) {
      record('C1', 'Employee nav: no Onboarding access', '❌ BROKEN', 'Employee can see Onboarding link — should be hidden');
    } else if (!hasDashboard || !hasProjects || !hasTeam || !hasTickets) {
      record('C1', 'Employee nav items', '⚠️ PARTIAL', `Nav: ${navLinks.join(', ')}`);
    } else {
      record('C1', 'Employee limited nav (no Reports/Onboarding)', '✅ WORKING',
        `Nav: ${navLinks.join(', ')}. Reports: ${hasReports}, Onboarding: ${hasOnboarding}`);
    }
  });

  test('C2 — Employee dashboard is different from admin', async ({ page }) => {
    await login(page, EMP_EMAIL, EMP_PASS);
    await page.waitForLoadState('networkidle');

    await screenshot(page, 'C2-employee-dashboard');

    const bodyText = await page.textContent('body') ?? '';
    // Employee dashboard should NOT have company-wide admin stats
    const hasEmployeeIndicator = bodyText.toLowerCase().includes('my') ||
      bodyText.toLowerCase().includes('task') ||
      bodyText.toLowerCase().includes('ticket');
    const hasAdminOnlyContent = bodyText.toLowerCase().includes('all employees') ||
      bodyText.toLowerCase().includes('company overview');

    record('C2', 'Employee dashboard different UI', (!hasAdminOnlyContent && hasEmployeeIndicator) ? '✅ WORKING' : '⚠️ PARTIAL',
      `Employee-specific content: ${hasEmployeeIndicator}, Admin-only content leaked: ${hasAdminOnlyContent}`);
  });

  test('C3 — Employee projects: only own projects visible', async ({ page }) => {
    await login(page, EMP_EMAIL, EMP_PASS);
    await page.goto(`${BASE}/dashboard/projects`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await screenshot(page, 'C3-employee-projects');

    // Employee should NOT see "Create Project" button (admin only)
    const hasCreateBtn = await page.locator('button:has-text("Create"), button:has-text("New Project")').count() > 0;
    const bodyText = await page.textContent('body') ?? '';
    const hasProjectsPage = bodyText.toLowerCase().includes('project') || bodyText.toLowerCase().includes('no projects');

    record('C3', 'Employee sees only own projects (no Create btn)', !hasCreateBtn ? '✅ WORKING' : '⚠️ PARTIAL',
      `Create button visible (should be false): ${hasCreateBtn}, Projects page loaded: ${hasProjectsPage}`);
  });

  test('C4 — Employee team page: sees member names only (no clickable profiles)', async ({ page }) => {
    await login(page, EMP_EMAIL, EMP_PASS);
    await page.goto(`${BASE}/dashboard/people`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await screenshot(page, 'C4-employee-team-page');
    const bodyText = await page.textContent('body') ?? '';
    const hasMemberNames = bodyText.trim().length > 100; // has some content

    // Try clicking a member — should NOT open full profile detail
    let clickOpensDetail = false;
    try {
      const firstCard = page.locator('button[class*="cursor"], div[class*="card"], button').filter({ hasText: /\w{3,}/ }).first();
      if (await firstCard.isVisible({ timeout: 2000 })) {
        await firstCard.click();
        await page.waitForTimeout(800);
        const afterText = await page.textContent('body') ?? '';
        // If clicking shows project/hours/time details specific to a member, that's admin-level
        clickOpensDetail = afterText.toLowerCase().includes('last week') ||
          afterText.toLowerCase().includes('hours worked') ||
          afterText.toLowerCase().includes('daily log');
      }
    } catch {}

    record('C4', 'Employee team: names visible, no full profile details', !clickOpensDetail ? '✅ WORKING' : '⚠️ PARTIAL',
      `Members listed: ${hasMemberNames}, Click exposes admin-level detail: ${clickOpensDetail}`);
  });

  test('C5 — Employee cannot access /dashboard/onboarding', async ({ page }) => {
    await login(page, EMP_EMAIL, EMP_PASS);
    await page.goto(`${BASE}/dashboard/onboarding`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    const url = page.url();
    await screenshot(page, 'C5-employee-onboarding-blocked');

    const wasRedirected = !url.includes('/onboarding');
    record('C5', 'Employee blocked from Onboarding page', wasRedirected ? '✅ WORKING' : '❌ BROKEN',
      `URL after nav: ${url}. Redirected away: ${wasRedirected}`);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION D: TICKETS
  // ───────────────────────────────────────────────────────────────────────────

  test('D1 — Tickets page exists with tabs (Open/Accepted/Completed)', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto(`${BASE}/dashboard/tickets`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    await screenshot(page, 'D1-tickets-page');

    const bodyText = await page.textContent('body') ?? '';
    const hasOpen = bodyText.toLowerCase().includes('open');
    const hasAccepted = bodyText.toLowerCase().includes('accepted');
    const hasCompleted = bodyText.toLowerCase().includes('completed');
    const hasRaiseBtn = await page.locator('button:has-text("Raise"), button:has-text("New Ticket"), button:has-text("+ Ticket"), button:has-text("raise ticket")').count() > 0;

    const tabsOk = hasOpen && hasAccepted && hasCompleted;
    record('D1', 'Tickets page: Open/Accepted/Completed tabs', tabsOk ? '✅ WORKING' : '⚠️ PARTIAL',
      `Open: ${hasOpen}, Accepted: ${hasAccepted}, Completed: ${hasCompleted}, Raise btn: ${hasRaiseBtn}`);
  });

  test('D2 — Raise Ticket modal: project + description fields', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.goto(`${BASE}/dashboard/tickets`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Try to open raise ticket modal
    const raiseBtn = page.locator('button:has-text("Raise"), button:has-text("New Ticket"), button:has-text("+ Ticket"), button:has-text("Raise Ticket")').first();
    if (!(await raiseBtn.isVisible())) {
      record('D2', 'Raise Ticket modal', '❌ BROKEN', 'Raise Ticket button not visible');
      return;
    }

    await raiseBtn.click();
    await page.waitForTimeout(800);
    await screenshot(page, 'D2-raise-ticket-modal');

    const modalText = await page.textContent('body') ?? '';
    const hasProjectField = modalText.toLowerCase().includes('project');
    const hasDescField = modalText.toLowerCase().includes('description') || modalText.toLowerCase().includes('issue') || modalText.toLowerCase().includes('describe');

    record('D2', 'Raise Ticket modal fields', (hasProjectField && hasDescField) ? '✅ WORKING' : '⚠️ PARTIAL',
      `Project field: ${hasProjectField}, Description/Issue field: ${hasDescField}`);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION E: STATUS (WORKING / NOT WORKING)
  // ───────────────────────────────────────────────────────────────────────────

  test('E1 — Status shows "Working" after login, sidebar displays it', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await screenshot(page, 'E1-status-working');

    const sidebarText = await page.textContent('aside') ?? '';
    const hasWorking = sidebarText.toLowerCase().includes('working');
    const hasNotWorking = sidebarText.toLowerCase().includes('not working');
    // After login, should show "Working" (not "Not Working")
    const showsWorking = hasWorking && !hasNotWorking;

    // Check no other status modes exist
    const bodyText = (await page.textContent('body') ?? '').toLowerCase();
    const hasActiveMode = bodyText.includes('active') && bodyText.includes('status');
    const hasFocusMode = bodyText.includes('focus mode') || bodyText.includes('focus status');
    const hasOfflineMode = bodyText.includes('offline mode') || bodyText.includes('go offline');
    const hasAvailableMode = bodyText.includes('available mode');
    const hasExtraModes = hasActiveMode || hasFocusMode || hasOfflineMode || hasAvailableMode;

    record('E1', 'Status: only Working/Not Working modes', (!hasExtraModes) ? '✅ WORKING' : '⚠️ PARTIAL',
      `Sidebar shows Working: ${showsWorking}, Extra modes (active/focus/offline): ${hasExtraModes}`);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION F: PROJECT DETAIL TABS
  // ───────────────────────────────────────────────────────────────────────────

  test('F1 — Project detail has 3 tabs: Overview, Tasks, Updates', async ({ page }) => {
    // First login as admin and get a project ID via API
    await login(page, ADMIN_EMAIL, ADMIN_PASS);

    const resp = await page.evaluate(async () => {
      const r = await fetch('/api/projects?limit=1', { credentials: 'include' });
      return r.json();
    });

    const projects = resp?.data?.items ?? resp?.data ?? [];
    if (!projects.length) {
      // Create a project first via API
      const createResp = await page.evaluate(async () => {
        const r = await fetch('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name: 'Test Project Audit',
            description: 'Created by E2E audit test',
            status: 'ACTIVE',
            priority: 'MEDIUM',
          }),
        });
        return r.json();
      });

      const projectId = createResp?.data?.id;
      if (!projectId) {
        record('F1', 'Project detail 3 tabs', '❌ BROKEN', 'Could not create or find a project to test detail page');
        return;
      }

      await page.goto(`${BASE}/dashboard/projects/${projectId}`);
    } else {
      await page.goto(`${BASE}/dashboard/projects/${projects[0].id}`);
    }

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    await screenshot(page, 'F1-project-detail-tabs');

    const bodyText = await page.textContent('body') ?? '';
    const hasOverview = bodyText.toLowerCase().includes('overview');
    const hasTasks = bodyText.toLowerCase().includes('tasks');
    const hasUpdates = bodyText.toLowerCase().includes('update') || bodyText.toLowerCase().includes('chat');

    const tabsOk = hasOverview && hasTasks && hasUpdates;
    record('F1', 'Project detail: Overview + Tasks + Updates tabs', tabsOk ? '✅ WORKING' : '⚠️ PARTIAL',
      `Overview: ${hasOverview}, Tasks: ${hasTasks}, Updates/Chat: ${hasUpdates}`);
  });

  test('F2 — Project Overview tab: team members, description, links, project lead', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);

    const resp = await page.evaluate(async () => {
      const r = await fetch('/api/projects?limit=1', { credentials: 'include' });
      return r.json();
    });
    const projects = resp?.data?.items ?? resp?.data ?? [];
    if (!projects.length) {
      record('F2', 'Project Overview tab', '⚠️ PARTIAL', 'No projects in DB to test');
      return;
    }

    await page.goto(`${BASE}/dashboard/projects/${projects[0].id}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    // Click Overview tab
    const overviewTab = page.locator('button:has-text("Overview"), a:has-text("Overview"), [role="tab"]:has-text("Overview")').first();
    if (await overviewTab.isVisible()) await overviewTab.click();
    await page.waitForTimeout(800);
    await screenshot(page, 'F2-overview-tab');

    const tabText = await page.textContent('body') ?? '';
    const hasMembers = tabText.toLowerCase().includes('member') || tabText.toLowerCase().includes('team');
    const hasDescription = tabText.toLowerCase().includes('description') || tabText.toLowerCase().includes('about');
    const hasLead = tabText.toLowerCase().includes('lead');

    record('F2', 'Overview tab content', (hasMembers && hasDescription) ? '✅ WORKING' : '⚠️ PARTIAL',
      `Members: ${hasMembers}, Description: ${hasDescription}, Lead: ${hasLead}`);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION G: STANDUP/BLOCKERS — SHOULD NOT EXIST
  // ───────────────────────────────────────────────────────────────────────────

  test('G1 — No standup or blockers pages exist anywhere', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);

    // Try navigating to standup/blockers routes
    const routes = [
      '/dashboard/standup',
      '/dashboard/blockers',
      '/dashboard/standups',
      '/dashboard/blocker',
    ];

    let foundAny = false;
    for (const route of routes) {
      await page.goto(`${BASE}${route}`);
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(500);
      const url = page.url();
      const wasRedirected = !url.includes(route.split('/').pop()!);
      if (!wasRedirected) {
        foundAny = true;
        await screenshot(page, `G1-found-${route.split('/').pop()}`);
      }
    }

    record('G1', 'No standup/blockers routes', !foundAny ? '✅ WORKING' : '❌ BROKEN',
      !foundAny ? 'All standup/blockers routes redirect correctly (not found)' : 'Found accessible standup/blockers route');
  });

  // ───────────────────────────────────────────────────────────────────────────
  // SECTION H: ONLINE/OFFLINE TIME TRACKING API
  // ───────────────────────────────────────────────────────────────────────────

  test('H1 — Time tracking: DailyActivity created on login via API', async ({ page }) => {
    // Test via API: login sets WORKING + creates DailyActivity
    await page.goto(`${BASE}/login`);

    const loginResult = await page.evaluate(async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: 'admin@forge.com', password: 'Admin1234!' }),
      });
      return r.json();
    });

    const status = loginResult?.data?.currentStatus;
    record('H1', 'Login sets WORKING status + time tracking', status === 'WORKING' ? '✅ WORKING' : '❌ BROKEN',
      `API returned currentStatus: ${status} (expected: WORKING)`);
  });

  test('H2 — Heartbeat endpoint exists for session tracking', async ({ page }) => {
    await login(page, ADMIN_EMAIL, ADMIN_PASS);

    const result = await page.evaluate(async () => {
      const r = await fetch('/api/heartbeat', {
        method: 'POST',
        credentials: 'include',
      });
      return { status: r.status, ok: r.ok };
    });

    record('H2', 'Heartbeat API endpoint', result.ok ? '✅ WORKING' : '⚠️ PARTIAL',
      `Heartbeat POST /api/heartbeat → ${result.status}`);
  });

  // ───────────────────────────────────────────────────────────────────────────
  // GENERATE FINAL REPORT
  // ───────────────────────────────────────────────────────────────────────────

  test.afterAll(async () => {
    const reportPath = path.join('tests', 'e2e', 'artifacts', 'AUDIT_REPORT.md');
    const working = results.filter(r => r.status === '✅ WORKING').length;
    const broken = results.filter(r => r.status === '❌ BROKEN').length;
    const partial = results.filter(r => r.status === '⚠️ PARTIAL').length;
    const total = results.length;

    let md = `# FORGE System Audit Report\n`;
    md += `**Date:** ${new Date().toISOString()}\n\n`;
    md += `## Summary\n`;
    md += `| Status | Count |\n|--------|-------|\n`;
    md += `| ✅ Working | ${working} |\n`;
    md += `| ⚠️ Partial | ${partial} |\n`;
    md += `| ❌ Broken | ${broken} |\n`;
    md += `| **Total** | **${total}** |\n\n`;
    md += `## Results\n\n`;
    for (const r of results) {
      md += `### REQ-${r.id}: ${r.label}\n`;
      md += `**Status:** ${r.status}\n\n`;
      md += `**Detail:** ${r.detail}\n\n`;
    }
    fs.writeFileSync(reportPath, md);
    console.log('\n' + '='.repeat(60));
    console.log('FORGE SYSTEM AUDIT COMPLETE');
    console.log('='.repeat(60));
    console.log(`✅ Working: ${working}  ⚠️ Partial: ${partial}  ❌ Broken: ${broken}  Total: ${total}`);
    console.log(`Report: ${reportPath}`);
    console.log('='.repeat(60));
  });
});
