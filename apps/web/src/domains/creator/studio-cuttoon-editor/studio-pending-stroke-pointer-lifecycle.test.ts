import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPendingStrokeAdmissionQueue } from "../live/studio-pending-stroke-admission";
import { bindStudioCuttoonStagePointersFinish } from "./studio-cuttoon-stage-pointers-finish";
import { bindStudioCuttoonStagePointersRelease } from "./studio-cuttoon-stage-pointers-release";

import type { DrawEl } from "../studio-element-model";
import type { StudioCuttoonStagePointersApi } from "./studio-cuttoon-stage-pointers-api";
import type { StudioCuttoonStagePointersHost } from "./studio-cuttoon-stage-pointers-types";

describe("준비 대기 획의 실제 pointerup 배선", () => {
  afterEach(() => vi.useRealTimers());

  it("원본을 seal하고 transport를 반납하되 앞선 provider의 표면과 CRDT 확정은 건드리지 않는다", () => {
    vi.useFakeTimers();
    const stroke: DrawEl = {
      id: "waiting", type: "draw", mode: "pen", kind: "freehand", brush: "pen",
      points: [10, 20, 30, 40], pressures: [0.2, 0.8], tiltXs: [1, 2], tiltYs: [3, 4],
      sampleTimeOffsets: [0, 20], stroke: "#112233", strokeWidth: 4,
    };
    const scope = { documentKey: "doc", pageId: "page", generation: 1 };
    const drawingRef = { current: stroke as DrawEl | null };
    const admit = vi.fn(() => false);
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => drawingRef.current?.id ?? null });
    queue.defer({ stroke, scope, admit, recover: vi.fn() });
    const clearDraftPreview = vi.fn();
    const flushDirectLiveDraftNow = vi.fn();
    const publisher = { flush: vi.fn(), cancel: vi.fn() };
    const releaseDrawingPointerSession = vi.fn();
    const endLiveResourceEdit = vi.fn();
    const host = {
      drawingRef, pendingStrokeAdmissionRef: { current: queue },
      drawingPointerTransportRef: { current: { getSession: () => ({ pointerId: 7 }) } },
      drawingInputSettingsRef: { current: null }, drawingFixedRateFilterRef: { current: null },
      drawingStabilizerRef: { current: null }, drawingPrecisionStabilizerBridgeRef: { current: null },
      drawingThinLineInkInputRef: { current: null },
      // 앞선 획의 권위가 아직 남아 있는 가장 위험한 입력 순서를 재현한다.
      gpuLiveInkPinnedRef: { current: true }, causalPostCorrectionStateRef: { current: { phase: "active" } },
      drawingCrdtPublisherRef: { current: publisher },
      clearDraftPreview, flushDirectLiveDraftNow, releaseDrawingPointerSession, endLiveResourceEdit,
      stopFixedRateStrokePump: vi.fn(), stopQuickShapeTracking: vi.fn(), scheduleLiveDrawPressure: vi.fn(),
      snapshotQuickShapeTracking: vi.fn(() => ({ held: false })),
    } as unknown as StudioCuttoonStagePointersHost;
    const api = {} as StudioCuttoonStagePointersApi;
    bindStudioCuttoonStagePointersRelease(host, api);
    bindStudioCuttoonStagePointersFinish(host, api);
    api.finishDrawingPointer(null, { pointerId: 7, pointerType: "pen" } as PointerEvent, { consumeReleaseSample: false });
    expect(drawingRef.current).toBeNull();
    expect(releaseDrawingPointerSession).toHaveBeenCalledOnce();
    expect(endLiveResourceEdit).toHaveBeenCalledOnce();
    expect(clearDraftPreview).not.toHaveBeenCalled();
    expect(flushDirectLiveDraftNow).not.toHaveBeenCalled();
    expect(publisher.flush).not.toHaveBeenCalled();
    expect(publisher.cancel).not.toHaveBeenCalled();
    queue.pump();
    expect(admit).toHaveBeenCalledWith(stroke, true, expect.any(Function));
    queue.dispose();
  });
});
