// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  StudioFocusLinesNode,
  StudioFramePanel,
  StudioSpeedLinesNode,
  StudioWorkAssetPlaceholderNode,
} from "./StudioKonvaPrimitiveNodes";

import type { FocusLinesEl, FrameEl, SpeedLinesEl } from "./studio-element-model";
import type { StudioWorkAssetRenderPlaceholder } from "./studio-work-asset-render-projection";
import type { ReactNode } from "react";

const konvaCapture = vi.hoisted(() => ({
  groups: [] as Record<string, unknown>[],
  images: [] as Record<string, unknown>[],
  lines: [] as Record<string, unknown>[],
  order: [] as string[],
  rects: [] as Record<string, unknown>[],
  shapes: [] as Record<string, unknown>[],
  texts: [] as Record<string, unknown>[],
}));

vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const { Fragment, createElement, forwardRef } = await import("react");

  const Group = forwardRef<unknown, Record<string, unknown> & { children?: ReactNode }>((props, ref) => {
    konvaCapture.groups.push({ ...props, ref });
    konvaCapture.order.push("Group");
    return createElement(Fragment, null, props.children as ReactNode);
  });
  const primitive = (name: "Image" | "Line" | "Rect" | "Shape" | "Text", target: Record<string, unknown>[]) => {
    const Component = forwardRef<unknown, Record<string, unknown>>((props, ref) => {
      target.push({ ...props, ref });
      konvaCapture.order.push(name);
      return null;
    });
    Component.displayName = `TestKonva${name}`;
    return Component;
  };

  Group.displayName = "TestKonvaGroup";
  return {
    Group,
    Image: primitive("Image", konvaCapture.images),
    Line: primitive("Line", konvaCapture.lines),
    Rect: primitive("Rect", konvaCapture.rects),
    Shape: primitive("Shape", konvaCapture.shapes),
    Text: primitive("Text", konvaCapture.texts),
  };
});

class ControlledImage {
  height = 100;
  naturalHeight = 100;
  naturalWidth = 200;
  onerror: ((event: Event) => void) | null = null;
  onload: ((event: Event) => void) | null = null;
  src = "";
  width = 200;
}

const imageHarness = {
  instances: [] as ControlledImage[],
};

function frame(overrides: Partial<FrameEl> = {}): FrameEl {
  return {
    height: 100,
    id: "frame-1",
    type: "frame",
    width: 100,
    x: 10,
    y: 20,
    ...overrides,
  };
}

function focusLines(overrides: Partial<FocusLinesEl> = {}): FocusLinesEl {
  return {
    height: 200,
    id: "focus-1",
    innerRadius: 20,
    lineCount: 6,
    noise: 12,
    outerRadius: 100,
    rotation: 0,
    stroke: "#111111",
    strokeWidth: 2,
    type: "focusLines",
    width: 300,
    x: 5,
    y: 6,
    ...overrides,
  };
}

function speedLines(overrides: Partial<SpeedLinesEl> = {}): SpeedLinesEl {
  return {
    direction: "horizontal",
    height: 200,
    id: "speed-1",
    lineCount: 6,
    rotation: 0,
    stroke: "#111111",
    strokeWidth: 2,
    type: "speedLines",
    width: 300,
    x: 5,
    y: 6,
    ...overrides,
  };
}

function commonNodeProps() {
  return {
    draggable: true,
    innerRef: vi.fn(),
    onChange: vi.fn(),
    onSelect: vi.fn(),
  };
}

function latest<T>(values: readonly T[], label: string): T {
  const value = values.at(-1);
  if (!value) throw new Error(`Missing captured ${label}`);
  return value;
}

interface SceneContextCapture {
  beginPath: ReturnType<typeof vi.fn>;
  closePath: ReturnType<typeof vi.fn>;
  fillStrokeShape: ReturnType<typeof vi.fn>;
  lines: number[][];
  lineTo: ReturnType<typeof vi.fn>;
  moves: number[][];
  moveTo: ReturnType<typeof vi.fn>;
  rect: ReturnType<typeof vi.fn>;
}

function sceneContext(): SceneContextCapture {
  const moves: number[][] = [];
  const lines: number[][] = [];
  return {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fillStrokeShape: vi.fn(),
    lines,
    lineTo: vi.fn((...point: number[]) => lines.push(point)),
    moves,
    moveTo: vi.fn((...point: number[]) => moves.push(point)),
    rect: vi.fn(),
  };
}

type CapturedShapeProps = {
  hitFunc: (context: SceneContextCapture, shape: unknown) => void;
  sceneFunc: (context: SceneContextCapture, shape: unknown) => void;
};

beforeEach(() => {
  for (const values of Object.values(konvaCapture)) {
    if (Array.isArray(values)) values.length = 0;
  }
  imageHarness.instances.length = 0;
  class CapturedImage extends ControlledImage {
    constructor() {
      super();
      imageHarness.instances.push(this);
    }
  }
  vi.stubGlobal("Image", CapturedImage);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("StudioFramePanel", () => {
  it("cover-fits loaded images, preserves fill/image/border order, and cleans stale loaders", async () => {
    const view = render(
      <StudioFramePanel
        {...commonNodeProps()}
        el={frame({ bg: "first.png" })}
        theme="classic"
      />
    );
    const first = latest(imageHarness.instances, "image loader");
    expect(first.src).toBe("first.png");

    await act(async () => first.onload?.(new Event("load")));
    expect(latest(konvaCapture.images, "Konva image")).toMatchObject({
      height: 100,
      image: first,
      width: 200,
      x: -50,
      y: 0,
    });
    expect(konvaCapture.order.slice(-4)).toEqual(["Group", "Rect", "Image", "Rect"]);

    view.rerender(
      <StudioFramePanel
        {...commonNodeProps()}
        el={frame({ bg: "second.png" })}
        theme="classic"
      />
    );
    expect(first.onload).toBeNull();
    expect(first.onerror).toBeNull();
    expect(latest(imageHarness.instances, "replacement loader").src).toBe("second.png");
  });

  it("clips polygon frames and bakes scaled dimensions and points while always releasing interaction", () => {
    const onChange = vi.fn();
    const onInteractionEnd = vi.fn();
    const points = [0, 0, 100, 0, 80, 60, 0, 60];
    render(
      <StudioFramePanel
        {...commonNodeProps()}
        el={frame({ height: 60, points })}
        onChange={onChange}
        onInteractionEnd={onInteractionEnd}
        theme="vivid"
      />
    );

    const group = latest(konvaCapture.groups, "frame group") as {
      clipFunc: (context: SceneContextCapture) => void;
      onTransformEnd: (event: { target: Record<string, unknown> }) => void;
    };
    const clip = sceneContext();
    group.clipFunc(clip);
    expect(clip.moveTo).toHaveBeenCalledWith(0, 0);
    expect(clip.lineTo.mock.calls).toEqual([[100, 0], [80, 60], [0, 60]]);
    expect(clip.closePath).toHaveBeenCalledTimes(1);

    const scaleX = vi.fn((value?: number) => value === undefined ? 0.5 : undefined);
    const scaleY = vi.fn((value?: number) => value === undefined ? 2 : undefined);
    group.onTransformEnd({
      target: {
        scaleX,
        scaleY,
        x: () => 7,
        y: () => 9,
      },
    });
    expect(scaleX).toHaveBeenCalledWith(1);
    expect(scaleY).toHaveBeenCalledWith(1);
    expect(onChange).toHaveBeenCalledWith({
      height: 120,
      points: [0, 0, 50, 0, 40, 120, 0, 120],
      width: 50,
      x: 7,
      y: 9,
    });
    expect(onInteractionEnd).toHaveBeenCalledTimes(1);
    expect(konvaCapture.order).toEqual(["Group", "Line", "Line"]);
  });

  it("releases the frame interaction even when a patch consumer throws", () => {
    const failure = new Error("patch failed");
    const onInteractionEnd = vi.fn();
    render(
      <StudioFramePanel
        {...commonNodeProps()}
        el={frame()}
        onChange={() => {
          throw failure;
        }}
        onInteractionEnd={onInteractionEnd}
        theme="classic"
      />
    );
    const group = latest(konvaCapture.groups, "frame group") as {
      onDragEnd: (event: { target: { x: () => number; y: () => number } }) => void;
    };

    expect(() => group.onDragEnd({ target: { x: () => 3, y: () => 4 } })).toThrow(failure);
    expect(onInteractionEnd).toHaveBeenCalledTimes(1);
  });
});

describe("Studio comic effect primitive geometry", () => {
  it("produces repeatable seeded focus-line paths and a full-box hit area", () => {
    render(<StudioFocusLinesNode {...commonNodeProps()} el={focusLines()} />);
    const shape = latest(konvaCapture.shapes, "focus shape") as unknown as CapturedShapeProps;
    const first = sceneContext();
    const second = sceneContext();
    shape.sceneFunc(first, {});
    shape.sceneFunc(second, {});

    expect(first.moves).toEqual(second.moves);
    expect(first.lines).toEqual(second.lines);
    expect(first.moves).toHaveLength(6);
    expect(first.lines).toHaveLength(6);
    expect(first.lines.flat().every(Number.isFinite)).toBe(true);

    const hit = sceneContext();
    shape.hitFunc(hit, {});
    expect(hit.rect).toHaveBeenCalledWith(0, 0, 300, 200);
    expect(hit.fillStrokeShape).toHaveBeenCalledTimes(1);
  });

  it("keeps horizontal and vertical speed-line geometry deterministic and axis-aligned", () => {
    const view = render(<StudioSpeedLinesNode {...commonNodeProps()} el={speedLines()} />);
    const horizontalShape = latest(konvaCapture.shapes, "horizontal speed shape") as unknown as CapturedShapeProps;
    const horizontal = sceneContext();
    const horizontalAgain = sceneContext();
    horizontalShape.sceneFunc(horizontal, {});
    horizontalShape.sceneFunc(horizontalAgain, {});

    expect(horizontal.moves).toEqual(horizontalAgain.moves);
    expect(horizontal.lines).toEqual(horizontalAgain.lines);
    expect(horizontal.moves).toHaveLength(6);
    horizontal.moves.forEach((move, index) => {
      expect(horizontal.lines[index][1]).toBe(move[1]);
    });

    view.rerender(
      <StudioSpeedLinesNode
        {...commonNodeProps()}
        el={speedLines({ direction: "vertical" })}
      />
    );
    const verticalShape = latest(konvaCapture.shapes, "vertical speed shape") as unknown as CapturedShapeProps;
    const vertical = sceneContext();
    verticalShape.sceneFunc(vertical, {});
    expect(vertical.moves).toHaveLength(6);
    vertical.moves.forEach((move, index) => {
      expect(vertical.lines[index][0]).toBe(move[0]);
    });
  });
});

describe("StudioWorkAssetPlaceholderNode", () => {
  it("renders the ready palette and message after its inert placeholder plate", () => {
    const placeholder: StudioWorkAssetRenderPlaceholder = {
      assetId: "asset-1",
      elementType: "image",
      height: 120,
      label: "공유 에셋",
      message: "동기화 완료",
      rotation: 5,
      status: "ready",
      width: 200,
      x: 10,
      y: 20,
    };
    render(<StudioWorkAssetPlaceholderNode placeholder={placeholder} scale={2} />);

    expect(konvaCapture.order).toEqual(["Group", "Rect", "Text", "Text"]);
    expect(konvaCapture.rects[0]).toMatchObject({
      fill: "#052e16",
      stroke: "#22c55e",
      strokeWidth: 0.75,
    });
    expect(konvaCapture.texts.map((props) => props.text)).toEqual(["공유 에셋", "동기화 완료"]);
    expect(konvaCapture.groups[0]).toMatchObject({ listening: false, rotation: 5, x: 10, y: 20 });
  });
});
