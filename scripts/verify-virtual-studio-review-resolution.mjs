import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

const origin = new URL(process.env.STUDIO_QA_BASE_URL ?? "");
assert(["localhost", "127.0.0.1"].includes(origin.hostname) && !origin.username && !origin.password);
assert(origin.pathname === "/" && !origin.search && !origin.hash);
const run = promisify(execFile), expectedCwd = await fs.realpath(process.cwd());
const { stdout } = await run("lsof", ["-nP", `-iTCP:${origin.port}`, "-sTCP:LISTEN", "-t"]);
let owned = false;
for (const pid of new Set(stdout.trim().split(/\s+/u))) {
  const owner = await run("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
  const cwd = owner.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1);
  if (cwd && await fs.realpath(cwd) === expectedCwd) owned = true;
}
assert(owned, "Resolution QA server must belong to this worktree");
const output = path.resolve(".qa/virtual-studio-review-resolution"), fixturePath = "/tools/browser-harnesses/virtual-studio-review-resolution.html";
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "ko-KR" });
const page = await context.newPage(), errors = [], cases = [], writes = [], held = [];
let fixture, mode = "normal", reads = 0, images = [];
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const request = route.request(), url = new URL(request.url());
  if (url.hostname === "review-resolution-fixture.invalid") {
    assert.equal(request.headers().referer, undefined);
    return route.fulfill({ contentType: "image/png", body: images[url.pathname === "/new.png" ? 1 : 0] });
  }
  if (url.origin !== origin.origin) return route.abort();
  // Follow the real identity-only return href, substituting only the page shell. This
  // intentionally exercises the actual parser/panel, not the complete editor router.
  if (request.isNavigationRequest() && url.pathname.startsWith("/studio/")) {
    const response = await route.fetch({ url: `${origin.origin}${fixturePath}${url.search}` });
    return route.fulfill({ response, body: (await response.text()).replace('./virtual-studio-review-resolution.tsx', '/tools/browser-harnesses/virtual-studio-review-resolution.tsx') });
  }
  if (!url.pathname.startsWith("/api/")) return route.continue();
  assert(fixture);
  if (request.method() !== "GET") {
    assert.equal(request.method(), "POST"); assert(url.pathname.endsWith("/review-comments/comment/resolve"), "No comment creation, capture or approval is permitted");
    const body = request.postDataJSON(); writes.push(body);
    assert.deepEqual(body, { resolutionRevisionId: "submission-new", status: "resolved", resolutionSourceRef: fixture.request.replacement });
    if (mode === "invalid-source") return route.fulfill({ status: 422, json: { causeCode: "review_resolution_source_mismatch" } });
    if (mode === "held-write") await new Promise((done) => held.push(done));
    if (mode !== "lost-before-save") {
      Object.assign(fixture.origin.review.comments[0], { status: "resolved", resolutionRevisionId: "submission-new", resolvedBy: "actor" });
      fixture.origin.review.openRequiredCommentCount = 0;
    }
    if (mode.startsWith("lost")) return route.abort("failed");
    return route.fulfill({ json: { id: "comment", status: "resolved", resolutionRevisionId: "submission-new", resolvedBy: "actor", updatedAt: "2026-09-20T01:00:00.000Z" } });
  }
  reads++;
  if (mode === "revoked") return route.fulfill({ status: 403, json: { message: "Fixture access revoked" } });
  if (mode === "held" && /\/reviews\/review(?:-new)?$/u.test(url.pathname)) await new Promise((done) => held.push(done));
  if (url.pathname.endsWith("/works/work/team")) return route.fulfill({ json: fixture.team });
  if (url.pathname.endsWith("/projects/graph")) return route.fulfill({ json: fixture.origin.project });
  if (url.pathname.endsWith("/reviews/review")) return route.fulfill({ json: fixture.origin.review });
  if (url.pathname.endsWith("/reviews/review-new")) return route.fulfill({ json: fixture.replacement.review });
  if (url.pathname.endsWith("/artifacts/artifact/revisions")) return route.fulfill({ json: mode === "missing-parent" ? fixture.revisions.filter((item) => item.id !== "submission-new") : fixture.revisions });
  if (url.pathname.endsWith("/previews")) {
    const newer = url.pathname.includes("/review-new/"), subject = newer ? fixture.request.replacement : fixture.request.origin.subject;
    for (const key of ["workId", "projectId", "artifactId", "revisionId", "rootGraphHash"]) assert.equal(url.searchParams.get(key), subject[key]);
    return route.fulfill({ json: { ok: true, subject, nextCursor: null, previews: [{ ordinal: 0, sha256: (newer ? "d" : "c").repeat(64),
      mediaType: "image/png", byteLength: images[newer ? 1 : 0].length, url: `https://review-resolution-fixture.invalid/${newer ? "new" : "old"}.png`, expiresAt: Date.now() + 25_000,
      mapping: { status: "mapped", version: 1, sourceServerRevision: newer ? 5 : 4, sourceContentDigest: subject.rootGraphHash,
        page: { ordinal: 0, id: "page-one", width: 600, height: 360, renderWidth: 600, renderHeight: 360, frames: [], elements: [] } } }] } });
  }
  throw new Error(`Unexpected API path ${url.pathname}`);
});
const region = () => page.getByRole("region", { name: "수정 검수본으로 의견 해결", exact: true });
const confirm = () => region().getByRole("checkbox", { name: "두 검수본을 비교했고 이 의견의 수정 결과를 확인했어요.", exact: true });
const resolve = () => region().getByRole("button", { name: "이 수정본으로 해결 기록", exact: true });
const complete = () => region().getByText(/이 의견은 새 검수본의 저장 버전으로 해결 기록이 확인/u).waitFor();
const release = () => { mode = "normal"; held.splice(0).forEach((done) => done()); };
async function waitHeld() {
  for (let attempt = 0; !held.length && attempt < 150; attempt++) await new Promise((done) => setTimeout(done, 20));
  assert(held.length > 0, "Expected a controlled delayed authority response");
}
async function load(width = 1280) {
  release(); reads = 0; writes.length = 0;
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.goto(`${origin.origin}${fixturePath}`);
  const link = page.getByRole("link", { name: "원래 의견에서 수정본 확인", exact: true }); await link.waitFor();
  fixture = JSON.parse(await page.locator("#fixture-data").textContent());
  images = (await page.evaluate(() => [false, true].map((corrected) => {
    const canvas = document.createElement("canvas"); canvas.width = 600; canvas.height = 360;
    const c = canvas.getContext("2d"); c.fillStyle = "#fff8ea"; c.fillRect(0, 0, 600, 360);
    c.strokeStyle = "#263b47"; c.lineWidth = 5; c.strokeRect(18, 18, 564, 324);
    c.font = "24px sans-serif"; c.fillStyle = "#263b47"; c.fillText(corrected ? "Saved correction · v5" : "Original note · v4", 42, 64);
    c.beginPath(); c.arc(210, 155, 36, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(210, 190); c.lineTo(210, 290);
    c.moveTo(210, 220); c.lineTo(corrected ? 350 : 90, corrected ? 175 : 265); c.stroke();
    c.fillStyle = corrected ? "#0a8c73" : "#b65944"; c.font = "21px sans-serif"; c.fillText(corrected ? "Hand points to dialogue →" : "Hand points away", 285, 285);
    return canvas.toDataURL("image/png").split(",")[1];
  }))).map((base64) => Buffer.from(base64, "base64"));
  assert.equal(reads, 0); assert.equal(writes.length, 0);
  const href = new URL(await link.getAttribute("href"), origin);
  assert.equal(href.searchParams.get("reviewComment"), "comment"); assert.equal(href.searchParams.get("correctedReview"), "review-new");
  await link.focus(); await page.keyboard.press("Enter"); await region().waitFor(); assert.equal(writes.length, 0);
}
async function compare() {
  const button = region().getByRole("button", { name: "수정 검수본 확인", exact: true }); await button.focus(); await page.keyboard.press("Enter");
  await confirm().waitFor();
  await region().getByRole("img", { name: "비교 검수본 페이지", exact: true }).scrollIntoViewIfNeeded();
  await page.waitForFunction(() => [...document.images].filter((img) => /검수본 페이지/u.test(img.alt)).length === 2
    && [...document.images].filter((img) => /검수본 페이지/u.test(img.alt)).every((img) => img.complete && img.naturalWidth === 600));
  assert(await resolve().isDisabled()); assert.equal(writes.length, 0);
}
try {
  for (const width of [1280, 390]) {
    await load(width); await compare();
    await region().getByRole("button", { name: "겹쳐 보기", exact: true }).click();
    const opacity = region().getByRole("slider", { name: /비교본 불투명도/u }); await opacity.focus(); await page.keyboard.press("ArrowRight"); assert.equal(await opacity.inputValue(), "55");
    await region().getByRole("button", { name: "나란히 보기", exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await region().screenshot({ path: path.join(output, `comparison-${width}.png`) });
    await confirm().focus(); await page.keyboard.press("Space"); await resolve().focus();
    assert((await resolve().boundingBox()).height >= 44); await page.keyboard.press("Enter"); await complete();
    assert.equal(writes.length, 1); assert.equal(fixture.origin.project.artifacts[0].approvedRevisionId, null);
    const approval = new URL(await region().getByRole("link", { name: "새 검수본에서 검토·승인", exact: true }).getAttribute("href"), origin);
    assert.equal(approval.searchParams.get("sharedReview"), "review-new");
    cases.push({ name: "capture-return-actual-two-previews-overlay-explicit-resolution", width, writes: 1 });
  }
  await load(); await compare(); await confirm().check(); mode = "lost-after-save"; await resolve().click(); await complete(); assert.equal(writes.length, 1);
  cases.push({ name: "lost-response-confirms-recorded-resolution-with-one-POST", writes: 1 });
  await load(); await compare(); await confirm().check(); mode = "lost-before-save"; await resolve().click();
  const recheck = region().getByRole("button", { name: "해결 기록 다시 확인", exact: true }); await recheck.waitFor();
  mode = "normal"; await recheck.click(); await recheck.waitFor(); assert.equal(writes.length, 1); assert.equal(await resolve().count(), 0);
  cases.push({ name: "uncertain-POST-explicit-recheck-is-read-only", writes: 1 });
  await load(); await compare(); await confirm().check(); mode = "invalid-source"; await resolve().click();
  await region().getByText(/후속 저장본으로 확인할 수 없어/u).waitFor(); assert.equal(writes.length, 1); assert.equal(await confirm().count(), 0);
  cases.push({ name: "invalid-source-422-never-retries-with-legacy-body", writes: 1 });
  await load(); await compare(); await confirm().check(); mode = "revoked"; await resolve().click();
  await region().getByText(/편집할 권한을 확인하지 못했어요/u).waitFor(); assert.equal(writes.length, 0); assert.equal(await region().getByRole("img").count(), 0);
  cases.push({ name: "fresh-access-revoked-before-save-zero-POST", writes: 0 });
  await load(); mode = "missing-parent"; await region().getByRole("button", { name: "수정 검수본 확인", exact: true }).click();
  await region().getByText(/후속 저장본으로 확인할 수 없어/u).waitFor(); assert.equal(writes.length, 0);
  cases.push({ name: "missing-submission-parent-zero-POST", writes: 0 });
  await load(); await compare(); await confirm().check(); mode = "held"; await resolve().click(); await waitHeld();
  await page.getByRole("button", { name: "예시 계정 전환", exact: true }).click(); release();
  await region().getByRole("button", { name: "수정 검수본 확인", exact: true }).waitFor(); assert.equal(writes.length, 0); assert.equal(await confirm().count(), 0);
  cases.push({ name: "actor-change-fences-delayed-authority", writes: 0 });
  await load(); await compare(); await confirm().check(); mode = "held-write"; await resolve().click(); await waitHeld();
  await page.getByRole("button", { name: "예시 계정 전환", exact: true }).click(); release();
  await region().getByRole("button", { name: "수정 검수본 확인", exact: true }).waitFor(); assert.equal(writes.length, 1);
  assert.equal(await region().getByText(/해결 기록이 확인됐어요/u).count(), 0);
  cases.push({ name: "actor-change-hides-delayed-write-result", writes: 1 });
  await load(); await compare(); await confirm().check(); mode = "held"; await resolve().click(); await waitHeld();
  await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange")); });
  release(); await region().waitFor({ state: "detached" }); assert.equal(writes.length, 0);
  cases.push({ name: "hidden-clears-comparison-and-fences-delayed-save-check", writes: 0 });
  await page.clock.install(); await load(); await compare(); await confirm().check();
  const pages = region().getByRole("combobox", { name: /비교 검수본 페이지/u }); await pages.focus(); mode = "held";
  await page.clock.runFor(10_250); await waitHeld();
  assert(await pages.evaluate((element) => document.activeElement === element)); assert(await pages.isEnabled()); assert(await confirm().isChecked());
  await page.clock.runFor(5_000); assert.equal(await confirm().count(), 0); assert.equal(await region().getByRole("img").count(), 0);
  release(); await page.clock.runFor(250); assert.equal(await confirm().count(), 0); assert.equal(writes.length, 0);
  cases.push({ name: "renewal-keeps-focus-confirmation-until-expiry-late-read-cannot-restore-selection", writes: 0 });
  assert.deepEqual(errors, []);
  const report = { passed: true, scope: "development-only synthetic completion, source/review/team HTTP records and PNG pixels; actual capture completion dialog, identity-only link, location parser, Panel, two-preview comparison, controller and HTTP clients. Not actual capture, production authentication, database attestation or full router E2E",
    origin: origin.origin, expectedCwd, cases, pageErrors: errors };
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) {
  await fs.writeFile(path.join(output, "failure.json"), JSON.stringify({ reads, mode, errors, cases, body: await page.locator("body").innerText() }, null, 2));
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); throw error;
} finally { release(); await browser.close(); }
