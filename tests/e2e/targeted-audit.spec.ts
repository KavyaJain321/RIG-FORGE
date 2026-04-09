/**
 * FORGE Targeted Audit — Project tabs + Employee access isolation
 *
 * Test data:
 *   OSINT project         → employee IS a member
 *   ADMIN ONLY PROJECT    → employee is NOT a member
 *   Task assigned to employee in OSINT
 */

import { test, expect, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const ADMIN_EMAIL    = 'admin@forge.com';
const ADMIN_PASS     = 'Admin123!';
const EMP_EMAIL      = 'employee@forge.com';
const EMP_PASS       = 'Emp12345!';
const BASE           = 'http://localhost:3000';
const OSINT_ID       = 'cmnm3fiho003tjn1rlvb3cesj';
const ADMIN_PROJ_ID  = 'test-proj-2-secret';

const results: { id: string; label: string; status: '✅ WORKING' | '❌ BROKEN' | '⚠️ PARTIAL'; detail: string }[] = [];

function record(id: string, label: string, status: '✅ WORKING' | '❌ BROKEN' | '⚠️ PARTIAL', detail: string) {
  results.push({ id, label, status, detail });
  console.log(`[${status}] ${id}: ${label} — ${detail}`);
}

async function login(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState('networkidle');
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")').first().click();
  await page.waitForURL(/dashboard/, { timeout: 15000 });
}

async function screenshot(page: Page, name: string) {
  const dir = path.join('tests', 'e2e', 'artifacts');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// PROJECT DETAIL TABS
// ─────────────────────────────────────────────────────────────────────────────

test('F1 — Project detail has Overview / Tasks / Updates tabs', async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASS);
  await page.goto(`${BASE}/dashboard/projects/${OSINT_ID}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await screenshot(page, 'F1-project-detail');

  const body = await page.textContent('body') ?? '';
  const hasOverview = body.toLowerCase().includes('overview');
  const hasTasks    = body.toLowerCase().includes('tasks');
  const hasUpdates  = body.toLowerCase().includes('update') || body.toLowerCase().includes('chat');

  // Confirm tab buttons are clickable
  const tabs = await page.locator('button:has-text("Overview"), button:has-text("Tasks"), button:has-text("Updates"), [role="tab"]').allInnerTexts();

  record('F1', 'Project detail 3 tabs', (hasOverview && hasTasks && hasUpdates) ? '✅ WORKING' : '⚠️ PARTIAL',
    `Overview: ${hasOverview}, Tasks: ${hasTasks}, Updates: ${hasUpdates}. Tab labels found: [${tabs.join(', ')}]`);
});

test('F2 — Overview tab: description, members, lead', async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASS);
  await page.goto(`${BASE}/dashboard/projects/${OSINT_ID}?tab=overview`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  // Click Overview tab if present
  const overviewTab = page.locator('button:has-text("Overview"), [role="tab"]:has-text("Overview")').first();
  if (await overviewTab.isVisible()) await overviewTab.click();
  await page.waitForTimeout(800);
  await screenshot(page, 'F2-overview-tab');

  const body = await page.textContent('body') ?? '';
  const hasMembers     = body.toLowerCase().includes('member') || body.toLowerCase().includes('team');
  const hasDescription = body.toLowerCase().includes('description') || body.toLowerCase().includes('about') || body.toLowerCase().includes('osint');
  const hasLead        = body.toLowerCase().includes('lead');
  const hasLinks       = body.toLowerCase().includes('link');

  record('F2', 'Overview tab: members + description + lead',
    (hasMembers && hasDescription) ? '✅ WORKING' : '⚠️ PARTIAL',
    `Description: ${hasDescription}, Members: ${hasMembers}, Lead: ${hasLead}, Links: ${hasLinks}`);
});

test('F3 — Tasks tab: shows assigned task with details', async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASS);
  await page.goto(`${BASE}/dashboard/projects/${OSINT_ID}?tab=tasks`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  // Click Tasks tab
  const tasksTab = page.locator('button:has-text("Tasks"), [role="tab"]:has-text("Tasks")').first();
  if (await tasksTab.isVisible()) await tasksTab.click();
  await page.waitForTimeout(800);
  await screenshot(page, 'F3-tasks-tab');

  const body = await page.textContent('body') ?? '';
  const hasTask        = body.toLowerCase().includes('gather intelligence') || body.toLowerCase().includes('intelligence report');
  const hasStatus      = body.toLowerCase().includes('todo') || body.toLowerCase().includes('in progress') || body.toLowerCase().includes('done');
  const hasAssignee    = body.toLowerCase().includes('employee') || body.toLowerCase().includes('test employee');
  const hasAddTaskBtn  = await page.locator('button:has-text("Add"), button:has-text("New Task"), button:has-text("+ Task")').count() > 0;

  record('F3', 'Tasks tab: shows tasks with assignees',
    (hasTask || hasStatus) ? '✅ WORKING' : '⚠️ PARTIAL',
    `Task visible: ${hasTask}, Status shown: ${hasStatus}, Assignee shown: ${hasAssignee}, Add task btn: ${hasAddTaskBtn}`);
});

test('F4 — Updates tab: chat / message input present', async ({ page }) => {
  await login(page, ADMIN_EMAIL, ADMIN_PASS);
  await page.goto(`${BASE}/dashboard/projects/${OSINT_ID}?tab=updates`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);

  // Click Updates tab
  const updatesTab = page.locator('button:has-text("Updates"), button:has-text("Update"), [role="tab"]:has-text("Update")').first();
  if (await updatesTab.isVisible()) await updatesTab.click();
  await page.waitForTimeout(800);
  await screenshot(page, 'F4-updates-tab');

  const body = await page.textContent('body') ?? '';
  const hasChat     = body.toLowerCase().includes('message') || body.toLowerCase().includes('chat') || body.toLowerCase().includes('send');
  const hasInput    = await page.locator('input[placeholder*="message" i], textarea[placeholder*="message" i], input[placeholder*="type" i], textarea').count() > 0;

  record('F4', 'Updates tab: chat/message input',
    (hasChat || hasInput) ? '✅ WORKING' : '⚠️ PARTIAL',
    `Chat content: ${hasChat}, Input field: ${hasInput}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE ACCESS ISOLATION
// ─────────────────────────────────────────────────────────────────────────────

test('E1 — Employee can see OSINT (their project) in projects list', async ({ page }) => {
  await login(page, EMP_EMAIL, EMP_PASS);
  await page.goto(`${BASE}/dashboard/projects`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await screenshot(page, 'E1-emp-projects-list');

  const body = await page.textContent('body') ?? '';
  const seesOsint = body.toLowerCase().includes('osint');

  record('E1', 'Employee sees their own project (OSINT)',
    seesOsint ? '✅ WORKING' : '❌ BROKEN',
    `OSINT visible in employee projects list: ${seesOsint}`);
});

test('E2 — Employee CANNOT see "ADMIN ONLY PROJECT" in projects list', async ({ page }) => {
  await login(page, EMP_EMAIL, EMP_PASS);
  await page.goto(`${BASE}/dashboard/projects`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  const body = await page.textContent('body') ?? '';
  const seesAdminProj = body.toLowerCase().includes('admin only');

  record('E2', 'Employee cannot see admin-only project',
    !seesAdminProj ? '✅ WORKING' : '❌ BROKEN',
    `"ADMIN ONLY PROJECT" visible to employee: ${seesAdminProj}`);
});

test('E3 — Employee CANNOT directly access ADMIN ONLY PROJECT page', async ({ page }) => {
  await login(page, EMP_EMAIL, EMP_PASS);
  await page.goto(`${BASE}/dashboard/projects/${ADMIN_PROJ_ID}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await screenshot(page, 'E3-emp-blocked-admin-project');

  const url  = page.url();
  const body = await page.textContent('body') ?? '';
  const wasBlocked = body.toLowerCase().includes('forbidden') ||
                     body.toLowerCase().includes('not found') ||
                     body.toLowerCase().includes('access') ||
                     body.toLowerCase().includes('unauthori') ||
                     !body.toLowerCase().includes('admin only');

  record('E3', 'Employee blocked from admin-only project URL',
    wasBlocked ? '✅ WORKING' : '❌ BROKEN',
    `URL: ${url}. Access blocked / content hidden: ${wasBlocked}`);
});

test('E4 — Employee CAN access OSINT project detail page', async ({ page }) => {
  await login(page, EMP_EMAIL, EMP_PASS);
  await page.goto(`${BASE}/dashboard/projects/${OSINT_ID}`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);
  await screenshot(page, 'E4-emp-osint-project');

  const body = await page.textContent('body') ?? '';
  const hasOsint = body.toLowerCase().includes('osint');

  record('E4', 'Employee can access their own project detail',
    hasOsint ? '✅ WORKING' : '❌ BROKEN',
    `OSINT project detail accessible to employee: ${hasOsint}`);
});

test('E5 — Employee profile page accessible, no other user profiles', async ({ page }) => {
  await login(page, EMP_EMAIL, EMP_PASS);
  await page.goto(`${BASE}/dashboard/profile`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(1500);
  await screenshot(page, 'E5-emp-profile');

  const body = await page.textContent('body') ?? '';
  const hasProfile = body.toLowerCase().includes('profile') || body.toLowerCase().includes('employee') || body.toLowerCase().includes('test employee');
  const hasOtherUserData = body.toLowerCase().includes('admin@forge') || body.toLowerCase().includes('admin profile');

  record('E5', 'Employee profile page: own data only',
    (hasProfile && !hasOtherUserData) ? '✅ WORKING' : '⚠️ PARTIAL',
    `Profile page loads: ${hasProfile}, Other user data visible: ${hasOtherUserData}`);
});

test('E6 — Employee API: /api/projects returns only own projects', async ({ page }) => {
  await login(page, EMP_EMAIL, EMP_PASS);

  const resp = await page.evaluate(async () => {
    const r = await fetch('/api/projects?limit=50', { credentials: 'include' });
    return r.json();
  });

  const items = resp?.data?.items ?? resp?.data ?? [];
  const projectNames = items.map((p: { name: string }) => p.name);
  const seesAdminProj = projectNames.some((n: string) => n.toLowerCase().includes('admin only'));
  const seesOsint     = projectNames.some((n: string) => n.toLowerCase().includes('osint'));

  record('E6', 'API: employee only gets own projects',
    (!seesAdminProj && seesOsint) ? '✅ WORKING' : (seesAdminProj ? '❌ BROKEN' : '⚠️ PARTIAL'),
    `Projects returned: [${projectNames.join(', ')}]. Sees admin-only: ${seesAdminProj}, Sees OSINT: ${seesOsint}`);
});

test('E7 — Employee API: /api/users returns members (names only accessible)', async ({ page }) => {
  await login(page, EMP_EMAIL, EMP_PASS);

  const resp = await page.evaluate(async () => {
    const r = await fetch('/api/users?limit=20', { credentials: 'include' });
    return r.json();
  });

  const items  = resp?.data?.items ?? resp?.data ?? [];
  const apiOk  = resp?.success !== false;
  const fields = items.length > 0 ? Object.keys(items[0]) : [];

  // Employee should get name, role, status — but NOT passwordHash, full logs
  const hasPasswordHash = fields.includes('passwordHash');
  const hasName         = fields.includes('name');

  record('E7', 'API: /api/users accessible to employee (names visible)',
    (apiOk && hasName && !hasPasswordHash) ? '✅ WORKING' : '⚠️ PARTIAL',
    `API success: ${apiOk}, Fields: [${fields.join(', ')}], passwordHash exposed: ${hasPasswordHash}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// REPORT
// ─────────────────────────────────────────────────────────────────────────────

test.afterAll(async () => {
  const working = results.filter(r => r.status === '✅ WORKING').length;
  const broken  = results.filter(r => r.status === '❌ BROKEN').length;
  const partial = results.filter(r => r.status === '⚠️ PARTIAL').length;

  let md = `# FORGE Targeted Audit — Project Tabs + Employee Access\n\n`;
  md += `| ✅ Working | ⚠️ Partial | ❌ Broken | Total |\n|-----------|-----------|---------|-------|\n`;
  md += `| ${working} | ${partial} | ${broken} | ${results.length} |\n\n## Results\n\n`;
  for (const r of results) {
    md += `### ${r.id}: ${r.label}\n**${r.status}** — ${r.detail}\n\n`;
  }

  fs.writeFileSync(path.join('tests', 'e2e', 'artifacts', 'TARGETED_REPORT.md'), md);

  console.log('\n' + '='.repeat(60));
  console.log('TARGETED AUDIT COMPLETE');
  console.log(`✅ ${working}  ⚠️ ${partial}  ❌ ${broken}  Total: ${results.length}`);
  console.log('='.repeat(60));
});
