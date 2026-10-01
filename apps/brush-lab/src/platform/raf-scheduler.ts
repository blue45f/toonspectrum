import type { Clock, RawSample } from "../engine/core/types";

/**
 * rAF 프레임 스케줄러. 이벤트 단위로 들어오는 표본을 모아 프레임당 정확히 1회 `onFrame` 콜백을
 * 호출한다(레인 `addSamples` 프레임당 1회 계약). `stop()` 이후에는 어떤 콜백도 호출되지 않는다.
 */

export type RequestFrameFn = (cb: (tMs: number) => void) => number;
export type CancelFrameFn = (handle: number) => void;

export type FrameCallback = (batch: RawSample[], frameTMs: number) => void;

export class FrameScheduler {
  private readonly raf: RequestFrameFn;
  private readonly caf: CancelFrameFn | null;
  private readonly clock: Clock;
  private pending: RawSample[] = [];
  private handle: number | null = null;
  private callback: FrameCallback | null = null;
  private stopped = false;
  private frameCount = 0;

  /**
   * @param raf rAF 구현. 생략 시 `globalThis.requestAnimationFrame`. 둘 다 없으면 생성 시 던진다(무음 대체 없음).
   * @param clock 프레임 시각 측정용 시계(주입).
   * @param caf rAF 취소 함수(선택). 생략 시 `globalThis.cancelAnimationFrame`.
   */
  constructor(raf: RequestFrameFn | undefined, clock: Clock, caf?: CancelFrameFn) {
    const fallbackRaf =
      typeof globalThis.requestAnimationFrame === "function"
        ? (cb: (tMs: number) => void): number => globalThis.requestAnimationFrame(cb)
        : undefined;
    const resolved = raf ?? fallbackRaf;
    if (!resolved) {
      throw new Error("FrameScheduler: requestAnimationFrame을 사용할 수 없다");
    }
    this.raf = resolved;
    this.caf =
      caf ??
      (typeof globalThis.cancelAnimationFrame === "function"
        ? (h: number): void => globalThis.cancelAnimationFrame(h)
        : null);
    this.clock = clock;
  }

  onFrame(cb: FrameCallback): void {
    this.callback = cb;
  }

  /** 표본을 큐에 넣고 다음 프레임을 예약한다(이미 예약돼 있으면 재예약하지 않는다). */
  enqueue(samples: readonly RawSample[]): void {
    if (this.stopped || samples.length === 0) return;
    for (const s of samples) this.pending.push(s);
    this.schedule();
  }

  /** 큐에 쌓인 표본 수(테스트·진단용). */
  pendingCount(): number {
    return this.pending.length;
  }

  /** 지금까지 flush한 프레임 수. */
  frames(): number {
    return this.frameCount;
  }

  /** 예약을 취소하고 큐를 비운다. 이후 콜백은 호출되지 않는다. */
  stop(): void {
    this.stopped = true;
    if (this.handle !== null && this.caf) this.caf(this.handle);
    this.handle = null;
    this.pending = [];
  }

  private schedule(): void {
    if (this.handle !== null) return;
    this.handle = this.raf(() => {
      this.handle = null;
      this.flush();
    });
  }

  private flush(): void {
    if (this.stopped) return;
    const batch = this.pending;
    this.pending = [];
    if (batch.length === 0 || !this.callback) return;
    this.frameCount += 1;
    this.callback(batch, this.clock.now());
  }
}
