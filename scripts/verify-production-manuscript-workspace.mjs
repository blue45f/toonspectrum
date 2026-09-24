import assert from "node:assert/strict";
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

const browser = await chromium.launch({ headless: true });
const results = [];
const pageErrors = [];
const consoleErrors = [];
const apiRequests = [];

async function installRoutes(page, label) {
  page.on("pageerror", (error) => pageErrors.push({ label, message: error.message }));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ label, message: message.text() });
  });
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    apiRequests.push({ label, method: route.request().method(), pathname: url.pathname });
    if (url.pathname === "/api/studio-project-graph/works/sample-work/project") {
      return route.fulfill({ json: project });
    }
    const revisionMatch = url.pathname.match(/^\/api\/studio-project-graph\/artifacts\/([^/]+)\/revisions$/u);
    if (revisionMatch) return route.fulfill({ json: revisions[decodeURIComponent(revisionMatch[1])] ?? [] });
    const reviewMatch = url.pathname.match(/^\/api\/studio-project-graph\/artifacts\/([^/]+)\/reviews$/u);
    if (reviewMatch) return route.fulfill({ json: reviews[decodeURIComponent(reviewMatch[1])] ?? [] });
    return route.fulfill({ status: 404, json: { message: "Unexpected manuscript fixture request" } });
  });
}

async function assertNoPageOverflow(page, width, label) {
  const metrics = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: window.innerWidth,
  }));
  assert(metrics.document <= width + 1, `${label} document overflowed: ${JSON.stringify(metrics)}`);
  assert(metrics.body <= width + 1, `${label} body overflowed: ${JSON.stringify(metrics)}`);
}

async function assertTouchTargets(page, label) {
  const violations = await page.locator([
    "[data-production-manuscript-workspace] button",
    "[data-production-manuscript-workspace] a[href]",
    "[data-production-manuscript-workspace] select",
    "[data-production-manuscript-workspace] input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden])",
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
    await expect(page.getByRole("heading", { name: "고정 원고 피드백" })).toBeVisible();
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
    results.push({ ...fixture, status: "passed" });
  } finally {
    await context.close();
  }
}

await browser.close();
assert.deepEqual(pageErrors, []);
assert.deepEqual(consoleErrors, []);
await fs.writeFile(path.join(output, "manuscript-workspace-report.json"), `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  results,
  apiRequests,
  pageErrors,
  consoleErrors,
  scope: {
    component: "actual ProductionManuscriptWorkspace React component",
    reviewSelection: "invalid immutable review query must fail closed until explicit user selection",
    devices: "Chromium browser-emulated desktop/tablet/mobile viewports",
    touch: "coarse-pointer target geometry, not physical-device ergonomics",
  },
}, null, 2)}\n`);
console.log(`PASS manuscript workspace fail-closed and responsive acceptance: ${results.length} viewports`);
