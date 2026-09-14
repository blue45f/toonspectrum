import {
  planStudioMaterialBrush, renderStudioMaterialBrush, renderStudioMaterialBrushMarks,
  StudioMaterialBrushPlanner, StudioMaterialBrushRenderCache, StudioMaterialBrushSvgBudgetError,
  writeStudioMaterialBrushSvg, STUDIO_MATERIAL_BRUSH_BATCH_MARKS,
} from "../apps/web/src/domains/creator/brush/studio-material-brush-runtime";
import { renderBrushStudioV6MaterialMarks } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-material-engine";
import { createBrushStudioV6ProductBrush } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-product-bridge";
import { exportPageToSvg } from "../apps/web/src/domains/creator/export/studio-svg-export";
import { StudioLiveRetainedMediaOverlayRenderer } from "../apps/web/src/domains/creator/live/studio-live-retained-media-overlay";

import { brushV6InkDistance, brushV6InkField } from "./studio-brush-v6-pixel-quality";

import type { BrushStudioV6Program } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-engine";
import type { DrawEl } from "../apps/web/src/domains/creator/studio-element-model";

const WIDTH = 420;
const HEIGHT = 180;

function read(canvas: HTMLCanvasElement): Uint8ClampedArray {
  return canvas.getContext("2d")!.getImageData(0, 0, WIDTH, HEIGHT).data;
}

async function pixelHash(pixels: Uint8ClampedArray): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(pixels).buffer);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function difference(first: Uint8ClampedArray, second: Uint8ClampedArray) {
  let total = 0;
  let maximum = 0;
  let alphaFirst = 0;
  let alphaSecond = 0;
  for (let index = 0; index < first.length; index += 1) {
    const change = Math.abs(first[index]! - second[index]!);
    maximum = Math.max(maximum, change);
    total += change;
    if (index % 4 === 3) { alphaFirst += first[index]!; alphaSecond += second[index]!; }
  }
  return { meanChannelError: total / first.length / 255, maximumChannelError: maximum,
    relativeAlphaError: Math.abs(alphaFirst - alphaSecond) / Math.max(1, alphaFirst), alphaFirst, alphaSecond };
}

function surface(parent: HTMLElement, label: string): HTMLCanvasElement {
  const container = document.createElement("div");
  const title = document.createElement("p");
  title.textContent = label;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  canvas.style.cssText = `width:${WIDTH}px;height:${HEIGHT}px;display:block;background:white;outline:1px solid #cbd5e1`;
  container.append(title, canvas);
  parent.append(container);
  return canvas;
}

function stroke(program: BrushStudioV6Program): DrawEl {
  // Serialize the actual saved brush payload, not an invented material-only fixture.
  const saved = JSON.parse(JSON.stringify(createBrushStudioV6ProductBrush(program))) as ReturnType<typeof createBrushStudioV6ProductBrush>;
  const points: number[] = [], pressures: number[] = [], tiltXs: number[] = [], tiltYs: number[] = [], twists: number[] = [];
  for (let index = 0; index <= 60; index += 1) {
    const t = index / 60;
    points.push(WIDTH * (0.08 + t * 0.84), HEIGHT * (0.52 + Math.sin(t * Math.PI * 2.15) * 0.25));
    pressures.push(0.12 + Math.sin(t * Math.PI) * 0.86);
    tiltXs.push(Math.round(35 * Math.sin(t * Math.PI)));
    tiltYs.push(15);
    twists.push(Math.round(t * 120));
  }
  return { id: `quality-${program.id}`, type: "draw", kind: "freehand", mode: "pen", brush: saved.brushId,
    stroke: saved.color, strokeWidth: saved.strokeWidth, opacity: saved.brushOpacity,
    points, pressures, tiltXs, tiltYs, twists, brushEnginePrograms: saved.enginePrograms ?? undefined };
}

function prefix(element: DrawEl, count: number): DrawEl {
  return { ...element, points: element.points.slice(0, count * 2), pressures: element.pressures?.slice(0, count),
    tiltXs: element.tiltXs?.slice(0, count), tiltYs: element.tiltYs?.slice(0, count), twists: element.twists?.slice(0, count) };
}

export async function verifyBrushV6ProductionQuality(
  program: BrushStudioV6Program,
  parent: HTMLElement,
  symmetry?: DrawEl["symmetry"],
  scenario?: { label: string; points?: number[] },
) {
  const failures: string[] = [];
  const label = scenario?.label ?? (symmetry ? `${symmetry.type} symmetry` : "Main Studio");
  const activeCanvas = document.createElement("canvas");
  const settledCanvas = surface(parent, `${label} · native retained live → settled`);
  const committedCanvas = surface(parent, `${label} · committed Canvas contacts`);
  const exportCanvas = surface(parent, `${label} · complete SVG export decoded`);
  const element = { ...stroke(program), ...(symmetry ? { symmetry } : {}) };
  if (scenario?.points) {
    element.points = scenario.points.slice();
    element.pressures = Array(scenario.points.length / 2).fill(0.7);
    element.tiltXs = Array(scenario.points.length / 2).fill(0);
    element.tiltYs = Array(scenario.points.length / 2).fill(0);
    element.twists = Array(scenario.points.length / 2).fill(0);
  }
  const overlay = new StudioLiveRetainedMediaOverlayRenderer();
  overlay.attach({ activeCanvas, settledCanvas });
  overlay.setSurface({ left: 0, top: 0, width: WIDTH, height: HEIGHT, documentScale: 1, documentWidth: WIDTH, flipX: false });
  const begin = overlay.begin(prefix(element, 1));
  if (begin.status !== "started" || begin.kind !== "material") failures.push(`${program.id}: production overlay did not select material`);
  const appendSamplesMs: number[] = [];
  for (let count = 2; count <= element.points.length / 2; count += 1) {
    const start = performance.now();
    const result = overlay.appendFrom(prefix(element, count));
    appendSamplesMs.push(performance.now() - start);
    if (result.status !== "appended" && result.status !== "noop") failures.push(`${program.id}: production append failed`);
  }
  const live = read(activeCanvas);
  const end = overlay.end(element);
  if (end.status !== "settled") failures.push(`${program.id}: production settle failed`);
  const settled = read(settledCanvas);
  const liveSettled = difference(live, settled);
  if (liveSettled.maximumChannelError !== 0) failures.push(`${program.id}: live/settled native pixels differ`);
  const context = committedCanvas.getContext("2d")!;
  context.globalAlpha = 1;
  const marks = planStudioMaterialBrush(element);
  renderStudioMaterialBrush(context, element);
  const batch = read(committedCanvas);
  const liveCommitted = difference(settled, batch);
  if (liveCommitted.maximumChannelError !== 0) failures.push(`${program.id}: incremental/committed contacts differ`);
  let symmetryNewPixels = 0;
  if (symmetry) {
    const original = document.createElement("canvas");
    original.width = WIDTH;
    original.height = HEIGHT;
    renderStudioMaterialBrushMarks(original.getContext("2d")!, marks);
    const originalPixels = read(original);
    for (let index = 3; index < batch.length; index += 4) {
      if (originalPixels[index] === 0 && batch[index]! > 2) symmetryNewPixels++;
    }
    if (symmetryNewPixels < 50) failures.push(`${program.id}: symmetry did not create distinct reflected/rotated geometry`);
  }
  const exported = exportPageToSvg({ width: WIDTH, height: HEIGHT, bg: "transparent", elements: [element] });
  if (!exported.svg.includes('data-brush-engine="material-contact-v1"')) failures.push(`${program.id}: document SVG bypassed material engine`);
  if (exported.skipped.length > 0) failures.push(`${program.id}: document SVG skipped content`);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(exported.svg)}`;
  await image.decode();
  exportCanvas.getContext("2d")!.drawImage(image, 0, 0);
  const svgFrame = read(exportCanvas);
  const svgPixels = difference(batch, svgFrame);
  // Browser SVG and Canvas antialias paths differ; preserve the measured error instead of claiming equality.
  if (svgPixels.meanChannelError > 0.01 || svgPixels.relativeAlphaError > 0.04) failures.push(`${program.id}: SVG paint/alpha differs materially from committed contacts`);
  overlay.attach(null);
  const pixelHashes = { native: await pixelHash(live), committed: await pixelHash(batch), svg: await pixelHash(svgFrame) };
  return { failures, symmetry: symmetry ?? null, symmetryNewPixels, markCount: marks.length, appendSamplesMs, liveSettled, liveCommitted, svgPixels,
    pixelHashes, savedOpacity: element.opacity, backend: "production-native-retained-canvas2d-and-svg" };
}

/** No Pickup must suppress both refill and color mixing on every production output path. */
export async function verifyBrushV6PickupQuality(program: BrushStudioV6Program, parent: HTMLElement) {
  const failures: string[] = [];
  const modes = [];
  for (const pickupMode of ["pickup-none", "pickup-pigment-reservoir"] as const) {
    const variants: (Awaited<ReturnType<typeof verifyBrushV6ProductionQuality>> & { pickup: number })[] = [];
    const fields = [];
    for (const pickup of [0, 1]) {
      const variant = { ...program, slots: { ...program.slots, pickup: pickupMode }, tuning: { ...program.tuning, pickup } };
      const production = await verifyBrushV6ProductionQuality(variant, parent, undefined, { label: `${pickupMode} · amount ${pickup}` });
      failures.push(...production.failures);
      const canvas = document.createElement("canvas");
      canvas.width = WIDTH;
      canvas.height = HEIGHT;
      renderStudioMaterialBrush(canvas.getContext("2d")!, stroke(variant));
      const pixels = read(canvas);
      fields.push(brushV6InkField(pixels, new Uint8ClampedArray(pixels.length)));
      variants.push({ pickup, ...production });
    }
    const distance = brushV6InkDistance(fields[0]!, fields[1]!);
    const equalPixels = (["native", "committed", "svg"] as const).every(output => variants[0]!.pixelHashes[output] === variants[1]!.pixelHashes[output]);
    if (pickupMode === "pickup-none" && (!equalPixels || distance !== 0)) failures.push(`${program.id}: No Pickup amount0/1 changed deposited native/committed/SVG pixels`);
    if (pickupMode === "pickup-pigment-reservoir" && (equalPixels || distance < 0.01)) failures.push(`${program.id}: enabled local reservoir amount0/1 has no meaningful output change (${distance})`);
    modes.push({ pickupMode, variants, equalPixels, distance });
  }
  return { modes, minimumEnabledDistance: 0.01, failures };
}

/** Two-point gestures expose false horizontal connectors hidden inside long horizontal starts. */
export async function verifyBrushV6ShortStartQuality(program: BrushStudioV6Program, parent: HTMLElement) {
  const cases = [
    { label: "Vertical short start", points: [210, 58, 210, 82] },
    { label: "Diagonal short start", points: [192, 58, 216, 82] },
  ];
  const results = [];
  for (const gesture of cases) {
    const production = await verifyBrushV6ProductionQuality(program, parent, undefined, gesture);
    if (production.liveCommitted.alphaFirst < 255 * 10) production.failures.push(`${program.id}: ${gesture.label} has no visible contact`);
    results.push({ ...gesture, ...production });
  }
  return { cases: results, failures: results.flatMap(result => result.failures) };
}

/** A visible material control must change deposited output, with seed/path/color held fixed. */
export async function verifyBrushV6ReliefQuality(program: BrushStudioV6Program, parent: HTMLElement) {
  const failures: string[] = [];
  const fields = [];
  const variants = [];
  for (const relief of [0, 1]) {
    const variant = { ...program, tuning: { ...program.tuning, relief } };
    const production = await verifyBrushV6ProductionQuality(variant, parent, undefined, { label: `Bristle relief ${relief}` });
    failures.push(...production.failures.map(failure => `relief=${relief}: ${failure}`));
    const canvas = document.createElement("canvas");
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    renderStudioMaterialBrush(canvas.getContext("2d")!, stroke(variant));
    const pixels = read(canvas);
    fields.push(brushV6InkField(pixels, new Uint8ClampedArray(pixels.length)));
    variants.push({ relief, ...production });
  }
  const distance = brushV6InkDistance(fields[0]!, fields[1]!);
  if (distance < 0.01) failures.push(`${program.id}: relief0/1 output remains perceptually indistinct (${distance})`);
  return { variants, distance, minimumDistance: 0.01, failures };
}

/** Exercise both incremental and whole-stroke production rendering for a max-strand stroke. */
export function verifyBrushV6LongStrokeQuality(program: BrushStudioV6Program) {
  const maximum = { ...program, tuning: { ...program.tuning, bristleStrands: 128, spacing: 0.01, size: 26 } };
  const element = stroke(maximum);
  element.points = [];
  element.pressures = [];
  element.tiltXs = [];
  element.tiltYs = [];
  element.twists = [];
  const planner = new StudioMaterialBrushPlanner();
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d")!;
  const samplesMs: number[] = [];
  let totalMarks = 0;
  let maximumMarksPerAppend = 0;
  for (let index = 0; index < 10_000; index += 1) {
    // A circle avoids wraparound teleports; adjacent samples stay 0.35 document pixels apart.
    const angle = index * (0.35 / 65);
    element.points.push(WIDTH / 2 + Math.cos(angle) * 65, HEIGHT / 2 + Math.sin(angle) * 65);
    element.pressures.push(0.7);
    element.tiltXs.push(20);
    element.tiltYs.push(10);
    element.twists.push(0);
    const start = performance.now();
    const result = planner.append(element);
    renderBrushStudioV6MaterialMarks(context, result.marks);
    samplesMs.push(performance.now() - start);
    totalMarks += result.marks.length;
    maximumMarksPerAppend = Math.max(maximumMarksPerAppend, result.marks.length);
    // Returned marks are consumed and discarded; retaining every historical array would hide a leak.
  }
  const windowMetrics = (start: number, end: number) => {
    const values = samplesMs.slice(start, end).sort((first, second) => first - second);
    return { meanMs: values.reduce((sum, value) => sum + value, 0) / values.length,
      p95Ms: values[Math.floor(values.length * 0.95)]!, maximumMs: values.at(-1)! };
  };
  const early = windowMetrics(1000, 2000);
  const late = windowMetrics(9000, 10000);
  const failures: string[] = [];
  const committedCanvas = document.createElement("canvas");
  committedCanvas.width = WIDTH;
  committedCanvas.height = HEIGHT;
  const cache = new StudioMaterialBrushRenderCache();
  const committedStart = performance.now();
  const committedStatistics = cache.render(committedCanvas.getContext("2d")!, element);
  const committedMs = performance.now() - committedStart;
  const committedPixels = difference(read(canvas), read(committedCanvas));
  if (committedPixels.maximumChannelError !== 0) failures.push("long stroke: incremental/committed pixels differ");
  if (committedStatistics.totalMarks !== totalMarks) failures.push("long stroke: whole-stroke replay lost contacts");
  if (committedStatistics.maxBatchMarks > STUDIO_MATERIAL_BRUSH_BATCH_MARKS) failures.push("long stroke: rendering batch exceeds bound");
  if (cache.statistics().retainedMarks !== 0) failures.push("long stroke: oversized plan retained in cache");
  let svgBudgetRejected = false;
  const svgBudgetStart = performance.now();
  try { writeStudioMaterialBrushSvg(element, () => {}); }
  catch (error) {
    if (!(error instanceof StudioMaterialBrushSvgBudgetError)) throw error;
    svgBudgetRejected = true;
  }
  if (!svgBudgetRejected) failures.push("long stroke: expected oversized SVG export to reject explicitly");
  const svgBudgetMs = performance.now() - svgBudgetStart;
  // A discarding sink proves fullpath streaming without building a huge string. The product's
  // string export still rejects at its fixed 64 MiB budget; this is not an export-success claim.
  let largestSvgChunkBytes = 0;
  const svgStreamStart = performance.now();
  const svgStreaming = writeStudioMaterialBrushSvg(element, (chunk) => {
    largestSvgChunkBytes = Math.max(largestSvgChunkBytes, chunk.length * 2);
  }, 1024 * 1024 * 1024);
  const svgStreamingMs = performance.now() - svgStreamStart;
  if (svgStreaming.totalMarks !== totalMarks) failures.push("long stroke: streaming SVG lost contacts");
  return { recipe: program.id, sampleCount: 10_000, spacingPx: 0.35, bristleStrands: 128,
    totalMarks, maximumMarksPerAppend, inputNumericValueCount: element.points.length + 4 * element.pressures.length,
    retainedOutputMarkArrays: 0, early, late, lateToEarlyMeanRatio: late.meanMs / Math.max(0.001, early.meanMs),
    totalMs: samplesMs.reduce((sum, value) => sum + value, 0), samplesMs, failures,
    committed: { ...committedStatistics, totalMs: committedMs, pixels: committedPixels, cache: cache.statistics() },
    svg: { productBudgetRejected: svgBudgetRejected, productBudgetMs: svgBudgetMs,
      fullStreaming: { ...svgStreaming, totalMs: svgStreamingMs, largestChunkUtf16Bytes: largestSvgChunkBytes, sink: "discarding" } },
    timingScope: "Production planner append and whole-stroke Canvas2D submission; excludes physical input and GPU presentation. Counts describe held input/transient output, not heap-byte measurements. Full SVG streaming uses a discarding sink; product string export rejects this oversized stroke." };
}
