import { describe, expect, it, vi } from "vitest";

import { bindStudioCuttoonStagePointersDown } from "./studio-cuttoon-stage-pointers-down";
import { bindStudioCuttoonStagePointersDownDraw } from "./studio-cuttoon-stage-pointers-down-draw";

import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";

describe("pointer admission host wiring", () => {
  it("선택 준비 중 첫 접촉을 DOM 플래그 대신 원본 입력 저널에 전달한다", () => {
    const capturePendingCatalogInput = vi.fn(() => true);
    const host = {
      nodeEditDragRef: { current: null }, liquifyDragRef: { current: null },
      pixelDragRef: { current: null }, pendingPixelSelectionRasterGestureRef: { current: null },
      pendingRasterRetouchGestureRef: { current: null }, bubbleShapeDragRef: { current: null },
      handleStudioPointCommentStageDown: () => false,
      capturePendingCatalogInput,
    } as unknown as StudioCuttoonStagePointersHost;
    const api = { tryStageDownDraw: vi.fn() } as unknown as StudioCuttoonStagePointersApi;
    bindStudioCuttoonStagePointersDown(host, api);
    const pointer = { pointerType: "pen", timeStamp: 1 } as PointerEvent;
    const stage = {};
    api.onStageDown({ target: { name: () => "bg", getStage: () => stage }, evt: pointer });
    expect(capturePendingCatalogInput).toHaveBeenCalledWith(pointer, stage);
    expect(api.tryStageDownDraw).not.toHaveBeenCalled();
  });
  it("asks the host to settle the previous page before starting a new draw operation", () => {
    const prepareStrokeCommitPage = vi.fn(() => false);
    const setError = vi.fn();
    const host = {
      tool: "draw",
      livingInkFinalizingRef: { current: false },
      hokusaiLiveFinalizingRef: { current: false },
      appSettingsRef: { current: { touch: {} } },
      drawingPointerTransportRef: { current: { getSession: () => null } },
      drawingRef: { current: null },
      zoomGestureRef: { current: null },
      prepareStrokeCommitPage,
      setError,
    } as unknown as StudioCuttoonStagePointersHost;
    const api = {} as StudioCuttoonStagePointersApi;
    bindStudioCuttoonStagePointersDownDraw(host, api);
    const pointer = { pointerType: "mouse", timeStamp: 1 } as PointerEvent;

    api.tryStageDownDraw({ evt: pointer }, pointer);

    expect(prepareStrokeCommitPage).toHaveBeenCalledOnce();
    expect(setError).toHaveBeenCalledWith(expect.stringContaining("이전 페이지의 마지막 획"));
    expect(host.drawingRef.current).toBeNull();
  });
});
