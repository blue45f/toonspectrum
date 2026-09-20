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
assert(owned, "Completion QA server must belong to this worktree");
const output = path.resolve(".qa/virtual-studio-review-task-completion"); await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ko-KR" });
const page = await context.newPage(), errors = [], cases = [], writes = [];
let fixture, completion, workspace, mode = "normal", release = null;
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== origin.origin) return route.abort();
  if (!url.pathname.startsWith("/api/")) return route.continue();
  assert(fixture, "No read before explicit expansion");
  if (mode === "revoked") return route.fulfill({ status: 403, json: { message: "Fixture revoked" } });
  if (request.method() !== "GET") {
    assert.equal(request.method(), "POST"); assert(url.pathname.endsWith("/production-tasks/task/review-completion"));
    const input = request.postDataJSON(); writes.push(input);
    assert.deepEqual(input.confirmedCriteria, completion.context.criteria);
    assert.equal(input.proofDigest, completion.context.proofDigest);
    if (mode === "conflict") return route.fulfill({ status: 409, json: { code: "studio_review_task_completion_conflict" } });
    completion.completed.evidence.receipt.requestId = input.requestId;
    if (mode !== "lost-before") completion.context = completion.completed;
    if (mode.startsWith("lost")) return route.abort("failed");
    return route.fulfill({ json: completion.completed });
  }
  if (url.pathname.endsWith("/production-tasks/task/review-completion")) {
    if (mode === "held") await new Promise((resolve) => { release = resolve; });
    return route.fulfill({ json: completion.context });
  }
  if (url.pathname.endsWith("/works/work/production")) return route.fulfill({ json: workspace });
  if (url.pathname.endsWith("/works/work/team")) return route.fulfill({ json: fixture.authority.team });
  if (url.pathname.endsWith("/projects/graph")) return route.fulfill({ json: fixture.verified.project });
  if (url.pathname.endsWith("/reviews/review")) return route.fulfill({ json: fixture.verified.review });
  if (url.pathname.endsWith("/artifacts/artifact/revisions")) return route.fulfill({ json: [fixture.verified.revision] });
  throw new Error(`Unexpected API path ${url.pathname}`);
});
async function load(width = 1280) {
  mode = "normal"; writes.length = 0; release = null;
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.goto(`${origin.origin}/tools/browser-harnesses/virtual-studio-review-task-completion.html`);
  await page.getByRole("button", { name: "해결된 의견의 작업 완료 검토", exact: true }).waitFor();
  ({ fixture, completion } = JSON.parse(await page.locator("#fixture-data").textContent()));
  workspace = await page.evaluate(async () => {
    const { studioProductionServerClientTestHelpers } = await import("/src/domains/creator/studio-production/studio-production-server-client.ts");
    return studioProductionServerClientTestHelpers.parseServerWorkspace(JSON.parse(document.querySelector("#fixture-data").textContent).fixture.authority.workspace, "work");
  });
}
async function choose() {
  const open = page.getByRole("button", { name: "해결된 의견의 작업 완료 검토", exact: true }); await open.focus(); await page.keyboard.press("Enter");
  assert(await open.evaluate((element) => document.activeElement === element));
  const select = page.getByLabel("이 의견에 연결된 작업", { exact: true }); await select.selectOption("task");
  for (const criterion of completion.context.criteria) await page.getByRole("checkbox", { name: criterion, exact: true }).waitFor();
}
const submit = () => page.getByRole("button", { name: "기준을 확인하고 작업 완료", exact: true });
async function check() { for (const criterion of completion.context.criteria) await page.getByRole("checkbox", { name: criterion, exact: true }).check(); }
const success = () => page.getByText(/검수 근거와 함께 작업 완료가 기록/u).waitFor();
try {
  for (const width of [1280, 390]) {
    await load(width); await choose(); assert(await submit().isDisabled()); await check(); assert.equal(writes.length, 0);
    assert((await submit().boundingBox()).height >= 44);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(output, `criteria-${width}.png`), fullPage: true });
    await submit().focus(); await page.keyboard.press("Enter"); await success(); assert.equal(writes.length, 1);
    await page.screenshot({ path: path.join(output, `completed-${width}.png`), fullPage: true });
    cases.push({ name: "explicit-exact-criteria-keyboard", width, writes: 1 });
  }
  await load(); await choose(); await check(); mode = "lost-after"; await submit().click(); await success(); assert.equal(writes.length, 1);
  cases.push({ name: "lost-response-read-only-reconciliation", writes: 1 });
  await load(); await choose(); await check(); mode = "lost-before"; await submit().click();
  const retry = page.getByRole("button", { name: "같은 완료 요청 다시 확인", exact: true }); await retry.waitFor(); assert.equal(writes.length, 1);
  mode = "normal"; await retry.click(); await success(); assert.equal(writes.length, 2); assert.deepEqual(writes[0], writes[1]);
  cases.push({ name: "explicit-identical-intent-retry", writes: 2 });
  await load(); await choose(); await check(); completion.context = { ...completion.context, proofDigest: "d".repeat(64), criteria: ["변경된 기준"] };
  await submit().click(); await page.getByRole("status").filter({ hasText: /현재 권한/u }).waitFor(); assert.equal(writes.length, 0);
  await page.getByRole("button", { name: "최신 근거 다시 읽기", exact: true }).click();
  assert.equal(await page.getByRole("checkbox", { name: "변경된 기준", exact: true }).isChecked(), false);
  cases.push({ name: "changed-proof-clears-checks-zero-write", writes: 0 });
  await load(); await choose(); await check(); mode = "revoked"; await submit().click();
  await page.getByRole("status").filter({ hasText: /현재 권한/u }).waitFor(); assert.equal(writes.length, 0);
  cases.push({ name: "revoked-before-post-zero-write", writes: 0 });
  await load(); await choose(); await check(); mode = "held"; await submit().click();
  for (let attempt = 0; !release && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert(release); await page.getByRole("button", { name: "예시 계정 전환", exact: true }).click(); mode = "normal"; release();
  await page.getByRole("checkbox").waitFor({ state: "detached" }); assert.equal(writes.length, 0);
  cases.push({ name: "late-actor-read-zero-write", writes: 0 });
  assert.deepEqual(errors, []);
  const report = { passed: true, scope: "Synthetic saved review/workspace/completion HTTP fixtures; actual form, hooks, controllers and parsers. Not a live database, production authentication or full editor E2E.", cases, pageErrors: errors };
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) {
  await fs.writeFile(path.join(output, "failure.json"), JSON.stringify({ mode, writes, errors, body: await page.locator("body").innerText() }, null, 2));
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); throw error;
} finally { await browser.close(); }
