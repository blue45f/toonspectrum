/**
 * Studio Bubble Text Fit — 말풍선 "크기 고정 시 폰트 자동 축소" 순수 엔진.
 *
 * 기존 동작(StudioPage.tsx의 commitEditText, grep "말풍선은 텍스트가 넘치지 않게 높이를 자동
 * 확장")은 텍스트가 넘치면 말풍선 "높이"를 늘려 항상 다 들어오게 한다(폭은 고정). 이 모듈은 그
 * 반대 모드 — 사용자가 말풍선 크기(폭·높이)를 고정하고 싶을 때, 높이를 늘리는 대신 폰트 크기를
 * 이진 탐색으로 줄여 고정된 박스 안에 맞추는 계산만 담당한다(Canva/Figma의 "autosize: shrink
 * text on overflow"와 동일한 패턴).
 *
 * 전부 순수·결정적 — 텍스트 폭 측정은 호출부가 주입하는 BubbleTextMeasurer 포트로 분리했다
 * (studio-pdf-contact-sheet.ts의 ctx.measureText 기반 이진 탐색과 동일한 관례: 코어 알고리즘은
 * Canvas/Konva 런타임과 무관하고, 테스트는 글자 수 기반 가짜 측정기를 주입해 결정적으로 검증
 * 한다). 실제 화면에서는 createCanvasBubbleTextMeasurer()가 만드는 실제 2D 컨텍스트 측정기를 쓴다.
 *
 * 패딩 계산(bubbleHorizontalPadding/bubbleVerticalPadding)은 StudioPage.tsx가 이미 쓰고 있는
 * bHPad/bVPadTop/bVPadBot 공식(폰트 크기의 0.6/0.48/0.64배, 최소 12/8/10px)을 그대로 옮겨온
 * 것이다 — 두 곳이 다른 공식을 쓰면 "탐색이 가정한 여유 폭"과 "실제 렌더 여유 폭"이 어긋나
 * 잘못된 크기를 고를 수 있어, 하나의 소스를 공유해야 한다(통합 설계 문서 §2 참고 — StudioPage.tsx의
 * 인라인 공식도 이 함수를 호출하도록 바꾼다).
 *
 * 단조성 가정(왜 이진 탐색이 유효한가): fontSize가 작아질수록 (1) hPad/vPad는 `max(고정 하한,
 * fontSize*비율)` 형태라 단조 비증가하므로 사용 가능 폭/높이는 단조 비감소하고, (2) 같은 폭에서
 * 그리디 워드랩이 필요로 하는 줄 수는 글자 폭이 좁아질수록 단조 비증가하지 않는다(같거나 준다).
 * 두 효과 모두 "작을수록 더 잘 맞는다" 방향이라 표준 경계 이진 탐색이 유효하다. 그리디 워드랩의
 * 아주 병적인 입력(예: 특정 폭에서만 우연히 한 단어가 걸치는 경우)에서 아주 드물게 이 가정이
 * 깨질 수 있으나, 기존 studio-pdf-contact-sheet.ts의 fitLabelToWidth도 동일한 가정을 이미 쓰고
 * 있고 실사용 범위에서 문제된 적이 없다.
 *
 * 세로쓰기(`vertical: true`): 판정만 studio-vertical-text.ts의 `layoutVerticalText`로 갈아끼운다.
 * 세로쓰기에서 줄바꿈을 결정하는 축은 **세로축(열 길이 ≤ 상자 높이)**이고, 넘칠지 말지는 그렇게
 * 만들어진 **열 수 × 열 간격이 상자 폭 안에 들어오는가**로 판정된다 — 가로쓰기와 폭/높이의
 * 역할이 정확히 뒤바뀐다. 이진 탐색의 단조성 가정은 그대로 성립한다(폰트가 작아질수록 열 길이도
 * 열 간격도 함께 줄어 열 수는 늘지 않고 블록 폭은 단조 비증가). `vertical`이 없으면 기존 경로가
 * 한 글자도 바뀌지 않는다(하위호환).
 */

import { layoutVerticalText, type VerticalBlockAlign } from "./studio-vertical-text";

export interface BubbleTextMeasurer {
  /** text를 (fontPx, fontFamily, fontStyle)로 그렸을 때의 렌더 폭(px). letterSpacing은 무시한다
   *  (근사 — letterSpacing이 있는 말풍선은 실제보다 살짝 여유 있게 계산될 수 있다). */
  measureWidth(text: string, fontPx: number, fontFamily: string, fontStyle: string): number;
}

/** 자동 축소 하한 기본값 — 패널 슬라이더/렌더 통합이 공유한다. */
export const BUBBLE_AUTO_SHRINK_MIN_FONT_DEFAULT = 10;

/** 자동 축소 하한 슬라이더 범위 — 패널 UI가 공유한다. */
export const BUBBLE_AUTO_SHRINK_MIN_FONT_RANGE = { min: 8, max: 24, step: 1 } as const;

/** 이진 탐색 폰트 크기 그리드 간격(px) — 0.5 단위면 표시값이 매끈하다. */
const FONT_SEARCH_STEP = 0.5;

/** 높이 예산에 곱하는 안전 여유 — 근사 워드랩(캔버스 measureText 기반)이 실제 Konva Text 내부
 *  워드랩과 완전히 같은 줄바꿈 지점을 고르지 못할 수 있어(§docstring 단조성 가정 참고), 넘치는
 *  쪽보다 살짝 이르게 줄이는 쪽이 안전하다는 판단으로 6%를 비워둔다. */
const HEIGHT_SAFETY_MARGIN = 0.94;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** 말풍선 좌우 패딩(px) — StudioPage.tsx bHPad와 동일 공식(그대로 옮김). */
export function bubbleHorizontalPadding(fontSize: number): number {
  return Math.max(12, Math.round(fontSize * 0.6));
}

/** 말풍선 상/하 패딩(px) — StudioPage.tsx bVPadTop/bVPadBot과 동일 공식(그대로 옮김). */
export function bubbleVerticalPadding(fontSize: number): { top: number; bottom: number } {
  return {
    top: Math.max(8, Math.round(fontSize * 0.48)),
    bottom: Math.max(10, Math.round(fontSize * 0.64)),
  };
}

// ── 줄바꿈(그리디 워드랩 + 긴 단어 강제 분할) ────────────────────────────────

/**
 * 공백 없이 maxWidth를 넘는 단어를 글자 단위로 강제 분할한다(한글은 글자=완성형 음절이라 이
 * 단위 분할이 시각적으로 자연스럽다 — 자모 분리 입력 등 예외적 인코딩은 다루지 않는다).
 * 반환 배열의 마지막 요소는 "아직 줄이 안 찬 나머지"이므로 호출부가 다음 단어를 이어 붙일 수 있다.
 */
function hardBreakWord(
  word: string,
  maxWidth: number,
  fontPx: number,
  fontFamily: string,
  fontStyle: string,
  measurer: BubbleTextMeasurer
): string[] {
  const out: string[] = [];
  let current = "";
  for (const ch of word) {
    const candidate = current + ch;
    if (current.length > 0 && measurer.measureWidth(candidate, fontPx, fontFamily, fontStyle) > maxWidth) {
      out.push(current);
      current = ch;
    } else {
      current = candidate;
    }
  }
  out.push(current);
  return out;
}

/**
 * 텍스트를 maxWidth 안에 들어오는 줄 배열로 그리디 워드랩한다. 명시적 줄바꿈(\n)은 항상 존중하고,
 * 각 문단 안에서는 공백 단위로 그리디하게 채우다 넘치면 새 줄로 넘긴다. 공백 없이 긴 단어(URL,
 * 의성어 연타 등)는 hardBreakWord로 강제 분할한다. 빈 문단(연속 줄바꿈)은 빈 줄로 보존한다.
 */
export function wrapBubbleTextLines(
  text: string,
  maxWidth: number,
  fontPx: number,
  fontFamily: string,
  fontStyle: string,
  measurer: BubbleTextMeasurer
): string[] {
  const safeMaxWidth = Math.max(1, maxWidth);
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (paragraph.length === 0) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of paragraph.split(" ")) {
      if (word.length === 0) continue; // 연속 공백은 한 칸으로 합쳐진다(Konva 기본 동작과 동일 근사).
      const candidate = current.length === 0 ? word : `${current} ${word}`;
      if (measurer.measureWidth(candidate, fontPx, fontFamily, fontStyle) <= safeMaxWidth) {
        current = candidate;
        continue;
      }
      // 후보가 넘친다 — 현재 줄을 먼저 확정.
      if (current.length > 0) lines.push(current);
      // 단어 하나만으로도 넘치면 글자 단위 강제 분할.
      if (measurer.measureWidth(word, fontPx, fontFamily, fontStyle) > safeMaxWidth) {
        const broken = hardBreakWord(word, safeMaxWidth, fontPx, fontFamily, fontStyle, measurer);
        lines.push(...broken.slice(0, -1));
        current = broken[broken.length - 1] ?? "";
      } else {
        current = word;
      }
    }
    lines.push(current);
  }
  return lines;
}

// ── 폰트 크기 이진 탐색 ──────────────────────────────────────────────────────

export interface BubbleFontFitInput {
  text: string;
  /** 말풍선 전체 폭(px, 패딩 포함) — el.width 그대로. */
  boxWidth: number;
  /** 말풍선 전체 높이(px, 패딩 포함) — el.height 그대로. */
  boxHeight: number;
  /** 탐색 상한(사용자가 지정한 "기준" 폰트 크기) — 텍스트가 짧으면 그대로 반환된다. */
  maxFontSize: number;
  /** 탐색 하한. 미지정 시 BUBBLE_AUTO_SHRINK_MIN_FONT_DEFAULT(10). */
  minFontSize?: number;
  fontFamily: string;
  fontStyle?: string;
  /**
   * 행간 배수 — **필수**(선택값이 아니다). 반드시 StudioPage.tsx의 실제 렌더가 쓰는
   * `bubbleLineHeight`(`el.lineHeight ?? (el.vertical ? 1.4 : webtoonTheme === "soft" ? 1.35 :
   * webtoonTheme === "vivid" ? 1.2 : 1.25)`)와 정확히 같은 값을 호출부가 계산해 넘겨야 한다 —
   * 테마/세로쓰기 여부에 따라 1.2~1.4 사이에서 갈리므로(어떤 조합에서도 1.1이 나오지 않는다) 이
   * 모듈은 고정 기본값을 두지 않는다(패딩과 동일하게 "탐색과 실제 렌더가 같은 소스를 공유해야
   * 한다"는 원칙 — 모듈 상단 docstring 참고). 예전 버전은 `?? 1.1`로 조용히 폴백했는데, 1.1은
   * 실제로 가능한 어떤 테마/세로 조합보다도 작아 텍스트 블록 높이를 항상 과소평가했다(최대 ~27%
   * 오차) — 폰트를 필요한 만큼 충분히 줄이지 못해 "크기 고정"인데도 텍스트가 넘치는 회귀로
   * 이어질 수 있었다(검증 단계에서 발견·수정).
   */
  lineHeight: number;
  /**
   * 세로쓰기 조판으로 판정할지 여부. 미설정/false면 이 모듈의 기존 가로쓰기 경로가 그대로
   * 쓰인다(하위호환 — 한 글자도 달라지지 않는다). true면 studio-vertical-text.ts의
   * `layoutVerticalText`가 세로축으로 열을 끊고, 그 결과 블록 폭이 상자 폭에 맞는지로 판정한다.
   * 이때 `text`에는 **원문 그대로** 넘겨야 한다(레거시 `formatVerticalText` 전치 문자열이 아니라).
   */
  vertical?: boolean;
  /** 세로쓰기 전용 — 글자 사이 세로 간격(px). 가로쓰기 경로는 이 값을 쓰지 않는다(측정기가 무시). */
  letterSpacing?: number;
  /** 세로쓰기 전용 — 열 안 정렬(가로쓰기 align의 세로축 대응). 판정 결과에는 영향이 없다. */
  blockAlign?: VerticalBlockAlign;
}

export interface BubbleFontFitResult {
  /** 선택된 폰트 크기(px) — [minFontSize, maxFontSize] 안, FONT_SEARCH_STEP 그리드에 스냅. */
  fontSize: number;
  /**
   * 참고/디버그용 — 가로쓰기는 워드랩 줄 배열(실제 캔버스 렌더는 Konva Text 자체 워드랩에
   * 맡기므로 약간 다를 수 있다), 세로쓰기는 **열 배열**(오른쪽 열부터, 각 열의 글자를 이어붙인 것).
   */
  lines: string[];
  /** minFontSize에서도 못 맞으면 true — 호출부가 경고 표시를 보여줄 수 있다. */
  overflow: boolean;
}

/** fontSize 하나가 박스 안에 들어가는지 판정 — 패딩은 그 fontSize 자체 기준(모듈 상단 docstring). */
function fitsAtFontSize(
  input: Pick<
    BubbleFontFitInput,
    | "text"
    | "boxWidth"
    | "boxHeight"
    | "fontFamily"
    | "fontStyle"
    | "lineHeight"
    | "vertical"
    | "letterSpacing"
    | "blockAlign"
  >,
  fontSize: number,
  measurer: BubbleTextMeasurer
): { ok: boolean; lines: string[] } {
  const fontStyle = input.fontStyle ?? "bold";
  const lineHeight = input.lineHeight;
  const hPad = bubbleHorizontalPadding(fontSize);
  const vPad = bubbleVerticalPadding(fontSize);
  const availW = Math.max(4, input.boxWidth - hPad * 2);
  const availH = Math.max(4, (input.boxHeight - (vPad.top + vPad.bottom)) * HEIGHT_SAFETY_MARGIN);
  if (input.vertical) {
    // 세로쓰기 — 열은 세로축(availH)으로 끊고, 그렇게 나온 블록 폭이 availW 안이면 맞는 것이다.
    const layout = layoutVerticalText(
      {
        text: input.text || " ",
        fontSize,
        lineHeight,
        letterSpacing: input.letterSpacing,
        fontFamily: input.fontFamily,
        fontStyle,
        maxColumnLength: availH,
        blockAlign: input.blockAlign,
      },
      measurer
    );
    const columns = layout.columns.map((column) => column.items.map((item) => item.text.split("\n").join("")).join(""));
    return { ok: !layout.overflow && layout.width <= availW, lines: columns };
  }
  const lines = wrapBubbleTextLines(input.text || " ", availW, fontSize, input.fontFamily, fontStyle, measurer);
  const blockHeight = lines.length * fontSize * lineHeight;
  return { ok: blockHeight <= availH, lines };
}

/**
 * 고정된 (boxWidth, boxHeight) 안에 text가 들어가는 가장 큰 폰트 크기를 이진 탐색으로 찾는다.
 * maxFontSize에서 이미 맞으면 탐색 없이 그대로 반환한다. minFontSize에서도 못 맞으면 minFontSize를
 * 돌려주며 overflow:true로 표시한다(그 이상 줄이지 않는다 — Canva/Figma와 동일하게 하한을 존중).
 */
export function fitBubbleFontSize(
  input: BubbleFontFitInput,
  measurer: BubbleTextMeasurer = createCanvasBubbleTextMeasurer()
): BubbleFontFitResult {
  const minFontSize = Math.max(1, input.minFontSize ?? BUBBLE_AUTO_SHRINK_MIN_FONT_DEFAULT);
  const maxFontSize = Math.max(minFontSize, input.maxFontSize);

  const atMax = fitsAtFontSize(input, maxFontSize, measurer);
  if (atMax.ok || maxFontSize <= minFontSize) {
    return { fontSize: round1(maxFontSize), lines: atMax.lines, overflow: !atMax.ok };
  }

  // 내림차순 그리드: sizes[0]≈maxFontSize 다음 스텝, sizes[last]=minFontSize.
  const sizes: number[] = [];
  for (let s = maxFontSize - FONT_SEARCH_STEP; s > minFontSize; s -= FONT_SEARCH_STEP) sizes.push(round1(s));
  sizes.push(round1(minFontSize));

  const atMin = fitsAtFontSize(input, sizes[sizes.length - 1]!, measurer);
  if (!atMin.ok) {
    return { fontSize: sizes[sizes.length - 1]!, lines: atMin.lines, overflow: true };
  }

  // "처음으로 맞는(ok===true) 지점"을 찾는 표준 경계 이진 탐색 — sizes는 내림차순이라 인덱스가
  // 커질수록(폰트가 작아질수록) ok가 될 가능성이 단조 증가한다(모듈 docstring의 단조성 가정).
  let lo = 0;
  let hi = sizes.length - 1;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fitsAtFontSize(input, sizes[mid]!, measurer).ok) hi = mid;
    else lo = mid + 1;
  }
  const chosen = sizes[lo]!;
  return { fontSize: chosen, lines: fitsAtFontSize(input, chosen, measurer).lines, overflow: false };
}

// ── 실제 런타임 측정기(Canvas 2D) ────────────────────────────────────────────

let sharedMeasureCanvas: HTMLCanvasElement | null = null;
let sharedMeasureCtx: CanvasRenderingContext2D | null = null;

/**
 * 실제 화면용 측정기 — 재사용 가능한 오프스크린 <canvas> 하나로 ctx.measureText를 호출한다
 * (Konva.Text 내부도 결국 캔버스 measureText로 귀결되므로 여기 결과와 실제 렌더 폭은 사실상
 * 일치한다 — letterSpacing은 반영하지 않는다). SSR/캔버스 미지원 환경(document 없음)에서는
 * "글자당 fontPx*0.55px" 근사로 방어적으로 폴백한다.
 */
export function createCanvasBubbleTextMeasurer(): BubbleTextMeasurer {
  return {
    measureWidth(text, fontPx, fontFamily, fontStyle) {
      if (typeof document === "undefined") return text.length * fontPx * 0.55;
      if (!sharedMeasureCanvas) {
        sharedMeasureCanvas = document.createElement("canvas");
        sharedMeasureCtx = sharedMeasureCanvas.getContext("2d");
      }
      const ctx = sharedMeasureCtx;
      if (!ctx) return text.length * fontPx * 0.55;
      ctx.font = `${fontStyle} ${fontPx}px ${fontFamily}`;
      return ctx.measureText(text).width;
    },
  };
}
