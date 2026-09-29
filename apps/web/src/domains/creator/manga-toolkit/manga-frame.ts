/**
 * 만화 전용 툴킷 — 프레임 분할 도구 데이터 모델과 순수 로직.
 *
 * ⚠️ 이 모듈은 **페이지 모드**를 전제로 동작한다.
 * 웹툰 세로 스크롤(무한 세로 캔버스)과는 충돌하므로 그 환경에서는 사용하지 않는다.
 * 모드 전제는 `MangaToolkitMode` 타입으로 강제한다.
 */

/** 만화 툴킷이 지원하는 캔버스 모드. 프레임 분할은 페이지 모드에서만 유효하다. */
export type MangaToolkitMode = "page";

/** 캔버스 좌표계 기준 사각 영역. */
export interface MangaRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 페이지 모드용 만화 프레임. */
export interface MangaFrame {
  id: string;
  /** 본문 사각 영역. */
  rect: MangaRect;
  /** 프레임 테두리 두께 (px). */
  borderWidth: number;
  /** 인접 프레임과의 간격 (gutter, px). */
  gutter: number;
}

/** 페이지 모드 전제를 담은 프레임 문서. */
export interface MangaFrameDocument {
  /** 반드시 "page" 이다. 웹툰 세로 스크롤 모드에서는 프레임 분할을 지원하지 않는다. */
  mode: MangaToolkitMode;
  frames: MangaFrame[];
}

const MIN_SIZE = 0;

/**
 * 사각 영역을 N행×M열로 분할한다.
 * 셀 사이에 gutter 간격을 균등 배분하고, 각 셀은 간격을 제외한 순수 영역만 차지한다.
 * 순수 함수이며 입력 rect를 변경하지 않는다.
 *
 * @param rect  분할할 원본 사각 영역 (페이지 모드 좌표)
 * @param rows  행 수 (>= 1)
 * @param cols  열 수 (>= 1)
 * @param gutter 셀 사이 간격 px (>= 0)
 * @returns gutter를 제외한 순수 셀 rect 목록 (행 우선 순서)
 */
export function splitFrame(
  rect: MangaRect,
  rows: number,
  cols: number,
  gutter: number,
): MangaRect[] {
  const safeRows = Math.max(1, Math.floor(rows));
  const safeCols = Math.max(1, Math.floor(cols));
  const safeGutter = Math.max(0, gutter);

  const cellW = (rect.w - safeGutter * (safeCols - 1)) / safeCols;
  const cellH = (rect.h - safeGutter * (safeRows - 1)) / safeRows;
  const width = Math.max(MIN_SIZE, cellW);
  const height = Math.max(MIN_SIZE, cellH);

  const cells: MangaRect[] = [];
  for (let r = 0; r < safeRows; r += 1) {
    for (let c = 0; c < safeCols; c += 1) {
      cells.push({
        x: rect.x + c * (width + safeGutter),
        y: rect.y + r * (height + safeGutter),
        w: width,
        h: height,
      });
    }
  }
  return cells;
}

/**
 * 사각 영역을 `MangaFrame` 배열로 분할한다.
 * 각 프레임은 테두리 두께와 간격을 공유한다.
 */
export function splitFrameToFrames(
  rect: MangaRect,
  rows: number,
  cols: number,
  gutter: number,
  borderWidth: number,
  makeId: (row: number, col: number) => string,
): MangaFrame[] {
  const safeRows = Math.max(1, Math.floor(rows));
  const safeCols = Math.max(1, Math.floor(cols));
  const cells = splitFrame(rect, safeRows, safeCols, gutter);
  return cells.map((cell, index) => {
    const row = Math.floor(index / safeCols);
    const col = index % safeCols;
    return {
      id: makeId(row, col),
      rect: cell,
      borderWidth: Math.max(0, borderWidth),
      gutter: Math.max(0, gutter),
    };
  });
}

/** 모든 프레임의 간격(gutter)을 일괄 조정한다. 원본 배열을 변경하지 않는다. */
export function setFramesGutter(frames: readonly MangaFrame[], gutter: number): MangaFrame[] {
  const safeGutter = Math.max(0, gutter);
  return frames.map((frame) => ({ ...frame, gutter: safeGutter }));
}

/** 모든 프레임의 테두리 두께를 일괄 조정한다. 원본 배열을 변경하지 않는다. */
export function setFramesBorderWidth(
  frames: readonly MangaFrame[],
  borderWidth: number,
): MangaFrame[] {
  const safeWidth = Math.max(0, borderWidth);
  return frames.map((frame) => ({ ...frame, borderWidth: safeWidth }));
}

/** id에 해당하는 프레임을 삭제한다. */
export function deleteFrame(frames: readonly MangaFrame[], id: string): MangaFrame[] {
  return frames.filter((frame) => frame.id !== id);
}

/**
 * 여러 프레임을 하나의 프레임으로 병합한다.
 * 병합 결과는 모든 프레임의 바운딩 박스를 감싸고,
 * 가장 첫 번째 프레임의 테두리/간격 값을 물려받는다.
 * 유효한 프레임이 하나도 없으면 null을 반환한다.
 */
export function mergeFrames(
  frames: readonly MangaFrame[],
  ids: readonly string[],
): MangaFrame | null {
  const targets = frames.filter((frame) => ids.includes(frame.id));
  if (targets.length === 0) return null;

  const minX = Math.min(...targets.map((f) => f.rect.x));
  const minY = Math.min(...targets.map((f) => f.rect.y));
  const maxX = Math.max(...targets.map((f) => f.rect.x + f.rect.w));
  const maxY = Math.max(...targets.map((f) => f.rect.y + f.rect.h));

  return {
    id: targets[0]!.id,
    rect: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    borderWidth: targets[0]!.borderWidth,
    gutter: targets[0]!.gutter,
  };
}

/** rect 면적. */
export function mangaRectArea(rect: MangaRect): number {
  return Math.max(0, rect.w) * Math.max(0, rect.h);
}

/** 분할된 셀들의 총 순수 면적(= gutter 제외 면적). */
export function splitCellsArea(cells: readonly MangaRect[]): number {
  return cells.reduce((sum, cell) => sum + mangaRectArea(cell), 0);
}
