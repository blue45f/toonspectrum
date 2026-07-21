// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeStudioBrushDynamicsSettings } from "./studio-brush-dynamics";
import { STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET } from "./studio-brush-render-budget";
import { encodeStudioBrushTipAlphaMapBase64 } from "./studio-brush-tip-stamp";
import { StudioDrawNode } from "./StudioDrawNode";

import type { DrawEl } from "./studio-element-model";
import type { StudioPatternSpec } from "./studio-pattern-fill";

interface CapturedKonvaNode {
  kind: string;
  props: Record<string, unknown>;
}

class StampSceneContext {
  readonly arcs: string[] = [];
  readonly fills: Array<{ alpha: number; color: string }> = [];
  readonly transforms: string[] = [];
  globalAlpha = 1;
  fillStyle: string | CanvasGradient | CanvasPattern = "";

  save(): void {}
  restore(): void {}
  beginPath(): void {}
  fill(): void {
    this.fills.push({ alpha: this.globalAlpha, color: String(this.fillStyle) });
  }
  arc(x: number, y: number, radius: number): void {
    this.arcs.push(`${x},${y},${radius}`);
  }
  transform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.transforms.push(`${a},${b},${c},${d},${e},${f}`);
  }
}

class AliasSceneContext {
  readonly arcs: Array<{ alpha: number; radius: number; x: number; y: number }> = [];
  readonly strokeWidths: number[] = [];
  fillStyle: string | CanvasGradient | CanvasPattern = "";
  globalAlpha = 1;
  lineCap: CanvasLineCap = "butt";
  lineJoin: CanvasLineJoin = "miter";
  lineWidth = 1;
  strokeStyle: string | CanvasGradient | CanvasPattern = "";

  save(): void {}
  restore(): void {}
  beginPath(): void {}
  closePath(): void {}
  fill(): void {}
  moveTo(): void {}
  lineTo(): void {}
  quadraticCurveTo(): void {}
  stroke(): void {
    this.strokeWidths.push(this.lineWidth);
  }
  arc(x: number, y: number, radius: number): void {
    this.arcs.push({ alpha: this.globalAlpha, radius, x, y });
  }
  createRadialGradient(): CanvasGradient {
    return { addColorStop: () => undefined } as unknown as CanvasGradient;
  }
}

const konvaCapture = vi.hoisted(() => ({
  nodes: [] as CapturedKonvaNode[],
}));

const patternLoader = vi.hoisted(() => ({
  loads: [] as Array<{
    reject: (reason?: unknown) => void;
    resolve: (image: HTMLImageElement) => void;
    src: string;
  }>,
}));

const watercolorCapture = vi.hoisted(() => ({
  causalPlan: vi.fn((
    _input?: {
      baseWidth?: number;
      pressures?: readonly number[];
      spacing?: number;
      [key: string]: unknown;
    },
    _finalize?: boolean,
  ): Array<{
      opacity: number;
      radius: number;
      role: "core" | "diffuse";
      x: number;
      y: number;
    }> => []),
}));

vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const { Fragment, createElement } = await import("react");
  const capture = (kind: string, renderChildren = false) =>
    (props: Record<string, unknown>) => {
      konvaCapture.nodes.push({ kind, props });
      return renderChildren
        ? createElement(Fragment, null, props.children as import("react").ReactNode)
        : null;
    };

  return {
    Arrow: capture("Arrow"),
    Circle: capture("Circle"),
    Ellipse: capture("Ellipse"),
    Group: capture("Group", true),
    Line: capture("Line"),
    Rect: capture("Rect"),
    Shape: capture("Shape"),
    Star: capture("Star"),
  };
});

vi.mock("./studio-pattern-fill", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-pattern-fill")>();
  return {
    ...actual,
    // Scale is applied through Konva props and intentionally does not change the tile bitmap URL.
    patternDataUrl: (pattern: StudioPatternSpec) =>
      `pattern:${pattern.patternId}:${pattern.fg}:${pattern.bg ?? "transparent"}`,
    loadPatternTileImage: (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
      patternLoader.loads.push({ reject, resolve, src });
    }),
  };
});

vi.mock("./studio-causal-watercolor-brush", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./studio-causal-watercolor-brush")>();
  return {
    ...actual,
    planCausalWatercolorBrushDabs: watercolorCapture.causalPlan,
  };
});

function drawEl(overrides: Partial<DrawEl> = {}): DrawEl {
  return {
    id: "draw-1",
    type: "draw",
    points: [0, 0, 10, 0],
    stroke: "#123456",
    strokeWidth: 10,
    ...overrides,
  };
}

function pattern(overrides: Partial<StudioPatternSpec> = {}): StudioPatternSpec {
  return {
    patternId: "dots",
    fg: "#111111",
    scale: 1,
    ...overrides,
  };
}

function captured(kind: string): CapturedKonvaNode[] {
  return konvaCapture.nodes.filter((node) => node.kind === kind);
}

async function flushStampRenderer(): Promise<void> {
  await act(async () => {
    await import("./StudioStampDrawShape");
  });
}

beforeEach(() => {
  konvaCapture.nodes.length = 0;
  patternLoader.loads.length = 0;
  watercolorCapture.causalPlan.mockClear();
});

afterEach(cleanup);

describe("StudioDrawNode pattern image lifecycle", () => {
  it("ignores stale loads, reuses a scale-independent tile, and clears removed patterns", async () => {
    const firstPattern = pattern({ patternId: "dots", fg: "#111111" });
    const secondPattern = pattern({ patternId: "grid", fg: "#222222" });
    const view = render(
      <StudioDrawNode
        el={drawEl({ kind: "rect", pattern: firstPattern, points: [0, 0, 10, 10] })}
      />,
    );

    expect(patternLoader.loads.map((load) => load.src)).toEqual([
      "pattern:dots:#111111:transparent",
    ]);
    view.rerender(
      <StudioDrawNode
        el={drawEl({ kind: "rect", pattern: secondPattern, points: [0, 0, 10, 10] })}
      />,
    );
    expect(patternLoader.loads.map((load) => load.src)).toEqual([
      "pattern:dots:#111111:transparent",
      "pattern:grid:#222222:transparent",
    ]);

    const staleImage = { id: "stale" } as unknown as HTMLImageElement;
    await act(async () => {
      patternLoader.loads[0]!.resolve(staleImage);
      await Promise.resolve();
    });
    expect(captured("Rect").at(-1)!.props.fillPatternImage).toBeUndefined();

    const currentImage = { id: "current" } as unknown as HTMLImageElement;
    await act(async () => {
      patternLoader.loads[1]!.resolve(currentImage);
      await Promise.resolve();
    });
    expect(captured("Rect").at(-1)!.props.fillPatternImage).toBe(currentImage);

    view.rerender(
      <StudioDrawNode
        el={drawEl({
          kind: "rect",
          pattern: { ...secondPattern, scale: 2 },
          points: [0, 0, 10, 10],
        })}
      />,
    );
    expect(patternLoader.loads).toHaveLength(2);
    expect(captured("Rect").at(-1)!.props.fillPatternImage).toBe(currentImage);

    view.rerender(
      <StudioDrawNode el={drawEl({ kind: "rect", points: [0, 0, 10, 10] })} />,
    );
    expect(captured("Rect").at(-1)!.props.fillPatternImage).toBeUndefined();
  });

  it("keeps the fallback empty after a failed tile load or a late unmounted result", async () => {
    const first = render(
      <StudioDrawNode
        el={drawEl({
          kind: "rect",
          pattern: pattern({ patternId: "stripes" }),
          points: [0, 0, 10, 10],
        })}
      />,
    );
    await act(async () => {
      patternLoader.loads[0]!.reject(new Error("tile failed"));
      await Promise.resolve();
    });
    expect(captured("Rect").at(-1)!.props.fillPatternImage).toBeUndefined();
    first.unmount();

    const second = render(
      <StudioDrawNode
        el={drawEl({
          kind: "rect",
          pattern: pattern({ patternId: "checker" }),
          points: [0, 0, 10, 10],
        })}
      />,
    );
    const lateLoad = patternLoader.loads[1]!;
    second.unmount();
    await act(async () => {
      lateLoad.resolve({ id: "late" } as unknown as HTMLImageElement);
      await Promise.resolve();
    });
    expect(patternLoader.loads).toHaveLength(2);
  });
});

describe("StudioDrawNode orchestration", () => {
  it("keeps the hot-path React memo boundary", () => {
    expect((StudioDrawNode as unknown as { $$typeof: symbol }).$$typeof).toBe(
      Symbol.for("react.memo"),
    );
  });

  it("renders source-first and mirrored rectangle bounds", () => {
    render(
      <StudioDrawNode
        el={drawEl({
          kind: "rect",
          points: [2, 3, 8, 11],
          symmetry: { type: "vertical", centerX: 10, centerY: 0 },
        })}
      />,
    );

    expect(captured("Rect").map(({ props }) => ({
      height: props.height,
      width: props.width,
      x: props.x,
      y: props.y,
    }))).toEqual([
      { x: 2, y: 3, width: 6, height: 8 },
      { x: 12, y: 3, width: 6, height: 8 },
    ]);
  });

  it("routes arrow shapes to the registered Konva Arrow node", () => {
    render(
      <StudioDrawNode
        el={drawEl({
          kind: "arrow",
          points: [2, 3, 42, 23],
          stroke: "#654321",
          strokeWidth: 5,
        })}
      />,
    );

    expect(captured("Arrow")).toHaveLength(1);
    expect(captured("Arrow")[0]!.props).toMatchObject({
      fill: "#654321",
      points: [2, 3, 42, 23],
      pointerLength: 10,
      pointerWidth: 10,
      stroke: "#654321",
      strokeWidth: 5,
    });
  });

  it("routes ordinary and eraser taps to generic dots with the correct composite", () => {
    const pen = render(<StudioDrawNode el={drawEl({ points: [4, 7] })} />);
    expect(captured("Circle")).toHaveLength(1);
    expect(captured("Circle")[0]!.props).toMatchObject({
      fill: "#123456",
      globalCompositeOperation: "source-over",
      x: 4,
      y: 7,
    });

    pen.unmount();
    konvaCapture.nodes.length = 0;
    render(
      <StudioDrawNode
        el={drawEl({ mode: "eraser", points: [4, 7], stroke: "#ffffff" })}
      />,
    );
    expect(captured("Circle")).toHaveLength(1);
    expect(captured("Circle")[0]!.props).toMatchObject({
      fill: "#16100c",
      globalCompositeOperation: "destination-out",
    });
  });

  it("makes equal-size fineliner and bold-marker taps visibly distinct through alias profiles", () => {
    const fineliner = render(
      <StudioDrawNode
        el={drawEl({ brush: "fineliner", points: [4, 7], pressures: [0] })}
      />,
    );
    expect(captured("Circle")[0]!.props.radius).toBeCloseTo(3.408);

    fineliner.unmount();
    konvaCapture.nodes.length = 0;
    render(
      <StudioDrawNode
        el={drawEl({ brush: "marker-bold", points: [4, 7], pressures: [0] })}
      />,
    );
    expect(captured("Circle")[0]!.props.radius).toBeCloseTo(11.91);
  });

  it("applies alias diameter and pressure curves to causal pen/marker retained dabs", () => {
    const renderRadii = (brush: "fineliner" | "marker-bold") => {
      const view = render(
        <StudioDrawNode
          el={drawEl({
            brush,
            mode: "pen",
            points: [0, 0, 12, 0],
            pressures: [0.5, 0.5],
            pressureModel: "linear-residual-path-v3",
            sampleSpacing: 1,
          })}
        />,
      );
      const context = new AliasSceneContext();
      const sceneFunc = captured("Shape")[0]!.props.sceneFunc as (
        context: CanvasRenderingContext2D
      ) => void;
      sceneFunc(context as unknown as CanvasRenderingContext2D);
      view.unmount();
      konvaCapture.nodes.length = 0;
      return context.arcs.map((arc) => arc.radius);
    };

    const fineliner = renderRadii("fineliner");
    const boldMarker = renderRadii("marker-bold");
    expect(fineliner.length).toBeGreaterThan(0);
    expect(boldMarker.length).toBeGreaterThan(0);
    expect(Math.max(...boldMarker)).toBeGreaterThan(Math.max(...fineliner) * 3);
  });

  it("keeps liner narrower than G-pen at full pressure in committed segment rendering", () => {
    const renderWidths = (brush: "gpen" | "liner") => {
      const view = render(
        <StudioDrawNode
          el={drawEl({
            brush,
            mode: "pen",
            points: [0, 0, 10, 0, 20, 0, 30, 0, 40, 0],
            pressures: [1, 1, 1, 1, 1],
          })}
        />,
      );
      const context = new AliasSceneContext();
      const sceneFunc = captured("Shape")[0]!.props.sceneFunc as (
        context: CanvasRenderingContext2D
      ) => void;
      sceneFunc(context as unknown as CanvasRenderingContext2D);
      view.unmount();
      konvaCapture.nodes.length = 0;
      return context.strokeWidths;
    };

    const gpen = renderWidths("gpen");
    const liner = renderWidths("liner");
    expect(gpen.length).toBeGreaterThan(0);
    expect(liner.length).toBeGreaterThan(0);
    expect(Math.max(...liner)).toBeLessThan(Math.max(...gpen));
  });

  it("applies ink-wash spacing, pressure, and material scales to retained watercolor", () => {
    watercolorCapture.causalPlan.mockReturnValueOnce([
      { x: 1, y: 2, radius: 10, opacity: 0.6, role: "core" },
      { x: 3, y: 4, radius: 12, opacity: 0.2, role: "diffuse" },
    ]);
    render(
      <StudioDrawNode
        el={drawEl({
          brush: "ink-wash",
          mode: "pen",
          points: [0, 0, 8, 0],
          pressures: [0.5, 0.5],
          strokeWidth: 20,
          watercolorPipeline: "causal-walker-v2",
        })}
      />,
    );

    const [planInput, finalize] = watercolorCapture.causalPlan.mock.calls[0]!;
    expect(planInput?.baseWidth).toBeCloseTo(17.6);
    expect(planInput?.spacing).toBeCloseTo(3.872);
    expect(planInput?.pressures).toEqual([
      expect.any(Number),
      expect.any(Number),
    ]);
    expect(planInput?.pressures?.[0]).toBeGreaterThan(0.5);
    expect(finalize).toBe(true);
    const context = new AliasSceneContext();
    const sceneFunc = captured("Shape")[0]!.props.sceneFunc as (
      context: CanvasRenderingContext2D
    ) => void;
    sceneFunc(context as unknown as CanvasRenderingContext2D);
    expect(context.arcs).toHaveLength(2);
    expect(context.arcs[0]).toMatchObject({ x: 1, y: 2 });
    expect(context.arcs[0]!.radius).toBeCloseTo(7.8);
    expect(context.arcs[0]!.alpha).toBeCloseTo(0.93);
    expect(context.arcs[1]).toMatchObject({ x: 3, y: 4 });
    expect(context.arcs[1]!.radius).toBeCloseTo(18.6);
    expect(context.arcs[1]!.alpha).toBeCloseTo(0.124);
  });

  it("renders soft pencil as a pale wide skirt plus a rough core", () => {
    const standard = render(
      <StudioDrawNode
        el={drawEl({ brush: "pencil", mode: "pen", points: [0, 0, 10, 0] })}
      />,
    );
    expect(captured("Line")).toHaveLength(1);
    expect(captured("Line")[0]!.props).toMatchObject({ opacity: 1, strokeWidth: 10 });

    standard.unmount();
    konvaCapture.nodes.length = 0;
    render(
      <StudioDrawNode
        el={drawEl({ brush: "soft-pencil", mode: "pen", points: [0, 0, 10, 0] })}
      />,
    );
    expect(captured("Line")).toHaveLength(2);
    expect(captured("Line").map(({ props }) => ({
      opacity: props.opacity,
      strokeWidth: props.strokeWidth,
    }))).toEqual([
      { opacity: 0.18, strokeWidth: 24.32 },
      { opacity: 0.72, strokeWidth: 12.8 },
    ]);
    expect(captured("Line")[0]!.props.points).not.toEqual(captured("Line")[1]!.props.points);
  });

  it("keeps the soft-pencil two-pass material on a one-point tap", () => {
    render(
      <StudioDrawNode
        el={drawEl({ brush: "soft-pencil", mode: "pen", points: [4, 7] })}
      />,
    );

    expect(captured("Circle")).toHaveLength(2);
    expect(captured("Circle").map(({ props }) => ({
      opacity: props.opacity,
      radius: props.radius,
    }))).toEqual([
      { opacity: 0.18, radius: 12.16 },
      { opacity: 0.72, radius: 6.4 },
    ]);
  });

  it.each([
    ["causal pen", { points: [4, 7], sampleSpacing: 1 }],
    ["causal stamp", {
      brush: "ink-brush",
      mode: "pen",
      points: [4, 7],
      stampPipeline: "causal-walker-v2",
    }],
  ])("keeps a one-point %s on its engine-specific Shape route", async (_label, overrides) => {
    render(<StudioDrawNode el={drawEl(overrides as Partial<DrawEl>)} />);
    await flushStampRenderer();

    expect(captured("Circle")).toHaveLength(0);
    expect(captured("Shape").length).toBeGreaterThan(0);
  });

  it("renders a symmetric v2 pencil stamp through one bounded affine compositor", async () => {
    render(
      <StudioDrawNode
        el={drawEl({
          brush: "pencil-grain",
          mode: "pen",
          points: [2, 3],
          pressures: [0.7],
          stampPipeline: "causal-walker-v2",
          symmetry: { type: "vertical", centerX: 10, centerY: 0 },
        })}
      />,
    );
    await flushStampRenderer();

    expect(captured("Shape")).toHaveLength(1);
    const context = new StampSceneContext();
    const sceneFunc = captured("Shape")[0]!.props.sceneFunc as (
      context: CanvasRenderingContext2D
    ) => void;
    sceneFunc(context as unknown as CanvasRenderingContext2D);

    expect(context.transforms).toEqual([
      "1,0,0,1,0,0",
      "-1,0,0,1,20,0",
    ]);
    expect(context.arcs).toHaveLength(6);
    expect(context.arcs.slice(0, 3)).toEqual(context.arcs.slice(3));
  });

  it("does not overpaint a kaleidoscope center tap through duplicate Shapes or dabs", async () => {
    render(
      <StudioDrawNode
        el={drawEl({
          brush: "ink-brush",
          mode: "pen",
          points: [50, 40],
          pressures: [0.5],
          stampPipeline: "causal-walker-v2",
          symmetry: {
            type: "kaleidoscope",
            centerX: 50,
            centerY: 40,
            radialCount: 16,
          },
        })}
      />,
    );
    await flushStampRenderer();

    expect(captured("Shape")).toHaveLength(1);
    const context = new StampSceneContext();
    const sceneFunc = captured("Shape")[0]!.props.sceneFunc as (
      context: CanvasRenderingContext2D
    ) => void;
    sceneFunc(context as unknown as CanvasRenderingContext2D);
    expect(context.transforms).toEqual(["1,0,0,1,0,0"]);
    expect(context.arcs).toHaveLength(1);
  });

  it("renders phase-two colour, fixed grain and multi-tip marks on the Canvas path", () => {
    const brushDynamics = normalizeStudioBrushDynamicsSettings({
      tip: { shape: "round", softness: 0.1 },
      colorDynamics: { hueJitter: 65, saturationJitter: 0.2, valueJitter: 0.12 },
      grain: { space: "canvas-fixed", amount: 0.7, scale: 4, contrast: 0.75, seed: 81 },
      tipLayers: [
        { tip: { shape: "star" }, scale: 0.6, opacity: 0.65, offsetY: -0.45 },
        { tip: { shape: "grain" }, scale: 0.4, opacity: 0.45, offsetY: 0.5 },
      ],
      taper: { enabled: false },
      spacingRatio: null,
      spacing: { base: 8, mappings: [] },
      scatterRatio: null,
      scatter: { base: 0, mappings: [] },
    });
    const element = drawEl({
      id: "phase-two-canvas",
      brush: "ink-particle",
      mode: "pen",
      points: [10, 20, 50, 20],
      pressures: [0.7, 0.7],
      stroke: "#356dcc",
      brushDynamics,
    });
    const view = render(<StudioDrawNode el={element} />);
    const layeredContext = new StampSceneContext();
    const layeredScene = captured("Shape")[0]!.props.sceneFunc as (
      context: CanvasRenderingContext2D
    ) => void;
    layeredScene(layeredContext as unknown as CanvasRenderingContext2D);

    view.unmount();
    konvaCapture.nodes.length = 0;
    render(<StudioDrawNode el={{
      ...element,
      brushDynamics: normalizeStudioBrushDynamicsSettings({ ...brushDynamics, tipLayers: [] }),
    }} />);
    const singleContext = new StampSceneContext();
    const singleScene = captured("Shape")[0]!.props.sceneFunc as (
      context: CanvasRenderingContext2D
    ) => void;
    singleScene(singleContext as unknown as CanvasRenderingContext2D);

    expect(layeredContext.arcs.length).toBeGreaterThan(singleContext.arcs.length * 1.5);
    expect(new Set(layeredContext.fills.map((fill) => fill.color)).size).toBeGreaterThan(2);
    expect(new Set(layeredContext.fills.map((fill) => fill.alpha.toFixed(4))).size).toBeGreaterThan(5);
    expect(layeredContext.fills.every((fill) => fill.alpha >= 0 && fill.alpha <= 1)).toBe(true);
  });

  it("keeps pathological live multi-tip kaleidoscope work inside the shared mark budget", () => {
    const alphaMapSize = 8;
    const alphaBytes = new Uint8Array(alphaMapSize * alphaMapSize);
    alphaBytes.fill(255);
    const tip = {
      shape: "hard" as const,
      softness: 0,
      alphaMapBase64: encodeStudioBrushTipAlphaMapBase64(alphaBytes),
      alphaMapSize,
    };
    const brushDynamics = normalizeStudioBrushDynamicsSettings({
      tip,
      tipLayers: [{ tip }, { tip }],
      taper: { enabled: false },
      spacingRatio: null,
      spacing: { base: 0.25, mappings: [] },
    });
    render(<StudioDrawNode
      activeDraft
      el={drawEl({
        id: "bounded-live-kaleidoscope",
        brush: "ink-particle",
        mode: "pen",
        points: [0, 0, 5_000, 0],
        pressures: [0.7, 0.7],
        brushDynamics,
        symmetry: {
          type: "kaleidoscope",
          centerX: 0,
          centerY: 0,
          radialCount: 32,
        },
      })}
    />);

    const shapes = captured("Shape");
    const context = new StampSceneContext();
    // One bounded Shape owns all 64 affine copies; React/Konva no longer reconcile 64 nodes or
    // allocate 64 transformed source-point arrays on every active-draft frame.
    expect(shapes).toHaveLength(1);
    const sceneFunc = shapes[0]!.props.sceneFunc as (context: CanvasRenderingContext2D) => void;
    sceneFunc(context as unknown as CanvasRenderingContext2D);

    expect(context.arcs).toHaveLength(15_552);
    expect(context.arcs.length).toBeLessThanOrEqual(STUDIO_DYNAMIC_BRUSH_LIVE_MARK_BUDGET);
    expect(context.fills).toHaveLength(context.arcs.length);
  });

  it.each([
    [true, false],
    [false, true],
  ])(
    "passes activeDraft=%s as causal-watercolor finalization=%s",
    (activeDraft, expectedFinalize) => {
      render(
        <StudioDrawNode
          activeDraft={activeDraft}
          el={drawEl({
            brush: "watercolor",
            mode: "pen",
            points: [0, 0, 8, 0],
            watercolorPipeline: "causal-walker-v2",
          })}
        />,
      );

      expect(watercolorCapture.causalPlan).toHaveBeenCalledTimes(1);
      expect(watercolorCapture.causalPlan).toHaveBeenCalledWith(
        expect.objectContaining({ points: [0, 0, 8, 0] }),
        expectedFinalize,
      );
    },
  );
});
