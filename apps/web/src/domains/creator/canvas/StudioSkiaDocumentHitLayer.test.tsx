// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioSkiaDocumentHitLayer } from "./StudioSkiaDocumentHitLayer";
import { studioCanvasDocumentSelectionEnabled } from "./studio-canvas-selection-authority";

import type { El } from "../studio-element-model";
import type Konva from "konva";

type PointerEventObject = Konva.KonvaEventObject<PointerEvent>;
const captured = vi.hoisted(() => ({ props: null as null | {
  onPointerDown: (event: PointerEventObject) => void;
  onPointerUp: (event: PointerEventObject) => void;
} }));
vi.mock("react-konva/lib/ReactKonvaCore", () => ({
  Shape: (props: NonNullable<typeof captured.props>) => { captured.props = props; return null; },
}));

const guards = ["activeSurfaceReviewLocked", "canvasInteractionBlocked", "commentPinArmed",
  "advancedFillArmed", "pixelToolArmed", "cropArmed", "panelSplitArmed", "nodeEditArmed", "smudgeArmed",
  "dodgeBurnArmed", "wetMixArmed", "liquifyArmed", "healCloneArmed", "layerMaskPaintArmed",
  "filterMaskPaintArmed", "quickMaskArmed", "historyBrushArmed", "bubbleShapeArmed", "puppetWarpArmed"] as const;
const available: Parameters<typeof studioCanvasDocumentSelectionEnabled>[0] = {
  tool: "select", activeSurfaceReviewLocked: false, canvasInteractionBlocked: false, commentPinArmed: false,
  advancedFillArmed: false, pixelToolArmed: false, cropArmed: false, panelSplitArmed: false, nodeEditArmed: false,
  smudgeArmed: false, dodgeBurnArmed: false, wetMixArmed: false, liquifyArmed: false, healCloneArmed: false,
  layerMaskPaintArmed: false, filterMaskPaintArmed: false, quickMaskArmed: false, historyBrushArmed: false,
  bubbleShapeArmed: false, puppetWarpArmed: false,
};
const stroke = { id: "corrected", type: "draw", kind: "freehand", mode: "pen", brush: "pen",
  points: [10, 20, 30, 40], stroke: "#333333", strokeWidth: 4 } as El;

function pointer(shiftKey = true, point = { x: 10, y: 20 }) {
  const setAttrs = vi.fn();
  const native = { shiftKey, pointerId: 1, preventDefault: vi.fn(), stopPropagation: vi.fn() };
  const event = { evt: native, cancelBubble: false, target: {
    setAttrs, getStage: () => ({ getPointerPosition: () => point }),
    getAbsoluteTransform: () => ({ copy: () => ({ invert: () => ({ point: (value: unknown) => value }) }) }),
  } } as unknown as PointerEventObject;
  return { event, setAttrs, native };
}

afterEach(() => { cleanup(); captured.props = null; });

describe("Skia 문서 접촉의 선택 권한", () => {
  it.each(guards)("%s가 접촉을 소유하면 Shift 선택 전환 없이 Stage에 전달한다", (guard) => {
    const onSelect = vi.fn();
    render(<StudioSkiaDocumentHitLayer elements={[stroke]} effectiveScale={1}
      selectionEnabled={studioCanvasDocumentSelectionEnabled({ ...available, [guard]: true })} onSelect={onSelect} />);
    const { event, setAttrs, native } = pointer();
    captured.props!.onPointerDown(event);
    captured.props!.onPointerUp(event);
    expect(onSelect).not.toHaveBeenCalled();
    expect(setAttrs).toHaveBeenLastCalledWith({ studioElementId: "corrected", name: "skia-document-hit-proxy" });
    expect(event.cancelBubble).toBe(false);
    expect(native.preventDefault).not.toHaveBeenCalled();
    expect(native.stopPropagation).not.toHaveBeenCalled();
  });

  it.each([false, true])("일반 선택은 Shift=%s와 원래 포인터를 그대로 전달한다", (shiftKey) => {
    const onSelect = vi.fn();
    render(<StudioSkiaDocumentHitLayer elements={[stroke]} effectiveScale={1}
      selectionEnabled={studioCanvasDocumentSelectionEnabled(available)} onSelect={onSelect} />);
    const { event } = pointer(shiftKey);
    captured.props!.onPointerDown(event);
    captured.props!.onPointerUp(event);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("corrected", event);
  });

  it("빈 곳은 Stage 배경 경로에 맡기고 다른 기본 도구는 선택하지 않는다", () => {
    const onSelect = vi.fn();
    expect(studioCanvasDocumentSelectionEnabled({ ...available, tool: "draw" })).toBe(false);
    render(<StudioSkiaDocumentHitLayer elements={[stroke]} effectiveScale={1} selectionEnabled onSelect={onSelect} />);
    const { event, setAttrs } = pointer(false, { x: 100, y: 100 });
    captured.props!.onPointerDown(event);
    expect(onSelect).not.toHaveBeenCalled();
    expect(setAttrs).toHaveBeenCalledWith({ studioElementId: undefined, name: "bg" });
    expect(event.cancelBubble).toBe(false);
  });

  it("실제 Stage가 현재 viewport 권한을 hit layer로 전달한다", () => {
    const source = readFileSync(resolve(process.cwd(), "apps/web/src/domains/creator/canvas/StudioCanvasViewportStageHost.tsx"), "utf8");
    expect(source).toContain("selectionEnabled={studioCanvasDocumentSelectionEnabled(viewport)}");
  });
});
