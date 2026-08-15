import {
  normalizeStudioBrushDynamicsSettings,
  studioBrushDynamicsPresetSettings,
} from "./studio-brush-dynamics";

import type { DrawEl, El } from "./studio-element-model";
import type { StudioLiveGesturePreviewRendererSnapshot } from "./studio-live-gesture-preview";
import type {
  StudioLiveGesturePreviewSnapshot,
  StudioLiveGesturePreviewSnapshotEntry,
} from "./studio-live-gesture-preview-store";

function previewBrushDynamics(
  renderer: StudioLiveGesturePreviewRendererSnapshot,
): DrawEl["brushDynamics"] {
  const preview = renderer.brushDynamics;
  if (!preview) return undefined;
  const preset = studioBrushDynamicsPresetSettings(preview.presetId);
  return normalizeStudioBrushDynamicsSettings({
    ...preset,
    seed: preview.seed,
    fallbackPressure: preview.fallbackPressure,
    ...(preview.minimumDiameterRatio === undefined
      ? {}
      : { minimumDiameterRatio: preview.minimumDiameterRatio }),
    ...(preview.spacingRatio === undefined
      ? {}
      : { spacingRatio: preview.spacingRatio }),
    ...(preview.scatterRatio === undefined
      ? {}
      : { scatterRatio: preview.scatterRatio }),
  });
}

function operationMatchesRenderer(
  entry: StudioLiveGesturePreviewSnapshotEntry,
): boolean {
  const renderer = entry.renderer;
  if (!renderer) return false;
  switch (entry.operation) {
    case "draw":
      return renderer.kind === "freehand"
        && renderer.mode === "pen"
        && renderer.fill === undefined;
    case "erase":
      return renderer.kind === "freehand"
        && renderer.mode === "eraser"
        && renderer.fill === undefined;
    case "lasso-fill":
      return renderer.kind === "freehand"
        && renderer.mode === "pen"
        && renderer.fill !== undefined;
    case "shape":
      return Boolean(
        entry.shape
        && renderer.kind !== "freehand"
        && renderer.kind === entry.shape.kind
        && renderer.mode === "pen",
      );
    case "retouch":
      return false;
  }
}

function copySampleChannels(
  entry: StudioLiveGesturePreviewSnapshotEntry,
): Partial<DrawEl> {
  const samples = entry.samples;
  if (!samples) return {};
  return {
    ...(samples.pressures ? { pressures: [...samples.pressures] } : {}),
    ...(samples.tiltXs ? { tiltXs: [...samples.tiltXs] } : {}),
    ...(samples.tiltYs ? { tiltYs: [...samples.tiltYs] } : {}),
    ...(samples.twists ? { twists: [...samples.twists] } : {}),
    ...(samples.speeds ? { speeds: [...samples.speeds] } : {}),
    ...(samples.tangentialPressures
      ? { tangentialPressures: [...samples.tangentialPressures] }
      : {}),
    ...(samples.altitudeAngles
      ? { altitudeAngles: [...samples.altitudeAngles] }
      : {}),
    ...(samples.azimuthAngles
      ? { azimuthAngles: [...samples.azimuthAngles] }
      : {}),
    ...(samples.contactWidths
      ? { contactWidths: [...samples.contactWidths] }
      : {}),
    ...(samples.contactHeights
      ? { contactHeights: [...samples.contactHeights] }
      : {}),
    ...(samples.sampleTimeOffsets
      ? { sampleTimeOffsets: [...samples.sampleTimeOffsets] }
      : {}),
  };
}

/**
 * Converts one strict store entry into a disposable DrawEl for the retained `activeDraft` lane.
 * The result must never enter history, export, hit testing, or the authoritative CRDT document.
 */
export function projectStudioLiveGesturePreviewEntry(
  entry: StudioLiveGesturePreviewSnapshotEntry,
): DrawEl | null {
  if (!operationMatchesRenderer(entry) || entry.retouch) return null;
  const renderer = entry.renderer!;
  const shape = entry.shape;
  const samples = entry.samples;
  const points = entry.operation === "shape"
    ? shape
      ? [shape.x0, shape.y0, shape.x1, shape.y1]
      : null
    : samples
      && samples.points.length / 2 === entry.sampleCount
      && entry.sampleCount > 0
      ? [...samples.points]
      : null;
  if (!points) return null;

  let brushDynamics: DrawEl["brushDynamics"];
  try {
    brushDynamics = previewBrushDynamics(renderer);
  } catch {
    return null;
  }

  return {
    id: entry.gestureId,
    type: "draw",
    kind: renderer.kind,
    mode: renderer.mode,
    points,
    stroke: renderer.stroke,
    strokeWidth: renderer.strokeWidth,
    ...(renderer.opacity === undefined ? {} : { opacity: renderer.opacity }),
    ...(renderer.fill === undefined ? {} : { fill: renderer.fill }),
    ...(renderer.brush === undefined ? {} : { brush: renderer.brush }),
    ...(renderer.brushCatalogId === undefined
      ? {}
      : { brushCatalogId: renderer.brushCatalogId }),
    ...(renderer.brushCatalogName === undefined
      ? {}
      : { brushCatalogName: renderer.brushCatalogName }),
    ...(renderer.sampleSpacing === undefined
      ? {}
      : { sampleSpacing: renderer.sampleSpacing }),
    ...(renderer.blendMode === undefined ? {} : { blendMode: renderer.blendMode }),
    ...(renderer.paintModel === undefined ? {} : { paintModel: renderer.paintModel }),
    ...(renderer.pressureModel === undefined
      ? {}
      : { pressureModel: renderer.pressureModel }),
    ...(renderer.materialPressureModel === undefined
      ? {}
      : { materialPressureModel: renderer.materialPressureModel }),
    ...(renderer.materialMinimumDiameterRatio === undefined
      ? {}
      : { materialMinimumDiameterRatio: renderer.materialMinimumDiameterRatio }),
    ...(renderer.watercolorPipeline === undefined
      ? {}
      : { watercolorPipeline: renderer.watercolorPipeline }),
    ...(renderer.stampPipeline === undefined
      ? {}
      : { stampPipeline: renderer.stampPipeline }),
    ...(renderer.brushTip ? { brushTip: { ...renderer.brushTip } } : {}),
    ...(renderer.strokeStyle
      ? { strokeStyle: { ...renderer.strokeStyle } }
      : {}),
    ...(renderer.shapeParams
      ? { shapeParams: { ...renderer.shapeParams } }
      : {}),
    ...(renderer.sketch ? { sketch: { ...renderer.sketch } } : {}),
    ...(renderer.symmetry ? { symmetry: { ...renderer.symmetry } } : {}),
    ...(brushDynamics ? { brushDynamics } : {}),
    ...copySampleChannels(entry),
  };
}

export function projectStudioLiveGesturePreviewSnapshot(
  snapshot: StudioLiveGesturePreviewSnapshot,
): readonly DrawEl[] {
  const projected: DrawEl[] = [];
  for (const entry of snapshot) {
    const element = projectStudioLiveGesturePreviewEntry(entry);
    if (element) projected.push(element);
  }
  return projected;
}

function drawKind(element: DrawEl): NonNullable<DrawEl["kind"]> {
  return element.kind ?? "freehand";
}

function shapeEndpointsMatch(authoritative: DrawEl, preview: DrawEl): boolean {
  return drawKind(authoritative) === drawKind(preview)
    && authoritative.points.length >= 4
    && authoritative.points[0] === preview.points[0]
    && authoritative.points[1] === preview.points[1]
    && authoritative.points[2] === preview.points[2]
    && authoritative.points[3] === preview.points[3];
}

function reconcileDrawElement(authoritative: El, preview: DrawEl): El {
  if (authoritative.type !== "draw") return authoritative;
  const previewKind = drawKind(preview);
  const authoritativeKind = drawKind(authoritative);
  if (previewKind === "freehand") {
    if (authoritativeKind !== "freehand") return authoritative;
    const authoritativeSampleCount = Math.floor(authoritative.points.length / 2);
    const previewSampleCount = Math.floor(preview.points.length / 2);
    return authoritativeSampleCount >= previewSampleCount ? authoritative : preview;
  }
  if (authoritativeKind !== previewKind) return authoritative;
  return shapeEndpointsMatch(authoritative, preview) ? authoritative : preview;
}

/**
 * Produces one paint slot per id during the speculative→CRDT handoff. A lagging authoritative
 * element is replaced in place, never painted beside its preview, so alpha and destination-out
 * cannot be applied twice. Once authoritative geometry catches up, its original object wins.
 */
export function mergeStudioLiveGesturePreviewElements(
  authoritative: readonly El[],
  snapshot: StudioLiveGesturePreviewSnapshot,
  eligiblePreviewKeys: ReadonlySet<string>,
): readonly El[] {
  // Eligibility is pinned by the adapter only when this exact sender+gesture key began while its
  // authoritative id was absent. Without that evidence, an id-reuse packet could temporarily
  // replace another peer's pre-existing CRDT element.
  if (!eligiblePreviewKeys || typeof eligiblePreviewKeys.has !== "function") {
    return authoritative;
  }
  const projected: DrawEl[] = [];
  for (const entry of snapshot) {
    if (!eligiblePreviewKeys.has(entry.key)) continue;
    const preview = projectStudioLiveGesturePreviewEntry(entry);
    if (preview) projected.push(preview);
  }
  const previewIdCounts = new Map<string, number>();
  for (const preview of projected) {
    previewIdCounts.set(preview.id, (previewIdCounts.get(preview.id) ?? 0) + 1);
  }

  const authoritativeIndex = new Map<string, number>();
  const duplicateAuthoritativeIds = new Set<string>();
  for (const [index, element] of authoritative.entries()) {
    if (authoritativeIndex.has(element.id)) duplicateAuthoritativeIds.add(element.id);
    else authoritativeIndex.set(element.id, index);
  }

  let merged: El[] | null = null;
  for (const preview of projected) {
    if (
      previewIdCounts.get(preview.id) !== 1
      || duplicateAuthoritativeIds.has(preview.id)
    ) continue;
    const index = authoritativeIndex.get(preview.id);
    if (index === undefined) {
      merged ??= [...authoritative];
      authoritativeIndex.set(preview.id, merged.length);
      merged.push(preview);
      continue;
    }
    const current = (merged ?? authoritative)[index]!;
    const reconciled = reconcileDrawElement(current, preview);
    if (reconciled === current) continue;
    merged ??= [...authoritative];
    merged[index] = reconciled;
  }
  return merged ?? authoritative;
}
