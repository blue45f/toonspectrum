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
assert(owned, "Handoff QA server must belong to this worktree");
const output = path.resolve(".qa/virtual-studio-review-editor-handoff");
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "ko-KR" });
const page = await context.newPage(), errors = [], mutations = [], cases = [];
let fixture = null, revoked = false, reads = 0, deferredRead = null, held = false;
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const request = route.request(), url = new URL(request.url());
  if (!url.pathname.includes("/studio-project-graph/") && !url.pathname.endsWith("/works/work/team/document")) {
    if (url.origin !== origin.origin) return route.abort();
    return route.continue();
  }
  reads++;
  if (request.method() !== "GET") { mutations.push({ method: request.method(), path: url.pathname }); return route.fulfill({ status: 405 }); }
  if (revoked) return route.fulfill({ status: 403, json: { message: "Fixture access revoked" } });
  if (held && url.pathname.endsWith("/reviews/review")) await new Promise((resolve) => { deferredRead = resolve; });
  assert(fixture);
  const { subject } = fixture.request, at = "2026-09-20T00:00:00.000Z";
  if (url.pathname.endsWith("/works/work/team/document")) {
    const saved = { ...fixture.saved };
    delete saved.access;
    return route.fulfill({ json: saved });
  }
  const artifact = { id: subject.artifactId, projectId: subject.projectId, kind: "canvas-2d", title: "Review source",
    scope: { projectId: subject.projectId }, headRevisionId: "different-latest-head", approvedRevisionId: null,
    ownerWorkspaceId: "workspace", createdAt: at, updatedAt: at };
  if (url.pathname.endsWith("/projects/graph")) return route.fulfill({ json: {
    id: subject.projectId, workId: subject.workId, schemaVersion: 3, authorityVersion: "project-graph-v3", ownerUserId: "actor",
    createdAt: at, updatedAt: at, access: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false, owner: true, role: "owner" }, artifacts: [artifact],
  } });
  if (url.pathname.endsWith("/reviews/review")) return route.fulfill({ json: {
    id: subject.reviewId, artifactId: subject.artifactId, revisionId: subject.revisionId, requestedBy: "actor", reviewerIds: ["actor"],
    title: "Pinned review", status: "open", decidedAt: null, decidedBy: null, createdAt: at, updatedAt: at, openRequiredCommentCount: 1,
    comments: [{ id: fixture.request.commentId, reviewId: subject.reviewId, authorUserId: "actor", body: "Inspect this exact cut", anchor: fixture.authority.anchor,
      severity: "required", status: "open", dueAt: null, resolutionRevisionId: null, resolvedBy: null, createdAt: at, updatedAt: at, assigneeIds: [] }],
  } });
  if (url.pathname.endsWith("/artifacts/artifact/revisions")) return route.fulfill({ json: [{
    id: subject.revisionId, artifactId: subject.artifactId, kind: "review-snapshot", parentIds: [], rootGraphHash: subject.rootGraphHash,
    operationFirst: null, operationLast: null, createdBy: "actor", deviceId: "device", createdAt: at, message: null, compatibilityReportId: null, provenanceManifestId: null, blobRefs: [],
  }] });
  if (url.pathname.endsWith("/reviews/review/previews")) return route.fulfill({ json: { ok: true, subject, nextCursor: null, previews: [{
    ordinal: 1, sha256: "b".repeat(64), mediaType: "image/png", byteLength: 99, url: "https://private-fixture.invalid/never-render-this.png",
    expiresAt: Date.now() + 25_000, mapping: fixture.authority.mapping,
  }] } });
  throw new Error(`Unexpected fixture path ${url.pathname}`);
});
async function load(width = 1280) {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  revoked = false; held = false; reads = 0;
  await page.goto(`${origin.origin}/tools/browser-harnesses/virtual-studio-review-editor-handoff.html`);
  await page.getByRole("button", { name: "의견 위치 선택", exact: true }).waitFor();
  fixture = JSON.parse(await page.locator("#fixture-data").textContent());
  assert.equal(reads, 0, "Arrival must perform zero authority reads");
  assert.equal(await page.locator("#selection-state").textContent(), "null");
}
async function unchanged() {
  assert.equal(await page.locator("#page-state").textContent(), "현재 페이지: p1");
  assert.equal(await page.locator("#selection-state").textContent(), "null");
}
try {
  for (const width of [1280, 390]) {
    await load(width);
    const generation = await page.locator("#document-generation").textContent();
    const select = page.getByRole("button", { name: "의견 위치 선택", exact: true });
    await select.focus(); await page.keyboard.press("Enter");
    await page.getByText("의견에 연결된 컷을 선택했어요.", { exact: true }).waitFor();
    assert.deepEqual(JSON.parse(await page.locator("#selection-state").textContent()), { elementId: "cut-2", master: false, point: null });
    assert.equal(await page.locator("#document-generation").textContent(), generation, "View navigation must preserve real mutation generation");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const bounds = await select.boundingBox(); assert(bounds.height >= 44);
    assert.equal(await page.locator('img[src*="private-fixture.invalid"]').count(), 0);
    await page.screenshot({ path: path.join(output, `selected-${width}.png`), fullPage: true });
    cases.push({ case: "exact-cut-keyboard-selection", width, unchangedDocumentGeneration: true });
  }
  await load(); await page.getByRole("button", { name: "로컬 수정", exact: true }).click();
  await page.getByRole("button", { name: "의견 위치 선택", exact: true }).click();
  await page.getByText(/저장되지 않은 변경이 있어 위치를 선택하지 않았어요/u).waitFor();
  await unchanged(); cases.push({ case: "dirty-runtime-zero-selection", passed: true });
  await load(); revoked = true;
  await page.getByRole("button", { name: "의견 위치 선택", exact: true }).click();
  await page.getByRole("status").filter({ hasText: /권한|다시 확인/u }).waitFor();
  await page.getByRole("button", { name: "의견 위치 선택", exact: true }).waitFor({ state: "visible" });
  await unchanged(); cases.push({ case: "revoked-source-zero-selection", passed: true });
  await load(); await page.getByRole("button", { name: "페이지 이동 거부", exact: true }).click();
  await page.getByRole("button", { name: "의견 위치 선택", exact: true }).click();
  await page.getByText(/페이지를 이동할 수 없어 위치를 선택하지 않았어요/u).waitFor();
  await unchanged(); cases.push({ case: "rejected-page-transport-zero-selection", passed: true });
  await load(); held = true;
  await page.getByRole("button", { name: "의견 위치 선택", exact: true }).click();
  await page.getByRole("button", { name: "확인 중단", exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[role="status"]')?.textContent?.includes("확인하고"));
  for (let attempt = 0; !deferredRead && attempt < 100; attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert(deferredRead);
  await page.getByRole("button", { name: "확인 중단", exact: true }).click();
  deferredRead(); held = false;
  await page.getByText(/위치 확인을 중단했어요/u).waitFor();
  await unchanged(); cases.push({ case: "cancelled-late-authority-zero-selection", passed: true });
  assert.deepEqual(mutations, []); assert.deepEqual(errors, []);
  const report = { passed: true, scope: "development-only synthetic document; actual HandoffMount, mutation authority, save projection, selection adapter and HTTP response parsers; not full Host/Konva E2E or production authentication/storage",
    origin: origin.origin, expectedCwd, cases, writes: mutations.length, pageErrors: errors };
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
