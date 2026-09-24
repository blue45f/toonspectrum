import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { chromium, expect } from "@playwright/test";

const origin = new URL(process.env.STUDIO_QA_BASE_URL ?? "http://127.0.0.1:5254");
assert(["localhost", "127.0.0.1"].includes(origin.hostname));
assert.equal(origin.pathname, "/");
const output = path.resolve(".qa/review-delivery-release-acceptance");
await fs.mkdir(output, { recursive: true });

const at = (minute) => `2026-09-23T01:${String(minute).padStart(2, "0")}:00.000Z`;
const project = {
  id: "graph-project",
  workId: "sample-work",
  schemaVersion: 3,
  authorityVersion: "project-graph-v3",
  ownerUserId: "manuscript-owner",
  createdAt: at(0),
  updatedAt: at(9),
  access: {
    view: true,
    comment: true,
    edit: true,
    manageMembers: true,
    respondInvite: false,
    owner: true,
    role: "owner",
  },
  artifacts: [
    {
      id: "artifact-image",
      projectId: "graph-project",
      kind: "canvas-2d",
      title: "12화 작화 원고",
      scope: { projectId: "graph-project", seasonId: "season-1", episodeId: "episode-12" },
      headRevisionId: "revision-head",
      approvedRevisionId: "revision-approved",
      ownerWorkspaceId: "workspace-1",
      createdAt: at(1),
      updatedAt: at(8),
    },
    {
      id: "artifact-story",
      projectId: "graph-project",
      kind: "story",
      title: "12화 대본",
      scope: { projectId: "graph-project", seasonId: "season-1", episodeId: "episode-12" },
      headRevisionId: "story-head",
      approvedRevisionId: null,
      ownerWorkspaceId: "workspace-1",
      createdAt: at(1),
      updatedAt: at(4),
    },
  ],
};
function revision(artifactId, id, kind, minute) {
  return {
    id,
    artifactId,
    kind,
    parentIds: [],
    rootGraphHash: "a".repeat(64),
    operationFirst: null,
    operationLast: null,
    createdBy: "manuscript-owner",
    deviceId: "device-1",
    createdAt: at(minute),
    message: `${kind} ${id}`,
    compatibilityReportId: null,
    provenanceManifestId: null,
    blobRefs: [],
  };
}
const revisions = {
  "artifact-image": [
    revision("artifact-image", "revision-head", "checkpoint", 8),
    revision("artifact-image", "revision-review", "review-snapshot", 7),
    revision("artifact-image", "revision-approved", "approved", 5),
  ],
  "artifact-story": [revision("artifact-story", "story-head", "checkpoint", 4)],
};
const reviews = {
  "artifact-image": [{
    id: "review-image",
    artifactId: "artifact-image",
    revisionId: "revision-review",
    requestedBy: "manuscript-owner",
    title: "12화 편집 검수",
    status: "changes-requested",
    decidedAt: null,
    decidedBy: null,
    createdAt: at(6),
    updatedAt: at(9),
    reviewerIds: ["manuscript-owner", "editor-user"],
    openRequiredCommentCount: 2,
  }],
  "artifact-story": [],
};
const reviewSubject = {
  schemaVersion: 1,
  projectId: project.id,
  workId: project.workId,
  artifactId: "artifact-image",
  reviewId: "review-image",
  revisionId: "revision-review",
  rootGraphHash: "a".repeat(64),
};
const previewBytes = [
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGP4DwQACfsD/fteaysAAAAASUVORK5CYII=", "base64"),
  Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAX+XDSwAAAABJRU5ErkJggg==", "base64"),
];
const previewPages = previewBytes.map((bytes, ordinal) => ({
  ordinal,
  sha256: createHash("sha256").update(bytes).digest("hex"),
  mediaType: "image/png",
  byteLength: bytes.length,
  url: `https://manuscript-fixture.invalid/page-${ordinal}.png`,
  expiresAt: Date.now() + 25_000,
  mapping: { status: "unmapped", reason: "legacy-review" },
}));

const browser = await chromium.launch({ headless: true });
const results = [];
const pageErrors = [];
const consoleErrors = [];
const failedResponses = [];
const apiRequests = [];

async function installRoutes(page, label) {
  page.on("pageerror", (error) => pageErrors.push({ label, message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ label, message: message.text() });
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failedResponses.push({
      label,
      status: response.status(),
      url: response.url(),
    });
  });
  await page.route("https://manuscript-fixture.invalid/**", async (route) => {
    const match = new URL(route.request().url()).pathname.match(/page-(\d+)\.png$/u);
    const bytes = match ? previewBytes[Number(match[1])] : null;
    if (!bytes) return route.fulfill({ status: 404, body: "missing preview fixture" });
    return route.fulfill({ status: 200, contentType: "image/png", body: bytes });
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    apiRequests.push({ label, method: request.method(), pathname: url.pathname });
    if (url.pathname === "/api/studio-project-graph/works/sample-work/project"
      || url.pathname === "/api/studio-project-graph/projects/graph-project") {
      return route.fulfill({ json: project });
    }
    const revisionMatch = url.pathname.match(/^\/api\/studio-project-graph\/artifacts\/([^/]+)\/revisions$/u);
    if (revisionMatch) return route.fulfill({ json: revisions[decodeURIComponent(revisionMatch[1])] ?? [] });
    const reviewMatch = url.pathname.match(/^\/api\/studio-project-graph\/artifacts\/([^/]+)\/reviews$/u);
    if (reviewMatch) return route.fulfill({ json: reviews[decodeURIComponent(reviewMatch[1])] ?? [] });
    if (url.pathname === "/api/studio-project-graph/reviews/review-image") {
      return route.fulfill({ json: { ...reviews["artifact-image"][0], comments: [] } });
    }
    if (url.pathname === "/api/studio-project-graph/reviews/review-image/previews") {
      return route.fulfill({ json: {
        ok: true,
        subject: reviewSubject,
        previews: previewPages.map((page) => ({ ...page, expiresAt: Date.now() + 25_000 })),
        nextCursor: null,
      } });
    }
    if (url.pathname === "/api/studio-project-graph/works/sample-work/review-voice-notes/query"
      && request.method() === "POST") {
      return route.fulfill({ json: { items: [] } });
    }
    if (url.pathname === "/api/creator/works/sample-work/pinned-review-shares"
      && request.method() === "GET") {
      return route.fulfill({ json: { items: [], nextCursor: null } });
    }
    if (url.pathname === "/api/creator/works/sample-work/pinned-review-shares/sources"
      && request.method() === "POST") {
      return route.fulfill({ json: {
        subject: reviewSubject,
        pages: previewPages.map(({ ordinal, sha256, byteLength, mediaType }) => ({
          ordinal, sha256, byteLength, mediaType, width: 1, height: 1,
        })),
        nextOffset: null,
        approved: false,
        expiresAt: new Date(Date.now() + 25_000).toISOString(),
      } });
    }
    return route.fulfill({ status: 404, json: { message: `Unexpected manuscript fixture request: ${request.method()} ${url.pathname}` } });
  });
}

async function assertNoPageOverflow(page, width, label) {
  const metrics = await page.evaluate((expectedWidth) => {
    const viewport = window.innerWidth;
    const offenders = [...document.querySelectorAll("body *")].flatMap((element) => {
      const rect = element.getBoundingClientRect();
      if (rect.right <= expectedWidth + 1 && rect.left >= -1 && rect.width <= expectedWidth + 1) return [];
      return [{
        tag: element.tagName.toLowerCase(),
        className: element.getAttribute("class")?.slice(0, 120) ?? "",
        label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || "",
        left: Math.round(rect.left),
        right: Math.round(rect.right),
        width: Math.round(rect.width),
      }];
    }).slice(0, 12);
    const beforeX = window.scrollX;
    window.scrollTo({ left: 1_000_000, top: window.scrollY, behavior: "instant" });
    const rootScrollX = window.scrollX;
    window.scrollTo({ left: beforeX, top: window.scrollY, behavior: "instant" });
    return {
      body: document.body.scrollWidth,
      document: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
      visual: window.visualViewport?.width ?? null,
      outer: window.outerWidth,
      screen: window.screen.width,
      viewport,
      rootScrollX,
      offenders,
    };
  }, width);
  assert(metrics.client <= width + 1, `${label} layout viewport overflowed: ${JSON.stringify(metrics)}`);
  assert(metrics.body <= width + 1, `${label} body overflowed: ${JSON.stringify(metrics)}`);
  assert.equal(metrics.rootScrollX, 0, `${label} root page scrolls horizontally: ${JSON.stringify(metrics)}`);
}

async function assertTouchTargets(page, label) {
  const violations = await page.locator([
    "[data-production-manuscript-workspace] button",
    "[data-production-manuscript-workspace] a[href]",
    "[data-production-manuscript-workspace] select",
    "[data-production-manuscript-workspace] input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]):not([type=file])",
    "[data-production-manuscript-workspace] summary",
    "[data-production-manuscript-workspace] [role=button]",
  ].join(", ")).evaluateAll((elements) => elements.flatMap((element) => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const visible = rect.width > 0 && rect.height > 0
      && style.visibility !== "hidden" && style.display !== "none";
    if (!visible || (rect.width >= 43.5 && rect.height >= 43.5)) return [];
    return [{
      tag: element.tagName.toLowerCase(),
      label: element.getAttribute("aria-label") || element.textContent?.trim().slice(0, 80) || "",
      width: Math.round(rect.width * 10) / 10,
      height: Math.round(rect.height * 10) / 10,
    }];
  }));
  assert.deepEqual(violations, [], `${label} has touch targets below 44px`);
}

for (const fixture of [
  { width: 1440, height: 1100, touch: false, label: "desktop" },
  { width: 820, height: 1100, touch: true, label: "tablet" },
  { width: 390, height: 1100, touch: true, label: "mobile" },
  { width: 320, height: 1100, touch: true, label: "mobile-compact" },
]) {
  const context = await browser.newContext({
    viewport: { width: fixture.width, height: fixture.height },
    locale: "ko-KR",
    hasTouch: fixture.touch,
    isMobile: fixture.touch && fixture.width <= 390,
    reducedMotion: "reduce",
  });
  try {
    const page = await context.newPage();
    await installRoutes(page, fixture.label);
    await page.goto(`${origin.origin}/tools/browser-harnesses/production-manuscript-workspace.html`, {
      waitUntil: "networkidle",
    });
    try {
      await expect(page.getByRole("heading", { name: "고정 원고 피드백" })).toBeVisible();
    } catch (error) {
      console.error(JSON.stringify({
        fixture: fixture.label,
        pageErrors: pageErrors.filter((entry) => entry.label === fixture.label),
        consoleErrors: consoleErrors.filter((entry) => entry.label === fixture.label),
        failedResponses: failedResponses.filter((entry) => entry.label === fixture.label),
        body: (await page.locator("body").innerText()).slice(0, 2_000),
      }, null, 2));
      throw error;
    }
    await expect(page.getByRole("heading", { name: "요청한 원고·검수본 조합을 찾을 수 없습니다" })).toBeVisible();
    await expect(page.getByText(/다른 공정이나 검수본으로 자동 대체하지 않았습니다/u)).toBeVisible();
    assert.equal(
      apiRequests.some(({ label, pathname }) => label === fixture.label && /\/reviews\/review-image(?:\/|$)/u.test(pathname)),
      false,
      `${fixture.label} opened a fallback review detail request`,
    );
    await assertNoPageOverflow(page, fixture.width, `${fixture.label}-feedback`);
    if (fixture.touch) await assertTouchTargets(page, `${fixture.label}-feedback`);
    await page.screenshot({
      path: path.join(output, `manuscript-${fixture.label}-feedback.png`),
      fullPage: true,
    });

    await page.getByRole("tab", { name: "공정·원고" }).click();
    await expect(page.getByRole("searchbox", { name: "원고·공정 검색" })).toBeVisible();
    await assertNoPageOverflow(page, fixture.width, `${fixture.label}-processes`);
    if (fixture.touch) await assertTouchTargets(page, `${fixture.label}-processes`);

    await page.getByRole("button", { name: "한눈 보기" }).click();
    const matrix = page.getByRole("region", { name: "공정 한눈 보기 표" });
    await expect(matrix).toBeVisible();
    await assertNoPageOverflow(page, fixture.width, `${fixture.label}-matrix`);
    if (fixture.width <= 820) {
      const matrixOverflow = await matrix.evaluate((element) => element.scrollWidth > element.clientWidth);
      assert.equal(matrixOverflow, true, `${fixture.label} matrix should scroll inside its own region`);
    }
    await page.screenshot({
      path: path.join(output, `manuscript-${fixture.label}-matrix.png`),
      fullPage: true,
    });
    await expect(page.getByRole("heading", { name: "회차와 공정을 한 표에서 운영합니다" })).toBeVisible();

    await page.getByRole("button", { name: "필수 수정 확인", exact: true }).first().click();
    await expect(page.getByRole("heading", { name: "필수 수정 2개를 처리하세요" })).toBeVisible();
    await assertNoPageOverflow(page, fixture.width, `${fixture.label}-unified-review`);

    await page.getByRole("tab", { name: "전문 비교" }).click();
    await expect(page.getByRole("heading", { name: "여러 공정·회차 원고를 한 작업대에서 비교합니다" })).toBeVisible();
    await page.getByRole("button", { name: "4분할" }).click();
    await expect(page.getByLabel("4번 원고")).toBeVisible();
    await assertNoPageOverflow(page, fixture.width, `${fixture.label}-workbench`);
    if (fixture.touch) await assertTouchTargets(page, `${fixture.label}-workbench`);

    await page.getByRole("tab", { name: "버전·비교" }).click();
    await expect(page.getByRole("heading", { name: "수정한 페이지만 바꾸어 새 원고 버전을 구성합니다" })).toBeVisible();
    await page.getByRole("button", { name: "전체 페이지 불러오기" }).click();
    await expect(page.getByRole("heading", { name: "새 페이지 구성 · 2장" })).toBeVisible();
    await expect(page.getByLabel("페이지 구성 변경 요약")).toContainText("재사용 2");
    await expect(page.getByLabel("페이지 구성 변경 요약")).toContainText("누락 0");
    await assertNoPageOverflow(page, fixture.width, `${fixture.label}-page-builder`);

    await page.getByRole("tab", { name: "공유·내보내기" }).click();
    await expect(page.getByRole("heading", { name: "원고 페이지를 바로 CBZ로 받습니다" })).toBeVisible();
    await assertNoPageOverflow(page, fixture.width, `${fixture.label}-quick-export`);

    await page.getByRole("tab", { name: "AI 도우미" }).click();
    await expect(page.getByRole("heading", { name: "선택 영역 음영·광원 보조를 끝까지 안내합니다" })).toBeVisible();
    await assertNoPageOverflow(page, fixture.width, `${fixture.label}-focused-ai`);

    await page.getByRole("tab", { name: "팀·권한" }).click();
    await expect(page.getByRole("heading", { name: "역할 이름보다 실제 가능한 행동을 먼저 확인합니다" })).toBeVisible();
    await assertNoPageOverflow(page, fixture.width, `${fixture.label}-role-presets`);

    await page.getByRole("tab", { name: "시작 가이드" }).click();
    await expect(page.getByRole("heading", { name: "역할별 대표 과업을 실제 화면에서 완주합니다" })).toBeVisible();
    await assertNoPageOverflow(page, fixture.width, `${fixture.label}-adoption`);
    if (fixture.touch) await assertTouchTargets(page, `${fixture.label}-adoption`);

    if (fixture.width === 1440 || fixture.width === 390) {
      await page.screenshot({
        path: path.join(output, `manuscript-${fixture.label}-competitive-workflows.png`),
        fullPage: true,
      });
    }
    results.push({ ...fixture, status: "passed", competitiveWorkflows: 9 });
  } finally {
    await context.close();
  }
}

await browser.close();
if (failedResponses.length) console.error(JSON.stringify({ failedResponses }, null, 2));
assert.deepEqual(pageErrors, []);
assert.deepEqual(failedResponses, []);
assert.deepEqual(consoleErrors, []);
await fs.writeFile(path.join(output, "manuscript-workspace-report.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  results,
  apiRequests,
  pageErrors,
  failedResponses,
  consoleErrors,
  scope: {
    component: "actual ProductionManuscriptWorkspace React component",
    reviewSelection: "invalid immutable review query must fail closed until explicit user selection",
    devices: "Chromium browser-emulated desktop/tablet/mobile viewports",
    touch: "coarse-pointer target geometry, not physical-device ergonomics",
    competitiveWorkflows: "matrix, multi-review, page manifest, unified lifecycle, quick export, role presets, text lifecycle, focused AI handoff and adoption",
  },
}, null, 2)}\n`);
console.log(`PASS manuscript workspace fail-closed and responsive acceptance: ${results.length} viewports`);
