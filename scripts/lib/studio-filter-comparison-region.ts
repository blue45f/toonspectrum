interface ComparisonRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 드래그된 패널과 그림자를 제외하되 원본·미리보기의 동일한 상단 픽셀만 비교한다. */
export function studioFilterComparisonBandHeight(band: ComparisonRect, panel: ComparisonRect): number {
  for (const rect of [band, panel]) {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)
      || rect.width <= 0 || rect.height <= 0) {
      throw new Error("필터 비교 영역의 실제 화면 좌표가 유효하지 않습니다.");
    }
  }
  const shadowGap = 12;
  const separatedHorizontally = panel.x - shadowGap >= band.x + band.width
    || panel.x + panel.width + shadowGap <= band.x;
  const panelAbove = panel.y + panel.height + shadowGap <= band.y;
  const height = separatedHorizontally || panelAbove
    ? Math.floor(band.height)
    : Math.min(Math.floor(band.height), Math.floor(panel.y - band.y - shadowGap));
  if (height < 64) {
    throw new Error("다이얼로그를 제외한 필터 비교 영역이 64px보다 작습니다. 실제 드래그 위치를 확인하세요.");
  }
  return height;
}
