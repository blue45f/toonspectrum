import {
  BRUSH_STUDIO_V6_RECIPES,
  normalizeBrushStudioV6Program,
  type BrushStudioV6Program,
} from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-engine";
import {
  attachBrushStudioV6LivePreview,
  renderBrushStudioV6Preview,
  type BrushStudioV6LiveController,
} from "../apps/web/src/domains/creator/brush-lab/brush-studio-v6-preview";

import { brushV6InkDistance, brushV6InkField, brushV6InkStatistics } from "./studio-brush-v6-pixel-quality";
import { verifyBrushV6LongStrokeQuality, verifyBrushV6ProductionQuality, verifyBrushV6ShortStartQuality, verifyBrushV6ReliefQuality, verifyBrushV6PickupQuality } from "./studio-brush-v6-production-quality-browser";

const WIDTH = 420;
const HEIGHT = 180;
const fields = new Map<string, Float32Array>();
const failures: string[] = [];
let live: HTMLCanvasElement;
let controller: BrushStudioV6LiveController;
let paper: Uint8ClampedArray;
let firstLiveHash = "";
let currentId = "";
let currentProgram: BrushStudioV6Program;
const timings: number[] = [];

function canvas(parent: HTMLElement, label: string): HTMLCanvasElement {
  const container = document.createElement("div");
  const title = document.createElement("p");
  title.textContent = label;
  const element = document.createElement("canvas");
  element.style.cssText = `width:${WIDTH}px;height:${HEIGHT}px;display:block;border:1px solid #cbd5e1;`;
  element.setAttribute("aria-label", label);
  container.append(title, element);
  parent.append(container);
  return element;
}

function pixels(element: HTMLCanvasElement): Uint8ClampedArray {
  const context = element.getContext("2d");
  if (!context) throw new Error("Canvas2D readback unavailable");
  return context.getImageData(0, 0, element.width, element.height).data;
}

async function hash(data: Uint8ClampedArray): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(data).buffer);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalizedProgram(id: string): BrushStudioV6Program {
  const recipe = BRUSH_STUDIO_V6_RECIPES.find((entry) => entry.id === id);
  if (!recipe) throw new Error(`unknown recipe ${id}`);
  const source = recipe.create();
  return normalizeBrushStudioV6Program({
    ...source,
    seed: 912_2026,
    input: { ...source.input, transport: "move-basic" },
    tuning: { ...source.tuning, size: 26, opacity: 0.8, primaryColor: "#243c56", secondaryColor: "#76532f" },
  });
}

const harness = {
  recipes: BRUSH_STUDIO_V6_RECIPES.map(({ id, label, group }) => ({ id, label, group })),
  async select(id: string) {
    controller?.destroy();
    currentId = id;
    currentProgram = normalizedProgram(id);
    const row = document.createElement("section");
    row.id = `recipe-${id}`;
    const heading = document.createElement("h2");
    heading.textContent = `${id} · ${currentProgram.name}`;
    const cards = document.createElement("div");
    cards.style.cssText = "display:grid;grid-template-columns:repeat(2,420px);gap:16px";
    row.append(heading, cards);
    document.body.append(row);
    const preview = canvas(cards, "Reference · normalized size / colors / opacity / seed");
    live = canvas(cards, "Actual pen input · pressure / tilt / twist");
    for (let index = 0; index < 7; index += 1) {
      const start = performance.now();
      renderBrushStudioV6Preview(preview, currentProgram);
      if (index > 1) timings.push(performance.now() - start);
    }
    const previewHash = await hash(pixels(preview));
    const saved = JSON.parse(JSON.stringify({ kind: "toonspectrum.brush-program-v6", program: currentProgram })) as { program: unknown };
    renderBrushStudioV6Preview(preview, normalizeBrushStudioV6Program(saved.program));
    const roundtripHash = await hash(pixels(preview));
    if (previewHash !== roundtripHash) failures.push(`${id}: JSON roundtrip changed reference pixels`);
    renderBrushStudioV6Preview(preview, currentProgram);
    const replayHash = await hash(pixels(preview));
    if (previewHash !== replayHash) failures.push(`${id}: reference rendering is nondeterministic`);
    controller = attachBrushStudioV6LivePreview(live, () => currentProgram);
    paper = pixels(live);
    firstLiveHash = "";
    const production = await verifyBrushV6ProductionQuality(currentProgram, cards);
    failures.push(...production.failures);
    const symmetry = id === "natural-calligraphy"
      ? { type: "vertical" as const, centerX: WIDTH / 2, centerY: HEIGHT / 2 }
      : id === "kaleido-swarm"
        ? { type: "radial" as const, centerX: WIDTH / 2, centerY: HEIGHT / 2, radialCount: 4 }
        : null;
    const symmetryProduction = symmetry ? await verifyBrushV6ProductionQuality(currentProgram, cards, symmetry) : null;
    if (symmetryProduction) failures.push(...symmetryProduction.failures.map((failure) => `${symmetry!.type} symmetry: ${failure}`));
    const shortStarts = id === "oil-hair-mixer" || id === "mineral-bloom"
      ? await verifyBrushV6ShortStartQuality(currentProgram, cards) : null;
    if (shortStarts) failures.push(...shortStarts.failures);
    const relief = id === "oil-hair-mixer" ? await verifyBrushV6ReliefQuality(currentProgram, cards) : null;
    if (relief) failures.push(...relief.failures);
    const pickup = id === "oil-hair-mixer" ? await verifyBrushV6PickupQuality(currentProgram, cards) : null;
    if (pickup) failures.push(...pickup.failures);
    return { previewHash, roundtripHash, previewSamplesMs: timings.splice(0), production, symmetryProduction, shortStarts, relief, pickup };
  },
  location() {
    live.scrollIntoView({ block: "center" });
    const rect = live.getBoundingClientRect();
    return { x: rect.left + 1, y: rect.top + 1, width: WIDTH, height: HEIGHT };
  },
  async capture(replay = false) {
    const frame = pixels(live);
    const liveHash = await hash(frame);
    const field = brushV6InkField(frame, paper);
    const statistics = brushV6InkStatistics(field);
    if (statistics.paintedPixels < 30) failures.push(`${currentId}: live stroke is empty`);
    if (replay) {
      if (firstLiveHash !== liveHash) failures.push(`${currentId}: clear and pen replay changed pixels`);
    } else {
      firstLiveHash = liveHash;
      fields.set(currentId, field);
    }
    // Decode actual PNG output; an encoded blob alone is not export-parity evidence.
    const exported = new Image();
    exported.src = live.toDataURL("image/png");
    await exported.decode();
    const scratch = document.createElement("canvas");
    scratch.width = live.width;
    scratch.height = live.height;
    scratch.getContext("2d")!.drawImage(exported, 0, 0);
    const pngHash = await hash(pixels(scratch));
    if (pngHash !== liveHash) failures.push(`${currentId}: PNG decode differs from live pixels`);
    return { liveHash, pngHash, ...statistics };
  },
  clear() {
    controller.clear();
    paper = pixels(live);
  },
  stress() { return verifyBrushV6LongStrokeQuality(normalizedProgram("oil-hair-mixer")); },
  finish() {
    controller.destroy();
    const distances: { first: string; second: string; distance: number }[] = [];
    const entries = [...fields];
    for (let first = 0; first < entries.length; first += 1) {
      for (let second = first + 1; second < entries.length; second += 1) {
        const [firstId, firstField] = entries[first]!;
        const [secondId, secondField] = entries[second]!;
        distances.push({ first: firstId, second: secondId, distance: brushV6InkDistance(firstField, secondField) });
      }
    }
    distances.sort((first, second) => first.distance - second.distance);
    for (const pair of distances.filter((entry) => entry.distance < 0.025)) {
      failures.push(`${pair.first}/${pair.second}: normalized material distance ${pair.distance.toFixed(5)} < 0.025`);
    }
    return { failures, distances, backend: "production-v6-canvas2d", width: live.width, height: live.height };
  },
};

declare global {
  interface Window { __studioBrushV6Quality: typeof harness }
}
window.__studioBrushV6Quality = harness;
