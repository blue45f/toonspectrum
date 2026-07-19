// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  bubblePathData,
  bubblePathDataMulti,
  burstStarPathData,
  doubleBubblePathData,
  heartBubblePathData,
  normalizeExtraTails,
  scaredBubblePathData,
  thoughtBubbleBodyPath,
  type BubbleTailSpec,
} from "./studio-bubble-path";
import {
  bubbleHorizontalPadding,
  bubbleVerticalPadding,
} from "./studio-bubble-text-fit";
import { formatVerticalText } from "./studio-bubble-text-runtime";
import { StudioKonvaBubbleNode } from "./StudioKonvaBubbleNode";

import type { El } from "./studio-element-model";
import type { ReactNode } from "react";

const konvaCapture = vi.hoisted(() => ({
  circles: [] as Record<string, unknown>[],
  ellipses: [] as Record<string, unknown>[],
  groups: [] as Record<string, unknown>[],
  lines: [] as Record<string, unknown>[],
  order: [] as string[],
  paths: [] as Record<string, unknown>[],
  rects: [] as Record<string, unknown>[],
  texts: [] as Record<string, unknown>[],
}));

vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const { Fragment, createElement, forwardRef } = await import("react");
  const Group = forwardRef<unknown, Record<string, unknown> & { children?: ReactNode }>((props, ref) => {
    konvaCapture.groups.push({ ...props, ref });
    konvaCapture.order.push("Group");
    return createElement(Fragment, null, props.children as ReactNode);
  });
  const primitive = (
    name: "Circle" | "Ellipse" | "Line" | "Path" | "Rect" | "Text",
    target: Record<string, unknown>[],
  ) => {
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
    Circle: primitive("Circle", konvaCapture.circles),
    Ellipse: primitive("Ellipse", konvaCapture.ellipses),
    Group,
    Line: primitive("Line", konvaCapture.lines),
    Path: primitive("Path", konvaCapture.paths),
    Rect: primitive("Rect", konvaCapture.rects),
    Text: primitive("Text", konvaCapture.texts),
  };
});

type BubbleElement = Extract<El, { type: "bubble" }>;

function bubbleElement(overrides: Partial<BubbleElement> = {}): BubbleElement {
  return {
    fill: "#ffffff",
    height: 100,
    id: "bubble-1",
    rotation: 0,
    text: "안녕하세요",
    textFill: "#111111",
    type: "bubble",
    variant: "speech",
    width: 200,
    x: 10,
    y: 20,
    ...overrides,
  };
}

function commonProps(overrides: Record<string, unknown> = {}) {
  return {
    dragBoundFunc: vi.fn((pos: { x: number; y: number }) => pos),
    draggable: true,
    effectiveScale: 1,
    exporting: false,
    innerRef: vi.fn(),
    onChange: vi.fn(),
    onEdit: vi.fn(),
    onSelect: vi.fn(),
    selected: false,
    theme: "classic" as const,
    ...overrides,
  };
}

function latest<T>(values: readonly T[], label: string): T {
  const value = values.at(-1);
  if (!value) throw new Error(`Missing captured ${label}`);
  return value;
}

function classicTail(overrides: Partial<BubbleTailSpec> = {}): BubbleTailSpec {
  return {
    base: 28.8,
    bend: 0,
    direction: "bottom",
    length: 30,
    ratio: 0.35,
    side: "center",
    ...overrides,
  };
}

beforeEach(() => {
  for (const value of Object.values(konvaCapture)) {
    if (Array.isArray(value)) value.length = 0;
  }
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const variantCases: Array<{
  variant: BubbleElement["variant"];
  expectedData?: () => string;
  ellipseCount?: number;
  pathCount?: number;
  rectCount?: number;
  expectedDash?: number[];
}> = [
  {
    variant: "speech",
    expectedData: () => bubblePathData(200, 100, 18, classicTail()),
    pathCount: 1,
  },
  {
    variant: "double",
    expectedData: () => doubleBubblePathData(200, 100, classicTail()),
    pathCount: 1,
  },
  {
    variant: "shout",
    expectedData: () => burstStarPathData(200, 100, 20, 36, 68),
    pathCount: 1,
  },
  {
    variant: "thought",
    ellipseCount: 3,
    expectedData: () => thoughtBubbleBodyPath(200, 100),
    pathCount: 1,
  },
  {
    variant: "whisper",
    expectedDash: [8, 5],
    expectedData: () => bubblePathData(200, 100, 18, classicTail()),
    pathCount: 1,
  },
  {
    variant: "scared",
    expectedData: () => scaredBubblePathData(200, 100, classicTail()),
    pathCount: 1,
  },
  { variant: "system", rectCount: 2 },
  {
    variant: "angry",
    expectedData: () => burstStarPathData(200, 100, 22, 28, 64),
    pathCount: 1,
  },
  {
    variant: "phone",
    expectedData: () => bubblePathData(200, 100, 8, classicTail({ base: 12, length: 10 })),
    pathCount: 1,
  },
  {
    variant: "heart",
    expectedData: () => heartBubblePathData(200, 100),
    pathCount: 1,
  },
  { variant: "box", rectCount: 1 },
];

describe("StudioKonvaBubbleNode variants", () => {
  it.each(variantCases)("renders $variant with its existing primitive/path contract", (testCase) => {
    render(
      <StudioKonvaBubbleNode
        {...commonProps()}
        el={bubbleElement({ variant: testCase.variant })}
      />,
    );

    expect(konvaCapture.groups).toHaveLength(1);
    expect(konvaCapture.paths).toHaveLength(testCase.pathCount ?? 0);
    expect(konvaCapture.rects).toHaveLength(testCase.rectCount ?? 0);
    expect(konvaCapture.ellipses).toHaveLength(testCase.ellipseCount ?? 0);
    expect(konvaCapture.texts).toHaveLength(1);
    if (testCase.expectedData) {
      expect(latest(konvaCapture.paths, `${testCase.variant} path`).data).toBe(testCase.expectedData());
    }
    if (testCase.expectedDash) {
      expect(latest(konvaCapture.paths, `${testCase.variant} path`).dash).toEqual(testCase.expectedDash);
    }
  });

  it("keeps extra tails in the multi-tail path and preserves gradient fill attrs", () => {
    const extraTails: BubbleTailSpec[] = [
      { base: 20, bend: 0.4, direction: "top", length: 18, ratio: 0.7, side: "center" },
    ];
    render(
      <StudioKonvaBubbleNode
        {...commonProps()}
        el={bubbleElement({
          extraTails,
          gradient: {
            angleDeg: 90,
            stops: [
              { color: "#ffffff", offset: 0 },
              { color: "#ffcc00", offset: 1 },
            ],
            type: "linear",
          },
        })}
      />,
    );

    expect(latest(konvaCapture.paths, "multi-tail path")).toMatchObject({
      data: bubblePathDataMulti(200, 100, 18, [classicTail(), ...normalizeExtraTails(extraTails)]),
      fillLinearGradientColorStops: [0, "#ffffff", 1, "#ffcc00"],
      fillPriority: "linear-gradient",
    });
  });

  it("gives live custom-shape draft points precedence over the stored variant and tail handle", () => {
    const draft = [0, 0, 200, 0, 180, 100, 0, 100];
    render(
      <StudioKonvaBubbleNode
        {...commonProps({ selected: true })}
        customShapeDraftPoints={draft}
        el={bubbleElement({
          customShapePoints: [0, 0, 100, 0, 100, 50, 0, 50],
          variant: "heart",
        })}
      />,
    );

    expect(konvaCapture.lines).toHaveLength(1);
    expect(konvaCapture.lines[0]).toMatchObject({ closed: true, points: draft });
    expect(konvaCapture.paths).toHaveLength(0);
    expect(konvaCapture.rects).toHaveLength(0);
    expect(konvaCapture.circles).toHaveLength(0);
  });
});

describe("StudioKonvaBubbleNode text and interaction", () => {
  it("preserves auto-shrink, vertical formatting, and the shared padding geometry", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      font: "",
      measureText: (value: string) => ({ width: value.length * 40 }),
    } as unknown as CanvasRenderingContext2D);
    const source = "가나다라마바사아자차카타파하";
    render(
      <StudioKonvaBubbleNode
        {...commonProps()}
        el={bubbleElement({
          autoShrinkMinFontSize: 10,
          autoShrinkText: true,
          fontSize: 30,
          height: 60,
          text: source,
          vertical: true,
          width: 100,
        })}
      />,
    );

    const text = latest(konvaCapture.texts, "auto-shrunk text");
    const fontSize = text.fontSize as number;
    const horizontalPadding = bubbleHorizontalPadding(fontSize);
    const verticalPadding = bubbleVerticalPadding(fontSize);
    expect(fontSize).toBeLessThan(30);
    expect(text).toMatchObject({
      height: Math.max(8, 60 - verticalPadding.top - verticalPadding.bottom),
      letterSpacing: 0.3,
      lineHeight: 1.4,
      text: formatVerticalText(source),
      width: Math.max(8, 100 - horizontalPadding * 2),
      x: horizontalPadding,
      y: verticalPadding.top,
    });
  });

  it("shows the selected tail handle and preserves clamping, mirroring, and drag reset", () => {
    const onInteractionBegin = vi.fn(() => true);
    const onInteractionEnd = vi.fn();
    const props = commonProps({
      effectiveScale: 2,
      onInteractionBegin,
      onInteractionEnd,
      selected: true,
    });
    render(
      <StudioKonvaBubbleNode
        {...props}
        el={bubbleElement({ tail: "right", tailXRatio: 0.2 })}
      />,
    );

    const circle = latest(konvaCapture.circles, "tail handle") as {
      onDragStart: (event: Record<string, unknown>) => void;
      onDragEnd: (event: Record<string, unknown>) => void;
      onDragMove: (event: Record<string, unknown>) => void;
    } & Record<string, unknown>;
    expect(circle).toMatchObject({
      draggable: true,
      radius: 3,
      strokeWidth: 0.75,
      x: 160,
      y: 130,
    });

    let x = 190;
    let y = 105;
    const batchDraw = vi.fn();
    const xAccessor = vi.fn((next?: number) => {
      if (next !== undefined) x = next;
      return x;
    });
    const yAccessor = vi.fn((next?: number) => {
      if (next !== undefined) y = next;
      return y;
    });
    const target = {
      getLayer: () => ({ batchDraw }),
      stopDrag: vi.fn(),
      x: xAccessor,
      y: yAccessor,
    };
    const startEvent = { cancelBubble: false, target };
    circle.onDragStart(startEvent);
    expect(startEvent.cancelBubble).toBe(true);
    expect(onInteractionBegin).toHaveBeenCalledTimes(1);
    expect(target.stopDrag).not.toHaveBeenCalled();

    const moveEvent = { cancelBubble: false, target };
    circle.onDragMove(moveEvent);
    expect(moveEvent.cancelBubble).toBe(true);
    expect(props.onChange).toHaveBeenCalledWith({
      tailDirection: "bottom",
      tailHeight: 8,
      tailXRatio: 0.15,
    });

    const endEvent = { cancelBubble: false, target };
    circle.onDragEnd(endEvent);
    expect(endEvent.cancelBubble).toBe(true);
    expect(xAccessor).toHaveBeenCalledWith(160);
    expect(yAccessor).toHaveBeenCalledWith(130);
    expect(batchDraw).toHaveBeenCalledTimes(1);
    expect(onInteractionEnd).toHaveBeenCalledTimes(1);
  });

  it("preserves Group behavior while claiming and releasing the collaboration soft lock", () => {
    const onInteractionBegin = vi.fn(() => true);
    const onInteractionEnd = vi.fn();
    const props = commonProps({ onInteractionBegin, onInteractionEnd });
    render(<StudioKonvaBubbleNode {...props} el={bubbleElement()} />);

    const group = latest(konvaCapture.groups, "bubble group") as {
      dragBoundFunc: unknown;
      onDblClick: () => void;
      onDblTap: () => void;
      onDragStart: (event: Record<string, unknown>) => void;
      onDragEnd: (event: Record<string, unknown>) => void;
      onMouseDown: () => void;
      onTap: () => void;
      onTransformStart: (event: Record<string, unknown>) => void;
      onTransformEnd: (event: Record<string, unknown>) => void;
      ref: unknown;
    } & Record<string, unknown>;
    expect(group.ref).toBe(props.innerRef);
    expect(group.dragBoundFunc).toBe(props.dragBoundFunc);

    group.onMouseDown();
    group.onTap();
    group.onDblClick();
    group.onDblTap();
    expect(props.onSelect).toHaveBeenCalledTimes(2);
    expect(props.onEdit).toHaveBeenCalledTimes(2);

    const dragTarget = { stopDrag: vi.fn(), x: () => 7, y: () => 8 };
    group.onDragStart({ target: dragTarget });
    expect(onInteractionBegin).toHaveBeenCalledTimes(1);
    expect(dragTarget.stopDrag).not.toHaveBeenCalled();
    group.onDragEnd({ target: dragTarget });
    expect(props.onChange).toHaveBeenLastCalledWith({ x: 7, y: 8 });
    expect(onInteractionEnd).toHaveBeenCalledTimes(1);

    const scaleX = vi.fn((value?: number) => value === undefined ? 2 : undefined);
    const scaleY = vi.fn((value?: number) => value === undefined ? 0.25 : undefined);
    const transformTarget = {
      rotation: () => 15,
      scaleX,
      scaleY,
      stopDrag: vi.fn(),
      x: () => 9,
      y: () => 10,
    };
    group.onTransformStart({ target: transformTarget });
    expect(onInteractionBegin).toHaveBeenCalledTimes(2);
    group.onTransformEnd({ target: transformTarget });
    expect(scaleX).toHaveBeenCalledWith(1);
    expect(scaleY).toHaveBeenCalledWith(1);
    expect(props.onChange).toHaveBeenLastCalledWith({
      height: 50,
      rotation: 15,
      width: 400,
      x: 9,
      y: 10,
    });
    expect(onInteractionEnd).toHaveBeenCalledTimes(2);
  });

  it("stops a denied bubble gesture and always releases after a failing commit", () => {
    const onInteractionBegin = vi.fn(() => false);
    const onInteractionEnd = vi.fn();
    const onChange = vi.fn(() => {
      throw new Error("commit failed");
    });
    render(
      <StudioKonvaBubbleNode
        {...commonProps({ onChange, onInteractionBegin, onInteractionEnd })}
        el={bubbleElement()}
      />,
    );

    const group = latest(konvaCapture.groups, "guarded bubble group") as {
      onDragStart: (event: Record<string, unknown>) => void;
      onDragEnd: (event: Record<string, unknown>) => void;
    };
    const target = { stopDrag: vi.fn(), x: () => 7, y: () => 8 };
    group.onDragStart({ target });
    expect(target.stopDrag).toHaveBeenCalledTimes(1);
    expect(() => group.onDragEnd({ target })).toThrow("commit failed");
    expect(onInteractionEnd).toHaveBeenCalledTimes(1);
  });
});
