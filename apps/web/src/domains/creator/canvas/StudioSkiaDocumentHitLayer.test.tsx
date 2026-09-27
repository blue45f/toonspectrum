// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { bindStudioCuttoonStagePointersDownArmed } from "../studio-cuttoon-editor/studio-cuttoon-stage-pointers-down-armed";
import { planGroupClickSelection } from "../studio-group-selection";
import { useStudioVectorNodeBubbleEdit } from "../vector/studio-node-bubble-edit-controller";

import { StudioSkiaDocumentHitLayer } from "./StudioSkiaDocumentHitLayer";

import type { StudioCuttoonStagePointersApi } from "../studio-cuttoon-editor/studio-cuttoon-stage-pointers-api";
import type { StudioCuttoonStagePointersHost } from "../studio-cuttoon-editor/studio-cuttoon-stage-pointers-types";
import type { DrawEl } from "../studio-element-model";
import type { GroupSelectionState } from "../studio-group-selection";
import type Konva from "konva";

type HitEvent = Konva.KonvaEventObject<PointerEvent>;
const shape = vi.hoisted(() => ({
  props: null as null | {
    onPointerDown: (event: HitEvent) => void;
    onPointerUp: (event: HitEvent) => void;
  },
}));
vi.mock("react-konva/lib/ReactKonvaCore", () => ({
  Shape: (props: NonNullable<typeof shape.props>) => {
    shape.props = props;
    return null;
  },
}));

afterEach(() => { cleanup(); shape.props = null; });

const idleSelection = {
  tool: "select" as const,
  activeSurfaceReviewLocked: false,
  advancedFillArmed: false,
  pixelToolArmed: false,
  cropArmed: false,
  panelSplitArmed: false,
  nodeEditArmed: false,
  smudgeArmed: false,
  dodgeBurnArmed: false,
  wetMixArmed: false,
  liquifyArmed: false,
  healCloneArmed: false,
  layerMaskPaintArmed: false,
  filterMaskPaintArmed: false,
  quickMaskArmed: false,
  historyBrushArmed: false,
  bubbleShapeArmed: false,
  puppetWarpArmed: false,
};

const stroke: DrawEl = {
  id: "corrected-shape", type: "draw", kind: "freehand", mode: "pen", brush: "pen",
  points: [10, 20, 80, 20, 100, 40], pressures: [0.2, 0.5, 0.8],
  stroke: "#123456", strokeWidth: 4,
};

function hitEvent(shiftKey = false, point = { x: 10, y: 20 }) {
  const canvas = document.createElement("canvas");
  canvas.setPointerCapture = vi.fn();
  canvas.releasePointerCapture = vi.fn();
  let name = "skia-document-hit-proxy";
  const setAttrs = vi.fn((attrs: { name: string }) => { name = attrs.name; });
  const target = {
    getStage: () => ({
      getPointerPosition: () => point,
      getRelativePointerPosition: () => point,
    }),
    getAbsoluteTransform: () => ({ copy: () => ({ invert: () => ({ point: () => point }) }) }),
    getParent: () => null,
    name: () => name,
    setAttrs,
  };
  const event = {
    evt: { pointerId: 7, pointerType: "pen", target: canvas, shiftKey },
    target,
    cancelBubble: false,
  } as unknown as HitEvent;
  return { event, setAttrs, canvas };
}

function dispatchDown(event: HitEvent) {
  if (!shape.props) throw new Error("Skia hit 레이어가 렌더되지 않았습니다.");
  act(() => shape.props?.onPointerDown(event));
}

describe("Skia 문서 선택의 도구 권위 경계", () => {
  it.each(Object.keys(idleSelection).filter((key) => key !== "tool"))(
    "%s 동안 요소 선택을 바꾸지 않고 상위 포인터 이벤트를 보존한다",
    (blocked) => {
      const onSelect = vi.fn();
      const props = {
        elements: [stroke], effectiveScale: 1, onSelect,
        selectionState: { ...idleSelection, [blocked]: true },
      };
      render(<StudioSkiaDocumentHitLayer {...props} />);
      const { event, setAttrs } = hitEvent(true);
      dispatchDown(event);
      expect(onSelect).not.toHaveBeenCalled();
      expect(event.cancelBubble).toBe(false);
      expect(setAttrs).toHaveBeenCalledWith({
        studioElementId: stroke.id, name: "skia-document-hit-proxy",
      });
    },
  );

  it("드로잉 도구에서는 요소 선택을 시작하지 않는다", () => {
    const onSelect = vi.fn();
    const props = {
      elements: [stroke], effectiveScale: 1, onSelect,
      selectionState: { ...idleSelection, tool: "draw" as const },
    };
    render(<StudioSkiaDocumentHitLayer {...props} />);
    dispatchDown(hitEvent().event);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("일반 선택과 Shift 다중 선택은 원래 이벤트로 기존 선택 엔진에 전달한다", () => {
    const other: DrawEl = { ...stroke, id: "other", points: [10, 50, 80, 50] };
    let selection: GroupSelectionState = { selectedId: null, marqueeIds: [], activeGroupId: null };
    const onSelect = vi.fn((id: string, event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      selection = planGroupClickSelection({
        items: [stroke, other], groups: [], clickedId: id,
        current: selection, additive: event?.evt.shiftKey === true,
      });
    });
    const props = { elements: [stroke, other], effectiveScale: 1, onSelect, selectionState: idleSelection };
    render(<StudioSkiaDocumentHitLayer {...props} />);
    const first = hitEvent().event;
    dispatchDown(first);
    expect(selection).toEqual({ selectedId: stroke.id, marqueeIds: [], activeGroupId: null });
    expect(onSelect).toHaveBeenLastCalledWith(stroke.id, first);
    const second = hitEvent(true, { x: 10, y: 50 }).event;
    dispatchDown(second);
    expect(selection).toEqual({ selectedId: null, marqueeIds: [stroke.id, other.id], activeGroupId: null });
    expect(onSelect).toHaveBeenLastCalledWith(other.id, second);
  });

  it("빈 영역과 pointerup은 선택을 추가하지 않고 Stage 배경 처리에 위임한다", () => {
    const onSelect = vi.fn();
    const props = { elements: [stroke], effectiveScale: 1, onSelect, selectionState: idleSelection };
    render(<StudioSkiaDocumentHitLayer {...props} />);
    const empty = hitEvent(false, { x: 500, y: 500 });
    dispatchDown(empty.event);
    expect(empty.setAttrs).toHaveBeenCalledWith({ studioElementId: undefined, name: "bg" });
    act(() => shape.props?.onPointerUp(hitEvent().event));
    expect(onSelect).not.toHaveBeenCalled();
    expect(empty.event.cancelBubble).toBe(false);
  });

  it("무장한 노드의 Shift pointerdown은 선택을 유지하고 실제 Stage 노드 드래그를 연다", () => {
    const hook = renderHook(() => {
      const [selectedId, setSelectedId] = useState<string | null>(stroke.id);
      return { selectedId, setSelectedId, ...useStudioVectorNodeBubbleEdit({ selectedId }) };
    });
    act(() => hook.result.current.setNodeEditTool("move", stroke.id));
    const hostValues: Record<string, unknown> = {
      ...hook.result.current, selected: stroke, nodeEditArmed: true, effScale: 1,
      nodeEditHandles: [{ pointIndex: 0, x: 10, y: 20 }],
    };
    const host = new Proxy(hostValues, {
      get(values, property: string) {
        if (!(property in values) && property.endsWith("Ref")) values[property] = { current: null };
        return values[property];
      },
    }) as unknown as StudioCuttoonStagePointersHost;
    const api = {} as StudioCuttoonStagePointersApi;
    bindStudioCuttoonStagePointersDownArmed(host, api);
    const onSelect = vi.fn((id: string, event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>) => {
      const next = planGroupClickSelection({
        items: [stroke], groups: [], clickedId: id,
        current: { selectedId: hook.result.current.selectedId, marqueeIds: [], activeGroupId: null },
        additive: event?.evt.shiftKey === true,
      });
      hook.result.current.setSelectedId(next.selectedId);
    });
    const props = {
      elements: [stroke], effectiveScale: 1, onSelect,
      selectionState: { ...idleSelection, nodeEditArmed: true },
    };
    render(<StudioSkiaDocumentHitLayer {...props} />);
    const { event, canvas } = hitEvent(true);
    act(() => {
      shape.props?.onPointerDown(event);
      if (!event.cancelBubble) expect(api.tryStageDownArmedTools(event, event.evt)).toBe(true);
    });
    expect(hook.result.current.selectedId).toBe(stroke.id);
    expect(hook.result.current.nodeEditTool).toBe("move");
    expect(hook.result.current.nodeEditDragRef.current?.pointerId).toBe(7);
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(7);
    expect(onSelect).not.toHaveBeenCalled();
  });
});
