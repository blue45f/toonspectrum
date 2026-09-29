/**
 * 스펙터클 캔버스 공유 헬퍼.
 *
 * 컨페티·폭죽 등 fixed 오버레이 캔버스 연출이 공통으로 쓰는
 * 캔버스 생성·정리 로직을 한 곳에 모은다.
 */

export interface SpectacleOverlayCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  /** CSS px 기준 너비. */
  readonly width: number;
  /** CSS px 기준 높이. */
  readonly height: number;
  /** 캔버스를 DOM에서 제거한다. */
  dispose(): void;
}

/**
 * 화면 전체 fixed 오버레이 캔버스를 만든다.
 * document가 없거나 2D 컨텍스트를 얻지 못하면 null.
 */
export function createSpectacleOverlayCanvas(): SpectacleOverlayCanvas | null {
  if (typeof document === "undefined") return null;

  const canvas = document.createElement("canvas");
  canvas.className = "spectacle-confetti-canvas";
  canvas.setAttribute("aria-hidden", "true");
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  const width = window.innerWidth;
  const height = window.innerHeight;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  document.body.appendChild(canvas);

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    canvas.remove();
    return null;
  }
  ctx.scale(dpr, dpr);

  return {
    canvas,
    ctx,
    width,
    height,
    dispose: () => canvas.remove(),
  };
}

/** 시드 가능한 랜덤에서 목록의 원소 하나를 고른다. */
export function pickSpectacle<T>(random: () => number, list: readonly T[]): T {
  return list[Math.floor(random() * list.length) % list.length];
}
