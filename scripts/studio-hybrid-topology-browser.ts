/** Browser audit of the actual product Canvas/streaming/SVG material paths. Synthetic pen input only. */
import { planStudioMaterialBrush, renderStudioMaterialBrush, renderStudioMaterialBrushMarks, StudioMaterialBrushPlanner, studioMaterialBrushMarksToSvg, type StudioMaterialBrushElement } from "../apps/web/src/domains/creator/brush/studio-material-brush-runtime";
import { createBrushStudioV6Program } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-engine";
import { normalizeBrushStudioV6MaterialConfig } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-material-engine";
import { BRUSH_STUDIO_V6_TOPOLOGIES } from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-topology-catalog";

function canvas(width = 640, height = 480) { const c = document.createElement("canvas"); c.width = width; c.height = height; return c; }
function element(id: string, pressure?: number): StudioMaterialBrushElement {
  const program = createBrushStudioV6Program(id);
  const material = normalizeBrushStudioV6MaterialConfig({ ...program, tuning: { ...program.tuning,
    size: 44, spacing: 0.07, primaryColor: "#273444", secondaryColor: "#c2805c", particleCount: 2048,
    bristleStrands: 64, patternDensity: 0.65, patternScale: 1.2, patternJitter: 0.6 } })!;
  const points: number[] = [], pressures: number[] = [], tiltXs: number[] = [], tiltYs: number[] = [];
  for (let i = 0; i < 96; i++) {
    const t = i / 95; points.push(70 + t * 490, 240 + Math.sin(t * Math.PI * 2) * 35);
    pressures.push(pressure ?? 0.1 + 0.8 * Math.sin(Math.PI * t)); tiltXs.push(20); tiltYs.push(10);
  }
  return { points, pressures, tiltXs, tiltYs, stroke: "#273444", strokeWidth: 44, opacity: 0.9,
    brushEnginePrograms: { version: 1, material } };
}
function draw(source: StudioMaterialBrushElement, dpr = 1, live = false) {
  const target = canvas(640 * dpr, 480 * dpr), ctx = target.getContext("2d")!; ctx.scale(dpr, dpr);
  const start = performance.now();
  if (live) {
    const planner = new StudioMaterialBrushPlanner();
    for (let i = 1; i <= source.points.length / 2; i++) planner.appendBatches({ ...source,
      points: source.points.slice(0, i * 2), pressures: source.pressures?.slice(0, i),
      tiltXs: source.tiltXs?.slice(0, i), tiltYs: source.tiltYs?.slice(0, i),
    }, (marks) => renderStudioMaterialBrushMarks(ctx, marks, source.symmetry));
  } else renderStudioMaterialBrush(ctx, source);
  const submitMs = performance.now() - start;
  const rgba = ctx.getImageData(0, 0, target.width, target.height).data;
  let mass = 0, visible = 0;
  for (let i = 3; i < rgba.length; i += 4) { mass += rgba[i]!; if (rgba[i]! > 4) visible++; }
  return { target, rgba, mass, visible, submitMs };
}
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  if (a.length !== b.length) return Infinity;
  let sum = 0; for (let i = 0; i < a.length; i++) sum += Math.abs(a[i]! - b[i]!); return sum;
}
function alphaDistance(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let massA = 0, massB = 0; for (let i = 3; i < a.length; i += 4) { massA += a[i]!; massB += b[i]!; }
  let sum = 0; for (let i = 3; i < a.length; i += 4) sum += Math.abs(a[i]! / Math.max(1, massA) - b[i]! / Math.max(1, massB));
  return sum / 2;
}
async function svgPixels(source: StudioMaterialBrushElement) {
  const marks = planStudioMaterialBrush(source), target = canvas();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480">${studioMaterialBrushMarksToSvg(marks, source.symmetry)}</svg>`;
  const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    const image = new Image(); image.src = url; await image.decode();
    const ctx = target.getContext("2d")!; ctx.drawImage(image, 0, 0);
    return ctx.getImageData(0, 0, 640, 480).data;
  } finally { URL.revokeObjectURL(url); }
}

export async function auditStudioHybridTopology() {
  const failures: string[] = [], cases = [], times: number[] = [], planTimes: number[] = [];
  const check = (ok: boolean, message: string) => { if (!ok) failures.push(message); };
  const sheet = canvas(1280, 1620), sheetCtx = sheet.getContext("2d")!;
  sheetCtx.fillStyle = "#fff"; sheetCtx.fillRect(0, 0, sheet.width, sheet.height);
  const shapes: { id: string; rgba: Uint8ClampedArray }[] = [];
  draw(element(BRUSH_STUDIO_V6_TOPOLOGIES[0]!.recipeId));
  for (const [index, topology] of BRUSH_STUDIO_V6_TOPOLOGIES.entries()) {
    const source = element(topology.recipeId), retained = draw(source);
    const replay = draw(JSON.parse(JSON.stringify(source)) as StudioMaterialBrushElement);
    check(difference(retained.rgba, replay.rgba) === 0, `${topology.recipeId}: JSON replay mismatch`);
    check(retained.visible > 100, `${topology.recipeId}: insufficient visible paint`);
    const liveDifferences: number[] = [];
    for (const dpr of [1, 2, 3]) {
      const full = dpr === 1 ? retained : draw(source, dpr), live = draw(source, dpr, true);
      const diff = difference(full.rgba, live.rgba); liveDifferences.push(diff);
      check(diff === 0, `${topology.recipeId}: DPR ${dpr} streaming mismatch (${diff})`);
    }
    const light = draw(element(topology.recipeId, 0.15)), heavy = draw(element(topology.recipeId, 0.85));
    const pressureRatio = heavy.mass / Math.max(1, light.mass);
    check(pressureRatio > 1.15, `${topology.recipeId}: ineffective pressure (${pressureRatio})`);
    const svgDistance = alphaDistance(retained.rgba, await svgPixels(source));
    check(svgDistance < 0.06, `${topology.recipeId}: SVG alpha-distance ${svgDistance}`);
    const hybridCases = [];
    for (const deposition of ["deposit-ink", "deposit-marker", "deposit-dry", "deposit-wet", "deposit-oil"]) {
      const material = source.brushEnginePrograms!.material!;
      const hybrid: StudioMaterialBrushElement = { ...source, brushEnginePrograms: { version: 1, material: {
        ...material, slots: { ...material.slots, deposition, surface: "surface-coldpress", finish: ["finish-neon"] },
        tuning: { ...material.tuning, wetness: 0.8, diffusion: 0.65, relief: 0.7, granulation: 0.6 },
      } } };
      const full = draw(hybrid), live = draw(hybrid, 1, true), saved = draw(JSON.parse(JSON.stringify(hybrid)) as StudioMaterialBrushElement);
      const diff = difference(full.rgba, live.rgba) + difference(full.rgba, saved.rgba);
      check(diff === 0, `${topology.recipeId}/${deposition}: hybrid replay mismatch`);
      check(full.visible > 100, `${topology.recipeId}/${deposition}: empty hybrid`);
      hybridCases.push({ deposition, replayDifference: diff, visiblePixels: full.visible });
    }
    const symmetryCases = [];
    for (const type of ["vertical", "kaleidoscope"] as const) {
      const mirrored: StudioMaterialBrushElement = { ...source, symmetry: { type, centerX: 320, centerY: 240, radialCount: 3 } };
      const full = draw(mirrored), live = draw(mirrored, 1, true);
      const diff = difference(full.rgba, live.rgba), svgDistance = alphaDistance(full.rgba, await svgPixels(mirrored));
      check(diff === 0, `${topology.recipeId}/${type}: symmetry live mismatch`);
      check(svgDistance < 0.06, `${topology.recipeId}/${type}: symmetry SVG mismatch`);
      symmetryCases.push({ type, liveDifference: diff, svgAlphaDistance: svgDistance });
    }
    for (let trial = 0; trial < 5; trial++) {
      const start = performance.now(), marks = planStudioMaterialBrush(source);
      planTimes.push(performance.now() - start);
      const target = canvas(), ctx = target.getContext("2d")!, submit = performance.now();
      renderStudioMaterialBrushMarks(ctx, marks); times.push(performance.now() - submit);
    }
    shapes.push({ id: topology.recipeId, rgba: retained.rgba });
    const x = index % 2 * 640, y = Math.floor(index / 2) * 540;
    sheetCtx.fillStyle = "#17212e"; sheetCtx.font = "bold 22px sans-serif";
    sheetCtx.fillText(topology.label, x + 22, y + 32);
    sheetCtx.font = "13px sans-serif"; sheetCtx.fillText(topology.recipeId, x + 22, y + 53);
    sheetCtx.drawImage(retained.target, x, y + 60);
    cases.push({ id: topology.recipeId, liveDifferences, jsonDifference: difference(retained.rgba, replay.rgba),
      svgAlphaDistance: svgDistance, pressureMassRatio: pressureRatio, visiblePixels: retained.visible,
      markCount: planStudioMaterialBrush(source).length, hybridCases, symmetryCases });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  let minimumDistance = Infinity, pairs = 0, closestPair: string[] = [];
  for (let i = 0; i < shapes.length; i++) for (let j = 0; j < i; j++) {
    const distance = alphaDistance(shapes[i]!.rgba, shapes[j]!.rgba); pairs++;
    if (distance < minimumDistance) { minimumDistance = distance; closestPair = [shapes[i]!.id, shapes[j]!.id]; }
    check(distance > 0.1, `${shapes[i]!.id}/${shapes[j]!.id}: convergent geometry (${distance})`);
  }
  const p95 = (values: number[]) => values.sort((a, b) => a - b)[Math.floor(values.length * 0.95)]!;
  const performanceResult = { planningP95: p95(planTimes), submissionP95: p95(times), trials: times.length, excludesReadback: true };
  check(performanceResult.planningP95 < 33, "planner exceeds 33ms freeze guard");
  check(performanceResult.submissionP95 < 50, "submission exceeds 50ms freeze guard");
  return { backend: "real-browser-canvas2d", cases, distinctness: { pairs, minimumDistance, closestPair, opacityNormalized: true },
    performance: performanceResult, failures, scope: "Synthetic input only; no physical pen, fluid-grid or WebGPU latency claim", sheets: [sheet.toDataURL("image/png")] };
}
