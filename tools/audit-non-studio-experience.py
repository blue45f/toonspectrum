"""Read-only production browser inventory. This is not an authenticated E2E pass.
Run: python tools/audit-non-studio-experience.py
Requires playwright==1.58.0 and its Chromium browser.
Studio/editor and administrator workspaces are deliberately not entered.
"""
import asyncio
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "qa-results/non-studio"
BASE = os.environ.get("NON_STUDIO_AUDIT_URL", "https://www.toonstudio.cloud").rstrip("/")


def excluded(path):
    return bool(re.match(r"^/(?:studio|shaper|admin|make|music|brush-lab|creator-hub|publishing|auth)(?:/|$)", path))


def inventory():
    routes = {"/", "/learn", "/learn/glossary", "/learn/records", "/learn/studio"}
    unresolved = set()
    directory = ROOT / "apps/web/src/app/routes/groups"
    for source in directory.glob("*.routes.tsx"):
        text = source.read_text(encoding="utf-8")
        for path in re.findall(r"\bpath:\s*[\"']([^\"']+)[\"']", text):
            if not path.startswith("/") or excluded(path):
                continue
            if ":" in path or "*" in path:
                unresolved.add(path)
            else:
                routes.add(path)
    return sorted(routes), sorted(unresolved)


async def inspect_page(context, route, device):
    page = await context.new_page()
    errors = []
    failures = []
    page.on("pageerror", lambda error: errors.append(str(error)[:1500]))
    page.on("response", lambda response: failures.append({"url": response.url, "status": response.status}) if response.status >= 400 else None)
    result = {"route": route, "device": device, "authenticated": False, "errors": errors, "httpFailures": failures}
    slug = re.sub(r"[^a-zA-Z0-9_-]", "_", route).strip("_") or "home"
    try:
        response = await page.goto(BASE + route, wait_until="domcontentloaded", timeout=45000)
        result["status"] = response.status if response else None
        await page.locator("main").first.wait_for(state="visible", timeout=15000)
        await page.wait_for_timeout(2500)
        if excluded(urlparse(page.url).path):
            result["excludedRedirect"] = page.url
            raise RuntimeError("Redirected to an excluded workspace; no interactions or visual inspection performed")
        result.update(await page.evaluate("""() => {
          const visible = el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
          const name = el => el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || '';
          return {
            finalUrl: location.href, title: document.title,
            headings: [...document.querySelectorAll('h1,h2,h3')].filter(visible).map(el => ({level: el.tagName, text: el.innerText})),
            text: document.body.innerText.slice(0, 22000),
            links: [...document.querySelectorAll('a[href]')].filter(visible).map(el => ({text: name(el).trim(), href: el.getAttribute('href')})),
            buttons: [...document.querySelectorAll('button')].filter(visible).map(el => ({text: name(el).trim(), disabled: el.disabled, expanded: el.getAttribute('aria-expanded')})),
            inputs: [...document.querySelectorAll('input,select,textarea')].filter(visible).map(el => ({type: el.type, placeholder: el.placeholder, name: el.getAttribute('aria-label'), id: el.id})),
            viewportWidth: innerWidth, documentWidth: document.documentElement.scrollWidth,
            overflowElements: [...document.querySelectorAll('main *')].filter(el => {
              const r = el.getBoundingClientRect(); const style = getComputedStyle(el);
              return visible(el) && style.position !== 'fixed' && r.width > 0 && (r.right > innerWidth + 2 || r.left < -2);
            }).slice(0, 15).map(el => ({tag: el.tagName, class: String(el.className).slice(0, 200), text: el.textContent.slice(0, 120)})),
          };
        }"""))
        await page.screenshot(path=str(OUT / f"{device}-{slug}.png"), full_page=True, animations="disabled", timeout=20000)
        # Scroll activates the existing deferred footer and reveals lower-page navigation.
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await page.wait_for_timeout(500)
        result["footerText"] = await page.locator("footer").all_inner_texts()
        result["inspected"] = True
    except Exception as error:
        result["inspectionFailure"] = str(error)[:1500]
        result["inspected"] = False
        try:
            if "excludedRedirect" not in result:
                result["text"] = (await page.locator("body").inner_text())[:22000]
                await page.screenshot(path=str(OUT / f"{device}-{slug}-failure.png"), timeout=10000)
        except Exception:
            pass
    finally:
        await page.close()
    print(json.dumps({"route": route, "device": device, "inspected": result["inspected"], "errors": errors, "status": result.get("status"), "overflow": result.get("documentWidth", 0) > result.get("viewportWidth", 0)}, ensure_ascii=False), flush=True)
    (OUT / f"{device}-{slug}.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    return result


async def main():
    OUT.mkdir(parents=True, exist_ok=True)
    routes, unresolved = inventory()
    report = {"baseUrl": BASE, "scope": "public non-studio route inventory; no forms submitted; no login", "routes": routes, "dynamicRoutesRequiringFixtures": unresolved, "results": []}
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        for device, viewport in [("desktop", {"width": 1440, "height": 1000}), ("mobile", {"width": 390, "height": 844})]:
            context = await browser.new_context(viewport=viewport, locale="ko-KR", reduced_motion="reduce", is_mobile=device == "mobile", has_touch=device == "mobile")
            # Guard against redirects or links entering an excluded editor workspace.
            async def guard(request_route):
                request = request_route.request
                if request.is_navigation_request() and excluded(urlparse(request.url).path):
                    await request_route.abort()
                else:
                    await request_route.continue_()
            await context.route("**/*", guard)
            semaphore = asyncio.Semaphore(3)
            async def bounded_inspection(route):
                async with semaphore:
                    result = await inspect_page(context, route, device)
                    report["results"].append(result)
                    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            await asyncio.gather(*(bounded_inspection(route) for route in routes))
            await context.close()
        await browser.close()
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    total = len(report["results"])
    inspected = sum(row["inspected"] for row in report["results"])
    print(f"Inspected {inspected}/{total} public route/viewports; dynamic and authenticated interactions remain separate.", flush=True)
    if inspected == 0:
        raise SystemExit("No usable page inspections; this run is not evidence of functional success.")


if __name__ == "__main__":
    asyncio.run(main())
