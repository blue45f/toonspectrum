export interface StudioFilterEvidenceRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 픽셀이 아니라 실제 패널 위치로 비교 영역을 고정한다. 너무 좁은 영역은 거절한다. */
export function studioFilterComparisonClip(
  canvas: StudioFilterEvidenceRect,
  dialog: StudioFilterEvidenceRect,
): StudioFilterEvidenceRect {
  if (![...Object.values(canvas), ...Object.values(dialog)].every(Number.isFinite)
    || canvas.width <= 0 || canvas.height <= 0 || dialog.width <= 0 || dialog.height <= 0) {
    throw new Error("필터 비교 영역의 실제 위치와 크기가 필요합니다.");
  }
  const height = Math.min(180, canvas.height, Math.floor(dialog.y - canvas.y - 8));
  if (height < 120) throw new Error("패널 위에 120px 이상의 가려지지 않은 캔버스 비교 영역이 필요합니다.");
  return { ...canvas, height };
}
