/**
 * 캠퍼스 코드 드로잉 오브젝트의 지면 접지 그림자 — 아트 통일 규격.
 *
 * 아틀라스 일러스트 오브젝트는 이미지 안에 가장자리가 번지는 소프트 섀도우가 베이크돼 있는데,
 * 코드 드로잉 오브젝트는 단색 타원(날카로운 모서리)으로 접지 그림자를 그려 같은 바닥에서도
 * 화풍이 갈렸다. 이 모듈은 중심에서 가장자리로 alpha가 0까지 감쇠하는 라디얼 그라디언트
 * 타원을 단일 규격으로 제공해, 코드 드로잉 오브젝트의 접지감을 아틀라스 쪽에 맞춘다.
 * (오브젝트 단위 접지 그림자일 뿐, 화면 전체 워시·틴트가 아니다.)
 */

export interface CampusSoftShadowStop {
  readonly offset: number;
  readonly alpha: number;
}

/**
 * 접지 그림자 감쇠 곡선: 중심 alpha → 55% 지점 0.62배 → 80% 지점 0.28배 → 가장자리 0.
 * alpha는 0~1로 clamp한다.
 */
export function campusSoftShadowStops(alpha: number): readonly CampusSoftShadowStop[] {
  const clamped = Math.max(0, Math.min(1, alpha));
  return Object.freeze([
    { offset: 0, alpha: clamped },
    { offset: 0.55, alpha: clamped * 0.62 },
    { offset: 0.8, alpha: clamped * 0.28 },
    { offset: 1, alpha: 0 },
  ]);
}

function shadowRgba(color: number, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  return `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${clamped})`;
}

type SoftShadowContext = Pick<
  CanvasRenderingContext2D,
  "save" | "restore" | "translate" | "scale" | "createRadialGradient" | "fillStyle" | "beginPath" | "arc" | "fill"
>;

/** (x, y)를 중심으로 rx×ry 소프트 접지 그림자를 그린다. color는 24비트 RGB 값. */
export function campusSoftGroundShadow(
  context: SoftShadowContext,
  color: number,
  x: number,
  y: number,
  rx: number,
  ry: number,
  alpha = 0.25,
): void {
  if (rx <= 0 || ry <= 0) return;
  context.save();
  context.translate(x, y);
  context.scale(1, ry / rx);
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, rx);
  for (const stop of campusSoftShadowStops(alpha)) {
    gradient.addColorStop(stop.offset, shadowRgba(color, stop.alpha));
  }
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(0, 0, rx, 0, Math.PI * 2);
  context.fill();
  context.restore();
}
