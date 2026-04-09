from datetime import datetime, timedelta
import json
import time

from playwright.sync_api import sync_playwright


BASE_URL = "http://localhost:3001"
ADMIN_EMAIL = "admin@forge.dev"
ADMIN_PASSWORD = "Admin1234!"


def now_tag() -> str:
    return datetime.now().strftime("%Y%m%d%H%M%S")


def react_fill(page, selector: str, value: str) -> None:
    page.wait_for_selector(selector, timeout=10000)
    page.evaluate(
        """([sel, val]) => {
            const el = document.querySelector(sel);
            if (!el) throw new Error(`Missing element: ${sel}`);
            const setter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              'value'
            )?.set;
            if (setter) setter.call(el, val);
            else el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }""",
        [selector, value],
    )


def run():
    out = {
        "environment": {
            "baseUrl": BASE_URL,
            "timestamp": datetime.now().isoformat(),
            "browser": "Chromium (Playwright)",
        },
        "features": [],
        "issues": [],
    }

    project_name = f"QA Project {now_tag()}"
    member_email = f"qa.member.{now_tag()}@forge.dev"
    member_name = "QA Member"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            # 1) Login
            page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
            react_fill(page, 'input[placeholder="operator@domain.com"]', ADMIN_EMAIL)
            react_fill(page, 'input[placeholder="••••••••"]', ADMIN_PASSWORD)
            page.click('button:has-text("AUTHENTICATE")')
            page.wait_for_url("**/dashboard", timeout=15000)
            out["features"].append({
                "feature": "Login",
                "status": "WORKING",
                "evidence": f"Reached {page.url}",
            })

            # Create second user via admin API for add-member validation
            register_res = page.request.post(
                f"{BASE_URL}/api/auth/register",
                data={
                    "name": member_name,
                    "email": member_email,
                    "password": "Member1234!",
                    "role": "MEMBER",
                },
            )
            if not register_res.ok:
                out["issues"].append({
                    "issue": "Failed to create secondary member for Add Member test",
                    "observed": f"/api/auth/register returned {register_res.status}",
                    "expected": "201 Created",
                })

            # 2) Create project
            page.goto(f"{BASE_URL}/dashboard/projects", wait_until="domcontentloaded")
            page.click('button:has-text("+ NEW PROJECT")')
            page.wait_for_selector('text="[ CREATE PROJECT ]"', timeout=8000)
            page.fill('input[placeholder="e.g. Auth System Rebuild"]', project_name)
            page.fill('textarea[placeholder="Optional project description..."]', "QA automation project")
            deadline = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
            page.fill('input[type="date"]', deadline)
            page.click('button:has-text("CREATE PROJECT")')
            page.wait_for_selector("text=[ PROJECT CREATED ]", timeout=12000)
            page.wait_for_selector(f"text={project_name}", timeout=12000)
            out["features"].append({
                "feature": "Create Project",
                "status": "WORKING",
                "evidence": f"Toast seen and project row visible: {project_name}",
            })

            # 3) Open project detail
            page.click(f'text="{project_name}"')
            page.wait_for_url("**/dashboard/projects/**", timeout=12000)
            page.wait_for_selector('button:has-text("⊕ ADD MEMBER")', timeout=8000)
            out["features"].append({
                "feature": "Project Detail / Tasks View",
                "status": "WORKING",
                "evidence": f"Opened detail page: {page.url}",
            })

            # 4) Add member
            page.click('button:has-text("⊕ ADD MEMBER")')
            page.wait_for_selector('text="[ ADD MEMBERS ]"', timeout=8000)
            page.fill('input[placeholder="SEARCH MEMBERS..."]', "QA Member")
            page.wait_for_timeout(600)
            options = page.locator('button:has-text("QA Member")')
            option_count = options.count()
            if option_count > 0:
                options.first.click()
                page.click('button:has-text("ADD TO PROJECT")')
                page.wait_for_selector("text=[ MEMBERS ADDED ]", timeout=12000)
                out["features"].append({
                    "feature": "Add Member to Project",
                    "status": "WORKING",
                    "evidence": "Member selected and [ MEMBERS ADDED ] toast displayed",
                })
            else:
                out["features"].append({
                    "feature": "Add Member to Project",
                    "status": "PARTIALLY WORKING",
                    "evidence": "Add-member modal opened, but no selectable member row matched QA Member",
                })
                out["issues"].append({
                    "issue": "No selectable member in Add Member modal",
                    "observed": "Search field showed no clickable QA Member option",
                    "expected": "Newly created member should be selectable and addable",
                })

            # 5) Thread/Chat
            page.click('button:has-text("Updates")')
            page.wait_for_selector('text="[ PROJECT WALL ]"', timeout=8000)
            msg = f"QA chat ping {now_tag()}"
            page.fill('textarea[placeholder*="Write a message"]', msg)
            page.keyboard.press("Enter")
            page.wait_for_timeout(1400)
            if page.locator(f"text={msg}").count() > 0:
                out["features"].append({
                    "feature": "Thread / Chat",
                    "status": "WORKING",
                    "evidence": "Message posted and visible in thread",
                })
            else:
                out["features"].append({
                    "feature": "Thread / Chat",
                    "status": "BROKEN",
                    "evidence": "Message was sent but did not appear in thread within wait window",
                })
                out["issues"].append({
                    "issue": "Thread message not visible after send",
                    "observed": "Input accepted Enter submit, message not rendered",
                    "expected": "New message should appear in thread list",
                })

            # 6) Standup (if reachable)
            page.goto(f"{BASE_URL}/dashboard/standup", wait_until="domcontentloaded")
            if page.locator("text=YOUR UPDATE").count() > 0 or page.locator("text=Submit").count() > 0:
                out["features"].append({
                    "feature": "Standup Page Reachability",
                    "status": "WORKING",
                    "evidence": f"Standup page loaded at {page.url}",
                })
            else:
                out["features"].append({
                    "feature": "Standup Page Reachability",
                    "status": "PARTIALLY WORKING",
                    "evidence": "Standup route opened but expected section labels were not clearly detected",
                })

        except Exception as e:
            out["issues"].append({
                "issue": "Automation runtime error",
                "observed": str(e),
                "expected": "All checks should run without exceptions",
            })
        finally:
            # Collect browser console errors
            browser.close()

    print(json.dumps(out, indent=2))


if __name__ == "__main__":
    run()
