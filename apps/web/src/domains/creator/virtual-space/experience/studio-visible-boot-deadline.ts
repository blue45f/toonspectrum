interface StudioBootVisibility {
  readonly hidden: boolean;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

/** Phaser가 정지하는 숨긴 탭의 시간은 초기화 실패 예산에 넣지 않는다. */
export function studioVisibleBootDeadline(visibility: StudioBootVisibility, onTimeout: () => void, timeoutMs = 25_000): () => void {
  let remaining = timeoutMs;
  let startedAt: number | null = null;
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  let disposed = false;
  const pause = () => {
    if (timer !== undefined) globalThis.clearTimeout(timer);
    timer = undefined;
    if (startedAt !== null) remaining = Math.max(0, remaining - Math.max(0, performance.now() - startedAt));
    startedAt = null;
  };
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    pause();
    visibility.removeEventListener("visibilitychange", update);
  };
  const update = () => {
    if (disposed) return;
    pause();
    if (visibility.hidden) return;
    startedAt = performance.now();
    timer = globalThis.setTimeout(() => {
      pause();
      if (visibility.hidden || disposed) return;
      dispose();
      onTimeout();
    }, remaining);
  };
  visibility.addEventListener("visibilitychange", update);
  update();
  return dispose;
}
