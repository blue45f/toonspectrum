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
const output = path.resolve(".qa/virtual-studio-review-workflow");
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
const priorSubject = { ...subject, reviewId: "qa-prior-review", revisionId: "qa-prior-snapshot", rootGraphHash: "c".repeat(64) };
const priorRevision = { ...revision, id: priorSubject.revisionId, rootGraphHash: priorSubject.rootGraphHash };
const priorReview = { ...review, id: priorSubject.reviewId, revisionId: priorSubject.revisionId, title: "1화 · 이전 검수본", status: "approved", comments: [], openRequiredCommentCount: 0 };
function mapping(pin, ordinal) {
  return { status: "mapped", version: 1, sourceServerRevision: pin === subject ? 8 : 7, sourceContentDigest: pin.rootGraphHash,
    page: { id: `authored-page-${ordinal}`, ordinal, width: 800, height: 1000, renderWidth: 800, renderHeight: 1000,
      frames: [{ id: `cut-${ordinal}-1`, bounds: { x: 80, y: 100, width: 640, height: 300 } },
        { id: `cut-${ordinal}-2`, bounds: { x: 80, y: 500, width: 640, height: 300 } }],
      elements: [{ id: `cut-${ordinal}-1`, type: "frame", origin: "page" }, { id: `cut-${ordinal}-2`, type: "frame", origin: "page" }, { id: `dialogue-${ordinal}`, type: "text", origin: "page" }] } };
}
const mutations = [], errors = [], requests = [], fixtures = new Map();
let revoked = false, editorEligible = true, loseFirstCommentResponse = true;
const team = () => ({ workId: subject.workId, viewer: { userId: "reviewer", role: "owner", status: "active", capabilities: project.access },
  members: [
    { userId: "reviewer", name: "민서 · 감독", image: "", role: "owner", status: "active", isOwner: true },
    { userId: "qa-editor", name: "시나 · 원화", image: "", role: editorEligible ? "editor" : "viewer", status: "active", isOwner: false },
    { userId: "qa-viewer", name: "초대 관람객", image: "", role: "viewer", status: "active", isOwner: false },
    { userId: "qa-pending", name: "미수락 초대", image: "", role: "editor", status: "pending", isOwner: false },
  ] });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "ko-KR", timezoneId: "Asia/Seoul" });
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
await page.route("**/*", async (route) => {
  const request = route.request(), url = new URL(request.url());
  if (url.hostname === "review-fixture.invalid") {
    assert.equal(request.headers().referer, undefined);
    return route.fulfill({ contentType: "image/png", body: fixtures.get(url.pathname) });
  }
  if (url.pathname.endsWith("/creator/works/qa-work/team")) {
    requests.push({ method: request.method(), path: url.pathname });
    assert.equal(request.method(), "GET");
    return route.fulfill(revoked ? { status: 403, json: { message: "fixture ACL revoked" } } : { json: team() });
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
    if (suffix === "/reviews/qa-prior-review") return route.fulfill({ json: priorReview });
    if (suffix === "/artifacts/qa-artifact/reviews") return route.fulfill({ json: [review, priorReview].map((record) => Object.fromEntries(Object.entries(record).filter(([key]) => key !== "comments"))) });
    if (suffix === "/artifacts/qa-artifact/revisions") return route.fulfill({ json: [revision, priorRevision, saved] });
    if (suffix === "/reviews/qa-review/previews" || suffix === "/reviews/qa-prior-review/previews") {
      const pin = suffix.includes("qa-prior-review") ? priorSubject : subject;
      for (const key of ["projectId", "workId", "artifactId", "revisionId", "rootGraphHash"]) assert.equal(url.searchParams.get(key), pin[key]);
      return route.fulfill({ json: { ok: true, subject: pin, nextCursor: null, previews: [0, 1].map((ordinal) => ({
        sha256: (pin === subject ? "b" : "d").repeat(63) + ordinal, ordinal, mediaType: "image/png",
        byteLength: fixtures.get(`/${pin.reviewId}/${ordinal}.png`).length,
        url: `https://review-fixture.invalid/${pin.reviewId}/${ordinal}.png`, expiresAt: Date.now() + 25_000, mapping: mapping(pin, ordinal),
      })) } });
    }
  }
  const body = request.postDataJSON();
  mutations.push({ path: suffix, body });
  if (suffix === "/reviews/qa-review/comments") {
    assert.equal(body.anchor.revisionId, subject.revisionId);
    assert.deepEqual(body.anchor.scope, { projectId: subject.projectId });
    assert.equal(body.anchor.source.pageId, "authored-page-0");
    assert.equal(body.anchor.source.frameId, "cut-0-2");
    assert.equal(body.anchor.source.sourceContentDigest, subject.rootGraphHash);
    assert.equal(body.anchor.source.sourceServerRevision, 8);
    assert.equal(body.anchor.kind, "panel");
    assert.deepEqual(body.assigneeIds, ["qa-editor", "reviewer"]);
    assert.equal(body.dueAt, "2026-10-21T05:30:00.000Z");
    assert.equal(body.severity, "required");
    const prior = review.comments.find((item) => item.id === body.id);
    if (prior) assert.deepEqual(mutations.at(-1).body, mutations[0].body, "An explicit retry must reuse the same semantic request");
    const created = prior ?? { ...comment, ...body, reviewId: review.id };
    if (!prior) { review.comments.push(created); review.openRequiredCommentCount++; }
    if (loseFirstCommentResponse) { loseFirstCommentResponse = false; return route.abort("connectionreset"); }
    return route.fulfill({ json: { id: created.id, reviewId: created.reviewId, status: created.status, anchor: created.anchor, createdAt: created.createdAt } });
  }
  throw new Error(`Unexpected fixture request ${request.method()} ${suffix}`);
});
try {
  for (const pin of [subject, priorSubject]) for (const ordinal of [0, 1]) {
    const encoded = await page.evaluate(({ ordinal, current }) => {
      const canvas = document.createElement("canvas"); canvas.width = 800; canvas.height = 1000;
      const ctx = canvas.getContext("2d"); ctx.fillStyle = "#fffdfa"; ctx.fillRect(0, 0, 800, 1000);
      ctx.fillStyle = "#1e293b"; ctx.font = "bold 32px sans-serif"; ctx.fillText(`QA snapshot · Page ${ordinal + 1}`, 80, 65);
      for (const y of [100, 500]) { ctx.fillStyle = "#cbd5e1"; ctx.fillRect(80, y, 640, 300); ctx.strokeStyle = "#334155"; ctx.lineWidth = 4; ctx.strokeRect(80, y, 640, 300); }
      ctx.fillStyle = current ? "#eab308" : "#fb7185"; ctx.beginPath(); ctx.arc(current ? 500 : 400, 650, 65, 0, Math.PI * 2); ctx.fill();
      return canvas.toDataURL("image/png").split(",")[1];
    }, { ordinal, current: pin === subject });
    fixtures.set(`/${pin.reviewId}/${ordinal}.png`, Buffer.from(encoded, "base64"));
  }
  await page.goto(`${origin.origin}/tools/browser-harnesses/virtual-studio-review-acceptance.html`);
  await page.getByRole("heading", { name: review.title }).waitFor();
  await page.getByRole("img", { name: "검수 미리보기 1" }).waitFor();
  assert.equal(mutations.length, 0);
  assert.equal(requests.some((request) => request.path.endsWith("/qa-prior-review/previews")), false);
  await page.getByRole("button", { name: "이전 검수본과 비교" }).click();
  await page.getByRole("combobox", { name: "비교할 검수본" }).selectOption(priorReview.id);
  const comparison = page.getByRole("region", { name: "검수 버전 비교" });
  await comparison.getByRole("img", { name: "비교 검수본 페이지" }).waitFor();
  assert.equal(mutations.length, 0);
  await comparison.getByRole("button", { name: "겹쳐 보기", exact: true }).click();
  const slider = comparison.getByRole("slider", { name: /비교본 불투명도/u });
  await slider.fill("70");
  assert.equal(await comparison.getByRole("img", { name: "비교 검수본 페이지" }).evaluate((image) => image.closest("div").style.opacity), "0.7");
  await page.screenshot({ path: path.join(output, "comparison-desktop.png"), fullPage: true });
  await comparison.getByRole("combobox", { name: "비교 검수본 페이지" }).selectOption("1");
  assert.equal(await comparison.getByRole("button", { name: "겹쳐 보기", exact: true }).isEnabled(), false);
  assert.equal(await comparison.getByRole("img", { name: "기준 검수본 페이지" }).getAttribute("src"), `https://review-fixture.invalid/${subject.reviewId}/0.png`);
  assert.equal(await comparison.getByRole("img", { name: "비교 검수본 페이지" }).getAttribute("src"), `https://review-fixture.invalid/${priorSubject.reviewId}/1.png`);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(output, "comparison-mobile.png"), fullPage: true });
  await comparison.getByRole("button", { name: "비교 닫기" }).focus(); await page.keyboard.press("Escape");
  assert.equal(await comparison.getByRole("img").count(), 0);
  assert.equal(await page.getByRole("button", { name: "이전 검수본과 비교" }).evaluate((button) => document.activeElement === button), true);
  const placement = page.getByRole("region", { name: "1페이지 의견 위치", exact: true });
  await placement.getByRole("combobox", { name: "위치 방식" }).selectOption("panel");
  await placement.getByRole("combobox", { name: "연결할 컷" }).selectOption("cut-0-2");
  await placement.getByRole("button", { name: "이 위치에 의견 연결" }).click();
  await page.getByRole("textbox", { name: "이 버전에 의견 남기기" }).fill("두 번째 컷의 색상 대비를 확인했습니다.");
  await page.getByRole("combobox", { name: "의견 유형" }).selectOption("required");
  await page.getByRole("button", { name: "배정 가능한 팀원 확인" }).click();
  await page.getByRole("checkbox", { name: "민서 · 감독" }).check();
  await page.getByRole("checkbox", { name: "시나 · 원화" }).check();
  assert.equal(await page.getByRole("checkbox", { name: "초대 관람객" }).count(), 0);
  assert.equal(await page.getByRole("checkbox", { name: "미수락 초대" }).count(), 0);
  await page.getByLabel("완료 기한", { exact: true }).fill("2026-10-21T14:30");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: path.join(output, "assignment-draft-mobile.png"), fullPage: true });
  editorEligible = false;
  await page.getByRole("button", { name: "의견 저장", exact: true }).click();
  await page.getByText(/선택한 담당자의 현재 편집 권한을 확인/u).waitFor();
  assert.equal(mutations.length, 0, "Revoked assignee must prevent the comment POST");
  assert.equal(await page.getByRole("textbox", { name: "이 버전에 의견 남기기" }).inputValue(), "두 번째 컷의 색상 대비를 확인했습니다.");
  assert.equal(await page.getByLabel("완료 기한", { exact: true }).inputValue(), "2026-10-21T14:30");
  editorEligible = true;
  await page.getByRole("button", { name: "의견 저장", exact: true }).click();
  await page.getByText(/저장 결과를 확인하지 못했어요/u).waitFor();
  assert.equal(mutations.length, 1, "An uncertain response must not auto-retry");
  assert.equal(await page.getByLabel("완료 기한", { exact: true }).inputValue(), "2026-10-21T14:30");
  await page.getByRole("button", { name: "의견 저장", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("textarea")?.value === "");
  await page.getByText("두 번째 컷의 색상 대비를 확인했습니다.", { exact: true }).first().waitFor();
  assert.equal(mutations.length, 2);
  assert.equal(review.comments.length, 2, "Two explicit attempts create exactly one new comment");
  assert.deepEqual(mutations[1].body, mutations[0].body);
  assert.equal(project.artifacts[0].headRevisionId, "different-latest-head");
  const savedNote = page.getByRole("article").filter({ hasText: "두 번째 컷의 색상 대비를 확인했습니다." });
  await savedNote.getByText("담당자 · 시나 · 원화, 민서 · 감독", { exact: true }).waitFor();
  assert.equal((await savedNote.textContent()).includes("qa-editor"), false);
  const editorLink = savedNote.getByRole("link", { name: "편집기에서 의견 위치 확인" });
  const editorUrl = new URL(await editorLink.getAttribute("href"), origin);
  assert.equal(editorUrl.origin, origin.origin);
  assert.equal(editorUrl.searchParams.get("reviewComment"), mutations[0].body.id);
  assert.equal(editorUrl.searchParams.get("sharedReview"), subject.reviewId);
  assert.equal(editorUrl.searchParams.get("revision"), subject.revisionId);
  assert.equal(editorUrl.searchParams.get("digest"), subject.rootGraphHash);
  assert.deepEqual([...editorUrl.searchParams.keys()].sort(), ["artifact", "digest", "graphProject", "reviewComment", "revision", "sharedReview"].sort());
  await editorLink.focus();
  assert.equal(await editorLink.evaluate((link) => link === document.activeElement), true);
  await page.screenshot({ path: path.join(output, "cut-note-mobile.png"), fullPage: true });
  revoked = true; await page.getByRole("button", { name: "검토 기록 새로 확인" }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("img").count(), 0);
  assert.equal(await page.getByText(comment.body, { exact: true }).count(), 0);
  assert.equal(mutations.length, 2); assert.deepEqual(errors, []);
  const report = { passed: true, scope: "real React, image decoding and client parsers with intercepted HTTP fixtures; synthetic QA panels, not production authentication or source-to-pixel equivalence",
    origin: origin.origin, expectedCwd, requestCount: requests.length, mutations, comparison: { base: subject, prior: priorSubject, independentPages: true, overlay: true },
    assignment: { userIds: ["qa-editor", "reviewer"], dueAt: "2026-10-21T05:30:00.000Z", revokedAssigneePreventedPost: true, uncertainResponseExplicitRetry: true, uniqueCreatedComments: 1, currentAssigneeNames: true, identityOnlyEditorLink: true },
    sourcePageAndCutPreserved: true, differentEditableHeadPreserved: true, revokedPrivateContentRemoved: true, mobileWidth: 390, pageErrors: errors };
  await fs.writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2)); console.log(JSON.stringify(report));
} catch (error) {
  await page.screenshot({ path: path.join(output, "failure.png"), fullPage: true }).catch(() => {});
  await fs.writeFile(path.join(output, "failure.html"), await page.content());
  console.error({ errors, requests, mutations }); throw error;
} finally { await browser.close(); }
