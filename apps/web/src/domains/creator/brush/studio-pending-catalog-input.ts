import type Konva from "konva";
import type { StudioBrushSnapshot } from "./studio-brush-library";
import { snapshotStudioStagePointerBatchMapper, type StudioStagePointerBatchMapper } from "../canvas/studio-stage-pointer-coordinate";

export type StudioBrushSelectionLifecycle = {
  requestId: string;
  catalogId: string;
  operation?: "paint" | "erase";
  phase: "preparing" | "applied" | "failed" | "cancelled";
};
export interface StudioCatalogPointerBatch {
  pointer: PointerEvent;
  mapper: StudioStagePointerBatchMapper;
}
export interface StudioCatalogInputGesture {
  id: string;
  ownerScope: string;
  catalogId: string;
  operation?: "paint" | "erase";
  brushSnapshot?: StudioBrushSnapshot;
  scope: string;
  sourceScope?: string;
  stage: Konva.Stage;
  start: StudioCatalogPointerBatch;
  moves: StudioCatalogPointerBatch[];
  end: PointerEvent | null;
  endMapper?: StudioStagePointerBatchMapper;
}

/** 브라우저 이벤트 수명이 끝나도 원본 센서와 coalesced 표본을 그대로 소유한다. */
export function snapshotStudioCatalogPointer(event: PointerEvent, coalesced = true): PointerEvent {
  const samples = coalesced ? (event.getCoalescedEvents?.() ?? []).map((sample) => snapshotStudioCatalogPointer(sample, false)) : [];
  const snapshot = new Event(event.type, {
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    composed: event.composed,
  }) as PointerEvent;
  const values = {
    target: event.target, currentTarget: event.currentTarget,
    pointerId: event.pointerId, pointerType: event.pointerType, isPrimary: event.isPrimary,
    clientX: event.clientX, clientY: event.clientY, screenX: event.screenX, screenY: event.screenY,
    width: event.width, height: event.height, pressure: event.pressure,
    tangentialPressure: event.tangentialPressure, tiltX: event.tiltX, tiltY: event.tiltY,
    twist: event.twist, altitudeAngle: event.altitudeAngle, azimuthAngle: event.azimuthAngle,
    button: event.button, buttons: event.buttons, timeStamp: event.timeStamp,
    altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey,
    movementX: event.movementX, movementY: event.movementY,
    getCoalescedEvents: () => samples, getPredictedEvents: () => [],
  };
  Object.defineProperties(snapshot, Object.fromEntries(Object.entries(values).map(([key, value]) => [
    key, { configurable: true, enumerable: true, value },
  ])));
  return snapshot;
}

/** 선택 준비는 문서 획이 아니다. 실제 브러시가 활성화된 뒤 정상 샘플러에만 전달한다. */
export class StudioPendingCatalogInput {
  private selectedSnapshot: StudioBrushSnapshot | undefined;
  private request: StudioBrushSelectionLifecycle | null = null;
  private gestures: StudioCatalogInputGesture[] = [];
  private active: StudioCatalogInputGesture | null = null;
  private lastScope: string | null = null;
  private releaseListeners: ((releaseCapture?: boolean) => void) | null = null;
  constructor(private readonly notify: (message: string) => void, private readonly persist: (gesture: StudioCatalogInputGesture, restoredStrokeId?: string) => void = () => undefined) {}

  restore(gestures: StudioCatalogInputGesture[]): void {
    for (const gesture of gestures) {
      const existing = this.gestures.find((candidate) => candidate.id === gesture.id);
      if (existing?.scope === gesture.scope) continue;
      this.gestures = this.gestures.filter((candidate) => candidate.id !== gesture.id);
      this.gestures.push(gesture);
    }
    if (gestures.length) this.notify("보관된 브러시 입력이 있어요. 같은 브러시를 선택하면 이어집니다.");
  }

  selection(event: StudioBrushSelectionLifecycle, snapshot?: StudioBrushSnapshot, scope?: string): void {
    if (event.phase === "preparing") { this.request = event; this.selectedSnapshot = undefined; }
    else if (this.request?.requestId === event.requestId) {
      this.request = event;
      if (event.phase === "applied" && snapshot) {
        this.selectedSnapshot = structuredClone(snapshot);
        for (const gesture of this.gestures) {
          if (gesture.catalogId === event.catalogId && (!scope || gesture.scope === scope) && !gesture.brushSnapshot) gesture.brushSnapshot = structuredClone(snapshot);
        }
      }
      if (event.phase === "failed" || event.phase === "cancelled") {
        if (this.gestures.length) this.notify("브러시 준비가 멈췄어요. 입력은 보관했으며 같은 브러시를 다시 선택하면 이어집니다.");
      }
    }
  }

  capture(input: { pointer: PointerEvent; stage: Konva.Stage; scope: string; ownerScope: string; touchDraw: boolean }): boolean {
    if (!this.request || this.request.phase === "failed" || this.request.phase === "cancelled") return false;
    const { pointer, stage, scope } = input;
    if (pointer.altKey || pointer.button !== 0 && pointer.button !== -1 && pointer.button !== 5) return false;
    if (pointer.pointerType === "touch" && !input.touchDraw) return false;
    if (this.active) {
      if (pointer.pointerType === "touch" && this.active.start.pointer.pointerType === "touch"
        && pointer.pointerId !== this.active.start.pointer.pointerId) {
        this.gestures = this.gestures.filter((gesture) => gesture !== this.active);
        this.active = null;
        this.releaseListeners?.();
      }
      return true;
    }
    const mapper = snapshotStudioStagePointerBatchMapper(stage);
    if (!mapper.pointFor(pointer)) return true;
    const gesture: StudioCatalogInputGesture = {
      id: crypto.randomUUID(), ownerScope: input.ownerScope, catalogId: this.request.catalogId, operation: this.request.operation, brushSnapshot: this.selectedSnapshot, sourceScope: scope, scope, stage,
      start: { pointer: snapshotStudioCatalogPointer(pointer), mapper }, moves: [], end: null,
    };
    this.gestures.push(gesture);
    this.active = gesture;
    const captureTarget = stage.getContent();
    try { captureTarget?.setPointerCapture(pointer.pointerId); } catch { /* 창 캡처 리스너가 동일한 소유권을 보장한다. */ }
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointer.pointerId || event.pointerType !== pointer.pointerType) return;
      gesture.moves.push({ pointer: snapshotStudioCatalogPointer(event), mapper: snapshotStudioStagePointerBatchMapper(stage) });
    };
    const end = (event: PointerEvent) => {
      if (event.pointerId !== pointer.pointerId || event.pointerType !== pointer.pointerType) return;
      // 종료 좌표는 기존 release sampler의 압력 보정 정책으로 재생한다.
      gesture.end = snapshotStudioCatalogPointer(event, false);
      gesture.endMapper = snapshotStudioStagePointerBatchMapper(stage);
      this.active = null;
      this.releaseListeners?.();
      this.persist(gesture);
    };
    const blur = () => {
      gesture.end = gesture.moves.at(-1)?.pointer ?? gesture.start.pointer;
      this.active = null;
      this.releaseListeners?.();
      this.persist(gesture);
    };
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
    window.addEventListener("blur", blur);
    this.releaseListeners = (releaseCapture = true) => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      window.removeEventListener("blur", blur);
      try { if (releaseCapture) captureTarget?.releasePointerCapture(pointer.pointerId); } catch { /* 이미 해제된 접촉도 정상 종료다. */ }
      this.releaseListeners = null;
    };
    this.notify("브러시를 준비하며 입력을 보관하고 있어요.");
    return true;
  }

  replayReady(catalogId: string, scope: string, replay: (gesture: StudioCatalogInputGesture) => string | false): void {
    const stale = this.gestures.filter((gesture) => gesture.scope !== scope);
    if (stale.length && this.lastScope !== scope) {
      if (this.active && stale.includes(this.active)) {
        this.active.end = this.active.moves.at(-1)?.pointer ?? this.active.start.pointer;
        this.active = null;
        this.releaseListeners?.();
      }
      for (const gesture of stale) this.persist(gesture);
      if (this.request) this.notify("문서가 바뀌어 이전 문서의 브러시 입력을 복구 보관함에 남겼어요.");
      this.request = null;
    }
    this.lastScope = scope;
    if (this.request?.phase !== "applied" || this.request.catalogId !== catalogId) return;
    const ready = this.gestures.filter((gesture) => gesture.catalogId === catalogId && gesture.scope === scope);
    for (const gesture of ready) {
      const restoredStrokeId = replay(gesture);
      if (!restoredStrokeId) {
        this.notify("대기한 입력을 아직 적용하지 못했어요. 같은 브러시를 다시 선택하면 재시도합니다.");
        return;
      }
      this.persist(gesture, restoredStrokeId);
      if (this.active === gesture) {
        this.active = null;
        this.releaseListeners?.(false);
      }
      this.gestures = this.gestures.filter((candidate) => candidate !== gesture);
    }
    this.request = null;
  }

  dispose(): void {
    for (const gesture of this.gestures) this.persist(gesture);
    this.releaseListeners?.();
    this.active = null;
    this.gestures = [];
    this.request = null;
  }
}
