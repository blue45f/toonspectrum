import { beforeEach, describe, expect, it } from "vitest";

import { StudioLiveWetInkOverlayRenderer } from "../live/studio-live-wet-ink-overlay";
import { BRUSH_PRESETS } from "../studio-brush";

import { filterStudioBrushCatalogItems } from "./studio-brush-catalog";
import { isStudioBrushQuarantinedPresetId } from "./studio-brush-quarantine";
import { studioCoreBrushCatalogSelection } from "./studio-brush-selection";
import {
  planStudioDrawPointerStart,
  type StudioDrawPointerStartInput,
} from "./studio-draw-pointer-start-plan";
import { STUDIO_SUB_TOOL_PALETTE_CATEGORIES } from "./studio-sub-tool-palette-data";
import {
  createStudioInkwashFluidSession,
  depositStudioInkwashFluidStamp,
  getStudioInkwashWash,
  planStudioWetInkBrushReplay,
  readStudioInkwashFluidCell,
  readStudioInkwashWashDocumentCell,
  resetStudioInkwashWash,
  resolveStudioWetInkBrushPhysicalRecipe,
  stepStudioInkwashFluid,
  studioWetInkBrushRuntimeSupportsElement,
  type StudioWetInkBrushSurface,
  type StudioWetInkBrushSurfaceFactory,
} from "./studio-wet-ink-brush-runtime";
import {
  createStudioWetInkField,
  depositStudioWetInkStroke,
  planStudioWetInkTileUploads,
  readStudioWetInkCell,
  simulateStudioWetInkField,
} from "./studio-wet-ink-field";

import type { StudioLiveInkSurface } from "../live/studio-live-ink-overlay";
import type { DrawEl } from "../studio-element-model";

function inkWashStroke(overrides: Partial<DrawEl> = {}): DrawEl {
  return {
    id: "ink-wash-feel-stroke",
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [6, 8, 28, 9, 48, 8],
    pressures: [0.7, 0.85, 0.6],
    stroke: "#1a1a1a",
    strokeWidth: 8,
    opacity: 1,
    brush: "ink-wash",
    watercolorPipeline: "causal-walker-v2",
    ...overrides,
  };
}

function inkWashField() {
  const recipe = resolveStudioWetInkBrushPhysicalRecipe(inkWashStroke());
  if (!recipe) throw new Error("ink-wash recipe missing");
  const created = createStudioWetInkField({
    width: 32,
    height: 20,
    tileSize: 16,
    absorption: recipe.material.absorption,
    bleed: recipe.material.bleed,
    chromatography: recipe.material.chromatography,
    dryingRate: 0,
    evaporation: 0,
    fixationRate: 0,
    granulation: 0,
    paperRoughness: 0,
    edgeDarkening: 0,
    pigmentDiffusion: 0.2,
    waterDiffusion: 0,
    inkColor: recipe.inkColor,
    spectralAbsorption: recipe.material.spectralAbsorption,
  });
  if (!created.ok) throw new Error(created.reason);
  return created.value;
}

describe("ink-wash feel on the shipped Studio wet-ink path", () => {
  it("does not advect or bleed pigment on dry paper", () => {
    const field = inkWashField();
    const deposited = depositStudioWetInkStroke(field, {
      samples: [{ x: 8, y: 10, timeMs: 0, pressure: 1 }],
      radius: 2,
      hardness: 1,
      spacing: 1,
      waterLoad: 0,
      pigmentLoad: 1,
      wetnessLoad: 0,
    });
    expect(deposited.ok).toBe(true);
    const beforeFar = readStudioWetInkCell(field, 20, 10);
    expect(beforeFar?.pigment ?? 0).toBe(0);
    expect(simulateStudioWetInkField(field, 12).ok).toBe(true);
    const afterFar = readStudioWetInkCell(field, 20, 10);
    expect(afterFar?.pigment ?? 0).toBe(0);
    expect(afterFar?.pigmentOpticalDensity[0] ?? 0).toBe(0);
    expect(afterFar?.pigmentOpticalDensity[2] ?? 0).toBe(0);
  });

  it("moves pigment when the paper is wet", () => {
    const field = inkWashField();
    const deposited = depositStudioWetInkStroke(field, {
      samples: [{ x: 8, y: 10, timeMs: 0, pressure: 1 }],
      radius: 2,
      hardness: 1,
      spacing: 1,
      waterLoad: 1.2,
      pigmentLoad: 1,
      wetnessLoad: 1,
    });
    expect(deposited.ok).toBe(true);
    const originBefore = readStudioWetInkCell(field, 8, 10)!;
    expect(simulateStudioWetInkField(field, 10).ok).toBe(true);
    const originAfter = readStudioWetInkCell(field, 8, 10)!;
    const neighbor = readStudioWetInkCell(field, 11, 10)!;
    expect(neighbor.pigment + neighbor.stain).toBeGreaterThan(0);
    expect(originAfter.pigment).toBeLessThan(originBefore.pigment);
  });

  it("deepens overlapping wet deposits as optical density, not gray-mud alpha-over", () => {
    const field = inkWashField();
    const dab = {
      samples: [{ x: 10, y: 10, timeMs: 0, pressure: 1 }],
      radius: 3,
      hardness: 1,
      spacing: 1,
      waterLoad: 0.8,
      pigmentLoad: 0.9,
      wetnessLoad: 0.9,
    };
    expect(depositStudioWetInkStroke(field, dab).ok).toBe(true);
    const once = readStudioWetInkCell(field, 10, 10)!;
    expect(depositStudioWetInkStroke(field, dab).ok).toBe(true);
    const twice = readStudioWetInkCell(field, 10, 10)!;
    expect(twice.pigmentOpticalDensity[0]).toBeGreaterThan(once.pigmentOpticalDensity[0] * 1.6);
    const reflectanceOnce = Math.exp(-once.pigmentOpticalDensity[0]);
    const reflectanceTwice = Math.exp(-twice.pigmentOpticalDensity[0]);
    expect(reflectanceTwice).toBeLessThan(reflectanceOnce);
    expect(reflectanceTwice).toBeLessThan(0.5);
  });

  it("lets red-absorbing dye outrun blue-absorbing dye on wet ink-wash paper", () => {
    const field = inkWashField();
    expect(depositStudioWetInkStroke(field, {
      samples: [{ x: 8, y: 10, timeMs: 0, pressure: 1 }],
      radius: 2.2,
      hardness: 1,
      spacing: 1,
      waterLoad: 1.3,
      pigmentLoad: 1.2,
      wetnessLoad: 1,
    }).ok).toBe(true);
    expect(simulateStudioWetInkField(field, 12).ok).toBe(true);
    const neighbor = readStudioWetInkCell(field, 12, 10)!;
    expect(neighbor.pigmentOpticalDensity[0]).toBeGreaterThan(neighbor.pigmentOpticalDensity[2]);
    const uploads = planStudioWetInkTileUploads(field);
    expect(uploads.ok).toBe(true);
    if (!uploads.ok) return;
    expect(uploads.value.some((tile) => tile.rgba.some((byte) => byte > 0))).toBe(true);
  });

  it("replays the Studio ink-wash planner twice with identical bytes", () => {
    const element = inkWashStroke();
    const first = planStudioWetInkBrushReplay(element, { phase: "committed" });
    const second = planStudioWetInkBrushReplay(element, { phase: "committed" });
    if (!first.ok || !second.ok) throw new Error("ink-wash planner rejected");
    expect(second.value.fieldDigest).toBe(first.value.fieldDigest);
    expect(second.value.uploads.length).toBe(first.value.uploads.length);
    for (let index = 0; index < first.value.uploads.length; index += 1) {
      expect(Array.from(second.value.uploads[index]!.rgba)).toEqual(
        Array.from(first.value.uploads[index]!.rgba),
      );
    }
    expect(first.value.brushId).toBe("ink-wash");
    expect(first.value.simulationSteps).toBeGreaterThan(0);
  });
});

function pointerStartInput(
  overrides: Partial<StudioDrawPointerStartInput> = {},
): StudioDrawPointerStartInput {
  return {
    id: "inkwash-feel-start",
    position: { x: 12, y: 16 },
    pointer: { pointerType: "pen", pressure: 0.8, timeStamp: 1 },
    drawMode: "pen",
    drawShape: "line",
    shapeFill: false,
    color: "#16161e",
    strokeWidth: 10,
    brushOpacity: 1,
    brush: "inkwash-pen",
    stampTuning: null,
    brushDynamics: {},
    stabilizer: 0,
    stabilizerMode: "standard",
    velocitySensitivity: 0.65,
    pressureCurve: 1,
    positionScale: 2,
    brushTip: { tiltEnabled: false, angleDeg: 0, roundness: 1 },
    symmetry: { type: "none", centerX: 0, centerY: 0, radialCount: 6 },
    ...overrides,
  };
}

function productInkwashStart(brushId: "inkwash-pen" | "inkwash-water-brush") {
  const preset = BRUSH_PRESETS.find((candidate) => candidate.id === brushId);
  if (!preset) throw new Error(`missing ${brushId}`);
  const selection = studioCoreBrushCatalogSelection(preset);
  const plan = planStudioDrawPointerStart(pointerStartInput({
    id: `${brushId}-start`,
    brush: brushId,
    brushCatalogId: selection.catalogId,
    brushCatalogName: selection.catalogName,
    brushDynamics: selection.brushDynamics,
    brushOpacity: selection.defaultOpacity,
    strokeWidth: selection.defaultWidth,
  }));
  return {
    ...plan.element,
    points: [10, 16, 22, 16, 34, 16],
    pressures: [0.85, 0.9, 0.7],
  };
}

describe("InkWash pen/water product start on the shipped wet/fluid path", () => {
  beforeEach(() => {
    resetStudioInkwashWash();
  });

  it("lists the pen and water brush in the picker, search, and 붓 palette", () => {
    for (const id of ["inkwash-pen", "inkwash-water-brush"] as const) {
      expect(isStudioBrushQuarantinedPresetId(id), id).toBe(false);
      expect(
        filterStudioBrushCatalogItems({ category: "beginner" }).some((item) => item.id === id),
        `${id}: missing from the default 기본 tab`,
      ).toBe(true);
      expect(
        filterStudioBrushCatalogItems({ category: "watercolor" }).some((item) => item.id === id),
        `${id}: missing from the 수채 tab`,
      ).toBe(true);
    }
    expect(
      filterStudioBrushCatalogItems({ query: "잉크펜" }).some((item) => item.id === "inkwash-pen"),
    ).toBe(true);
    expect(
      filterStudioBrushCatalogItems({ query: "물붓" }).some((item) => item.id === "inkwash-water-brush"),
    ).toBe(true);
    const brushTab = STUDIO_SUB_TOOL_PALETTE_CATEGORIES.find((category) => category.id === "brush");
    expect(brushTab?.tools.map((tool) => tool.id)).toEqual(
      expect.arrayContaining(["inkwash-pen", "inkwash-water-brush"]),
    );
  });

  it("accepts pointer-start snapshots and keeps water from depositing ink", () => {
    const pen = productInkwashStart("inkwash-pen");
    const water = productInkwashStart("inkwash-water-brush");
    expect(studioWetInkBrushRuntimeSupportsElement(pen)).toBe(true);
    expect(studioWetInkBrushRuntimeSupportsElement(water)).toBe(true);
    const penRecipe = resolveStudioWetInkBrushPhysicalRecipe(pen);
    const waterRecipe = resolveStudioWetInkBrushPhysicalRecipe(water);
    expect(penRecipe).not.toBeNull();
    expect(waterRecipe).not.toBeNull();
    expect(waterRecipe!.material.pigmentLoad).toBe(0);
    expect(penRecipe!.material.wetnessLoad).toBeGreaterThan(0.14);
    expect(penRecipe!.material.wetnessLoad).toBeLessThan(0.4);
    expect(penRecipe!.material.pigmentLoad).toBeGreaterThan(1);
    const replay = planStudioWetInkBrushReplay(pen, { phase: "committed" });
    expect(replay.ok).toBe(true);
  });

  it("shares one wash field so water moves unfixed pen ink and dry paper stays still", () => {
    const session = createStudioInkwashFluidSession({ width: 48, height: 32 });
    depositStudioInkwashFluidStamp(session, {
      x: 12,
      y: 16,
      radius: 2.2,
      pigment: [1.1, 1.05, 0.95],
      wetness: 0,
      velocity: [0, 0],
    });
    const dryOrigin = readStudioInkwashFluidCell(session, 12, 16)!;
    expect(stepStudioInkwashFluid(session, 10).divergenceAfter).toBeGreaterThanOrEqual(0);
    const dryFar = readStudioInkwashFluidCell(session, 28, 16)!;
    expect(dryFar.mobile[0] + dryFar.mobile[2]).toBe(0);
    expect(readStudioInkwashFluidCell(session, 12, 16)!.mobile[0]).toBeCloseTo(dryOrigin.mobile[0], 5);

    const pen = {
      ...productInkwashStart("inkwash-pen"),
      id: "inkwash-pen-shared",
      points: [12, 20, 16, 20, 20, 20],
      pressures: [0.95, 0.9, 0.85],
    };
    const water = {
      ...productInkwashStart("inkwash-water-brush"),
      id: "inkwash-water-follow",
      points: [20, 20, 32, 20, 44, 20],
      pressures: [0.9, 0.85, 0.8],
    };

    const { renderer } = attachedInkwashOverlay();
    expect(renderer.begin(pen, { pageEpoch: "feel" }).status).toBe("started");
    expect(renderer.end(pen, { pageEpoch: "feel" }).status).toBe("settled");
    expect(renderer.begin(water, { pageEpoch: "feel" }).status).toBe("started");
    expect(renderer.end(water, { pageEpoch: "feel" }).status).toBe("settled");

    const planned = planStudioWetInkBrushReplay(water, { phase: "committed" });
    expect(planned.ok).toBe(true);
    const wash = getStudioInkwashWash();
    expect(wash).not.toBeNull();
    const onPen = readStudioInkwashWashDocumentCell(wash!, 16, 20);
    const offPen = readStudioInkwashWashDocumentCell(wash!, 28, 20);
    const dryPaper = readStudioInkwashWashDocumentCell(wash!, 16, 8);
    expect(onPen).not.toBeNull();
    expect((onPen!.mobile[0] + onPen!.fixed[0])).toBeGreaterThan(0);
    expect(onPen!.fixed[0]).toBeGreaterThan(onPen!.mobile[0]);
    expect(offPen).not.toBeNull();
    expect((offPen!.mobile[0] + offPen!.fixed[0])).toBeGreaterThan(0);
    expect((dryPaper?.mobile[0] ?? 0) + (dryPaper?.fixed[0] ?? 0)).toBeLessThan(1e-12);
  });

  it("does not restep the shared wash when the same stroke is planned again", () => {
    resetStudioInkwashWash();
    const pen = {
      ...productInkwashStart("inkwash-pen"),
      id: "inkwash-pen-restep",
      points: [12, 16, 28, 16, 44, 16],
      pressures: [0.9, 0.85, 0.8],
    };
    const first = planStudioWetInkBrushReplay(pen, { phase: "committed" });
    expect(first.ok).toBe(true);
    const wash = getStudioInkwashWash();
    expect(wash).not.toBeNull();
    const revision = wash!.session.revision;
    const digest = first.value.fieldDigest;
    const second = planStudioWetInkBrushReplay(pen, { phase: "committed" });
    expect(second.ok).toBe(true);
    expect(getStudioInkwashWash()!.session.revision).toBe(revision);
    expect(second.value.fieldDigest).toBe(digest);
  });
});

function attachedInkwashOverlay() {
  const activeCanvas = {
    width: 320,
    height: 240,
    style: { opacity: "1" },
    getContext: () => ({
      save: () => undefined,
      restore: () => undefined,
      setTransform: () => undefined,
      clearRect: () => undefined,
      drawImage: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
      imageSmoothingEnabled: true,
      lineCap: "butt",
      lineJoin: "miter",
      lineWidth: 1,
      strokeStyle: "#000",
      get globalAlpha() { return 1; },
      set globalAlpha(_value: number) { /* no-op mock */ },
      get globalCompositeOperation() { return "source-over"; },
      set globalCompositeOperation(_value: string) { /* no-op mock */ },
    }),
  } as unknown as HTMLCanvasElement;
  const settledCanvas = {
    width: 320,
    height: 240,
    style: { opacity: "1" },
    getContext: () => ({
      save: () => undefined,
      restore: () => undefined,
      setTransform: () => undefined,
      clearRect: () => undefined,
      drawImage: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      stroke: () => undefined,
      imageSmoothingEnabled: true,
      lineCap: "butt",
      lineJoin: "miter",
      lineWidth: 1,
      strokeStyle: "#000",
      get globalAlpha() { return 1; },
      set globalAlpha(_value: number) { /* no-op mock */ },
      get globalCompositeOperation() { return "source-over"; },
      set globalCompositeOperation(_value: string) { /* no-op mock */ },
    }),
  } as unknown as HTMLCanvasElement;
  const surfaceFactory: StudioWetInkBrushSurfaceFactory = (width, height) => ({
    width,
    height,
    getContext: () => ({
      createImageData: (imageWidth: number, imageHeight: number) => ({
        width: imageWidth,
        height: imageHeight,
        colorSpace: "srgb",
        data: new Uint8ClampedArray(imageWidth * imageHeight * 4),
      }) as ImageData,
      putImageData: () => undefined,
    }),
  } as unknown as StudioWetInkBrushSurface);
  const renderer = new StudioLiveWetInkOverlayRenderer({ surfaceFactory });
  renderer.attach({ activeCanvas, settledCanvas });
  const surface: StudioLiveInkSurface = {
    left: 0,
    top: 0,
    width: 320,
    height: 240,
    documentScale: 1,
    documentWidth: 320,
    flipX: false,
  };
  renderer.setSurface(surface);
  return { renderer };
}
