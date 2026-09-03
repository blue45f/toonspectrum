/**
 * Studio Localization QA — 세 엔진(문체 린터·넘침 게이트·MQM 채점기)을 회차 한 편에 물리는
 * 조립층.
 *
 * 세 엔진은 서로를 모른다. 그게 옳다 — 린터는 문자열만 보고, 넘침 게이트는 상자만 보고,
 * 채점기는 오류 목록만 본다. 그래서 **누군가는 세 결과를 같은 큐(cue) 위에서 합쳐야 하고**,
 * 그 자리가 여기다. 이 조립을 패널(.tsx) 안에 두면 테스트가 DOM을 거쳐야 하고, 엔진 안에 두면
 * 세 엔진이 서로를 import 하게 된다 — 둘 다 하지 않으려고 이 모듈이 존재한다.
 *
 * 규칙(하우스 관례 그대로):
 *  - 순수·결정적. Konva/DOM 의존 없음. 글자 폭 측정은 `BubbleTextMeasurer` 포트로 주입받는다.
 *  - 입력 배열·객체는 절대 변형하지 않는다.
 *  - 타이포그래피 기본값(폰트 크기·글꼴·행간·자간)은 **한 글자도 새로 정하지 않는다**.
 *    전부 `studio-bubble-text-fit.ts`의 리졸버를 부른다 — 그 단일 소스가 깨졌을 때 대사가
 *    조용히 사라진 것이 이 저장소의 실제 결함 이력이다(같은 파일 헤더 참조).
 *
 * 순서가 계약이다:
 *   ① 넘침 게이트를 먼저 돌린다 → 권고 조판 줄(`verdict.lines`)을 얻는다.
 *   ② 그 줄을 문체 린터에 `lines`로 넘긴다 → 레이아웃 3규칙(관사 뒤 줄바꿈·하이픈 앞 줄바꿈·
 *      실루엣)이 비로소 실행된다. 이 줄이 없으면 그 셋은 "미실행"으로 집계된다.
 *   ③ 두 결과를 MQM 오류 입력으로 바꿔 한 번에 채점한다 → 점수가 하나만 존재한다.
 *
 * §1. 입력 모델
 * §2. 타이포그래피 해석 — 전부 위임
 * §3. 회차 실행
 * §4. 차원별 묶음(패널이 그대로 그린다)
 */

import {
  bubbleLetterSpacing,
  resolveBubbleFontFamily,
  resolveBubbleFontSize,
  resolveBubbleFontStyle,
  resolveBubbleLineHeight,
  type BubbleTextMeasurer,
  type BubbleWebtoonTheme,
} from "./studio-bubble-text-fit";
import { collectDialogueItems } from "./studio-dialogue-batch";
import {
  detectStudioMqmTruncationErrors,
  scoreStudioMqmErrors,
  studioMqmDenominator,
  STUDIO_MQM_DIMENSIONS,
  type StudioMqmDenominatorUnit,
  type StudioMqmError,
  type StudioMqmErrorInput,
  type StudioMqmDimensionRollup,
  type StudioMqmScoreResult,
  type StudioMqmTruncationObservation,
} from "./studio-localization-mqm";
import {
  evaluateLocalizationOverflow,
  summarizeLocalizationOverflow,
  type LocalizationOverflowInput,
  type LocalizationOverflowPolicy,
  type LocalizationOverflowSummary,
  type LocalizationOverflowVerdict,
} from "./studio-localization-overflow-gate";
import {
  lintStudioLocalizationStyle,
  studioLocalizationStyleFindingToMqmError,
  type StudioLocalizationStyleLintOptions,
  type StudioLocalizationStyleLintResult,
  type StudioLocalizationStyleUnit,
} from "./studio-localization-style-lint";

import type { DialogueElementLike, DialoguePageLike } from "./studio-dialogue-batch";

// ── §1. 입력 모델 ─────────────────────────────────────────────────────────────

/**
 * `DialogueElementLike`가 선언하지 않는 조판 필드들. 실제 문서의 `BubbleEl`은 전부 갖고 있지만
 * 대사 목록화 타입은 최소 부분집합이라, 넘침 판정에 필요한 만큼만 여기서 넓힌다.
 * 전부 선택값이다 — 없으면 §2의 리졸버가 렌더와 같은 기본값을 준다.
 */
export interface StudioLocalizationQaElementTypography {
  readonly font?: string;
  readonly fontSize?: number;
  readonly fontStyle?: string;
  readonly lineHeight?: number;
  readonly vertical?: boolean;
}

type QaElement = DialogueElementLike & StudioLocalizationQaElementTypography;

/** 큐 하나 — 발견을 되짚을 때 패널이 필요한 최소 정보. */
export interface StudioLocalizationQaCue {
  readonly id: string;
  readonly pageId: string;
  /** 0 기준 페이지 순번(표시할 땐 +1). */
  readonly pageIndex: number;
  /** 검사 대상 문자열(초안이 있으면 초안). */
  readonly text: string;
  /** 넘침 판정 — 상자 치수를 못 읽은 큐는 null. */
  readonly overflow: LocalizationOverflowVerdict | null;
}

export interface StudioLocalizationQaOptions {
  /** 대상 로케일 코드. 문체 규칙표는 영문 전용이라 이 값이 규칙 실행 여부를 가른다. */
  readonly targetLocale: string;
  /** 원문 로케일 — 확장률 추정에만 쓴다. */
  readonly sourceLocale?: string;
  /**
   * 적용 **전**의 번역 초안. 주면 이 맵의 문자열을 검사한다(적용 후가 아니라 적용 전에
   * 막는 것이 이 게이트의 존재 이유다). 없으면 문서에 지금 들어 있는 문자열을 검사한다.
   */
  readonly translations?: ReadonlyMap<string, string>;
  /** 큐별 원문 — 확장률 추정용. 초안 검사 중이면 요소의 현재 text 가 곧 원문이다. */
  readonly sourceTextFor?: (cueId: string) => string | undefined;
  /** 말풍선 테마 — 행간·자간 기본값을 고른다(문서 상태라 호출부가 안다). */
  readonly theme?: BubbleWebtoonTheme;
  /** 효과음으로 취급할 큐 id. 문서에 SFX 표시가 없으므로 호출부가 알려 줄 때만 SFX 규칙이 돈다. */
  readonly sfxCueIds?: ReadonlySet<string>;
  readonly styleOptions?: StudioLocalizationStyleLintOptions;
  readonly overflowPolicy?: LocalizationOverflowPolicy;
  /**
   * 채점 분모 단위. 기본 `"characters"` — 웹툰 대사는 문단이 아니고 한국어·일본어·중국어의
   * 공백 분절이 단어 수를 크게 왜곡한다. 임계값 99가 단어 분모로만 교정돼 있다는 사실은
   * 결과의 `score.denominator.thresholdCalibrated`가 그대로 들고 다닌다.
   */
  readonly denominatorUnit?: StudioMqmDenominatorUnit;
  /** 숨김·잠금 큐도 검사할지. 기본 false — 캔버스 편집과 같은 규약. */
  readonly includeHidden?: boolean;
}

export interface StudioLocalizationQaReport {
  readonly basis: "studio-localization-qa";
  readonly targetLocale: string;
  /** 실제로 검사한 큐 수. */
  readonly checkedCueCount: number;
  /** 그중 상자 치수를 읽어 넘침까지 판정한 큐 수. */
  readonly overflowCheckedCount: number;
  /** 숨김·잠금이라 건너뛴 큐 수. */
  readonly skippedCueCount: number;
  readonly cues: readonly StudioLocalizationQaCue[];
  readonly style: StudioLocalizationStyleLintResult;
  readonly overflow: LocalizationOverflowSummary;
  readonly score: StudioMqmScoreResult;
}

// ── §2. 타이포그래피 해석 — 전부 위임 ─────────────────────────────────────────

function positiveNumber(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/** 넘침 게이트 입력 — 기본값은 하나도 여기서 정하지 않고 리졸버에 묻는다. */
function overflowInputFor(
  el: QaElement,
  text: string,
  options: StudioLocalizationQaOptions,
): LocalizationOverflowInput | null {
  const boxWidth = positiveNumber(el.width);
  const boxHeight = positiveNumber(el.height);
  // 상자 치수가 없으면 넘침은 **판정하지 않는다**. 임의의 상자를 가정하고 "넘친다"고 말하는
  // 쪽이 훨씬 나쁘다 — 그 순간 이 보고서는 오탐 생성기가 된다.
  if (boxWidth === null || boxHeight === null) return null;

  const fontSize = resolveBubbleFontSize(el.fontSize);
  const sourceText = options.sourceTextFor?.(el.id);
  return {
    text,
    ...(sourceText === undefined ? {} : { sourceText }),
    ...(options.sourceLocale === undefined ? {} : { sourceLocale: options.sourceLocale }),
    targetLocale: options.targetLocale,
    boxWidth,
    boxHeight,
    fontSize,
    fontFamily: resolveBubbleFontFamily(el.font),
    fontStyle: resolveBubbleFontStyle(el.fontStyle),
    lineHeight: resolveBubbleLineHeight({
      lineHeight: el.lineHeight,
      vertical: el.vertical,
      theme: options.theme,
    }),
    letterSpacing: bubbleLetterSpacing(options.theme),
    ...(el.vertical === undefined ? {} : { vertical: el.vertical }),
  };
}

/**
 * 넘침 판정을 MQM 관측치로 옮긴다.
 *
 * `textLost`는 **일부러 싣지 않는다** — 이 게이트는 렌더 전에 예측하는 물건이고, 글자를 실제로
 * 버렸는지는 렌더가 끝나야 안다. 확인되지 않은 손실을 Critical(자동 Fail)로 올리면 회차가
 * 근거 없이 막힌다.
 */
function truncationObservation(
  cueId: string,
  pageIndex: number,
  verdict: LocalizationOverflowVerdict,
  authoredFontSize: number,
): StudioMqmTruncationObservation {
  const expansionRatio =
    verdict.observedExpansionPercent === null ? undefined : verdict.observedExpansionPercent / 100;
  return {
    cueId,
    page: pageIndex + 1,
    fits: verdict.fits,
    shrinkRatio: authoredFontSize > 0 ? verdict.fontSize / authoredFontSize : 1,
    ...(expansionRatio === undefined ? {} : { expansionRatio }),
  };
}

// ── §3. 회차 실행 ─────────────────────────────────────────────────────────────

/**
 * 회차 한 편의 현지화 QA.
 *
 * 반환값의 `score`가 유일한 점수다 — 문체 발견과 넘침 판정이 **같은 채점기**를 통과하므로,
 * "린터는 통과인데 점수는 낙제" 같은 두 우주가 생기지 않는다.
 */
export function runStudioLocalizationQa(
  pages: readonly DialoguePageLike[],
  measurer: BubbleTextMeasurer,
  options: StudioLocalizationQaOptions,
): StudioLocalizationQaReport {
  const items = collectDialogueItems(pages);
  const elementById = new Map<string, QaElement>();
  for (const page of pages) {
    for (const el of page.elements) elementById.set(el.id, el as QaElement);
  }

  const cues: StudioLocalizationQaCue[] = [];
  const styleUnits: StudioLocalizationStyleUnit[] = [];
  const observations: StudioMqmTruncationObservation[] = [];
  const verdicts: LocalizationOverflowVerdict[] = [];
  const scoredTexts: string[] = [];
  let skippedCueCount = 0;
  let overflowCheckedCount = 0;

  for (const item of items) {
    if (!options.includeHidden && (item.hidden || item.locked)) {
      skippedCueCount += 1;
      continue;
    }
    const text = options.translations?.get(item.id) ?? item.text;
    const el = elementById.get(item.id);

    // ① 넘침 먼저 — 권고 조판 줄이 ②의 레이아웃 규칙 입력이다.
    let verdict: LocalizationOverflowVerdict | null = null;
    if (el) {
      const input = overflowInputFor(el, text, options);
      if (input) {
        verdict = evaluateLocalizationOverflow(input, measurer, options.overflowPolicy ?? {});
        verdicts.push(verdict);
        observations.push(
          truncationObservation(item.id, item.pageIndex, verdict, resolveBubbleFontSize(el.fontSize)),
        );
        overflowCheckedCount += 1;
      }
    }

    // ② 문체 — 줄이 있으면 레이아웃 3규칙까지 실행된다.
    styleUnits.push({
      id: item.id,
      text,
      kind: options.sfxCueIds?.has(item.id) ? "sfx" : "dialogue",
      ...(verdict === null ? {} : { lines: verdict.lines }),
      targetLocale: options.targetLocale,
      page: item.pageIndex + 1,
    });

    scoredTexts.push(text);
    cues.push({
      id: item.id,
      pageId: item.pageId,
      pageIndex: item.pageIndex,
      text,
      overflow: verdict,
    });
  }

  const style = lintStudioLocalizationStyle(styleUnits, options.styleOptions);

  // ③ 두 갈래를 한 채점기에 넣는다.
  const errorInputs: StudioMqmErrorInput[] = [
    ...style.findings.map(studioLocalizationStyleFindingToMqmError),
    ...detectStudioMqmTruncationErrors(observations),
  ];
  const score = scoreStudioMqmErrors(
    errorInputs,
    studioMqmDenominator(scoredTexts, options.denominatorUnit ?? "characters"),
  );

  return Object.freeze({
    basis: "studio-localization-qa",
    targetLocale: options.targetLocale,
    checkedCueCount: cues.length,
    overflowCheckedCount,
    skippedCueCount,
    cues: Object.freeze(cues),
    style,
    overflow: summarizeLocalizationOverflow(verdicts),
    score,
  });
}

// ── §4. 차원별 묶음 ───────────────────────────────────────────────────────────

export interface StudioLocalizationQaDimensionGroup {
  readonly rollup: StudioMqmDimensionRollup;
  readonly errors: readonly StudioMqmError[];
}

/**
 * 발견을 MQM 차원별로 묶는다. 순서는 `STUDIO_MQM_DIMENSIONS` 카탈로그 순서 — 심각도 순이 아니다.
 * 차원 순서가 고정이어야 같은 회차를 두 번 열었을 때 목록이 흔들리지 않는다.
 */
export function studioLocalizationQaGroups(
  report: StudioLocalizationQaReport,
): readonly StudioLocalizationQaDimensionGroup[] {
  const order = new Map(STUDIO_MQM_DIMENSIONS.map((dimension, index) => [dimension.id, index]));
  return report.score.byDimension
    .map((rollup) => ({
      rollup,
      errors: report.score.errors.filter((error) => error.dimension === rollup.dimension),
    }))
    .sort((left, right) => {
      const a = order.get(left.rollup.dimension) ?? Number.MAX_SAFE_INTEGER;
      const b = order.get(right.rollup.dimension) ?? Number.MAX_SAFE_INTEGER;
      return a - b;
    });
}

/** 큐 id → 큐. 발견에서 대사로 되짚을 때 패널이 쓴다. */
export function studioLocalizationQaCueIndex(
  report: StudioLocalizationQaReport,
): ReadonlyMap<string, StudioLocalizationQaCue> {
  return new Map(report.cues.map((cue) => [cue.id, cue]));
}
