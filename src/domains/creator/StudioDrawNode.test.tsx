// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioDrawNode } from "./StudioDrawNode";

import type { DrawEl } from "./studio-element-model";
import type { StudioPatternSpec } from "./studio-pattern-fill";

interface CapturedKonvaNode {
  kind: string;
  props: Record<string, unknown>;
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
  causalPlan: vi.fn(() => []),
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

  it.each([
    ["causal pen", { points: [4, 7], sampleSpacing: 1 }],
    ["causal stamp", {
      brush: "ink-brush",
      mode: "pen",
      points: [4, 7],
      stampPipeline: "causal-walker-v2",
    }],
  ])("keeps a one-point %s on its engine-specific Shape route", (_label, overrides) => {
    render(<StudioDrawNode el={drawEl(overrides as Partial<DrawEl>)} />);

    expect(captured("Circle")).toHaveLength(0);
    expect(captured("Shape").length).toBeGreaterThan(0);
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
