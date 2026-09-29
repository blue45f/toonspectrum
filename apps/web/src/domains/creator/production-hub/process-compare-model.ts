/**
 * 공정 비교 모드 (나란히 보기) 순수 모델.
 *
 * 크레코의 "비교 모드"를 뛰어넘는 UX를 목표로, 모든 상태 계산을
 * React 바깥의 순수 함수로 분리한다. 뷰어는 이 모듈의 타입·헬퍼만 사용한다.
 */

export type ProcessCompareKind = "image" | "text" | "media" | "package";

/** 비교 뷰어에 나란히 표시되는 뷰어(페인) 개수. */
export type ProcessCompareLayout = 2 | 3 | 4;

/** 비교 방식: 나란히 보기 / 비포·애프터 슬라이더 / 깜빡임(차이 찾기). */
export type ProcessCompareMode = "panes" | "slider" | "blink";

/** 개별 비교 항목: 한 공정의 한 리비전. */
export interface ProcessCompareItem {
  readonly id: string;
  readonly processId: string;
  readonly processLabel: string;
  readonly kind: ProcessCompareKind;
  readonly revisionId: string;
  readonly revisionLabel: string;
  readonly revisionIndex: number;
  readonly createdAt: string;
  /** 렌더된 이미지 URL. 없으면 플레이스홀더 아트를 사용한다. */
  readonly imageUrl: string | null;
  readonly statusTone: "ready" | "working" | "review" | "approved" | "done";
}

/** 한 페인이 바라보는 소스 (공정 + 리비전). */
export interface ProcessComparePaneSource {
  readonly processId: string;
  readonly revisionId: string;
}

export const PROCESS_COMPARE_LAYOUTS: readonly ProcessCompareLayout[] = [2, 3, 4] as const;

export const PROCESS_COMPARE_MODES: readonly ProcessCompareMode[] = ["panes", "slider", "blink"] as const;

/** 슬라이더 위치(%) 범위. */
export const PROCESS_COMPARE_SLIDER_MIN = 0;
export const PROCESS_COMPARE_SLIDER_MAX = 100;

export function clampProcessCompareSlider(value: number): number {
  if (!Number.isFinite(value)) return 50;
  return Math.min(PROCESS_COMPARE_SLIDER_MAX, Math.max(PROCESS_COMPARE_SLIDER_MIN, value));
}

/**
 * 슬라이더 모드에서 왼쪽(이전) 레이어에 적용할 clip-path.
 * position% 지점의 왼쪽이 보인다.
 */
export function processCompareSliderClip(position: number): string {
  const clamped = clampProcessCompareSlider(position);
  return `inset(0 ${100 - clamped}% 0 0)`;
}

/**
 * 슬라이더 핸들의 키보드 이동량(px 기준이 아닌 % 기준).
 * Shift와 함께 누르면 크게 이동한다.
 */
export function processCompareSliderStep(shiftKey: boolean): number {
  return shiftKey ? 10 : 2;
}

export function moveProcessCompareSlider(position: number, delta: number): number {
  return clampProcessCompareSlider(position + delta);
}

/**
 * 공정 목록에서 비교 항목을 만든다. 리비전이 없는 공정은 제외한다.
 * resolveImageUrl이 URL을 반환하지 못하면 imageUrl은 null이 되고
 * 뷰어가 플레이스홀더 아트를 렌더한다.
 */
export function buildProcessCompareItems<TProcess extends {
  readonly id: string;
  readonly label: string;
  readonly kind: ProcessCompareKind;
  readonly revisions: readonly {
    readonly id: string;
    readonly createdAt: string;
  }[];
}>(processes: readonly TProcess[], resolveImageUrl?: (processId: string, revisionId: string) => string | null): ProcessCompareItem[] {
  const items: ProcessCompareItem[] = [];
  for (const process of processes) {
    process.revisions.forEach((revision, index) => {
      items.push({
        id: `${process.id}::${revision.id}`,
        processId: process.id,
        processLabel: process.label,
        kind: process.kind,
        revisionId: revision.id,
        revisionLabel: `v${index + 1}`,
        revisionIndex: index + 1,
        createdAt: revision.createdAt,
        imageUrl: resolveImageUrl ? (resolveImageUrl(process.id, revision.id) ?? null) : null,
        statusTone: index === process.revisions.length - 1 ? "done" : "working",
      });
    });
  }
  return items;
}

export function findProcessCompareItem(
  items: readonly ProcessCompareItem[],
  source: ProcessComparePaneSource,
): ProcessCompareItem | null {
  return items.find((item) => item.processId === source.processId && item.revisionId === source.revisionId) ?? null;
}

/**
 * 기본 페인 구성: 서로 다른 공정의 최신 리비전을 앞에서부터 layout개 선택.
 * 항목이 부족하면 가능한 만큼만 반환한다.
 */
export function defaultProcessCompareSources(
  items: readonly ProcessCompareItem[],
  layout: ProcessCompareLayout,
): ProcessComparePaneSource[] {
  const seen = new Set<string>();
  const sources: ProcessComparePaneSource[] = [];
  // 최신 리비전이 뒤에 오도록 정렬되어 있다고 가정하고 뒤에서부터 탐색
  for (let i = items.length - 1; i >= 0 && sources.length < layout; i -= 1) {
    const item = items[i];
    if (seen.has(item.processId)) continue;
    seen.add(item.processId);
    sources.unshift({ processId: item.processId, revisionId: item.revisionId });
  }
  return sources;
}

/**
 * 공정 피커용 그룹: 공정별 리비전 목록.
 */
export interface ProcessCompareProcessGroup {
  readonly processId: string;
  readonly processLabel: string;
  readonly items: readonly ProcessCompareItem[];
}

export function groupProcessCompareItems(items: readonly ProcessCompareItem[]): ProcessCompareProcessGroup[] {
  const byProcess = new Map<string, { processId: string; processLabel: string; items: ProcessCompareItem[] }>();
  for (const item of items) {
    let group = byProcess.get(item.processId);
    if (!group) {
      group = { processId: item.processId, processLabel: item.processLabel, items: [] };
      byProcess.set(item.processId, group);
    }
    group.items.push(item);
  }
  return [...byProcess.values()];
}

/**
 * 동기 스크롤: 소스 페인의 스크롤 위치를 다른 페인에 그대로 적용한다.
 * 줌이 동일하다는 전제 하에 offset을 1:1로 복사한다.
 */
export function applySyncedScroll(
  targets: readonly { scrollLeft: number; scrollTop: number }[],
  source: { scrollLeft: number; scrollTop: number },
): void {
  for (const target of targets) {
    target.scrollLeft = source.scrollLeft;
    target.scrollTop = source.scrollTop;
  }
}

export const PROCESS_COMPARE_ZOOM_MIN = 0.5;
export const PROCESS_COMPARE_ZOOM_MAX = 4;
export const PROCESS_COMPARE_ZOOM_STEP = 0.25;

export function clampProcessCompareZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(PROCESS_COMPARE_ZOOM_MAX, Math.max(PROCESS_COMPARE_ZOOM_MIN, value));
}

export function zoomProcessCompareIn(current: number): number {
  return clampProcessCompareZoom(Math.round((current + PROCESS_COMPARE_ZOOM_STEP) * 100) / 100);
}

export function zoomProcessCompareOut(current: number): number {
  return clampProcessCompareZoom(Math.round((current - PROCESS_COMPARE_ZOOM_STEP) * 100) / 100);
}

/** 깜빡임 모드 주기(ms) 범위. */
export const PROCESS_COMPARE_BLINK_MIN_MS = 250;
export const PROCESS_COMPARE_BLINK_MAX_MS = 2000;

export function clampProcessCompareBlinkMs(value: number): number {
  if (!Number.isFinite(value)) return 800;
  return Math.min(PROCESS_COMPARE_BLINK_MAX_MS, Math.max(PROCESS_COMPARE_BLINK_MIN_MS, value));
}

/**
 * 차이 하이라이트: 다운스케일된 두 이미지의 픽셀 차이를 비교해
 * 차이가 큰 셀들의 경계 박스를 원본 좌표(%)로 반환한다.
 * data는 width*height*4 RGBA 배열이다.
 */
export interface ProcessCompareDiffRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function computeProcessCompareDiffRegions(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { readonly cellSize?: number; readonly threshold?: number; readonly maxRegions?: number },
): ProcessCompareDiffRegion[] {
  const cellSize = options?.cellSize ?? 8;
  const threshold = options?.threshold ?? 48;
  const maxRegions = options?.maxRegions ?? 6;
  if (a.length !== b.length || width <= 0 || height <= 0) return [];

  const cols = Math.ceil(width / cellSize);
  const rows = Math.ceil(height / cellSize);
  const scores: { col: number; row: number; score: number }[] = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let sum = 0;
      let count = 0;
      for (let y = row * cellSize; y < Math.min((row + 1) * cellSize, height); y += 1) {
        for (let x = col * cellSize; x < Math.min((col + 1) * cellSize, width); x += 1) {
          const i = (y * width + x) * 4;
          const dr = Math.abs(a[i] - b[i]);
          const dg = Math.abs(a[i + 1] - b[i + 1]);
          const db = Math.abs(a[i + 2] - b[i + 2]);
          sum += (dr + dg + db) / 3;
          count += 1;
        }
      }
      const avg = count === 0 ? 0 : sum / count;
      if (avg >= threshold) scores.push({ col, row, score: avg });
    }
  }

  scores.sort((x, y) => y.score - x.score);
  return scores.slice(0, maxRegions).map(({ col, row }) => ({
    x: (col * cellSize / width) * 100,
    y: (row * cellSize / height) * 100,
    width: (Math.min(cellSize, width - col * cellSize) / width) * 100,
    height: (Math.min(cellSize, height - row * cellSize) / height) * 100,
  }));
}

/**
 * 이미지가 없을 때 사용하는 결정적 플레이스홀더 아트 (SVG data URI).
 * 공정 종류별 그라데이션 + 라벨. seed로 색상 순환.
 */
const PROCESS_COMPARE_ART_HUES: Record<ProcessCompareKind, readonly number[]> = {
  image: [222, 258, 285],
  text: [160, 185, 210],
  media: [320, 345, 20],
  package: [40, 65, 90],
};

const PROCESS_COMPARE_ART_GLYPH: Record<ProcessCompareKind, string> = {
  image: "◈",
  text: "✎",
  media: "▶",
  package: "▣",
};

export function processComparePlaceholderArt(kind: ProcessCompareKind, label: string, seed = 0): string {
  const hues = PROCESS_COMPARE_ART_HUES[kind];
  const hue = hues[Math.abs(seed) % hues.length];
  const glyph = PROCESS_COMPARE_ART_GLYPH[kind];
  const safeLabel = label.replace(/[<>&"']/g, "");
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="900" viewBox="0 0 640 900">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue},45%,26%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 40) % 360},55%,14%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="640" height="900" fill="url(#g)"/>` +
    `<circle cx="320" cy="380" r="150" fill="none" stroke="hsl(${hue},70%,65%)" stroke-opacity="0.25" stroke-width="2"/>` +
    `<circle cx="320" cy="380" r="105" fill="none" stroke="hsl(${hue},70%,65%)" stroke-opacity="0.18" stroke-width="2"/>` +
    `<text x="320" y="410" text-anchor="middle" font-size="120" fill="hsl(${hue},80%,72%)" fill-opacity="0.85">${glyph}</text>` +
    `<text x="320" y="620" text-anchor="middle" font-size="44" font-weight="700" fill="#ffffff" fill-opacity="0.92" font-family="sans-serif">${safeLabel}</text>` +
    `<text x="320" y="668" text-anchor="middle" font-size="24" fill="#ffffff" fill-opacity="0.55" font-family="sans-serif">preview</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** 비교 가능한 항목이 2개 이상인지 (런처 버튼 활성화 조건). */
export function canOpenProcessCompare(items: readonly ProcessCompareItem[]): boolean {
  return items.length >= 2;
}
