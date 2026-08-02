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
  };
  operationDiff: StudioNativeRasterPixelDiff | null;
  undo: {
    attempted: boolean;
    restored: boolean;
    retainedEditableRasterWhenExpected: boolean;
    diffFromBefore: StudioNativeRasterPixelDiff | null;
  };
  browserErrors: readonly string[];
  failedResponses: readonly string[];
  failure?: string;
}

function meaningfulPixelChange(diff: StudioNativeRasterPixelDiff | null): boolean {
  return Boolean(
    diff
    && diff.changedPixels >= 8
    && diff.maxChannelDelta >= 4
    && diff.meanChangedChannelDelta >= 0.5,
  );
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
