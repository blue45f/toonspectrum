import ts from "typescript";

/** 브라우저에 직렬화해 실행하므로 외부 변수나 모듈을 참조하지 않는다. */
export function inspectAuditRouteReadiness(root = document) {
  const view = root.defaultView;
  const visible = (element) => {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    for (let node = element; node; node = node.parentElement) {
      const style = view.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return false;
    }
    return true;
  };
  const stage = root.querySelector(".route-stage");
  const developmentErrorOverlay = [...root.querySelectorAll("vite-error-overlay")].some(visible);
  const state = stage?.getAttribute("data-route-state") ?? "missing";
  const readinessSource = stage?.getAttribute("data-route-readiness-source") ?? "none";
  const count = (selector) => stage
    ? [...stage.querySelectorAll(selector)].filter(visible).length
    : 0;
  const loadingFallbacks = count("[data-route-loading-fallback]");
  const pendingMarkers = count("[data-route-pending]");
  const recoveryVisible = count("[data-route-recovery]") > 0;
  const skeletons = count(".skeleton, [data-skeleton], [data-testid='skeleton']");
  const ignored = "[data-route-semantic-heading], [data-route-recovery], [data-route-loading-fallback], [data-route-pending], [aria-busy='true'], [aria-hidden='true'], .sr-only, .skeleton, [data-skeleton]";
  const contentElements = stage
    ? [...stage.querySelectorAll("h1,h2,h3,a[href],button,input,select,textarea,canvas,img,video,[role='alert'],[role='status']")]
      .filter((element) => visible(element) && !element.closest(ignored)).length
    : 0;
  let outcome = "ready";
  if (developmentErrorOverlay) outcome = "error";
  else if (!stage) outcome = "missing";
  else if (recoveryVisible || state === "stalled") outcome = "stalled";
  else if (loadingFallbacks) outcome = "fallback";
  else if (pendingMarkers || state === "pending" || stage.getAttribute("aria-busy") === "true") outcome = "pending";
  else if (["blocked", "degraded", "error"].includes(state)) outcome = state;
  else if (skeletons && contentElements <= 1) outcome = "skeleton";
  else if (state !== "ready" || !contentElements) outcome = "empty";
  return {
    pathname: view.location.pathname,
    state,
    readinessSource,
    outcome,
    developmentErrorOverlay,
    loadingFallbacks,
    pendingMarkers,
    recoveryVisible,
    skeletons,
    contentElements,
  };
}

/** 애니메이션 종료와 실제 콘텐츠 준비를 구분하고 SPA 전환이 안정된 뒤 관측한다. */
export async function waitForAuditRouteReadiness(page, {
  timeoutMs = 20_000,
  stableMs = 300,
  pollMs = 150,
} = {}) {
  const started = Date.now();
  const observedStates = new Set();
  let lastSignature = "";
  let stableSince = started;
  let snapshot;
  while (Date.now() - started < timeoutMs) {
    try {
      snapshot = await page.evaluate(inspectAuditRouteReadiness);
    } catch (error) {
      // 전체 문서 리다이렉트 중에만 관측을 다시 시작한다. 종료된 브라우저 등은 실패로 남긴다.
      if (!(error instanceof Error) || !error.message.includes("Execution context was destroyed")) throw error;
      observedStates.add("navigation");
      lastSignature = "";
      stableSince = Date.now();
      await page.waitForTimeout(Math.min(pollMs, Math.max(1, timeoutMs - (Date.now() - started))));
      continue;
    }
    observedStates.add(snapshot.outcome);
    const signature = JSON.stringify([snapshot.pathname, snapshot.outcome, snapshot.state]);
    if (signature !== lastSignature) {
      lastSignature = signature;
      stableSince = Date.now();
    }
    const terminal = ["ready", "blocked", "degraded", "error"].includes(snapshot.outcome);
    if (terminal && Date.now() - stableSince >= stableMs) {
      return { ...snapshot, timedOut: false, durationMs: Date.now() - started, observedStates: [...observedStates] };
    }
    await page.waitForTimeout(Math.min(pollMs, Math.max(1, timeoutMs - (Date.now() - started))));
  }
  snapshot = await page.evaluate(inspectAuditRouteReadiness);
  observedStates.add(snapshot.outcome);
  return { ...snapshot, timedOut: true, durationMs: Date.now() - started, observedStates: [...observedStates] };
}

export function auditReadinessFindings(readiness, requestedPath) {
  const issues = [];
  const warnings = [];
  if (readiness.timedOut) issues.push("route-readiness-timeout");
  if (["missing", "pending", "fallback", "stalled", "skeleton", "empty", "error"].includes(readiness.outcome)) {
    issues.push(`route-content-${readiness.outcome}`);
  }
  if (readiness.outcome === "blocked" || readiness.outcome === "degraded") {
    warnings.push(`route-content-${readiness.outcome}`);
  }
  if (readiness.pathname !== requestedPath) warnings.push(`route-redirect:${readiness.pathname}`);
  return { issues, warnings };
}

/** Studio manifest의 선택 그룹과 선택 surface를 실제 감사 URL로 펼친다. */
export function expandAuditRoutePattern(pattern) {
  if (!pattern.startsWith("/") || pattern.includes("*")) return [];
  const normalized = pattern.replace(/:[A-Za-z0-9_]+\(([^()]*)\)/gu, "($1)");
  const group = /\(([^()]*)\)(\?)?/u.exec(normalized);
  if (group) {
    const alternatives = group[1].split("|");
    if (group[2]) alternatives.unshift("");
    return [...new Set(alternatives.flatMap((value) => expandAuditRoutePattern(
      normalized.slice(0, group.index) + value + normalized.slice(group.index + group[0].length),
    )))];
  }
  return [normalized.replace(/:[A-Za-z0-9_]+\??/gu, "visual-audit").replace(/\/{2,}/gu, "/").replace(/\/$/u, "") || "/"];
}

function declaredArrayElements(sourceText, name) {
  const source = ts.createSourceFile("content.ts", sourceText, ts.ScriptTarget.Latest, true);
  let entries;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) {
      let initializer = node.initializer;
      while (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer)) initializer = initializer.expression;
      if (ts.isArrayLiteralExpression(initializer)) entries = initializer.elements;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!entries) throw new Error(`${name} 정적 목록을 찾지 못했습니다. 경로 권위와 감사 수집기를 확인하세요.`);
  return { entries, source };
}

/** 중첩 lesson/path 예제를 가짜 ID 대신 기존 정적 콘텐츠 권위에서 읽는다. */
export function declaredArrayIds(sourceText, name) {
  const { entries, source } = declaredArrayElements(sourceText, name);
  return entries.flatMap((entry) => {
    if (!ts.isObjectLiteralExpression(entry)) return [];
    const id = entry.properties.find((property) => ts.isPropertyAssignment(property)
      && property.name.getText(source) === "id");
    return id && ts.isStringLiteral(id.initializer) ? [id.initializer.text] : [];
  });
}

/** companion처럼 유효한 이름만 허용하는 surface를 기존 권위에서 읽는다. */
export function declaredStringArrayValues(sourceText, name) {
  return declaredArrayElements(sourceText, name).entries.flatMap((entry) => ts.isStringLiteral(entry) ? [entry.text] : []);
}
