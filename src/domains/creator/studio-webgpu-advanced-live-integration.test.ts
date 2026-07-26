import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

function source(fileName: string): string {
  return readFileSync(new URL(fileName, import.meta.url), "utf8");
}

describe("Studio advanced WebGPU live-ink integration", () => {
  it("pins only an exactly prepared advanced stroke and keeps the legacy overlay as fallback", () => {
    const page = source("./StudioPage.tsx");

    expect(page).toContain('import("./studio-webgpu-live-stroke-plan")');
    expect(page).not.toContain('import { planStudioGpuLiveStroke } from "./studio-webgpu-stroke"');
    expect(page).toContain("preparedStroke: gpuStartPlan?.preparation");
    expect(page).toContain("direct: overlayDirect && gpuStartPlan !== null");
    expect(page).toContain(
      'const gpuStartEligible = STUDIO_VISIBLE_LIVE_INK_PREFERENCE === "webgpu"'
    );
    expect(page).toContain('webGpuBackendRef.current === "webgpu"');
    expect(page).toContain("const direct = pixelDirect || overlayDirect || gpuPin");
    expect(page).toContain("if (overlayDirect && !gpuPin");
    expect(page).toContain('destination: "transparent-overlay"');
  });

  it("starts one compact journal root and submits every symmetry suffix atomically", () => {
    const page = source("./StudioPage.tsx");

    expect(page).toContain(
      'if (outcome.status === "rejected") {'
    );
    expect(page).toContain("handle.appendPinnedJournalSuffixBatch({");
    expect(page).toContain("previousPointCount: suffix.previousRenderedPointCount");
    expect(page).toContain("suffixPoints: suffix.points");
    expect(page).toContain("suffixPressures: suffix.pressures");
    expect(page).not.toContain("handle.appendPinnedStrokeSuffixBatch({");
    expect(page).not.toContain("handle.appendPinnedStrokeSuffix({");
    expect(page).not.toContain("fallbackStrokes");
    expect(page).not.toContain("gpuLiveInkExposedPointsRef");
    expect(page).not.toContain("gpuLiveInkExposedPressuresRef");
    const flushStart = page.indexOf("const flushDirectLiveDraft = () => {");
    const flushEnd = page.indexOf("const flushDirectLiveDraftNow", flushStart);
    expect(flushStart).toBeGreaterThan(-1);
    expect(flushEnd).toBeGreaterThan(flushStart);
    expect(page.slice(flushStart, flushEnd)).not.toContain("buildGpuLiveStrokePlan(next)");
    expect(page.slice(flushStart, flushEnd)).not.toContain(".slice(previousPointCount");
    expect(page).toContain("...settled.strokes");
    expect(page).toContain("...activeGpuPlan.strokes");
    expect(page).toContain(
      'if (!outcome || outcome.status === "rejected") {'
    );
    expect(page).toContain("pendingGpuStrokesRef.current.length - reserved.gpu");
  });

  it("seals the release endpoint and fails visible to the retained Konva draft", () => {
    const page = source("./StudioPage.tsx");

    expect(page).toContain("appendGpuLiveSourceJournalSuffix(source, true)");
    expect(page).toContain("draftPreviewStoreRef.current.settle(finished)");
    expect(page).toContain("relinquishGpuLiveInkToKonva(true)");
    expect(page).toContain("handle?.replacePinnedStrokes(pendingGpu)");
    expect(page).toContain("liveDraftLayerRef.current?.batchDraw()");
    expect(page).toContain("if (gpuLiveInkPinnedRef.current) relinquishGpuLiveInkToKonva(true)");
  });

  it("fails over synchronously when the engine rejects a compact command", () => {
    const page = source("./StudioPage.tsx");
    const viewport = source("./StudioCanvasViewport.tsx");

    expect(page).toContain('if (outcome.status === "rejected") {');
    expect(page).toContain("gpuLiveSourceJournalRef.current = advanced.state");
    expect(page).toContain("relinquishGpuLiveInkToKonva(true)");
    expect(page).toContain("armGpuPinnedRequestWatchdog(outcome.requestId)");
    expect(page).toContain("STUDIO_GPU_PIN_REQUEST_TIMEOUT_MS");
    expect(page).toContain("new StudioGpuPinReceiptWatchdog({");
    expect(page).toContain("gpuPinReceiptWatchdog().receipt(receipt.requestId)");
    expect(page).toContain("gpuLiveAcceptedRequestIdRef.current = outcome.requestId");
    expect(page).toContain(
      "beginGpuPinnedReceiptEpoch(gpuLiveAcceptedRequestIdRef.current)"
    );
    expect(viewport).toContain("onFrameInvalid={onWebGpuFrameInvalid}");
  });

  it("assigns live operations a monotonic terminal key independent of random element ids", () => {
    const page = source("./StudioPage.tsx");

    expect(page).toContain('const STUDIO_GPU_LIVE_OPERATION_ORDER_PREFIX = "\\uffffstudio-live:"');
    expect(page).toContain("nextGpuLiveOperationOrderKey()");
    expect(page).toContain('String(nextSequence).padStart(16, "0")');
    expect(page).toContain("orderKey: gpuLiveOperationOrderKeyRef.current ?? el.id");
    expect(page).not.toContain("orderKey: el.id,");
  });

  it("does not trust a void repair and keeps an exact final vector until receipt handoff", () => {
    const page = source("./StudioPage.tsx");
    const settleStart = page.indexOf("const settleGpuLiveStroke =");
    const settleEnd = page.indexOf("const flushDirectLiveDraft =", settleStart);
    const settleSource = page.slice(settleStart, settleEnd);

    expect(settleStart).toBeGreaterThan(-1);
    expect(settleEnd).toBeGreaterThan(settleStart);
    expect(settleSource).toContain("gpuFinalReceiptFallbackStrokeRef.current = finished");
    expect(settleSource).toContain("gpuFinalReceiptRequestIdRef.current = correctedEl");
    expect(settleSource).toContain("pendingGpuDrawAuthoritiesRef.current = [");
    expect(settleSource).not.toContain("replacePinnedStrokes(pendingGpuStrokesRef.current)");
    expect(page).toContain(
      "promotePendingGpuAuthoritiesToKonva(gpuFinalFallbackOrderIdsRef.current ?? undefined)"
    );
    expect(page).toContain("draftPreviewStoreRef.current.replaceSettled(promotion.settledDrafts)");
    expect(page).toContain("releaseStudioGpuPendingAuthorityPrefix(");
    expect(page).toContain("webGpuCanvasHandleRef.current?.setPinnedVisible(false)");
  });

  it("hands active and pointerup-settled authority to Konva when its canvas surface disappears", () => {
    const page = source("./StudioPage.tsx");
    const handleStart = page.indexOf("function setWebGpuCanvasHandle(");
    const handleEnd = page.indexOf("function onWebGpuBackendChange", handleStart);
    const handleSource = page.slice(handleStart, handleEnd);
    const lossStart = page.indexOf("function failOverGpuAuthorityAfterSurfaceLoss(");
    const lossEnd = page.indexOf("function setWebGpuCanvasHandle(", lossStart);
    const lossSource = page.slice(lossStart, lossEnd);

    expect(handleStart).toBeGreaterThan(-1);
    expect(lossStart).toBeGreaterThan(-1);
    expect(lossEnd).toBeGreaterThan(lossStart);
    expect(lossSource).toContain("gpuAuthoritySurfaceIsPending()");
    expect(page).toContain("pendingGpuDrawAuthoritiesRef.current.length > 0");
    expect(page).toContain("pendingGpuStrokesRef.current.length > 0");
    expect(lossSource).toContain("relinquishGpuLiveInkToKonva(true)");
    expect(lossSource).toContain("gpuHandleBaselineRecoveryPendingRef.current = !promoted");
    expect(handleSource).toContain("failOverGpuAuthorityAfterSurfaceLoss()");
    expect(handleSource).toContain("restoreStudioGpuPendingBaselineOnHandle({");
    expect(handleSource).toContain("pendingStrokes: pendingGpuStrokesRef.current");

    const deviceLostStart = page.indexOf("function onWebGpuDeviceLost()");
    const deviceLostEnd = page.indexOf("function onWebGpuFrameReady", deviceLostStart);
    const deviceLostSource = page.slice(deviceLostStart, deviceLostEnd);
    expect(deviceLostSource).toContain("failOverGpuAuthorityAfterSurfaceLoss()");
    expect(deviceLostSource).not.toContain("gpuLiveInkPinnedRef.current");
  });

  it("normalizes symmetry releases and preserves the original handoff queue on invariant failure", () => {
    const page = source("./StudioPage.tsx");
    const releaseStart = page.indexOf("function releaseCommittedInkSurfaceCounts(");
    const releaseEnd = page.indexOf("function scheduleCommittedInkSurfaceHandoffRetry", releaseStart);
    const releaseSource = page.slice(releaseStart, releaseEnd);

    expect(releaseStart).toBeGreaterThan(-1);
    expect(releaseEnd).toBeGreaterThan(releaseStart);
    expect(releaseSource).toContain("availableGpuStrokeCount: pendingGpuStrokesRef.current.length");
    expect(releaseSource).toContain("completeElementIds: completeGpuElementIds");
    expect(releaseSource).toContain('if (releasedAuthorities?.status === "rejected") {');
    expect(releaseSource).toContain("const promoted = relinquishGpuLiveInkToKonva(true)");
    expect(releaseSource).not.toContain(
      'releasedAuthorities.status === "released"\n        ? [...releasedAuthorities.remaining]\n        : []'
    );
    expect(releaseSource).toContain("releasedAuthorities.releasedGpuStrokeCount");
    const firstSurfaceCountRead = releaseSource.indexOf("released.overlay > overlayRenderer.settledStrokeCount");
    const gpuAuthorityPlan = releaseSource.indexOf("releaseStudioGpuPendingAuthorityPrefix({");
    expect(firstSurfaceCountRead).toBeGreaterThan(-1);
    expect(firstSurfaceCountRead).toBeLessThan(gpuAuthorityPlan);
    expect(releaseSource.indexOf("replacePinnedJournalBaseline(nextGpuStrokes)")).toBeLessThan(
      releaseSource.indexOf("overlayRenderer.releaseSettledPrefix(released.overlay)")
    );
    expect(releaseSource.match(/released\.overlay > overlayRenderer\.settledStrokeCount/g)).toHaveLength(2);
    expect(releaseSource).toContain(
      "const releasedOverlayCount = overlayRenderer.releaseSettledPrefix(released.overlay)"
    );
    expect(releaseSource).toContain(
      "const releasedDraftCount = draftPreviewStore.releaseSettledPrefix(released.draft)"
    );
    const exactSurfaceReceipt = releaseSource.indexOf(
      "releasedOverlayCount !== released.overlay"
    );
    expect(exactSurfaceReceipt).toBeGreaterThan(-1);
    expect(exactSurfaceReceipt).toBeLessThan(
      releaseSource.indexOf("pendingGpuDrawAuthoritiesRef.current = [...releasedAuthorities.remaining]")
    );
    expect(exactSurfaceReceipt).toBeLessThan(
      releaseSource.indexOf("pendingGpuStrokesRef.current = nextPendingGpuStrokes")
    );
    expect(releaseSource).toContain('reason: "surface-release-mismatch"');
    expect(page).not.toContain("consumeStudioGpuHandoffReservationPrefix(");
    expect(page).toContain("committedInkSurfaceHandoffsRef.current = [...queue]");
    expect(page).toContain('if (releaseOutcome.status === "released") {');
    expect(page).toContain('} else if (releaseOutcome.status === "promoted") {');
  });

  it("requires the full active journal identity before rebaselining a settled prefix", () => {
    const page = source("./StudioPage.tsx");
    const matchStart = page.indexOf("function activeGpuLiveSourceJournalMatchesPlan(");
    const matchEnd = page.indexOf("function beginGpuLiveSourceJournal(", matchStart);
    const matchSource = page.slice(matchStart, matchEnd);

    expect(matchStart).toBeGreaterThan(-1);
    expect(matchEnd).toBeGreaterThan(matchStart);
    expect(matchSource).toContain("studioBrushSymmetryTransforms(el.symmetry)");
    expect(matchSource).toContain("journal.identity.epoch");
    expect(matchSource).toContain("id: plan.strokes[index]!.id");
    expect(matchSource).toContain("sameStudioGpuLiveSourceJournalIdentity(journal.identity, identity)");
    expect(page).toContain("activeGpuLiveSourceJournalMatchesPlan(activeDrawing, activeGpuPlan, activeJournal)");
  });

  it("keeps a ready retained head installed and retries it with a bounded invariant epoch", () => {
    const page = source("./StudioPage.tsx");
    const processStart = page.indexOf("processCommittedInkSurfaceHandoffsRef.current = () => {");
    const processEnd = page.indexOf("useLayoutEffect(() => {", processStart);
    const processSource = page.slice(processStart, processEnd);
    const releasedBranch = processSource.indexOf('if (releaseOutcome.status === "released") {');
    const queueInstall = processSource.indexOf("committedInkSurfaceHandoffsRef.current = [...queue]");
    const retainedRetry = processSource.indexOf("scheduleCommittedInkRetainedRetry(");

    expect(processStart).toBeGreaterThan(-1);
    expect(processEnd).toBeGreaterThan(processStart);
    expect(releasedBranch).toBeGreaterThan(-1);
    expect(queueInstall).toBeGreaterThan(releasedBranch);
    expect(retainedRetry).toBeGreaterThan(queueInstall);
    expect(processSource.slice(retainedRetry)).toContain("return;");
    expect(processSource.slice(retainedRetry)).not.toContain(
      "committedInkSurfaceHandoffsRef.current = [...queue]"
    );
    expect(page).toContain("planStudioCommittedInkRetainedRetry(");
    expect(page).toContain("studioRevisionProjectGenerationRef.current");
    expect(page).toContain("original handoffs and visible authority remain installed");
  });

  it("keeps the mutable source private so coalesced GPU input does not copy its full prefix", () => {
    const page = source("./StudioPage.tsx");

    expect(page).toContain(
      "const ownsCurrentArrays = !mutateDirectly\n      && current.points === drawingFixedRateOwnedPointsRef.current;"
    );
    expect(page).toContain(
      "const immediateBatchMutation = !compactGpuSourceJournalActive"
    );
    expect(page).toContain(
      "&& gpuLiveInkPinnedRef.current\n            && gpuLiveSourceJournalRef.current !== null"
    );
    expect(page).toContain("points: ownsCurrentArrays ? current.points : [...current.points]");
    expect(page).not.toContain("current.points !== gpuLiveInkExposedPointsRef.current");
  });

  it("does not let a transparent GPU overlay impersonate retained-layer erasing", () => {
    const policy = source("./studio-live-ink-backend.ts");

    expect(policy).toContain('composite === "erase" && prepared.destination !== "retained-layer"');
    expect(policy).toContain('return { backend: "canvas2d", reason: "eraser" }');
  });
});
