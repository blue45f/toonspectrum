/** User-facing page numbers are 1-based; capture and document APIs use 0-based indices. */
export type StudioExportPageSelectionResult =
  | { ok: true; indices: number[] }
  | { ok: false; message: string };

export const STUDIO_EXPORT_PAGE_SELECTION_MAX_LENGTH = 4096;

/** Resolve lists such as "1, 3–5, 8", preserving document order and removing overlaps. */
export function resolveStudioExportPageSelection(
  pageCount: number,
  expression: string
): StudioExportPageSelectionResult {
  if (!Number.isSafeInteger(pageCount) || pageCount < 1) {
    return { ok: false, message: "내보낼 페이지가 없습니다." };
  }
  if (!expression.trim()) {
    return { ok: false, message: "내보낼 페이지 번호를 입력하세요. 예: 1, 3–5, 8" };
  }
  if (expression.length > STUDIO_EXPORT_PAGE_SELECTION_MAX_LENGTH) {
    return { ok: false, message: "페이지 지정이 너무 깁니다. 연속 페이지는 3–5처럼 범위로 입력하세요." };
  }
  const intervals: { from: number; to: number }[] = [];
  for (const token of expression.split(/[,，]/u)) {
    const match = /^\s*(\d+)\s*(?:[-–—~]\s*(\d+)\s*)?$/u.exec(token);
    if (!match) {
      return { ok: false, message: "페이지는 쉼표와 범위로 지정하세요. 예: 1, 3–5, 8" };
    }
    const from = Number(match[1]);
    const to = Number(match[2] ?? match[1]);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 1 || to > pageCount || from > to) {
      return { ok: false, message: `페이지는 1~${pageCount} 사이에서 지정하고, 범위는 작은 번호부터 입력하세요.` };
    }
    intervals.push({ from: from - 1, to: to - 1 });
  }
  // Merge before expansion so repeated large ranges never repeat the expansion work.
  intervals.sort((a, b) => a.from - b.from);
  const merged: typeof intervals = [];
  for (const interval of intervals) {
    const previous = merged.at(-1);
    if (previous && interval.from <= previous.to + 1) previous.to = Math.max(previous.to, interval.to);
    else merged.push({ ...interval });
  }
  const indices: number[] = [];
  for (const interval of merged) {
    for (let index = interval.from; index <= interval.to; index += 1) indices.push(index);
  }
  return { ok: true, indices };
}

/** Compact noncontiguous selections without implying that skipped pages were exported. */
export function formatStudioExportPageSelection(indices: readonly number[]): string {
  if (indices.length === 0) return "페이지 선택 없음";
  const parts: string[] = [];
  for (let cursor = 0; cursor < indices.length; cursor += 1) {
    const from = indices[cursor]! + 1;
    let to = from;
    while (cursor + 1 < indices.length && indices[cursor + 1] === to) {
      cursor += 1;
      to = indices[cursor]! + 1;
    }
    parts.push(from === to ? String(from) : `${from}–${to}`);
  }
  return `페이지 ${parts.join(", ")}`;
}

/** Partial or empty captures must never produce an apparently complete delivery file. */
export function assertStudioExportCaptureComplete(
  pages: readonly HTMLCanvasElement[],
  expectedCount: number
): void {
  if (pages.length !== expectedCount) {
    throw new Error(`페이지 캡처가 완료되지 않았습니다. ${expectedCount}페이지 중 ${pages.length}페이지만 준비되어 저장을 중단했어요. 다시 내보내세요.`);
  }
  for (let index = 0; index < pages.length; index += 1) {
    const page = pages[index];
    if (!page || !Number.isSafeInteger(page.width) || !Number.isSafeInteger(page.height) || page.width < 1 || page.height < 1) {
      throw new Error(`${index + 1}번째 캡처 이미지가 비어 있어 저장을 중단했어요. 다시 내보내세요.`);
    }
  }
}
