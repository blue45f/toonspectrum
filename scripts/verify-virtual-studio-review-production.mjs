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
assert(owned, "Production connection QA server must belong to this worktree");
const output = path.resolve(".qa/virtual-studio-review-production");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ko-KR" });
const page = await context.newPage(), errors = [], cases = [], writes = [];
let fixture, workspace, mode = "normal", reads = 0, release = null;
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== origin.origin) return route.abort();
  if (!url.pathname.startsWith("/api/")) return route.continue();
  assert(fixture, "No authority read should occur before explicit expansion");
  if (request.method() !== "GET") {
    assert.equal(request.method(), "PUT", "No comment/role/handoff creation is permitted");
    assert(url.pathname.endsWith("/works/work/production"));
    const input = request.postDataJSON(); writes.push(input);
    if (mode === "conflict") return route.fulfill({ status: 409, json: { currentRevision: workspace.revision + 1 } });
    if (mode === "revoked") return route.fulfill({ status: 403, json: { message: "Fixture revoked" } });
    assert.equal(input.baseRevision, workspace.revision);
    assert.deepEqual(input.document.tasks[1], workspace.document.tasks[1]);
    assert.deepEqual(input.document.handoffs, workspace.document.handoffs);
    if (mode !== "lost-before-save") workspace = { ...workspace, revision: workspace.revision + 1,
      document: { ...input.document, revision: workspace.revision + 1 } };
    if (mode.startsWith("lost")) return route.abort("failed");
    return route.fulfill({ json: workspace });
  }
  reads++;
  if (mode === "revoked") return route.fulfill({ status: 403, json: { message: "Fixture revoked" } });
  if (mode === "held" && url.pathname.endsWith("/reviews/review")) await new Promise((resolve) => { release = resolve; });
  if (url.pathname.endsWith("/works/work/production")) return route.fulfill({ json: workspace });
  if (url.pathname.endsWith("/works/work/team")) return route.fulfill({ json: fixture.authority.team });
  if (url.pathname.endsWith("/projects/graph")) return route.fulfill({ json: fixture.verified.project });
  if (url.pathname.endsWith("/reviews/review")) return route.fulfill({ json: fixture.verified.review });
  if (url.pathname.endsWith("/artifacts/artifact/revisions")) return route.fulfill({ json: [fixture.verified.revision] });
  throw new Error(`Unexpected API path ${url.pathname}`);
});
async function load(width = 1280) {
  mode = "normal"; reads = 0; writes.length = 0; release = null;
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.goto(`${origin.origin}/tools/browser-harnesses/virtual-studio-review-production.html`);
  await page.getByRole("button", { name: "제작 작업에 연결", exact: true }).waitFor();
  fixture = JSON.parse(await page.locator("#fixture-data").textContent());
  workspace = fixture.authority.workspace;
  // Run the fixture through the same normalization that the authenticated GET parser uses.
  const client = await page.evaluate(async () => {
    const { studioProductionServerClientTestHelpers } = await import("/src/domains/creator/studio-production/studio-production-server-client.ts");
    const data = JSON.parse(document.querySelector("#fixture-data").textContent);
    return studioProductionServerClientTestHelpers.parseServerWorkspace(data.authority.workspace, "work");
  });
  workspace = client;
  assert.equal(reads, 0); assert.equal(writes.length, 0);
}
async function choose() {
  const open = page.getByRole("button", { name: "제작 작업에 연결", exact: true }); await open.focus(); await page.keyboard.press("Enter");
  const trigger = page.getByRole("button", { name: "연결 선택 닫기", exact: true });
  assert.equal(await trigger.getAttribute("aria-expanded"), "true");
  assert(await trigger.evaluate((element) => document.activeElement === element), "Expansion must preserve keyboard focus");
  await page.getByLabel("기존 제작 작업", { exact: true }).waitFor();
  await page.keyboard.press("Tab");
  assert(await page.getByLabel("기존 제작 작업", { exact: true }).evaluate((element) => document.activeElement === element));
  await page.getByLabel("기존 제작 작업", { exact: true }).selectOption("task");
  await page.getByLabel("기존 인계서 · 완료 조건", { exact: true }).selectOption("handoff");
  await page.getByRole("combobox", { name: "제작 역할 · 선화 작가", exact: true }).selectOption("role-editor");
  await page.getByText("손가락이 대사 방향을 가리킴", { exact: true }).waitFor();
}
const connect = () => page.getByRole("button", { name: "선택한 작업에 연결", exact: true });
const complete = () => page.getByText("제작 작업에 연결했어요. 의견과 원래 검수본은 그대로 보존됩니다.", { exact: true }).waitFor();
try {
  for (const width of [1280, 390]) {
    await load(width); await choose(); assert.equal(writes.length, 0);
    const bounds = await connect().boundingBox(); assert(bounds.height >= 44);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(output, `choices-${width}.png`), fullPage: true });
    await connect().focus(); await page.keyboard.press("Enter"); await complete();
    assert.equal(writes.length, 1); assert.deepEqual(writes[0].document.tasks[0].reviewRef, { ...fixture.request, handoffId: "handoff" });
    assert.deepEqual(writes[0].document.tasks[0].assigneeIds, ["role-editor"]);
    cases.push({ name: "existing-task-handoff-explicit-role-keyboard", width, writes: 1 });
  }
  await load(); await choose(); await page.getByRole("button", { name: "닫기", exact: true }).click();
  assert(await page.getByRole("button", { name: "제작 작업에 연결", exact: true }).evaluate((element) => document.activeElement === element));
  cases.push({ name: "close-restores-trigger-keyboard-focus", writes: 0 });
  await load(); workspace.document.tasks[0].reviewRef = { ...fixture.request, commentId: "previous-comment", handoffId: null };
  await choose(); assert(await connect().isDisabled()); await page.getByText(/previous-comment/u).waitFor();
  await page.getByRole("checkbox", { name: "이전 연결을 이 의견으로 교체", exact: true }).check(); await connect().click(); await complete();
  cases.push({ name: "explicit-existing-link-replacement", writes: writes.length });
  await load(); await choose(); mode = "lost-after-save"; await connect().click(); await complete(); assert.equal(writes.length, 1);
  cases.push({ name: "lost-response-read-confirms-without-second-PUT", writes: 1 });
  await load(); await choose(); mode = "lost-before-save"; await connect().click();
  const retry = page.getByRole("button", { name: "같은 연결 다시 확인", exact: true }); await retry.waitFor(); assert.equal(writes.length, 1);
  mode = "normal"; await retry.click(); await complete(); assert.equal(writes.length, 2); assert.deepEqual(writes[0], writes[1]);
  cases.push({ name: "uncertain-same-draft-explicit-retry", writes: 2 });
  await load(); await choose(); mode = "conflict"; await connect().click();
  await page.getByText(/최신 작업을 다시 읽고 선택을 확인/u).waitFor(); assert(await connect().isDisabled()); assert.equal(writes.length, 1);
  mode = "normal"; await page.getByRole("button", { name: "최신 작업 다시 읽기", exact: true }).click();
  await page.getByRole("combobox", { name: "제작 역할 · 선화 작가", exact: true }).waitFor(); assert.equal(writes.length, 1);
  cases.push({ name: "CAS-conflict-requires-read-and-confirmation", writes: 1 });
  await load(); await choose(); mode = "revoked"; await connect().click();
  await page.getByRole("status").filter({ hasText: /권한|확인하지 못했어요/u }).waitFor(); assert.equal(writes.length, 0);
  cases.push({ name: "revoked-before-commit-zero-writes", writes: 0 });
  await load(); await choose(); mode = "held"; await connect().click();
  for (let attempt = 0; !release && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert(release); await page.getByRole("button", { name: "예시 계정 전환", exact: true }).click(); mode = "normal"; release();
  await page.getByRole("status").filter({ hasText: /권한|계정/u }).waitFor(); assert.equal(writes.length, 0);
  assert.equal(await page.getByLabel("기존 제작 작업", { exact: true }).count(), 0);
  cases.push({ name: "late-authority-after-actor-change-zero-writes", writes: 0 });
  assert.deepEqual(errors, []);
  const report = { passed: true, scope: "development-only synthetic saved review/team/production records; actual form, hook, controller, authenticated HTTP clients and response parsers; not production auth/storage or full editor E2E",
    origin: origin.origin, expectedCwd, cases, pageErrors: errors };
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) {
  await fs.writeFile(path.join(output, "failure.json"), JSON.stringify({ reads, mode, errors, body: await page.locator("body").innerText() }, null, 2));
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true });
  throw error;
} finally { await browser.close(); }
