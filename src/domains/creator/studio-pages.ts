/**
 * Studio Pages — pure multi-page state operations for cuttoon editor.
 * 페이지 추가/복제/삭제/이동/재배치/일괄 적용 등 다중 페이지 조작의 순수 로직.
 * 히스토리/커밋/선택 상태 관리는 호출 측(StudioPage)에서 담당.
 *
 * 전부 불변 · 부수효과 없음. Konva/React/DOM 의존 없음.
 * 단위 테스트와 StudioPage가 동일한 진짜 export를 사용한다.
 */

export interface PageLike {
  id: string;
  elements: Array<{ id: string; [k: string]: unknown }>;
  bg: string;
  bgGrad: string[] | null;
  canvasH: number;
  grade?: unknown;
  groups?: Array<{ id: string; [k: string]: unknown }>;
}

export const DEFAULT_CANVAS_H = 1080;
export const DEFAULT_BG = "#ffffff";

/** 새 빈 페이지 생성. makeId로 호출자가 UUID 등을 제공(테스트 시 결정적 id 가능). */
export function createBlankPage(makeId: () => string, canvasH: number = DEFAULT_CANVAS_H): PageLike {
  return {
    id: makeId(),
    elements: [],
    bg: DEFAULT_BG,
    bgGrad: null,
    canvasH,
  };
}

/** 페이지 복제 — 새 id + elements의 각 id도 새로 부여. 원본 불변. */
export function duplicatePageState<P extends PageLike>(page: P, makeId: () => string): P {
  return {
    ...page,
    id: makeId(),
    elements: page.elements.map((el) => ({ ...el, id: makeId() })),
  } as P;
}

/** 지정 인덱스에 빈 페이지 삽입 (0..length 범위 클램프). */
export function insertBlankPageAt<P extends PageLike>(
  pages: readonly P[],
  index: number,
  makeId: () => string,
  canvasH: number = DEFAULT_CANVAS_H
): P[] {
  const safeIdx = Math.max(0, Math.min(index, pages.length));
  const newPage = createBlankPage(makeId, canvasH) as P;
  const next = pages.slice();
  next.splice(safeIdx, 0, newPage);
  return next;
}

/** fromIdx → toIdx 로 재배치 (splice 이동). 범위 벗어나면 원본 복사 반환. */
export function reorderPages<P extends PageLike>(
  pages: readonly P[],
  fromIndex: number,
  toIndex: number
): P[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= pages.length ||
    toIndex > pages.length
  ) {
    return pages.slice();
  }
  const next = pages.slice();
  const [moved] = next.splice(fromIndex, 1);
  // splice remove 후 toIndex를 그대로 사용하면 이동 의미가 정확 (append 시 length 허용).
  next.splice(toIndex, 0, moved);
  return next;
}

/** 페이지 삭제 (1개 이하 시 원본 그대로). */
export function deletePageSafe<P extends PageLike>(pages: readonly P[], pageId: string): P[] {
  if (pages.length <= 1) return pages.slice();
  return pages.filter((p) => p.id !== pageId);
}

/** 방향 이동(up=-1, down=+1) — reorderPages 재사용. */
export function movePage<P extends PageLike>(pages: readonly P[], pageId: string, dir: -1 | 1): P[] {
  const idx = pages.findIndex((p) => p.id === pageId);
  if (idx < 0) return pages.slice();
  const target = idx + dir;
  if (target < 0 || target >= pages.length) return pages.slice();
  return reorderPages(pages, idx, target);
}

/** 현재 페이지 내용만 비우기 (elements=[], groups는 보존 — 스타일/구조 유지). */
export function clearPage<P extends PageLike>(pages: readonly P[], pageId: string): P[] {
  return pages.map((p) =>
    p.id === pageId
      ? ({ ...p, elements: [] } as P)
      : p
  );
}

/** 모든 페이지에 동일 grade 적용 (복사본). grade는 정규화된 값 또는 undefined. */
export function applyGradeToAllPages<P extends PageLike>(pages: readonly P[], grade: unknown): P[] {
  return pages.map((p) => ({ ...p, grade } as P));
}

/** 모든 페이지에 동일 bg / bgGrad 적용. */
export function applyBackgroundToAllPages<P extends PageLike>(
  pages: readonly P[],
  bg: string,
  bgGrad: string[] | null
): P[] {
  return pages.map((p) => ({ ...p, bg, bgGrad } as P));
}

/** 가로 미러(좌우 반전) 복제 — 위치/폭/points x 좌표 반전. draw/image/text/frame 등 지원. */
export function duplicateMirroredPage<P extends PageLike>(
  page: P,
  makeId: () => string,
  canvasW: number
): P {
  const mirroredEls = page.elements.map((el: any) => {
    const w = (el.width ?? 0) as number;
    const x = (el.x ?? 0) as number;
    const newX = canvasW - x - w;
    const rot = (el.rotation ?? 0) as number;
    const newEl: any = { ...el, id: makeId(), x: newX, rotation: -rot };

    // draw freehand/shape points: x좌표만 반전
    if (Array.isArray(el.points) && el.points.length > 0) {
      const pts = el.points as number[];
      const flipped: number[] = [];
      for (let i = 0; i < pts.length; i += 2) {
        const px = pts[i] ?? 0;
        const py = pts[i + 1] ?? 0;
        flipped.push(canvasW - px, py);
      }
      newEl.points = flipped;
    }

    // frame 비정형 polygon points 반전
    if (Array.isArray(el.points) && el.type === "frame") {
      // 이미 위에서 처리됨 (points는 x,y 연속). frame points는 로컬? 하지만 안전하게 캔버스 기준 반전.
      // (기존 사용은 x,y 절대라 동일 로직 OK)
    }

    // lockAspect 등 기타는 복사 유지
    return newEl;
  });

  return {
    ...page,
    id: makeId(),
    elements: mirroredEls,
  } as P;
}

/** 유틸: id로 페이지 인덱스 찾기. */
export function findPageIndex<P extends PageLike>(pages: readonly P[], pageId: string): number {
  return pages.findIndex((p) => p.id === pageId);
}
