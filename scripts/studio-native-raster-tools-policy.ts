export const STUDIO_NATIVE_RASTER_REQUIRED_SCENARIOS = [
  "paint-bucket",
  "selection-rect",
  "selection-circle",
  "selection-lasso",
  "filter-whole",
  "filter-inside",
  "filter-outside",
  "smudge",
  "wet-mix",
  "dodge-burn",
  "liquify",
  "heal",
  "crop",
  "pixel-transform",
] as const;

export type StudioNativeRasterRequiredScenarioId =
  (typeof STUDIO_NATIVE_RASTER_REQUIRED_SCENARIOS)[number];

export type StudioNativeRasterScenarioId =
  | StudioNativeRasterRequiredScenarioId
  | "dodge-burn-burn"
  | "liquify-twirl";

export interface StudioNativeRasterPixelDiff {
  changedPixels: number;
  totalPixels: number;
  maxChannelDelta: number;
  meanChangedChannelDelta: number;
}

export interface StudioNativeRasterFixturePoint {
  x: number;
  y: number;
}

export interface StudioNativeRasterFixtureDrawGeometry {
  pointCount: number;
  firstPoint: StudioNativeRasterFixturePoint | null;
  lastPoint: StudioNativeRasterFixturePoint | null;
  hidden: boolean;
}

export const STUDIO_NATIVE_RASTER_FIXTURE_PIXEL_LIMITS = {
  maxChangedPixels: 2_500,
  maxChannelDelta: 160,
  maxMeanChangedChannelDelta: 24,
} as const;

export const STUDIO_NATIVE_RASTER_COLD_REPLAY_MIN_NOISE_EXCLUDED_PIXELS = 128;

export interface StudioNativeRasterFrameIntervalStats {
  sampleCount: number;
  intervalCount: number;
  meanMs: number | null;
  medianMs: number | null;
  p95Ms: number | null;
  maxMs: number | null;
  over50MsCount: number;
  over100MsCount: number;
}

export interface StudioNativeRasterLongTaskStats {
  supported: boolean;
  count: number;
  totalDurationMs: number;
  maxDurationMs: number | null;
}

export interface StudioNativeRasterDragPerformanceEvidence {
  pathPointCount: number;
  moveStepsPerSegment: number;
  configuredStepDelayMs: number;
  expectedPointerMoveCount: number;
  observedTrustedPointerMoveCount: number;
  frameIntervals: StudioNativeRasterFrameIntervalStats;
  longTasks: StudioNativeRasterLongTaskStats;
  reactProfiler: {
    source: "studio-profiler-buffer" | "armed-studio-render-counter";
    commitCount: number;
    actualDurationMs: number | null;
    editorRenderCount: number;
    canvasRenderCount: number;
    operationEditorRenderCount: number;
    operationCanvasRenderCount: number;
  };
}

export interface StudioNativeRasterWarmPerformanceEvidence {
  measurement: "second-trusted-pointer-stroke";
  readiness: "editable-raster-and-tool-ready";
  computeSettleFence: "tool-busy-control-enabled";
  operationSettleFence: "exact-raster-src-konva-layer-draw";
  persistenceFence: "post-effect-autosave-image-signature";
  wall: {
    pointerDownToPointerUpMs: number | null;
    pointerUpToEditableImageSignatureMs: number | null;
    pointerUpToBusySettledMs: number | null;
    pointerUpToOperationSettledMs: number | null;
  };
  operationLongTasks: StudioNativeRasterLongTaskStats;
  drag: StudioNativeRasterDragPerformanceEvidence;
  completion: {
    observation: "effect-autosave-signature-after-busy-settle";
    baselineImageSignature: string;
    observedImageSignature: string | null;
    finalImageSignature: string | null;
    signatureChanged: boolean;
    busySettled: boolean;
    busyTransitionObserved: boolean;
    exactRasterPresentation: boolean;
    presentedElementId: string | null;
    undoRestoredColdBaseline: boolean | null;
  };
}

export interface StudioNativeRasterPerformanceEvidence {
  /** Performance observations are advisory and never change the functional scenario verdict. */
  policy: "report-only";
  cold: {
    measurement:
      | "retouch-activation-preparation-and-first-replayed-stroke"
      | "heal-first-stroke-on-prepared-raster";
    readiness:
      | "native-vector-before-tool-activation"
      | "editable-raster-and-heal-source-ready";
    computeSettleFence: "tool-busy-control-enabled";
    operationSettleFence: "exact-raster-src-konva-layer-draw";
    persistenceFence: "post-effect-autosave-image-signature";
    activationToPointerDownMs: number | null;
    activationToEditableImageSignatureMs: number | null;
    pointerUpToEditableImageSignatureMs: number | null;
  };
  wall: {
    dragMs: number | null;
    pointerDownToOperationSettledMs: number | null;
    pointerUpToOperationSettledMs: number | null;
    activationToOperationSettledMs: number | null;
    pointerUpToBusySettledMs: number | null;
    activationToBusySettledMs: number | null;
  };
  operationLongTasks: StudioNativeRasterLongTaskStats;
  drag: StudioNativeRasterDragPerformanceEvidence;
  editableImage: {
    id: string | null;
    documentWidth: number | null;
    documentHeight: number | null;
    pixelWidth: number | null;
    pixelHeight: number | null;
  };
  completion: {
    observation: "effect-autosave-signature-after-busy-settle";
    baselineImageSignature: string;
    observedImageSignature: string | null;
    finalImageSignature: string | null;
    signatureChanged: boolean;
    busySettled: boolean;
    busyTransitionObserved: boolean;
    exactRasterPresentation: boolean;
    presentedElementId: string | null;
  };
  warm: StudioNativeRasterWarmPerformanceEvidence;
}

export interface StudioNativeRasterScenarioEvidence {
  id: StudioNativeRasterScenarioId;
  status: "passed" | "failed";
  fixture: {
    usedExternalImageFixture: boolean;
    trustedCanvasPointerDowns: number;
    trustedCanvasPointerMoves: number;
    trustedCanvasPointerUps: number;
    drawCount: number;
    closedOutlinePointCount: number;
    closedOutlineEndpointDistance: number;
    internalLinePointCount: number;
  };
  activation: {
    inactiveBefore: boolean;
    activeAfter: boolean;
  };
  editableRaster: {
    expected: boolean;
    createdImage: boolean;
    nativeDrawCount: number;
    hiddenNativeDrawCount: number;
    selectedImageObserved: boolean | null;
  };
  firstGesture: {
    expected: boolean;
    replayed: boolean | null;
    /** Bounded visual variation between independently drawn native fixtures. */
    fixtureControlDiff: StudioNativeRasterPixelDiff | null;
    /** Cold-effect pixels remaining after the fixture-noise mask is expanded by two pixels. */
    noiseExcludedChangedPixels: number | null;
    /** Cold retouch output compared with a separately prepared raster-only control. */
    rasterControlDiff: StudioNativeRasterPixelDiff | null;
  };
  operationDiff: StudioNativeRasterPixelDiff | null;
  undo: {
    attempted: boolean;
    restored: boolean;
    retainedEditableRasterWhenExpected: boolean;
    /** Raw diagnostic diff, including transient selection chrome. */
    rawDiffFromBefore: StudioNativeRasterPixelDiff | null;
    /** Authoritative document-pixel diff after scenario-specific chrome exclusion. */
    diffFromBefore: StudioNativeRasterPixelDiff | null;
    selectionStateCleared: boolean | null;
    durableSnapshotRetained: boolean | null;
    durableImageRestored: boolean | null;
    exactRestoredImagePresented: boolean | null;
    documentRedoEnabledAfterUndo: boolean | null;
  };
  performance: StudioNativeRasterPerformanceEvidence | null;
  browserErrors: readonly string[];
  failedResponses: readonly string[];
  failure?: string;
}

/**
 * Deliberately generous advisory thresholds. Browser load and CI host contention must not make the
 * native-raster functional gate flaky; these values only make suspicious samples visible in JSON
 * and CLI output while a representative baseline is collected.
 */
export const STUDIO_NATIVE_RASTER_PERFORMANCE_WARNING_BUDGETS = {
  maxDragFrameIntervalMs: 250,
  maxDragLongTaskMs: 1_000,
  maxOperationLongTaskMs: 2_000,
  maxPointerUpToOperationSettledMs: 15_000,
  maxDragReactProfilerCommits: 50,
} as const;

const STUDIO_NATIVE_RASTER_PERFORMANCE_SCENARIOS = new Set<StudioNativeRasterScenarioId>([
  "smudge",
  "wet-mix",
  "dodge-burn",
  "liquify",
  "heal",
]);

const STUDIO_NATIVE_RASTER_COLD_REPLAY_SCENARIOS = new Set<StudioNativeRasterScenarioId>([
  "smudge",
  "wet-mix",
  "dodge-burn",
  "liquify",
]);

export function studioNativeRasterPerformanceWarnings(
  evidence: StudioNativeRasterScenarioEvidence,
): string[] {
  if (!STUDIO_NATIVE_RASTER_PERFORMANCE_SCENARIOS.has(evidence.id)) return [];
  const performance = evidence.performance;
  if (!performance) return [`${evidence.id}: performance observation is unavailable`];

  const warnings: string[] = [];
  if (!performance.completion.signatureChanged) {
    warnings.push(`${evidence.id}: editable image signature change was not observed`);
  }
  if (!performance.completion.busySettled) {
    warnings.push(`${evidence.id}: cold busy-settle observation is unavailable`);
  }
  if (!performance.completion.busyTransitionObserved) {
    warnings.push(`${evidence.id}: cold busy transition was not observed`);
  }
  if (!performance.completion.exactRasterPresentation) {
    warnings.push(`${evidence.id}: cold exact raster presentation was not observed`);
  }
  if (
    performance.drag.observedTrustedPointerMoveCount
      !== performance.drag.expectedPointerMoveCount
  ) {
    warnings.push(
      `${evidence.id}: cold trusted pointermove count ${performance.drag.observedTrustedPointerMoveCount} did not match expected ${performance.drag.expectedPointerMoveCount}`,
    );
  }
  if (performance.drag.frameIntervals.intervalCount === 0) {
    warnings.push(`${evidence.id}: cold drag rAF intervals were not observed`);
  }
  const maxFrame = performance.drag.frameIntervals.maxMs;
  if (
    maxFrame !== null
    && maxFrame > STUDIO_NATIVE_RASTER_PERFORMANCE_WARNING_BUDGETS.maxDragFrameIntervalMs
  ) {
    warnings.push(`${evidence.id}: drag max rAF interval ${maxFrame}ms exceeded advisory budget`);
  }
  const maxLongTask = performance.drag.longTasks.maxDurationMs;
  if (
    maxLongTask !== null
    && maxLongTask > STUDIO_NATIVE_RASTER_PERFORMANCE_WARNING_BUDGETS.maxDragLongTaskMs
  ) {
    warnings.push(`${evidence.id}: drag long task ${maxLongTask}ms exceeded advisory budget`);
  }
  const maxOperationLongTask = performance.operationLongTasks.maxDurationMs;
  if (
    maxOperationLongTask !== null
    && maxOperationLongTask
      > STUDIO_NATIVE_RASTER_PERFORMANCE_WARNING_BUDGETS.maxOperationLongTaskMs
  ) {
    warnings.push(
      `${evidence.id}: pointerup operation long task ${maxOperationLongTask}ms exceeded advisory budget`,
    );
  }
  const settled = performance.wall.pointerUpToOperationSettledMs;
  if (
    settled !== null
    && settled
      > STUDIO_NATIVE_RASTER_PERFORMANCE_WARNING_BUDGETS.maxPointerUpToOperationSettledMs
  ) {
    warnings.push(`${evidence.id}: pointerup-to-settled ${settled}ms exceeded advisory budget`);
  }
  if (
    performance.drag.reactProfiler.commitCount
      > STUDIO_NATIVE_RASTER_PERFORMANCE_WARNING_BUDGETS.maxDragReactProfilerCommits
  ) {
    warnings.push(
      `${evidence.id}: drag React commit count ${performance.drag.reactProfiler.commitCount} exceeded advisory budget`,
    );
  }
  if (!performance.warm.completion.signatureChanged) {
    warnings.push(`${evidence.id}: warm editable image signature change was not observed`);
  }
  if (!performance.warm.completion.busySettled) {
    warnings.push(`${evidence.id}: warm busy-settle observation is unavailable`);
  }
  if (!performance.warm.completion.busyTransitionObserved) {
    warnings.push(`${evidence.id}: warm busy transition was not observed`);
  }
  if (!performance.warm.completion.exactRasterPresentation) {
    warnings.push(`${evidence.id}: warm exact raster presentation was not observed`);
  }
  if (
    performance.warm.drag.observedTrustedPointerMoveCount
      !== performance.warm.drag.expectedPointerMoveCount
  ) {
    warnings.push(
      `${evidence.id}: warm trusted pointermove count ${performance.warm.drag.observedTrustedPointerMoveCount} did not match expected ${performance.warm.drag.expectedPointerMoveCount}`,
    );
  }
  if (performance.warm.drag.frameIntervals.intervalCount === 0) {
    warnings.push(`${evidence.id}: warm drag rAF intervals were not observed`);
  }
  if (performance.warm.completion.undoRestoredColdBaseline === false) {
    warnings.push(`${evidence.id}: warm stroke Undo did not restore the cold baseline`);
  }
  const warmMaxFrame = performance.warm.drag.frameIntervals.maxMs;
  if (
    warmMaxFrame !== null
    && warmMaxFrame > STUDIO_NATIVE_RASTER_PERFORMANCE_WARNING_BUDGETS.maxDragFrameIntervalMs
  ) {
    warnings.push(
      `${evidence.id}: warm drag max rAF interval ${warmMaxFrame}ms exceeded advisory budget`,
    );
  }
  const warmMaxLongTask = performance.warm.drag.longTasks.maxDurationMs;
  if (
    warmMaxLongTask !== null
    && warmMaxLongTask > STUDIO_NATIVE_RASTER_PERFORMANCE_WARNING_BUDGETS.maxDragLongTaskMs
  ) {
    warnings.push(
      `${evidence.id}: warm drag long task ${warmMaxLongTask}ms exceeded advisory budget`,
    );
  }
  const warmMaxOperationLongTask = performance.warm.operationLongTasks.maxDurationMs;
  if (
    warmMaxOperationLongTask !== null
    && warmMaxOperationLongTask
      > STUDIO_NATIVE_RASTER_PERFORMANCE_WARNING_BUDGETS.maxOperationLongTaskMs
  ) {
    warnings.push(
      `${evidence.id}: warm pointerup operation long task ${warmMaxOperationLongTask}ms exceeded advisory budget`,
    );
  }
  const warmSettled = performance.warm.wall.pointerUpToOperationSettledMs;
  if (
    warmSettled !== null
    && warmSettled
      > STUDIO_NATIVE_RASTER_PERFORMANCE_WARNING_BUDGETS.maxPointerUpToOperationSettledMs
  ) {
    warnings.push(
      `${evidence.id}: warm pointerup-to-settled ${warmSettled}ms exceeded advisory budget`,
    );
  }
  if (
    performance.warm.drag.reactProfiler.commitCount
      > STUDIO_NATIVE_RASTER_PERFORMANCE_WARNING_BUDGETS.maxDragReactProfilerCommits
  ) {
    warnings.push(
      `${evidence.id}: warm drag React commit count ${performance.warm.drag.reactProfiler.commitCount} exceeded advisory budget`,
    );
  }
  return warnings;
}

function meaningfulPixelChange(diff: StudioNativeRasterPixelDiff | null): boolean {
  return Boolean(
    diff
    && diff.changedPixels >= 8
    && diff.maxChannelDelta >= 4
    && diff.meanChangedChannelDelta >= 0.5,
  );
}

function fixturePointDistance(
  first: StudioNativeRasterFixturePoint,
  second: StudioNativeRasterFixturePoint,
): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

/**
 * Compares the fixture's user-visible geometry rather than its scheduler-dependent internal
 * sampling cardinality. Adaptive stabilization may persist a different number of intermediate
 * points for two trusted pointer sessions even when their endpoints and rendered pixels match.
 */
export function studioNativeRasterFixtureGeometryEquivalent(
  measured: readonly StudioNativeRasterFixtureDrawGeometry[],
  control: readonly StudioNativeRasterFixtureDrawGeometry[],
  endpointTolerance = 0.75,
): boolean {
  if (measured.length !== 2 || control.length !== 2) return false;
  return measured.every((measuredDraw, index) => {
    const controlDraw = control[index];
    const minimumPointCount = index === 0 ? 5 : 3;
    return Boolean(
      controlDraw
      && measuredDraw.pointCount >= minimumPointCount
      && controlDraw.pointCount >= minimumPointCount
      && measuredDraw.hidden === controlDraw.hidden
      && measuredDraw.firstPoint
      && controlDraw.firstPoint
      && fixturePointDistance(measuredDraw.firstPoint, controlDraw.firstPoint)
        <= endpointTolerance
      && measuredDraw.lastPoint
      && controlDraw.lastPoint
      && fixturePointDistance(measuredDraw.lastPoint, controlDraw.lastPoint)
        <= endpointTolerance
    );
  });
}

/**
 * Allows only the bounded anti-aliasing variation measured between independent trusted-pointer
 * sessions. The semantic geometry and nonblank presentation guards run before this pixel policy.
 */
export function studioNativeRasterFixturePixelsSimilar(
  diff: StudioNativeRasterPixelDiff,
): boolean {
  return Number.isSafeInteger(diff.changedPixels)
    && Number.isSafeInteger(diff.totalPixels)
    && diff.totalPixels > 0
    && diff.changedPixels >= 0
    && diff.changedPixels <= diff.totalPixels
    && diff.changedPixels <= STUDIO_NATIVE_RASTER_FIXTURE_PIXEL_LIMITS.maxChangedPixels
    && Number.isFinite(diff.maxChannelDelta)
    && diff.maxChannelDelta >= 0
    && diff.maxChannelDelta <= STUDIO_NATIVE_RASTER_FIXTURE_PIXEL_LIMITS.maxChannelDelta
    && Number.isFinite(diff.meanChangedChannelDelta)
    && diff.meanChangedChannelDelta >= 0
    && diff.meanChangedChannelDelta
      <= STUDIO_NATIVE_RASTER_FIXTURE_PIXEL_LIMITS.maxMeanChangedChannelDelta;
}

export function studioNativeRasterNoiseExcludedChangedPixels(
  fixtureNoise: Uint8Array,
  effectChange: Uint8Array,
  width: number,
  height: number,
  radius = 2,
): number {
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
    || fixtureNoise.length !== width * height
    || effectChange.length !== fixtureNoise.length
    || !Number.isSafeInteger(radius)
    || radius < 0
  ) return 0;
  const excluded = new Uint8Array(fixtureNoise.length);
  for (let pixel = 0; pixel < fixtureNoise.length; pixel += 1) {
    if (fixtureNoise[pixel] !== 1) continue;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
      const candidateY = y + offsetY;
      if (candidateY < 0 || candidateY >= height) continue;
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        const candidateX = x + offsetX;
        if (candidateX < 0 || candidateX >= width) continue;
        if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
        excluded[candidateY * width + candidateX] = 1;
      }
    }
  }
  let uniqueChangedPixels = 0;
  for (let pixel = 0; pixel < effectChange.length; pixel += 1) {
    if (effectChange[pixel] === 1 && excluded[pixel] !== 1) uniqueChangedPixels += 1;
  }
  return uniqueChangedPixels;
}

export function studioNativeRasterScenarioViolations(
  evidence: StudioNativeRasterScenarioEvidence,
): string[] {
  const issues: string[] = [];
  if (evidence.status !== "passed") {
    issues.push(`${evidence.id}: scenario did not complete${evidence.failure ? ` (${evidence.failure})` : ""}`);
  }
  if (evidence.fixture.usedExternalImageFixture) {
    issues.push(`${evidence.id}: fixture used an external/imported image`);
  }
  if (
    evidence.fixture.trustedCanvasPointerDowns < 2
    || evidence.fixture.trustedCanvasPointerMoves < 4
    || evidence.fixture.trustedCanvasPointerUps < 2
  ) {
    issues.push(`${evidence.id}: closed outline and internal line were not created by trusted canvas pointer input`);
  }
  if (evidence.fixture.drawCount !== 2) {
    issues.push(`${evidence.id}: native fixture persisted ${evidence.fixture.drawCount} draws instead of exactly 2`);
  }
  if (
    evidence.fixture.closedOutlinePointCount < 5
    || evidence.fixture.closedOutlineEndpointDistance > 8
  ) {
    issues.push(`${evidence.id}: first native stroke is not a persisted closed outline`);
  }
  if (evidence.fixture.internalLinePointCount < 3) {
    issues.push(`${evidence.id}: second native stroke is not a persisted internal line`);
  }
  if (!evidence.activation.inactiveBefore || !evidence.activation.activeAfter) {
    issues.push(`${evidence.id}: inactive-to-active UI transition was not observed`);
  }
  if (evidence.editableRaster.expected && !evidence.editableRaster.createdImage) {
    issues.push(`${evidence.id}: editable-raster copy was not created`);
  }
  if (
    evidence.editableRaster.expected
    && evidence.editableRaster.nativeDrawCount < 2
  ) {
    issues.push(`${evidence.id}: editable-raster copy did not preserve both native sources`);
  }
  if (
    evidence.editableRaster.expected
    && evidence.id !== "filter-whole"
    && evidence.editableRaster.hiddenNativeDrawCount < 2
  ) {
    issues.push(`${evidence.id}: destructive pixel target did not hide both preserved native sources`);
  }
  if (
    evidence.id === "filter-whole"
    && evidence.editableRaster.hiddenNativeDrawCount !== 0
  ) {
    issues.push(`${evidence.id}: non-destructive page-filter layer did not preserve visible native sources`);
  }
  if (evidence.firstGesture.expected && evidence.firstGesture.replayed !== true) {
    issues.push(`${evidence.id}: first pointer gesture was not proven durable`);
  }
  if (
    STUDIO_NATIVE_RASTER_COLD_REPLAY_SCENARIOS.has(evidence.id)
    && !meaningfulPixelChange(evidence.firstGesture.rasterControlDiff)
  ) {
    issues.push(
      `${evidence.id}: cold first gesture was not distinguished from raster preparation`,
    );
  }
  if (
    STUDIO_NATIVE_RASTER_COLD_REPLAY_SCENARIOS.has(evidence.id)
    && (evidence.firstGesture.noiseExcludedChangedPixels ?? 0)
      < STUDIO_NATIVE_RASTER_COLD_REPLAY_MIN_NOISE_EXCLUDED_PIXELS
  ) {
    issues.push(
      `${evidence.id}: cold first gesture did not exceed the expanded fixture-noise mask`,
    );
  }
  if (!meaningfulPixelChange(evidence.operationDiff)) {
    issues.push(`${evidence.id}: before/after evidence has no meaningful pixel change`);
  }
  if (
    !evidence.undo.attempted
    || !evidence.undo.restored
    || !evidence.undo.retainedEditableRasterWhenExpected
  ) {
    issues.push(`${evidence.id}: one-step Undo contract failed`);
  }
  if (
    evidence.id.startsWith("selection-")
    && (
      evidence.undo.selectionStateCleared !== true
      || evidence.undo.durableSnapshotRetained !== true
    )
  ) {
    issues.push(
      `${evidence.id}: selection Undo did not clear transient state while retaining the durable document`,
    );
  }
  if (
    evidence.id === "pixel-transform"
    && (
      evidence.undo.durableImageRestored !== true
      || evidence.undo.exactRestoredImagePresented !== true
      || evidence.undo.documentRedoEnabledAfterUndo !== true
    )
  ) {
    issues.push(
      "pixel-transform: Undo lacked exact durable-image restoration or document Redo authority",
    );
  }
  if (evidence.browserErrors.length > 0) {
    issues.push(`${evidence.id}: ${evidence.browserErrors.length} unexpected browser error(s)`);
  }
  if (evidence.failedResponses.length > 0) {
    issues.push(`${evidence.id}: ${evidence.failedResponses.length} unexpected 5xx response(s)`);
  }
  return issues;
}

export function studioNativeRasterMatrixViolations(
  evidence: readonly StudioNativeRasterScenarioEvidence[],
): string[] {
  const issues: string[] = [];
  const ids = new Set(evidence.map((entry) => entry.id));
  for (const id of STUDIO_NATIVE_RASTER_REQUIRED_SCENARIOS) {
    if (!ids.has(id)) issues.push(`matrix: missing required scenario ${id}`);
  }
  const duplicateIds = evidence
    .map((entry) => entry.id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  for (const id of new Set(duplicateIds)) issues.push(`matrix: duplicate scenario ${id}`);
  for (const entry of evidence) issues.push(...studioNativeRasterScenarioViolations(entry));
  return issues;
}
