import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

const origin = new URL(process.env.STUDIO_QA_BASE_URL ?? "");
assert(["localhost", "127.0.0.1"].includes(origin.hostname) && !origin.username && !origin.password);
assert(origin.pathname === "/" && !origin.search && !origin.hash);
const run = promisify(execFile);
const { stdout } = await run("lsof", ["-nP", `-iTCP:${origin.port}`, "-sTCP:LISTEN", "-t"]);
const expectedCwd = await fs.realpath(process.cwd());
let owned = false;
for (const pid of new Set(stdout.trim().split(/\s+/u))) {
  const owner = await run("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
  const cwd = owner.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1);
  if (cwd && await fs.realpath(cwd) === expectedCwd) owned = true;
}
assert(owned, "Review QA server must belong to this worktree");
const output = path.resolve(".qa/virtual-studio-runtime-acceptance");
await fs.mkdir(output, { recursive: true });
const date = "2026-09-20T00:00:00.000Z";
const subject = { schemaVersion: 1, projectId: "qa-graph", workId: "qa-work", artifactId: "qa-artifact", reviewId: "qa-review", revisionId: "qa-snapshot", rootGraphHash: "a".repeat(64) };
const revision = { id: subject.revisionId, artifactId: subject.artifactId, kind: "review-snapshot", parentIds: ["qa-submission"], rootGraphHash: subject.rootGraphHash, operationFirst: null, operationLast: null, createdBy: "reviewer", deviceId: "qa-device", createdAt: date, message: "고정된 검수본", compatibilityReportId: null, provenanceManifestId: null, blobRefs: [] };
const saved = { ...revision, id: "qa-resolution", kind: "submission", message: "마지막 컷 수정본" };
const project = { id: subject.projectId, workId: subject.workId, schemaVersion: 3, authorityVersion: "project-graph-v3", ownerUserId: "reviewer", createdAt: date, updatedAt: date,
  access: { view: true, comment: true, edit: true, manageMembers: true, respondInvite: false, owner: true, role: "owner" },
  artifacts: [{ id: subject.artifactId, projectId: subject.projectId, kind: "canvas-2d", title: "1화", scope: { projectId: subject.projectId }, headRevisionId: "different-latest-head", approvedRevisionId: null, ownerWorkspaceId: "qa-workspace", createdAt: date, updatedAt: date }] };
const comment = { id: "qa-note", reviewId: subject.reviewId, authorUserId: "reviewer", body: "마지막 컷의 표정을 더 명확하게 해주세요.", anchor: { kind: "artifact", artifactId: subject.artifactId, revisionId: subject.revisionId, scope: { projectId: subject.projectId } }, severity: "required", status: "open", dueAt: null, resolutionRevisionId: null, resolvedBy: null, createdAt: date, updatedAt: date, assigneeIds: [] };
const review = { id: subject.reviewId, artifactId: subject.artifactId, revisionId: subject.revisionId, requestedBy: "reviewer", reviewerIds: ["reviewer"], title: "1화 · 마지막 장면 검토", status: "open", decidedAt: null, decidedBy: null, createdAt: date, updatedAt: date, openRequiredCommentCount: 1, comments: [comment] };
const mutations = [], errors = [], requests = [];
let revoked = false;
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "ko-KR" });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const request = route.request(), url = new URL(request.url());
  if (url.hostname === "review-fixture.invalid") {
    assert.equal(request.headers().referer, undefined);
    return route.fulfill({ contentType: "image/png", body: await fs.readFile("apps/web/public/assets/virtual-studio/production-v2/player-pink-direction-down.png") });
  }
  if (!url.pathname.includes("/studio-project-graph/")) {
    if (url.origin !== origin.origin) return route.abort();
    return route.continue();
  }
  requests.push({ method: request.method(), path: url.pathname });
  const suffix = url.pathname.split("/studio-project-graph")[1];
  if (revoked) return route.fulfill({ status: 403, json: { message: "fixture ACL revoked" } });
  if (request.method() === "GET") {
    if (suffix === "/projects/qa-graph") return route.fulfill({ json: project });
    if (suffix === "/reviews/qa-review") return route.fulfill({ json: review });
    if (suffix === "/artifacts/qa-artifact/revisions") return route.fulfill({ json: [revision, saved] });
    if (suffix === "/reviews/qa-review/previews") {
      for (const key of ["projectId", "workId", "artifactId", "revisionId", "rootGraphHash"]) assert.equal(url.searchParams.get(key), subject[key]);
      return route.fulfill({ json: { ok: true, subject, nextCursor: null, previews: [{ sha256: "b".repeat(64), ordinal: 0, mediaType: "image/png", byteLength: 1024, url: "https://review-fixture.invalid/page.png", expiresAt: Date.now() + 25_000 }] } });
    }
  }
  const body = request.postDataJSON();
  mutations.push({ path: suffix, body });
  if (suffix === "/review-comments/qa-note/resolve") {
    assert.deepEqual(body, { resolutionRevisionId: saved.id, status: "resolved" });
    Object.assign(comment, { status: "resolved", resolutionRevisionId: saved.id, resolvedBy: "reviewer" });
    review.openRequiredCommentCount = 0;
    return route.fulfill({ json: { id: comment.id, status: comment.status, resolutionRevisionId: saved.id, resolvedBy: "reviewer", updatedAt: date } });
  }
  if (suffix === "/reviews/qa-review/decision") {
    assert.equal(comment.status, "resolved"); assert.equal(body.status, "approved");
    Object.assign(review, { status: "approved", decidedAt: date, decidedBy: "reviewer" });
    return route.fulfill({ json: { id: review.id, status: review.status, decidedAt: date, decidedBy: "reviewer", updatedAt: date } });
  }
  throw new Error(`Unexpected fixture request ${request.method()} ${suffix}`);
});
try {
  await page.goto(`${origin.origin}/tools/browser-harnesses/virtual-studio-review-acceptance.html`);
  await page.getByRole("heading", { name: review.title }).waitFor();
  assert.equal(await page.getByRole("button", { name: "이 검수본 승인", exact: true }).isEnabled(), false);
  assert.equal(mutations.length, 0);
  await page.getByRole("img", { name: "검수 미리보기 1" }).waitFor();
  await page.waitForFunction(() => Array.from(document.images).some((img) => img.complete && img.naturalWidth > 0));
  await page.screenshot({ path: path.join(output, "review-desktop.png"), fullPage: true });
  await page.getByRole("button", { name: "수정한 저장 버전 선택" }).click();
  await page.getByLabel("의견을 해결한 버전").selectOption(saved.id);
  await page.getByRole("button", { name: "선택 버전으로 해결 기록" }).click();
  await page.getByRole("button", { name: "다시 수정 요청", exact: true }).waitFor();
  await page.getByRole("button", { name: "이 검수본 승인", exact: true }).click();
  assert.equal(mutations.length, 1, "Opening confirmation must not approve");
  await page.getByRole("button", { name: "승인 확정" }).click();
  await page.getByRole("heading", { name: "검수 승인됨", exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox").count(), 0);
  assert.equal(mutations.length, 2);
  assert.equal(project.artifacts[0].approvedRevisionId, null);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(output, "review-mobile-approved.png"), fullPage: true });
  revoked = true;
  await page.getByRole("button", { name: "검토 기록 새로 확인" }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("img").count(), 0);
  assert.equal(await page.getByText(comment.body, { exact: true }).count(), 0);
  assert.equal(mutations.length, 2);
  assert.deepEqual(errors, []);
  const report = { passed: true, scope: "real React components and authenticated client parsers with intercepted HTTP fixtures; not production authentication or end-to-end storage", origin: origin.origin, expectedCwd, mutations, requestCount: requests.length, pinnedRevision: subject.revisionId, differentEditableHeadPreserved: true, requiredResolution: true, approvalConfirmation: true, approvedHistoryReadable: true, revokedPrivateContentRemoved: true, mobileWidth: 390, pageErrors: errors };
  await fs.writeFile(path.join(output, "review-report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
