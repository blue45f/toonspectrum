/** Real Canvas2D product renderer audit. Not a substitute for pen-device or WebGPU testing. */
import { materializeStudioBrushPackSelection } from "../apps/web/src/domains/creator/brush/studio-brush-pack-runtime";
import { STUDIO_MATERIAL_BRUSH_IDS, studioMaterialBrushDefinition } from "../apps/web/src/domains/creator/brush/studio-material-brush-catalog";
import { planStudioDynamicBrushCoverageMarks, renderStudioDynamicBrushCoverage } from "../apps/web/src/domains/creator/studio-dynamic-brush-coverage-renderer";
import { planStudioDynamicBrushRender } from "../apps/web/src/domains/creator/studio-dynamic-brush-render-plan";

import type { DrawEl } from "../apps/web/src/domains/creator/studio-element-model";

function invariant(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
function canvas(width: number, height: number): HTMLCanvasElement {
  const result = document.createElement("canvas"); result.width = width; result.height = height; return result;
}
function element(id: string, pressure?: number, tilt = 20, size = 48, samples = 96): DrawEl {
  const selection = materializeStudioBrushPackSelection(id);
  invariant(selection, `missing selection: ${id}`);
  const points: number[] = [], pressures: number[] = [], speeds: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t = i / (samples - 1);
    points.push(42 + t * 360, 78 + Math.sin(t * Math.PI * 2) * 29);
    pressures.push(pressure ?? 0.12 + 0.83 * Math.sin(Math.PI * t)); speeds.push(0.6);
  }
  return {
    id: "material-browser-equal-input", type: "draw", kind: "freehand", points,
    pressures, speeds, tiltXs: points.filter((_, i) => i % 2 === 0).map(() => tilt),
    tiltYs: points.filter((_, i) => i % 2 === 0).map(() => tilt / 2),
    brush: selection.runtimeBrushId, brushCatalogId: selection.catalogId,
    brushDynamics: selection.brushDynamics, stroke: "#244358", strokeWidth: size, opacity: 1,
  };
}
function render(source: DrawEl, live = false, dpr = 1) {
  const target = canvas(450 * dpr, 164 * dpr);
  const ctx = target.getContext("2d")!; ctx.scale(dpr, dpr);
  const started = performance.now();
  const planned = planStudioDynamicBrushRender(source, source.brush!, live);
  invariant(planned.status === "ready", `${source.brushCatalogId}: rejected plan`);
  const p = planned.plan;
  const coverage = planStudioDynamicBrushCoverageMarks({
    dabVariations: p.dabVariations, dynamics: p.dynamics, dynamicSeed: p.seed,
    stroke: source.stroke, stampGrid: p.renderBudget.stampGrid, markBudget: p.markBudget,
    materialIdentity: p.materialIdentity, ...(p.paper ? { paper: p.paper } : {}),
  });
  invariant(coverage.ok, `${source.brushCatalogId}: rejected coverage`);
  const planningMs = performance.now() - started;
  const drawStart = performance.now();
  const receipt = renderStudioDynamicBrushCoverage(ctx, coverage.marks, {
    activeDraft: live, opacity: source.opacity ?? 1, surfaceFactory: canvas,
  });
  const submissionMs = performance.now() - drawStart;
  invariant(receipt.status === "rendered", `${source.brushCatalogId}: unrendered`);
  invariant(receipt.allocatedBytes < 16 * 1024 * 1024, "unbounded scratch allocation");
  const rgba = ctx.getImageData(0, 0, target.width, target.height).data;
  let mass = 0, visible = 0;
  for (let i = 3; i < rgba.length; i += 4) { mass += rgba[i]!; if (rgba[i]! > 8) visible++; }
  return { target, rgba, mass, visible, planningMs, submissionMs, marks: coverage.marks.length, bytes: receipt.allocatedBytes };
}
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  invariant(a.length === b.length, "incompatible image sizes");
  let sum = 0; for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!); return sum;
}
function percentile(values: number[], quantile: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * quantile))]!;
}

export async function auditStudioMaterialMorphology() {
  const cases = [], planTimes: number[] = [], submitTimes: number[] = [];
  const renderedShapes: { id: string; rgba: Uint8ClampedArray; mass: number }[] = [];
  const sheets = [canvas(960, 1600), canvas(960, 1600)];
  for (const sheet of sheets) { const ctx = sheet.getContext("2d")!; ctx.fillStyle = "white"; ctx.fillRect(0, 0, sheet.width, sheet.height); }
  // Warm actual normalization/coverage modules separately from measured rows.
  render(element(STUDIO_MATERIAL_BRUSH_IDS[0]!));
  for (const [index, id] of STUDIO_MATERIAL_BRUSH_IDS.entries()) {
    const source = element(id);
    const retained = render(source), live = render(source, true);
    const replay = render(JSON.parse(JSON.stringify(source)) as DrawEl);
    const light = render(element(id, 0.15)), heavy = render(element(id, 0.85));
    const upright = render(element(id, 0.5, 0)), inclined = render(element(id, 0.5, 60));
    renderedShapes.push({ id, rgba: retained.rgba, mass: retained.mass });
    const replayDifference = difference(retained.rgba, replay.rgba);
    const liveDifference = difference(retained.rgba, live.rgba);
    const tiltDifference = difference(upright.rgba, inclined.rgba);
    invariant(replayDifference === 0, `${id}: saved replay differs`);
    invariant(liveDifference === 0, `${id}: live/commit differs`);
    invariant(retained.visible > 32, `${id}: blank material`);
    invariant(heavy.mass / Math.max(1, light.mass) > 1.1, `${id}: ineffective pressure`);
    if (studioMaterialBrushDefinition(id)!.tiltRatio < 0.8) invariant(tiltDifference > 0, `${id}: ineffective tilt`);
    // DPR stress uses the same retained renderer and snapshot, never a separate approximate brush.
    for (const dpr of [2, 3]) {
      const a = render(source, false, dpr), b = render(source, true, dpr);
      invariant(difference(a.rgba, b.rgba) === 0, `${id}: DPR ${dpr} live mismatch`);
    }
    const warmPlans = [retained, live, replay, light, heavy, upright, inclined];
    planTimes.push(...warmPlans.map((row) => row.planningMs));
    submitTimes.push(...warmPlans.map((row) => row.submissionMs));
    cases.push({ id, replayDifference, liveDifference, tiltDifference, pressureMassRatio: heavy.mass / light.mass,
      visiblePixels: retained.visible, markCount: retained.marks, allocatedBytes: retained.bytes,
      planMs: retained.planningMs, submissionMs: retained.submissionMs });
    const local = index % 16, x = local % 2 * 480, y = Math.floor(local / 2) * 200;
    const ctx = sheets[Math.floor(index / 16)]!.getContext("2d")!;
    ctx.fillStyle = "#18232d"; ctx.font = "bold 15px sans-serif";
    ctx.fillText(studioMaterialBrushDefinition(id)!.name, x + 16, y + 23);
    ctx.drawImage(retained.target, x + 12, y + 28);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  // Compare actual retained strokes after removing global opacity as a distinguishing feature.
  // This catches different tip masks that converge into the same dense stroke after overlap.
  let minimumStrokeDistance = Infinity;
  let closestStrokePair: string[] = [];
  let strokePairs = 0;
  for (let i = 0; i < renderedShapes.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = renderedShapes[i]!, b = renderedShapes[j]!;
      let distance = 0;
      for (let p = 3; p < a.rgba.length; p += 4) {
        distance += Math.abs(a.rgba[p]! / a.mass - b.rgba[p]! / b.mass);
      }
      distance /= 2;
      strokePairs++;
      if (distance < minimumStrokeDistance) {
        minimumStrokeDistance = distance; closestStrokePair = [a.id, b.id];
      }
      invariant(distance > 0.10, `${a.id}/${b.id}: rendered shapes converge (${distance.toFixed(4)})`);
    }
  }
  invariant(strokePairs === 496, "incomplete rendered-stroke pair coverage");
  const planningP95 = percentile(planTimes, 0.95), submissionP95 = percentile(submitTimes, 0.95);
  // Freeze guard, not a manufactured 120 Hz or physical-pen latency claim.
  invariant(planningP95 < 33, `planner P95 ${planningP95.toFixed(2)}ms exceeds 33ms`);
  invariant(submissionP95 < 50, `Canvas submission P95 ${submissionP95.toFixed(2)}ms exceeds 50ms`);
  return { version: 1, backend: "browser-canvas2d", cases,
    distinctness: { strokePairs, minimumStrokeDistance, closestStrokePair, opacityNormalized: true },
    performance: { planningP95, submissionP95, sampleCount: planTimes.length, excludesPixelReadback: true },
    scope: "Synthetic input; same browser/device; no physical pen, competitor or WebGPU latency claim",
    sheets: sheets.map((sheet) => sheet.toDataURL("image/png")),
  };
}
