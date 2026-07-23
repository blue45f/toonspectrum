import type { DrawEl } from "./studio-element-model";

/** Immutable view consumed by the isolated draft-preview renderer. */
export interface StudioDraftPreviewSnapshot {
  readonly active: DrawEl | null;
  readonly settled: readonly DrawEl[];
}

/** Narrow external-store contract required by the React preview layers. */
export interface StudioDraftPreviewSource {
  readonly getSnapshot: () => StudioDraftPreviewSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
}

const EMPTY_DRAFT_PREVIEW: StudioDraftPreviewSnapshot = { active: null, settled: [] };

/**
 * 비다이렉트 초안(수채·연필·유화·입자 등 모든 팬시 브러시와 도형 드래그)의 미니 스토어.
 * 포인터 프레임마다 이 스토어만 갱신되고, 구독자는 StudioDraftPreviewLayers 하나뿐이라
 * 프레임당 리렌더가 전체 편집기가 아니라 초안 레이어 서브트리로 한정된다. settled 는
 * 메인 레이어의 커밋 동기화를 기다리는 확정 획의 FIFO 큐다.
 */
export class StudioDraftPreviewStore implements StudioDraftPreviewSource {
  private snapshot: StudioDraftPreviewSnapshot = EMPTY_DRAFT_PREVIEW;
  private listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): StudioDraftPreviewSnapshot => this.snapshot;

  get active(): DrawEl | null {
    return this.snapshot.active;
  }

  get hasSettled(): boolean {
    return this.snapshot.settled.length > 0;
  }

  get settledCount(): number {
    return this.snapshot.settled.length;
  }

  setActive(el: DrawEl | null): void {
    if (this.snapshot.active === el) return;
    this.snapshot = { active: el, settled: this.snapshot.settled };
    this.emit();
  }

  /** 펜 리프트: 확정된 최종 형태를 settled 로 넘겨 커밋 렌더까지 잉크를 유지한다. */
  settle(el: DrawEl): void {
    this.snapshot = { active: null, settled: [...this.snapshot.settled, el] };
    this.emit();
  }

  /** Atomically replaces the settled FIFO while preserving any active non-GPU draft. */
  replaceSettled(elements: readonly DrawEl[]): void {
    if (
      this.snapshot.settled.length === elements.length
      && this.snapshot.settled.every((element, index) => element === elements[index])
    ) return;
    this.snapshot = { active: this.snapshot.active, settled: [...elements] };
    this.emit();
  }

  clearSettled(): void {
    this.releaseSettledPrefix(this.snapshot.settled.length);
  }

  /** 실제 메인 레이어에 그려진 FIFO 접두부만 제거하고, 이후 초안은 그대로 유지한다. */
  releaseSettledPrefix(count: number): number {
    const requested = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
    const released = Math.min(requested, this.snapshot.settled.length);
    if (released === 0) return 0;
    this.snapshot = {
      active: this.snapshot.active,
      settled: this.snapshot.settled.slice(released),
    };
    this.emit();
    return released;
  }

  clear(): void {
    if (this.snapshot === EMPTY_DRAFT_PREVIEW) return;
    this.snapshot = EMPTY_DRAFT_PREVIEW;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}
