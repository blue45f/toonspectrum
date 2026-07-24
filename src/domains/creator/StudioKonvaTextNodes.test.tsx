// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildTextPathData, normalizeTextPath } from "./studio-text-path";
import {
  StudioKonvaStickerNode,
  StudioKonvaTextNode,
} from "./StudioKonvaTextNodes";

import type { El } from "./studio-element-model";

const konvaCapture = vi.hoisted(() => ({
  groups: [] as Record<string, unknown>[],
  textPaths: [] as Record<string, unknown>[],
  texts: [] as Record<string, unknown>[],
}));

vi.mock("react-konva/lib/ReactKonvaCore", async () => {
  const { forwardRef } = await import("react");
  const primitive = (target: Record<string, unknown>[]) => {
    const Component = forwardRef<unknown, Record<string, unknown>>((props, ref) => {
      target.push({ ...props, ref });
      return null;
    });
    return Component;
  };
  const container = (target: Record<string, unknown>[]) => {
    const Component = forwardRef<unknown, Record<string, unknown>>(({ children, ...props }, ref) => {
      target.push({ ...props, ref });
      return children as never;
    });
    return Component;
  };
  return {
    Group: container(konvaCapture.groups),
    Text: primitive(konvaCapture.texts),
    TextPath: primitive(konvaCapture.textPaths),
  };
});

type TextElement = Extract<El, { type: "text" }>;
type StickerElement = Extract<El, { type: "sticker" }>;

function textElement(overrides: Partial<TextElement> = {}): TextElement {
  return {
    fill: "#111111",
    fontSize: 32,
    id: "text-1",
    rotation: 0,
    text: "대사",
    type: "text",
    width: 220,
    x: 10,
    y: 20,
    ...overrides,
  };
}

function stickerElement(overrides: Partial<StickerElement> = {}): StickerElement {
  return {
    fontSize: 48,
    id: "sticker-1",
    rotation: 5,
    text: "✨",
    type: "sticker",
    x: 30,
    y: 40,
    ...overrides,
  };
}

function commonProps(overrides: Record<string, unknown> = {}) {
  return {
    dragBoundFunc: vi.fn((pos: { x: number; y: number }) => pos),
    draggable: true,
    innerRef: vi.fn(),
    onCommitTransform: vi.fn(),
    onEdit: vi.fn(),
    onInteractionBegin: vi.fn(() => true),
    onInteractionEnd: vi.fn(),
    onPatch: vi.fn(),
    onSelect: vi.fn(),
    ...overrides,
  };
}

function latest<T>(values: readonly T[], label: string): T {
  const value = values.at(-1);
  if (!value) throw new Error(`Missing captured ${label}`);
  return value;
}

beforeEach(() => {
  konvaCapture.groups.length = 0;
  konvaCapture.textPaths.length = 0;
  konvaCapture.texts.length = 0;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("StudioKonvaTextNode", () => {
  it("routes a flat path to Text and a curved path to TextPath with the exact transform contracts", () => {
    const flatProps = commonProps();
    const view = render(
      <StudioKonvaTextNode
        {...flatProps}
        el={textElement({ textPath: { shape: "none", curve: 50 } })}
      />,
    );

    expect(konvaCapture.texts).toHaveLength(1);
    expect(konvaCapture.textPaths).toHaveLength(0);
    const flat = latest(konvaCapture.texts, "flat text") as {
      onTransformEnd: (event: unknown) => void;
    };
    const flatEvent = { target: "flat-node" };
    flat.onTransformEnd(flatEvent);
    expect(flatProps.onCommitTransform).toHaveBeenCalledWith(
      "text-1",
      32,
      flatEvent,
      { minFontSize: 10, patchWidth: true },
    );

    const curvedProps = commonProps();
    const curvedPath = { shape: "arcUp" as const, curve: 72 };
    view.rerender(
      <StudioKonvaTextNode
        {...curvedProps}
        el={textElement({ textPath: curvedPath })}
      />,
    );

    const curved = latest(konvaCapture.textPaths, "curved text") as {
      data: string;
      onTransformEnd: (event: unknown) => void;
    };
    expect(curved.data).toBe(buildTextPathData(normalizeTextPath(curvedPath), 220, 32));
    const curvedEvent = { target: "path-node" };
    curved.onTransformEnd(curvedEvent);
    expect(curvedProps.onCommitTransform).toHaveBeenCalledWith(
      "text-1",
      32,
      curvedEvent,
      { minFontSize: 10 },
    );
  });

  it("typesets vertical text as right-to-left columns with rotated latin runs", () => {
    const props = commonProps();
    render(
      <StudioKonvaTextNode
        {...props}
        el={textElement({ align: "left", fontSize: 20, text: "가나ABC。\n다", vertical: true })}
      />,
    );

    const group = latest(konvaCapture.groups, "vertical group");
    expect(group).toMatchObject({ studioElementId: "text-1", width: 220, x: 10, y: 20 });
    expect(group.ref).toBe(props.innerRef);

    expect(
      konvaCapture.texts.map((text) => [text.text, text.rotation, text.x]),
    ).toEqual([
      // 1열(오른쪽, centerX=42): 직립 런 → 회전 런 → 우상단(+0.5em)으로 옮긴 마침표.
      ["가\n나", 0, 32],
      ["ABC", 90, 32],
      ["。", 0, 42],
      // 2열(왼쪽, centerX=14): 원문의 두 번째 줄.
      ["다", 0, 4],
    ]);
    // 회전 런은 앞선 직립 두 글자(20px×2) 다음에 시작하고, 마침표는 그 런의 폭만큼 더 내려간
    // 뒤 0.5em 위로 올라간다(가로쓰기 좌하단 → 세로쓰기 우상단).
    expect(konvaCapture.texts.map((text) => text.y)).toEqual([0, 40, 63, 0]);
  });

  it("commits vertical transforms through the same width-patching contract", () => {
    const props = commonProps();
    render(
      <StudioKonvaTextNode {...props} el={textElement({ text: "가나", vertical: true })} />,
    );

    const group = latest(konvaCapture.groups, "vertical group") as {
      onTransformEnd: (event: unknown) => void;
    };
    const event = { target: "vertical-node" };
    group.onTransformEnd(event);

    expect(props.onCommitTransform).toHaveBeenCalledWith("text-1", 32, event, {
      minFontSize: 10,
      patchWidth: true,
    });
  });

  it("preserves SFX lettering gradient, stroke, shadow, skew, and typography attributes", () => {
    render(
      <StudioKonvaTextNode
        {...commonProps()}
        el={textElement({
          fill: "#ffb24a",
          fillType: "gradient",
          font: "Black Han Sans",
          fontStyle: "bold italic",
          gradientColorEnd: "#ff8a2e",
          gradientColorStart: "#fff3c2",
          gradientDirection: "vertical",
          letterSpacing: 2,
          opacity: 0.8,
          rotation: -7,
          shadowBlur: 10,
          shadowColor: "#1a0a04",
          shadowOffsetX: 3,
          shadowOffsetY: 4,
          shadowOpacity: 0.4,
          skewX: 15,
          skewY: -10,
          stroke: "#33110a",
          strokeWidth: 8,
          text: "쾅!",
        })}
      />,
    );

    const sfx = latest(konvaCapture.texts, "SFX text");
    expect(sfx).toMatchObject({
      fill: undefined,
      fillAfterStrokeEnabled: true,
      fillLinearGradientColorStops: [0, "#fff3c2", 1, "#ff8a2e"],
      fillPriority: "linear-gradient",
      fontFamily: "Black Han Sans",
      fontStyle: "bold italic",
      letterSpacing: 2,
      lineJoin: "round",
      opacity: 0.8,
      rotation: -7,
      shadowBlur: 10,
      shadowColor: "#1a0a04",
      shadowEnabled: true,
      shadowOffsetX: 3,
      shadowOffsetY: 4,
      shadowOpacity: 0.4,
      stroke: "#33110a",
      strokeWidth: 8,
      text: "쾅!",
    });
    expect(sfx.skewX).toBeCloseTo(Math.tan((15 * Math.PI) / 180));
    expect(sfx.skewY).toBeCloseTo(Math.tan((-10 * Math.PI) / 180));
  });

  it("wires ref, selection, editing, snapping, drag patches, and soft-lock lifecycle", () => {
    const target = {
      stopDrag: vi.fn(),
      x: () => 71,
      y: () => 82,
    };
    const props = commonProps({ onInteractionBegin: vi.fn(() => false) });
    render(<StudioKonvaTextNode {...props} el={textElement()} />);

    const node = latest(konvaCapture.texts, "interactive text") as {
      dragBoundFunc: unknown;
      draggable: boolean;
      onDblClick: () => void;
      onDragEnd: (event: { target: typeof target }) => void;
      onDragStart: (event: { target: typeof target }) => void;
      onMouseDown: () => void;
      ref: unknown;
    };
    expect(node.ref).toBe(props.innerRef);
    expect(node.dragBoundFunc).toBe(props.dragBoundFunc);
    expect(node.draggable).toBe(true);

    node.onMouseDown();
    node.onDblClick();
    node.onDragStart({ target });
    node.onDragEnd({ target });

    expect(props.onSelect).toHaveBeenCalledTimes(1);
    expect(props.onEdit).toHaveBeenCalledWith("text-1");
    expect(props.onInteractionBegin).toHaveBeenCalledTimes(1);
    expect(target.stopDrag).toHaveBeenCalledTimes(1);
    expect(props.onPatch).toHaveBeenCalledWith("text-1", { x: 71, y: 82 });
    expect(props.onInteractionEnd).toHaveBeenCalledTimes(1);
  });
});

describe("StudioKonvaStickerNode", () => {
  it("preserves sticker attrs and commits transforms with the 16px floor", () => {
    const props = commonProps();
    render(
      <StudioKonvaStickerNode
        {...props}
        el={stickerElement({ opacity: 0.6, skewX: 30, skewY: -15 })}
      />,
    );

    const sticker = latest(konvaCapture.texts, "sticker") as {
      onTransformEnd: (event: unknown) => void;
      ref: unknown;
      skewX: number;
      skewY: number;
    };
    expect(sticker).toMatchObject({
      fontSize: 48,
      opacity: 0.6,
      rotation: 5,
      studioElementId: "sticker-1",
      text: "✨",
      x: 30,
      y: 40,
    });
    expect(sticker.ref).toBe(props.innerRef);
    expect(sticker.skewX).toBeCloseTo(Math.tan((30 * Math.PI) / 180));
    expect(sticker.skewY).toBeCloseTo(Math.tan((-15 * Math.PI) / 180));

    const event = { target: "sticker-node" };
    sticker.onTransformEnd(event);
    expect(props.onCommitTransform).toHaveBeenCalledWith(
      "sticker-1",
      48,
      event,
      { minFontSize: 16 },
    );
  });
});
