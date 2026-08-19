import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const PAGE_SOURCE = readFileSync(new URL("./StudioPage.tsx", import.meta.url), "utf8");
const ROUTE_SOURCE = readFileSync(
  new URL("./studio-stroke-surface-route.ts", import.meta.url),
  "utf8",
);

function sourceSection(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Missing source boundary: ${start} -> ${end}`);
  }
  return source.slice(startIndex, endIndex);
}

describe("Studio stroke surface route wiring boundary", () => {
  it("resolves one product route after strict-priority, short-circuited admissions", () => {
    // V12 §5 cutover: the tournament projection is resolved once per stroke start, BEFORE any
    // side-effecting begin call, and every specialist admission is gated by it. Each gate token
    // is pinned immediately before its lane's begin call so the ladder order and the "gate
    // precedes the side effect" contract are both machine-checked.
    const pointerDown = sourceSection(
      PAGE_SOURCE,
      "function beginStudioDrawLiveSurfaces(",
      "function onStageDown(",
    );
    const admissions = [
      "const strokeRouteTournamentRuntime = peekBootedStudioTournamentRuntime()",
      "resolveStudioStrokeRoutePointerDownGate({",
      "lanes: STUDIO_STROKE_ROUTE_TOURNAMENT_LANES",
      "strokeRouteTournamentGate.selection.killIgnoredReason",
      '(strokeRouteTournamentGate?.admits("living-ink") ?? true)',
      "beginStudioLivingInkStroke(next, pointerSample)",
      '(strokeRouteTournamentGate?.admits("hokusai") ?? true)',
      "beginStudioHokusaiLiveStroke(next)",
      '(strokeRouteTournamentGate?.admits("stamp") ?? true)',
      "liveStampOverlayRendererRef.current.begin(",
      '(strokeRouteTournamentGate?.admits("gpu") ?? true)',
      "beginLiveStrokeBackendAudit(next.id, \"webgpu\")",
      '(strokeRouteTournamentGate?.admits("live-ink") ?? true)',
      "liveInkOverlayRendererRef.current.begin(",
      '(strokeRouteTournamentGate?.admits("wet-fallback") ?? true)',
      "liveWetInkOverlayRendererRef.current.begin(next",
      '(strokeRouteTournamentGate?.admits("dynamic") ?? true)',
      "liveDynamicBrushOverlayRendererRef.current.begin(next)",
      "resolveStudioStrokeSurfaceRoute({",
    ] as const;

    let previous = -1;
    for (const admission of admissions) {
      const index = pointerDown.indexOf(admission);
      expect(index, `missing strict route admission: ${admission}`).toBeGreaterThan(previous);
      previous = index;
    }
    expect(pointerDown).toMatch(
      /const hokusaiPinned = \(strokeRouteTournamentGate\?\.admits\("hokusai"\) \?\? true\)\s*&& pendingGpuAuthorityPromoted\s*&& !livingInkAdmitted\s*&& beginStudioHokusaiLiveStroke\(next\);/u,
    );
    expect(pointerDown).toMatch(
      /const gpuStartEligible = \(strokeRouteTournamentGate\?\.admits\("gpu"\) \?\? true\)\s*&& pendingGpuAuthorityPromoted\s*&& !livingInkAdmitted\s*&& !hokusaiPinned\s*&& !stampDirect\s*&& STUDIO_VISIBLE_LIVE_INK_PREFERENCE/u,
    );
    // The terminal Konva fallback is never tournament-gated: no admits("konva") call may exist.
    expect(pointerDown).not.toContain('admits("konva")');
    // One projection per stroke start (the pointer-down hot-path budget): the gate is resolved
    // exactly once inside the admission ladder.
    expect(pointerDown.match(/resolveStudioStrokeRoutePointerDownGate\(/gu)?.length).toBe(1);
    expect(pointerDown).not.toContain("getStudioTournamentRuntime()");
    expect(pointerDown).toContain("studioStrokeSurfaceRouteRef.current = strokeSurfaceRoute");
    expect(pointerDown).toContain("livingInkCoordinatorRef.current.pinActiveRoute(");
    expect(pointerDown).toContain("strokeSurfaceRoute = resolveStudioStrokeSurfaceRoute({");
    expect(pointerDown).toContain("admitted: false");
    expect(pointerDown).toContain("dynamicAdmitted: false");
  });

  it("keeps canonical stroke/action handoff token-scoped and input-exclusive", () => {
    const livingInkBoundary = sourceSection(
      PAGE_SOURCE,
      "function releaseStudioLivingInkPresentation(",
      "function livingInkSelectionSnapshot(",
    );
    expect(livingInkBoundary).toContain("handoff?.token !== expectedToken");
    expect(livingInkBoundary).toContain('handoff?.kind === "stroke"');
    expect(livingInkBoundary).toContain("handoff.token !== `${routeKey}:canonical`");
    expect(livingInkBoundary).toContain("releaseStudioLivingInkPresentation(handoff.token)");

    const action = sourceSection(
      PAGE_SOURCE,
      "async function applyStudioLivingInkAction(",
      "const studioOptionsBarsHandlers =",
    );
    expect(action).toContain("studioLivingInkProductAdmissionBlocked({");
    expect(action).toContain('kind: "action"');
    expect(action).toContain("kind,");
    expect(action).toContain('void applyStudioLivingInkAction("fix")');
    expect(action).toContain('void applyStudioLivingInkAction("clear")');
    expect(action).toContain("if (!transactionCommitted) setLivingInkBusy(false)");
    expect(PAGE_SOURCE).toContain(
      'fixAvailable: livingInkPersistedLayer && livingInkState === "ready"',
    );
    expect(PAGE_SOURCE).not.toContain("fixAvailable: false");

    const history = sourceSection(
      PAGE_SOURCE,
      "const undo = () =>",
      "const studioBrushCatalogHandlers =",
    );
    expect(history).toContain("pendingLivingInkHandoff");
    expect(history).toContain("releaseStudioLivingInkPresentation(pendingLivingInkHandoff.token)");
  });

  it("revokes physical editing authority if document acceptance fails after commit", () => {
    expect(PAGE_SOURCE).toContain("if (!livingInkCoordinatorRef.current.acceptFinishedStroke(work))");
    expect(PAGE_SOURCE).toContain("if (!livingInkCoordinatorRef.current.acceptAction(work))");
    expect(PAGE_SOURCE.match(/livingInkCoordinatorRef\.current\.failClosed\(message\)/gu)?.length)
      .toBeGreaterThanOrEqual(3);
  });

  it("keeps every current surface and lifecycle phase explicit in the pure contract", () => {
    for (const kind of [
      "living-ink",
      "hokusai",
      "stamp",
      "gpu",
      "live-ink",
      "wet-fallback",
      "dynamic",
      "konva",
    ] as const) {
      expect(ROUTE_SOURCE).toContain(`"${kind}"`);
    }
    for (const phase of ["append", "finish", "cancel", "handoff"] as const) {
      expect(ROUTE_SOURCE).toContain(`| "${phase}"`);
    }

    const finish = sourceSection(
      PAGE_SOURCE,
      "function finishDrawingPointer(",
      "function onStagePointerCancel(",
    );
    const specialistFinish = sourceSection(
      PAGE_SOURCE,
      "function finishStudioSpecialistStroke(",
      "function finishDrawingPointer(",
    );
    expect(PAGE_SOURCE).toContain("appendStudioLivingInkAuthoritativeSuffix(authoritativeDrawing, startSample)");
    expect(specialistFinish).toContain("finishStudioLivingInkStroke");
    expect(specialistFinish).toContain("finishStudioHokusaiLiveStroke");
    expect(finish).toContain("finishStudioSpecialistStroke(finished)");
    expect(finish).toContain("gpuLiveInkPinnedRef.current");
    expect(finish).toContain("overlayRenderer.isActive");
    expect(finish).toContain("liveWetInkOverlayRendererRef.current.isActive");
    expect(finish).toContain("liveDynamicBrushOverlayRendererRef.current.isActive");
    expect(finish).toContain("queueCommittedStrokeSurfaceHandoff");
    for (const phase of ["append", "finish", "cancel", "handoff"] as const) {
      expect(PAGE_SOURCE).toContain(`phase: "${phase}"`);
    }
  });
});
