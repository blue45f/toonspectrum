/**
 * 모바일 독자 뷰(Reader Preview) 분석 — 순수 로직 모듈.
 *
 * 웹툰은 세로 스크롤 매체인데 창작 화면(가로 편집)과 독자 화면(세로 스크롤)이 다르다.
 * 이 모듈은 DOM·React·네트워크를 전혀 읽지 않고, 페이지/요소 경량 shape 만으로
 * "실제 모바일 폭(390px)에서 독자가 겪는 화면"을 계산한다:
 *
 * - 컷(프레임/패널)의 화면(screen) 단위 길이 — 1화면 = 844px(CSS, iPhone 14 기준)
 * - 과도하게 긴 컷(>3화면) / 짧은 컷(<0.5화면) 경고
 * - 대사 텍스트 가독성 — 독자 폭 환산 폰트가 최소값 미만이면 경고
 * - 컷 간격(gap) 측정 — 시각화와 겹침 경고의 재료
 * - 좌우 안전영역(16px) 침범 요소 검출
 *
 * `studio-scroll-rhythm.ts` 와 역할이 다르다: 그쪽은 문서 전체의 "연출 리듬"(밀도·호흡·
 * 엔딩)을 점수화하고, 이쪽은 독자 디바이스 한 화면을 기준으로 컷 단위 기하학을 잰다.
 * 임계값은 아래 `READER_PREVIEW_*` 상수에 모아 두어 테스트와 UI 가 공유한다.
 */

export const READER_PREVIEW_DEVICE_WIDTH_PX = 390;
export const READER_PREVIEW_VIEWPORT_HEIGHT_PX = 844;
export const READER_PREVIEW_CANVAS_WIDTH_PX = 720;
export const READER_PREVIEW_PAGE_GAP_PX = 24;

/** 컷 길이 경고 임계값 — 화면(screen) 단위. */
export const READER_PREVIEW_LONG_CUT_SCREENS = 3;
export const READER_PREVIEW_SHORT_CUT_SCREENS = 0.5;

/** 독자 폭(390px)으로 환산했을 때 대사가 읽히는 최소 폰트(px). */
export const READER_PREVIEW_MIN_DIALOGUE_FONT_PX = 14;

/** 좌우 안전영역 — 노치·엣지 제스처를 피해야 하는 최소 여백(px, 독자 폭 기준). */
export const READER_PREVIEW_SAFE_AREA_INSET_PX = 16;

export const READER_PREVIEW_LIMITS = Object.freeze({
  maxPages: 500,
  maxElementsPerPage: 20_000,
  maxWarnings: 200,
});

const CUT_TYPES = new Set(["frame", "panel"]);
const DIALOGUE_TYPES = new Set(["bubble", "dialogue", "caption", "text"]);

export interface ReaderPreviewElementLike {
  readonly id?: string;
  readonly type: string;
  readonly hidden?: boolean;
  readonly opacity?: number;
  readonly x?: number;
  readonly y?: number;
  readonly width?: number;
  readonly height?: number;
  readonly fontSize?: number;
  readonly text?: string;
}

export interface ReaderPreviewPageLike {
  readonly id: string;
  readonly canvasH: number;
  /** 생략하면 READER_PREVIEW_CANVAS_WIDTH_PX(720)를 쓴다. */
  readonly canvasW?: number;
  readonly elements: readonly ReaderPreviewElementLike[];
}

export type ReaderPreviewWarningSeverity = "info" | "warning" | "critical";

export type ReaderPreviewWarningCode =
  | "LONG_CUT"
  | "SHORT_CUT"
  | "SMALL_DIALOGUE_TEXT"
  | "OVERLAPPING_CUTS"
  | "SAFE_AREA_INTRUSION";

export interface ReaderPreviewWarning {
  readonly code: ReaderPreviewWarningCode;
  readonly severity: ReaderPreviewWarningSeverity;
  readonly pageId: string;
  readonly cutIndex: number | null;
  readonly elementId: string | null;
  /** 사용자 화면에 그대로 내는 한국어 한 줄 요약. */
  readonly message: string;
  /** 왜 문제인지 + 어떻게 고치는지. */
  readonly detail: string;
}

export interface ReaderPreviewCutMetric {
  readonly id: string | null;
  /** 페이지 안 컷 순서(위에서부터 0). */
  readonly index: number;
  /** 캔버스 px 기준. */
  readonly y: number;
  readonly height: number;
  /** 독자 폭 환산 기준 화면 수. */
  readonly screens: number;
  /** 다음 컷까지의 간격 — 캔버스 px. 마지막 컷은 null. 음수면 겹침. */
  readonly gapAfterPx: number | null;
  /** 독자 폭 환산 간격 px. 마지막 컷은 null. */
  readonly gapAfterReaderPx: number | null;
}

export interface ReaderPreviewPageAnalysis {
  readonly pageId: string;
  /** 독자 폭 / 캔버스 폭. */
  readonly scale: number;
  readonly cuts: readonly ReaderPreviewCutMetric[];
  readonly warnings: readonly ReaderPreviewWarning[];
  /** 페이지 전체 높이의 화면 수(독자 폭 환산). */
  readonly screenCount: number;
  readonly dialogueElementCount: number;
  readonly smallDialogueCount: number;
}

export interface ReaderPreviewAnalysis {
  readonly pages: readonly ReaderPreviewPageAnalysis[];
  readonly warnings: readonly ReaderPreviewWarning[];
  readonly warningCount: number;
  readonly criticalCount: number;
  readonly totalScreens: number;
}

export interface AnalyzeReaderPreviewOptions {
  readonly viewportHeightPx?: number;
  readonly readerWidthPx?: number;
  readonly canvasWidthPx?: number;
}

function finiteOr(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) ? (value as number) : fallback;
}

function round(value: number, precision = 2): number {
  const scale = 10 ** precision;
  return Math.round(value * scale) / scale;
}

function isVisibleElement(element: ReaderPreviewElementLike): boolean {
  if (element.hidden === true) return false;
  if (typeof element.opacity === "number" && element.opacity <= 0) return false;
  return true;
}

function toScreens(
  canvasPx: number,
  scale: number,
  viewportHeightPx: number,
): number {
  return round((canvasPx * scale) / viewportHeightPx);
}

export function analyzeReaderPreviewPage(
  page: ReaderPreviewPageLike,
  options: AnalyzeReaderPreviewOptions = {},
): ReaderPreviewPageAnalysis {
  const viewportHeightPx = Math.max(
    1,
    finiteOr(options.viewportHeightPx, READER_PREVIEW_VIEWPORT_HEIGHT_PX),
  );
  const readerWidthPx = Math.max(
    1,
    finiteOr(options.readerWidthPx, READER_PREVIEW_DEVICE_WIDTH_PX),
  );
  const canvasWidthPx = Math.max(
    1,
    finiteOr(
      options.canvasWidthPx ?? page.canvasW,
      READER_PREVIEW_CANVAS_WIDTH_PX,
    ),
  );
  const scale = readerWidthPx / canvasWidthPx;
  const canvasH = Math.max(0, finiteOr(page.canvasH, 0));

  const warnings: ReaderPreviewWarning[] = [];
  const pushWarning = (warning: ReaderPreviewWarning): void => {
    if (warnings.length < READER_PREVIEW_LIMITS.maxWarnings) warnings.push(warning);
  };

  const cutElements = page.elements
    .filter(isVisibleElement)
    .filter((element) => CUT_TYPES.has(element.type))
    .filter((element) => Number.isFinite(element.y) && Number.isFinite(element.height))
    .slice()
    .sort((a, b) => (a.y as number) - (b.y as number));

  const cuts: ReaderPreviewCutMetric[] = cutElements.map((element, index) => {
    const y = element.y as number;
    const height = Math.max(0, element.height as number);
    const next = cutElements[index + 1];
    const gapAfterPx =
      next === undefined ? null : (next.y as number) - (y + height);
    return {
      id: element.id ?? null,
      index,
      y,
      height,
      screens: toScreens(height, scale, viewportHeightPx),
      gapAfterPx,
      gapAfterReaderPx: gapAfterPx === null ? null : round(gapAfterPx * scale),
    };
  });

  for (const cut of cuts) {
    if (cut.screens > READER_PREVIEW_LONG_CUT_SCREENS) {
      pushWarning({
        code: "LONG_CUT",
        severity: "warning",
        pageId: page.id,
        cutIndex: cut.index,
        elementId: cut.id,
        message: `과도하게 긴 컷 — ${cut.screens}화면`,
        detail:
          `${cut.index + 1}번째 컷이 ${cut.screens}화면으로, 한 번에 스크롤해도 ` +
          `끝이 보이지 않습니다. 3화면 이하로 나누거나 컷 사이에 호흡 컷을 넣어 보세요.`,
      });
    } else if (cut.screens < READER_PREVIEW_SHORT_CUT_SCREENS && cut.height > 0) {
      pushWarning({
        code: "SHORT_CUT",
        severity: "warning",
        pageId: page.id,
        cutIndex: cut.index,
        elementId: cut.id,
        message: `과도하게 짧은 컷 — ${cut.screens}화면`,
        detail:
          `${cut.index + 1}번째 컷이 ${cut.screens}화면으로, 스크롤 중에 ` +
          `스쳐 지나가 독자가 인식하지 못할 수 있습니다. 앞뒤 컷과 합치거나 ` +
          `세로 길이를 늘려 보세요.`,
      });
    }
    if (cut.gapAfterPx !== null && cut.gapAfterPx < 0) {
      pushWarning({
        code: "OVERLAPPING_CUTS",
        severity: "critical",
        pageId: page.id,
        cutIndex: cut.index,
        elementId: cut.id,
        message: `컷이 겹쳐 있습니다 — ${cut.index + 1}번째 컷`,
        detail:
          `${cut.index + 1}번째 컷이 다음 컷과 ${Math.abs(round(cut.gapAfterPx))}px ` +
          `겹칩니다. 독자 화면에서는 두 컷의 경계가 뭉개져 보입니다.`,
      });
    }
  }

  const dialogueElements = page.elements
    .filter(isVisibleElement)
    .filter((element) => DIALOGUE_TYPES.has(element.type))
    .filter((element) => (element.text ?? "").trim().length > 0);

  let smallDialogueCount = 0;
  for (const element of dialogueElements) {
    const fontSize = finiteOr(element.fontSize, 0);
    if (fontSize <= 0) continue;
    const readerFontPx = round(fontSize * scale, 1);
    if (readerFontPx < READER_PREVIEW_MIN_DIALOGUE_FONT_PX) {
      smallDialogueCount += 1;
      pushWarning({
        code: "SMALL_DIALOGUE_TEXT",
        severity: "warning",
        pageId: page.id,
        cutIndex: null,
        elementId: element.id ?? null,
        message: `대사가 너무 작습니다 — 독자 폭 환산 ${readerFontPx}px`,
        detail:
          `말풍선/대사 텍스트가 독자 화면에서 ${readerFontPx}px로 보여 권장 ` +
          `최소값(${READER_PREVIEW_MIN_DIALOGUE_FONT_PX}px)에 못 미칩니다. ` +
          `폰트를 키우거나 말풍선을 넓혀 보세요.`,
      });
    }

    const x = finiteOr(element.x, 0);
    const width = finiteOr(element.width, 0);
    if (width > 0) {
      const leftReaderPx = x * scale;
      const rightReaderPx = (x + width) * scale;
      if (
        leftReaderPx < READER_PREVIEW_SAFE_AREA_INSET_PX ||
        rightReaderPx > readerWidthPx - READER_PREVIEW_SAFE_AREA_INSET_PX
      ) {
        pushWarning({
          code: "SAFE_AREA_INTRUSION",
          severity: "info",
          pageId: page.id,
          cutIndex: null,
          elementId: element.id ?? null,
          message: "대사가 안전영역을 침범합니다",
          detail:
            `대사 요소가 좌우 ${READER_PREVIEW_SAFE_AREA_INSET_PX}px 안전영역을 ` +
            `벗어났습니다. 노치·엣지 제스처 영역과 겹쳐 잘리거나 터치가 씹힐 수 있습니다.`,
        });
      }
    }
  }

  return {
    pageId: page.id,
    scale,
    cuts,
    warnings,
    screenCount: toScreens(canvasH, scale, viewportHeightPx),
    dialogueElementCount: dialogueElements.length,
    smallDialogueCount,
  };
}

export function analyzeReaderPreview(
  pages: readonly ReaderPreviewPageLike[],
  options: AnalyzeReaderPreviewOptions = {},
): ReaderPreviewAnalysis {
  const bounded = pages.slice(0, READER_PREVIEW_LIMITS.maxPages);
  const pageAnalyses = bounded.map((page) => analyzeReaderPreviewPage(page, options));
  const warnings = pageAnalyses.flatMap((analysis) => [...analysis.warnings]);
  return {
    pages: pageAnalyses,
    warnings,
    warningCount: warnings.length,
    criticalCount: warnings.filter((warning) => warning.severity === "critical").length,
    totalScreens: round(
      pageAnalyses.reduce((sum, analysis) => sum + analysis.screenCount, 0),
    ),
  };
}
