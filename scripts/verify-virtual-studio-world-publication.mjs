import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";
import { canonicalJson } from "@toonspectrum/studio-project-model";

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
assert(owned, "World QA server must belong to this worktree");
const output = path.resolve(".qa/virtual-studio-world-publication"); await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "ko-KR" });
const page = await context.newPage(), cases = [], errors = [], writes = [], held = [], receipts = new Map();
let publication = null, mode = "normal", actor = "world-owner";
const hash = (manifest) => createHash("sha256").update(canonicalJson(manifest)).digest("hex");
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  try {
  const request = route.request(), url = new URL(request.url());
  if (url.origin !== origin.origin) return route.abort();
  if (url.pathname === "/qa-missing-world.png") return route.fulfill({ status: 404, body: "missing fixture" });
  if (!url.pathname.startsWith("/api/")) return route.continue();
  if (url.pathname === "/api/health/ready") return route.fulfill({ json: { ok: true } });
  if (request.method() === "GET") {
    if (mode === "held") await new Promise((done) => held.push(done));
    if (mode === "revoked" || actor !== "world-owner") return route.fulfill({ status: 403, json: { message: "Fixture access denied" } });
    if (url.pathname.endsWith("/creator/works/world-qa/team")) return route.fulfill({ json: { workId: "world-qa", viewer: {
      userId: actor, role: "owner", status: "active", capabilities: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false } }, members: [] } });
    if (url.pathname.endsWith("/studio-project-graph/works/world-qa/world")) return route.fulfill({ json: { publication } });
    throw new Error(`Unexpected GET ${url.pathname}`);
  }
  assert.equal(request.method(), "POST"); assert(url.pathname.endsWith("/works/world-qa/world/publish"));
  const input = request.postDataJSON(), key = request.headers()["idempotency-key"]; assert(key?.length >= 8);
  writes.push({ key, input });
  const replay = receipts.get(key);
  if (replay) { assert.deepEqual(input, replay.input); return route.fulfill({ json: { publication: replay.publication, replayed: true } }); }
  if (input.expectedPublishedRevisionId !== (publication?.revisionId ?? null)) return route.fulfill({ status: 409, json: { code: "studio_world_publication_conflict" } });
  const sequence = (publication?.sequence ?? 0) + 1;
  publication = { contract: "studio-world-publication-v1", workId: "world-qa", projectId: "world-graph", artifactId: "studio-world-world-qa",
    revisionId: `published-${sequence}`, previousPublishedRevisionId: input.expectedPublishedRevisionId, contentHash: hash(input.manifest), sequence,
    publishedBy: actor, publishedAt: new Date().toISOString(), manifest: input.manifest };
  receipts.set(key, { input, publication });
  if (mode === "lost") { mode = "normal"; return route.abort("failed"); }
  return route.fulfill({ json: { publication, replayed: false } });
  } catch (error) { errors.push(error.message); await route.abort(); }
});
const panel = () => page.getByRole("region", { name: "공간 게시", exact: true });
const refresh = () => panel().getByRole("button", { name: "게시 공간 확인·적용", exact: true });
const runtime = () => page.locator('[data-studio-phaser-runtime="true"]');
async function ready() { await page.locator('[data-studio-engine-status="ready"]').waitFor({ timeout: 40_000 }); }
async function active(revision) {
  await page.waitForFunction((wanted) => {
    const state = JSON.parse(document.querySelector("#fixture-state").textContent);
    return state.revision === wanted && state.phase === "ready";
  }, revision);
  await ready();
}
function release() { mode = "normal"; held.splice(0).forEach((done) => done()); }
async function waitHeld() {
  for (let i = 0; !held.length && i < 200; i++) await new Promise((done) => setTimeout(done, 20));
  assert(held.length, "Expected a delayed read");
}
async function load(width = 1280) {
  release(); publication = null; actor = "world-owner"; writes.length = 0; receipts.clear();
  if (page.url().startsWith(origin.origin)) await page.evaluate(() => { localStorage.removeItem("toonspectrum:virtual-studio-world-draft:v1:world-qa"); });
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.goto(`${origin.origin}/tools/browser-harnesses/virtual-studio-world-publication.html?worldEdit=1`);
  await panel().getByRole("button", { name: "초안 게시·적용", exact: true }).waitFor(); await ready();
}
async function editAndPublish(label) {
  const editor = page.locator('[data-studio-world-authoring="true"]'); await editor.getByLabel("Label KO", { exact: true }).fill(label);
  const publish = panel().getByRole("button", { name: "초안 게시·적용", exact: true }); await publish.focus();
  assert((await publish.boundingBox()).height >= 44); await page.keyboard.press("Enter");
}
try {
  for (const width of [1280, 390]) {
    await load(width); const initial = await runtime().elementHandle(); await editAndPublish(`게시 라운지 ${width}`); await active("published-1");
    assert.equal(writes.length, 1); assert.equal(await initial.evaluate((element) => element.isConnected), false);
    assert.equal(new URL(page.url()).searchParams.has("worldEdit"), false);
    await panel().scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, `published-${width}.png`), fullPage: false });
    const first = publication, firstScope = await page.locator("#fixture-state").textContent(), same = await runtime().elementHandle();
    await refresh().click(); await active("published-1"); assert(await same.evaluate((element) => element.isConnected));
    await page.evaluate(() => { window.dispatchEvent(new Event("blur")); }); assert(await same.evaluate((element) => element.isConnected));
    await panel().getByRole("button", { name: "공간 초안 편집", exact: true }).click(); await ready();
    await editAndPublish(`두 번째 공간 ${width}`); await active("published-2");
    await panel().getByRole("button", { name: "이전 공간을 새 버전으로 게시", exact: true }).click(); await active("published-3");
    assert.equal(publication.contentHash, first.contentHash); assert.notEqual(await page.locator("#fixture-state").textContent(), firstScope);
    const preserved = await runtime().elementHandle(), current = publication;
    const broken = { ...publication.manifest, backgroundUrl: "/qa-missing-world.png" };
    publication = { ...publication, revisionId: "published-broken", sequence: 4, manifest: broken, contentHash: hash(broken) };
    await refresh().click(); await panel().getByText(/현재 공간을 유지합니다/u).waitFor();
    assert(await preserved.evaluate((element) => element.isConnected)); assert.equal(JSON.parse(await page.locator("#fixture-state").textContent()).revision, "published-3");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await panel().scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, `world-${width}.png`), fullPage: false });
    publication = current; await refresh().click(); await active("published-3");
    await panel().getByRole("button", { name: "공간 초안 편집", exact: true }).click(); await ready();
    publication = { ...current, revisionId: "concurrent-world", sequence: 4 };
    const count = writes.length; await editAndPublish("충돌 초안"); await panel().getByText(/다른 게시가 먼저/u).waitFor(); assert.equal(writes.length, count);
    cases.push({ name: `publish-renewal-undo-decode-failure-CAS-${width}`, writes: count, exactOldWorldPreserved: true });
  }
  await load(); await editAndPublish("저장 기준 A"); await active("published-1");
  await panel().getByRole("button", { name: "공간 초안 편집", exact: true }).click(); await ready();
  const editor = page.locator('[data-studio-world-authoring="true"]');
  await editor.getByLabel("Label KO", { exact: true }).fill("이전 게시본에서 저장한 초안");
  await editor.getByRole("button", { name: "초안 저장", exact: true }).click();
  const storedDraft = () => page.evaluate(() => JSON.parse(localStorage.getItem("toonspectrum:virtual-studio-world-draft:v1:world-qa")));
  assert.equal((await storedDraft()).basePublishedRevisionId, "published-1");
  publication = { ...publication, revisionId: "published-2", sequence: 2 };
  await page.reload(); await active("published-2");
  assert.equal((await storedDraft()).basePublishedRevisionId, "published-1");
  assert.equal(await panel().getByRole("button", { name: "초안 게시·적용", exact: true }).count(), 0);
  await panel().scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(output, "saved-base-review.png"), fullPage: false });
  const rebase = panel().getByRole("button", { name: "현재 게시본을 기준으로 초안 저장", exact: true });
  await rebase.focus(); await page.keyboard.press("Enter");
  await panel().getByRole("button", { name: "초안 게시·적용", exact: true }).waitFor();
  assert.equal((await storedDraft()).basePublishedRevisionId, "published-2"); assert.equal(writes.length, 1);
  await editAndPublish("명시적 기준 선택 후 게시"); await active("published-3");
  assert.equal(writes.at(-1).input.expectedPublishedRevisionId, "published-2");
  cases.push({ name: "persisted-A-draft-reconnects-to-B-without-silent-rebase", explicitBaseReviewPosts: 0 });
  await page.evaluate((manifest) => { localStorage.setItem("toonspectrum:virtual-studio-world-draft:v1:world-qa", JSON.stringify(manifest)); }, publication.manifest);
  await panel().getByRole("button", { name: "공간 초안 편집", exact: true }).click(); await ready();
  await rebase.waitFor(); assert.equal(await panel().getByRole("button", { name: "초안 게시·적용", exact: true }).count(), 0);
  assert.equal(writes.length, 2); cases.push({ name: "legacy-manifest-only-draft-requires-explicit-base-review" });
  await load(); mode = "lost"; await editAndPublish("응답 유실 초안");
  await panel().getByRole("button", { name: "같은 게시 요청 확인", exact: true }).click(); await active("published-1");
  assert.equal(writes.length, 2); assert.deepEqual(writes[0], writes[1]); assert.equal(receipts.size, 1);
  cases.push({ name: "lost-response-explicit-same-intent-and-bytes", requests: 2, publications: 1 });
  await load(); mode = "held"; await editAndPublish("늦은 응답"); await waitHeld(); actor = "other-actor";
  await page.getByRole("button", { name: "예시 계정 전환", exact: true }).click(); release();
  await panel().getByText(/접근 권한을 확인할 수 없어요/u).waitFor(); assert.equal(writes.length, 0);
  cases.push({ name: "actor-change-fences-late-authority-zero-POST" });
  await load(); await editAndPublish("권한 회수 공간"); await active("published-1"); const revoked = await runtime().elementHandle();
  mode = "revoked"; await refresh().click(); await panel().getByText(/접근 권한을 확인할 수 없어요/u).waitFor();
  assert.equal(JSON.parse(await page.locator("#fixture-state").textContent()).revision, null); assert.equal(await revoked.evaluate((element) => element.isConnected), false);
  cases.push({ name: "fresh-ACL-revocation-removes-published-realm" });
  assert.deepEqual(errors, []);
  const report = { passed: true, scope: "Synthetic actor and current-world/team/publish HTTP; actual product VirtualSpaceExperience, authoring panel, publication controller/parsers, original image decoding and Phaser. Not production login/DB publication or multi-client WAN proof.", origin: origin.origin, expectedCwd, cases, pageErrors: errors };
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) { await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }); console.error(await page.locator("body").innerText()); throw error; }
finally { release(); await browser.close(); }
