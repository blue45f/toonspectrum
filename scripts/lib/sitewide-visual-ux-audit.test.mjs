import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

const { test } = process.env.VITEST ? await import("vitest") : await import("node:test");

import {
  auditReadinessFindings,
  declaredArrayIds,
  declaredStringArrayValues,
  expandAuditRoutePattern,
  inspectAuditRouteReadiness,
  waitForAuditRouteReadiness,
} from "./sitewide-visual-ux-audit.mjs";

function documentFor(html) {
  const dom = new JSDOM(html, { url: "http://localhost/learn" });
  dom.window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 320, height: 40 });
  return dom.window.document;
}

test("애니메이션이 끝나고 ready가 남아 있어도 visible 로딩 fallback은 통과하지 않는다", () => {
  const root = documentFor('<div class="route-stage route-stage--settled" data-route-state="ready"><h1>학습</h1><div data-route-loading-fallback><div class="skeleton">준비 중</div></div></div>');
  const result = inspectAuditRouteReadiness(root);
  assert.equal(result.outcome, "fallback");
  assert.equal(result.loadingFallbacks, 1);
  assert.deepEqual(auditReadinessFindings(result, "/learn").issues, ["route-content-fallback"]);
});

test("pending marker·stalled recovery·skeleton만 있는 화면을 구분한다", () => {
  const cases = [
    ['data-route-state="ready"', '<section data-route-pending><h1>준비 중</h1></section>', "pending"],
    ['data-route-state="stalled"', '<section data-route-recovery><h1>다시 시도</h1></section>', "stalled"],
    ['data-route-state="ready"', '<h1 data-route-semantic-heading>학습</h1><div class="skeleton"></div>', "skeleton"],
    ['data-route-state="ready"', '', "empty"],
  ];
  for (const [attributes, content, expected] of cases) {
    const root = documentFor(`<div class="route-stage" ${attributes}>${content}</div>`);
    assert.equal(inspectAuditRouteReadiness(root).outcome, expected);
  }
});

test("정상 콘텐츠 안의 작은 skeleton과 숨겨진 fallback은 전체 로딩으로 오인하지 않는다", () => {
  const root = documentFor('<div class="route-stage" data-route-state="ready"><h1>학습</h1><a href="/learn/trace">시작</a><div class="skeleton"></div><div hidden><div data-route-loading-fallback></div></div></div>');
  assert.equal(inspectAuditRouteReadiness(root).outcome, "ready");
});

test("권한 거절·부분 장애는 오류·로딩 실패와 별도 상태로 보고한다", () => {
  for (const state of ["blocked", "degraded", "error"]) {
    const root = documentFor(`<div class="route-stage" data-route-state="${state}"><h1>안내</h1></div>`);
    const result = inspectAuditRouteReadiness(root);
    assert.equal(result.outcome, state);
    const findings = auditReadinessFindings(result, "/learn");
    assert.equal(findings.issues.length, state === "error" ? 1 : 0);
    assert.equal(findings.warnings.length, state === "error" ? 0 : 1);
  }
});

test("기존 콘텐츠가 ready여도 개발 서버 오류 overlay가 가리면 실패로 보고한다", () => {
  const root = documentFor('<div class="route-stage" data-route-state="ready"><h1>마켓</h1></div><vite-error-overlay></vite-error-overlay>');
  const result = inspectAuditRouteReadiness(root);
  assert.equal(result.outcome, "error");
  assert.equal(result.developmentErrorOverlay, true);
  assert.deepEqual(auditReadinessFindings(result, "/learn").issues, ["route-content-error"]);
});

test("SPA 리다이렉트와 준비 시간 초과를 결과에 남긴다", () => {
  const findings = auditReadinessFindings({ outcome: "pending", timedOut: true, pathname: "/auth/login" }, "/learn");
  assert.deepEqual(findings.issues, ["route-readiness-timeout", "route-content-pending"]);
  assert.deepEqual(findings.warnings, ["route-redirect:/auth/login"]);
});

test("실제 fallback 제거와 콘텐츠 상태 전환을 기다린다", async () => {
  const root = documentFor('<div class="route-stage route-stage--settled" data-route-state="pending"><div data-route-loading-fallback></div></div>');
  const page = {
    evaluate: async (fn) => fn(root),
    waitForTimeout: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
  const timer = setTimeout(() => {
    const stage = root.querySelector(".route-stage");
    stage.setAttribute("data-route-state", "ready");
    stage.innerHTML = '<h1>학습</h1><a href="/learn/trace">시작</a>';
  }, 20);
  try {
    const result = await waitForAuditRouteReadiness(page, { timeoutMs: 300, stableMs: 10, pollMs: 5 });
    assert.equal(result.outcome, "ready");
    assert.equal(result.timedOut, false);
    assert.deepEqual(result.observedStates, ["fallback", "ready"]);
  } finally {
    clearTimeout(timer);
  }
});

test("실제 timeout 후에도 skeleton 상태를 성공으로 바꾸지 않는다", async () => {
  const root = documentFor('<div class="route-stage" data-route-state="ready"><div class="skeleton"></div></div>');
  const page = {
    evaluate: async (fn) => fn(root),
    waitForTimeout: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
  const result = await waitForAuditRouteReadiness(page, { timeoutMs: 15, stableMs: 1, pollMs: 5 });
  assert.equal(result.outcome, "skeleton");
  assert.equal(result.timedOut, true);
});

test("문서 리다이렉트의 context 전환은 다시 관측하되 브라우저 종료는 숨기지 않는다", async () => {
  const root = documentFor('<div class="route-stage" data-route-state="ready"><h1>AI 설정</h1></div>');
  let calls = 0;
  const page = {
    evaluate: async (fn) => {
      if (calls++ === 0) throw new Error("Execution context was destroyed, most likely because of a navigation");
      return fn(root);
    },
    waitForTimeout: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
  const result = await waitForAuditRouteReadiness(page, { timeoutMs: 300, stableMs: 5, pollMs: 5 });
  assert.equal(result.timedOut, false);
  assert.deepEqual(result.observedStates, ["navigation", "ready"]);
  await assert.rejects(() => waitForAuditRouteReadiness({
    ...page,
    evaluate: async () => { throw new Error("Target page, context or browser has been closed"); },
  }), /has been closed/u);
});

test("Studio 권위 패턴의 선택 문서와 surface를 펼치고 wildcard는 제외한다", () => {
  const paths = expandAuditRoutePattern("/studio/(work/:workId|remix/:sourceWorkId)?/:surface(canvas|comic)?");
  assert.equal(paths.length, 9);
  assert.ok(paths.includes("/studio/canvas"));
  assert.ok(paths.includes("/studio/work/visual-audit/comic"));
  assert.ok(paths.includes("/studio/remix/visual-audit"));
  assert.deepEqual(expandAuditRoutePattern("/studio/(work/:workId/)?publish"), ["/studio/publish", "/studio/work/visual-audit/publish"]);
  assert.deepEqual(expandAuditRoutePattern("/studio/*"), []);
});

test("학습 콘텐츠 ID는 지정한 권위 배열에서만 읽는다", () => {
  const source = 'const OTHER = [{ id: "wrong" }]; export const LESSONS: readonly Lesson[] = [{ id: "story", sections: [{ id: "nested" }] }, { id: "color" }];';
  assert.deepEqual(declaredArrayIds(source, "LESSONS"), ["story", "color"]);
  assert.throws(() => declaredArrayIds(source, "MISSING"), /정적 목록/);
});

test("companion surface는 as const 권위 배열의 실제 이름만 사용한다", () => {
  const source = 'const OTHER = ["wrong"]; export const STUDIO_COMPANION_SURFACES = ["workspace", "review"] as const;';
  assert.deepEqual(declaredStringArrayValues(source, "STUDIO_COMPANION_SURFACES"), ["workspace", "review"]);
});
