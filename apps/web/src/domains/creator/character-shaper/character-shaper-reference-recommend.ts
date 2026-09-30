/**
 * Character Shaper — 2D 레퍼런스 → 프리셋 조합 추천 (온디바이스 휴리스틱).
 *
 * 참고 이미지 탭에서 올린 2D 캐릭터 설정화를 기기 안에서만 분석해 체형/헤어/의상 차원의
 * 카탈로그 프리셋 후보를 고른다. 네트워크 호출, 모델 다운로드, 유료 AI API가 전혀 없고,
 * 같은 픽셀이면 항상 같은 추천을 내놓는 결정적(deterministic) 계산이다.
 *
 * 분석은 "인물 실루엣" 마스크 위에서만 동작한다. 전경(foreground)은 불투명하면서 종이보다
 * 어두운 픽셀(`luma < 235`)로 정의한다 — 투명 배경 PNG의 컷아웃과 흰 배경 JPEG의 설정화
 * 둘 다에 동작하고, 꽉 찬 일러스트(배경까지 진한 사진)는 신뢰도 `low`로 표시한다.
 *
 * 차원별 휴리스틱:
 * - 체형: 실루엣 바운딩 박스의 세로/가로 비를 두신(heads) 프리셋 구간에 매핑한다.
 * - 헤어: 크라운(0.12H) 너비 ÷ 턱선(0.22H) 너비로 볼륨을, 어깨 높이(0.30H)에서 몸통
 *   기둥(0.45–0.60H 최협 행) 바깥으로 삐져나온 실루엣으로 길이를 추정한다. 옆으로
 *   벌린 팔도 같은 신호를 내는 것이 한계라 헤어 신뢰도는 보통 이하로 둔다.
 * - 상의: 몸통 밴드 너비 프로파일로 원피스(엉덩이 아래까지 한 덩어리 + 상·하 대표색이
 *   한 벌) · 후드(소매 벌림) · 티셔츠를 구분한다.
 * - 하의: 다리 밴드의 가로줄기(runs) 개수로 바지/치마를 구분하고, 두 줄기 구간의
 *   길이 비율로 반바지/긴바지, 벌어지는 정도로 플리츠/롱스커트를 구분한다. 상의가
 *   원피스면 하의 차원은 생략한다.
 *
 * 모든 임계값은 이 파일 상단의 상수로 모아 두었고, 추천 사유 문자열에 측정값을 그대로
 * 적어 창작자가 판단할 수 있게 한다. 실루엣을 찾지 못하면 `ok: false`와 재시도 문구를
 * 반환하고, 경계가 애매하면 신뢰도를 낮춰 UI가 수동 탐색을 유도하게 한다.
 */

import { CHARACTER_SLOT_CATALOG, findCharacterSlotEntry } from "./character-shaper-catalog";
import { lumaOf } from "./character-shaper-image-math";

import type { CharacterSlotEntry } from "./character-shaper-contract";

/** 분석 입력. `character-shaper-palette-extract`의 `CharacterReferenceImage`와 같은 모양. */
export interface ReferenceRecommendImage {
  readonly width: number;
  readonly height: number;
  /** Straight-alpha RGBA8, row-major, top-left origin. */
  readonly data: Uint8ClampedArray;
}

export interface ReferenceRecommendOptions {
  /** 팔레트 추출에서 얻은 머리색 추정 — 헤어 사유의 근거 문구에만 쓴다. */
  readonly hairColor?: string | null;
}

export type ReferenceRecommendDimension = "body" | "hair" | "top" | "bottom";
export type ReferenceRecommendConfidence = "high" | "medium" | "low";

export interface ReferenceDimensionRecommendation {
  readonly dimension: ReferenceRecommendDimension;
  readonly entry: CharacterSlotEntry;
  /** 왜 이 프리셋인지. UI가 카드에 그대로 보여준다. */
  readonly reason: string;
  /** 해당 밴드에서 뽑은 대표 색. 색감 근거용이며 없으면 null. */
  readonly evidenceColor: string | null;
  readonly confidence: ReferenceRecommendConfidence;
}

export type ReferencePresetCombination =
  | {
    readonly ok: true;
    readonly dimensions: readonly ReferenceDimensionRecommendation[];
    /** 프레임에서 인물이 차지한 비율(0–1). 신뢰도 표시용. */
    readonly coverage: number;
  }
  | { readonly ok: false; readonly reason: string };

export const REFERENCE_RECOMMEND_DIMENSION_LABELS: Readonly<Record<ReferenceRecommendDimension, string>> =
  Object.freeze({ body: "체형", hair: "헤어", top: "상의", bottom: "하의" });

export const REFERENCE_RECOMMEND_CONFIDENCE_LABELS: Readonly<Record<ReferenceRecommendConfidence, string>> =
  Object.freeze({ high: "확실", medium: "보통", low: "불확실" });

/* -------------------------------------------------------------------------- */
/* 상수 (임계값)                                                                */
/* -------------------------------------------------------------------------- */

/** 이보다 투명하면 "이미지의 일부가 아님"으로 본다. */
const FOREGROUND_ALPHA = 16;
/** 이보다 밝으면 흰 종이/배경으로 본다. */
const BACKGROUND_LUMA = 235;
/** 이보다 어두우면 선·머리카락 같은 잉크로 본다 (색상 대표값에서 제외). */
const INK_LUMA = 60;
/** 전경이 이 비율 미만이면 실루엣이 없다고 본다. */
const MIN_COVERAGE = 0.02;
/** 바운딩 박스가 이미지 끝에서 이 비율보다 가까우면 잘린 그림으로 보고 신뢰도를 낮춘다. */
const EDGE_MARGIN_RATIO = 0.02;
/** 신뢰도 high를 주는 인물 영역 비율 구간. */
const HIGH_CONFIDENCE_COVERAGE_MIN = 0.08;
const HIGH_CONFIDENCE_COVERAGE_MAX = 0.8;

/** 세로/가로 비 → 두신 프리셋. 경계는 카탈로그 body 프리셋(3/4/5/6/7/8/9두신)의 중간값. */
const BODY_ASPECT_TABLE: readonly { readonly minAspect: number; readonly presetId: string }[] = [
  { minAspect: 3.2, presetId: "runway-9" },
  { minAspect: 2.9, presetId: "realistic-8" },
  { minAspect: 2.6, presetId: "webtoon-7" },
  { minAspect: 2.2, presetId: "shonen-6" },
  { minAspect: 1.8, presetId: "cartoon-5" },
  { minAspect: 1.45, presetId: "mini-4" },
  { minAspect: 0, presetId: "sd-chibi-3" },
];

/**
 * 어깨 높이(0.30H)에서 몸통 기둥 바깥으로 삐져나온 실루엣 ÷ 몸통 기둥 너비.
 * 이 이상이면 머리 실루엣이 어깨 아래로 이어지는 긴 머리다. 옆으로 벌린 팔도 같은
 * 신호를 내므로(한계) 헤어 신뢰도는 보통 이하로 둔다.
 */
const LONG_HAIR_RATIO = 0.6;
/** 크라운 너비 ÷ 턱선 너비. 이 이상이면 볼륨이 커서 보브로 본다. */
const BOB_VOLUME_RATIO = 1.5;

/** 엉덩이선 아래 너비 ÷ 가슴 너비. 이 이상이고 다리가 갈라지지 않으면 원피스다. */
const DRESS_WIDTH_RATIO = 0.7;
/** 상·하 대표색의 채널별 거리. 이 안에 들면 한 벌 옷으로 읽는다. */
const DRESS_COLOR_DISTANCE = 48;
/** 소매선 너비 ÷ 목선 너비. 이 이상이면 소매가 퍼진 후드다. */
const HOODIE_WIDTH_RATIO = 1.25;

/** 두 줄기 다리 구간의 길이 ÷ 실루엣 높이. 이하면 반바지, 초과면 긴바지. */
const SHORTS_LEG_RATIO = 0.35;
/** 치마 판단: 밑단 너비 ÷ 허벅지 너비. */
const PLEATED_FLARE_RATIO = 1.4;
const LONGSKIRT_FLARE_RATIO = 1.15;

/* -------------------------------------------------------------------------- */
/* 실루엣 측정                                                                  */
/* -------------------------------------------------------------------------- */

function isForegroundPixel(data: Uint8ClampedArray, index: number): boolean {
  if (data[index + 3] <= FOREGROUND_ALPHA) return false;
  return lumaOf(data[index], data[index + 1], data[index + 2]) < BACKGROUND_LUMA;
}

interface SilhouetteBox {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly count: number;
}

function silhouetteBox(image: ReferenceRecommendImage): SilhouetteBox | null {
  const { width, height, data } = image;
  if (!Number.isSafeInteger(width) || width < 1 || !Number.isSafeInteger(height) || height < 1
    || data.length < width * height * 4) {
    return null;
  }
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * width;
    for (let x = 0; x < width; x += 1) {
      if (!isForegroundPixel(data, (rowOffset + x) * 4)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      count += 1;
    }
  }
  if (x1 < 0 || count / (width * height) < MIN_COVERAGE) return null;
  return { x0, y0, x1, y1, count };
}

interface RowProfile {
  /** 전경 픽셀 수. */
  readonly width: number;
  /** 전경 줄기 개수 (다리가 갈라지면 2). */
  readonly runs: number;
}

function rowProfile(image: ReferenceRecommendImage, y: number): RowProfile {
  const { width, data } = image;
  if (y < 0 || y >= image.height) return { width: 0, runs: 0 };
  let count = 0;
  let runs = 0;
  let inside = false;
  const rowOffset = y * width;
  for (let x = 0; x < width; x += 1) {
    const foreground = isForegroundPixel(data, (rowOffset + x) * 4);
    if (foreground) {
      count += 1;
      if (!inside) {
        runs += 1;
        inside = true;
      }
    } else {
      inside = false;
    }
  }
  return { width: count, runs };
}

/** 바운딩 박스 기준 상대 높이(0–1)의 전경 너비(픽셀 수). */
function widthAt(image: ReferenceRecommendImage, box: SilhouetteBox, ratio: number): number {
  const y = Math.round(box.y0 + (box.y1 - box.y0) * ratio);
  return rowProfile(image, y).width;
}

interface RowSpan {
  readonly x0: number;
  readonly x1: number;
  readonly width: number;
}

/** 한 행의 전경 구간 (줄기가 둘 이상이면 양 끝을 잇는다). */
function rowSpan(image: ReferenceRecommendImage, y: number): RowSpan {
  const { width, data } = image;
  if (y < 0 || y >= image.height) return { x0: 0, x1: -1, width: 0 };
  let x0 = width;
  let x1 = -1;
  const rowOffset = y * width;
  for (let x = 0; x < width; x += 1) {
    if (!isForegroundPixel(data, (rowOffset + x) * 4)) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
  }
  if (x1 < 0) return { x0: 0, x1: -1, width: 0 };
  return { x0, x1, width: x1 - x0 + 1 };
}

/** 주어진 행에서 [spanX0, spanX1) 바깥의 전경 픽셀 수. */
function sideOverhang(
  image: ReferenceRecommendImage,
  y: number,
  spanX0: number,
  spanX1: number,
): number {
  const { width, data } = image;
  if (y < 0 || y >= image.height) return 0;
  let count = 0;
  const rowOffset = y * width;
  for (let x = 0; x < width; x += 1) {
    if (x >= spanX0 && x < spanX1) continue;
    if (isForegroundPixel(data, (rowOffset + x) * 4)) count += 1;
  }
  return count;
}

/**
 * 밴드의 대표 색. 잉크(너무 어두움)와 배경은 제외하고 5비트 히스토그램의 최다 버킷
 * 평균을 돌려준다. 색을 특정할 수 없으면 null.
 */
function bandDominantColor(
  image: ReferenceRecommendImage,
  box: SilhouetteBox,
  fromRatio: number,
  toRatio: number,
): string | null {
  const { width, data } = image;
  const y0 = Math.max(0, Math.round(box.y0 + (box.y1 - box.y0) * fromRatio));
  const y1 = Math.min(image.height - 1, Math.round(box.y0 + (box.y1 - box.y0) * toRatio));
  const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let y = y0; y <= y1; y += 1) {
    const rowOffset = y * width;
    for (let x = box.x0; x <= box.x1; x += 1) {
      const i = (rowOffset + x) * 4;
      if (!isForegroundPixel(data, i)) continue;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (lumaOf(r, g, b) < INK_LUMA) continue;
      const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.count += 1;
        bucket.r += r;
        bucket.g += g;
        bucket.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
    }
  }
  let best: { count: number; r: number; g: number; b: number } | null = null;
  for (const bucket of buckets.values()) {
    if (!best || bucket.count > best.count) best = bucket;
  }
  if (!best) return null;
  const toHex = (value: number) => Math.round(value / best.count).toString(16).padStart(2, "0");
  return `#${toHex(best.r)}${toHex(best.g)}${toHex(best.b)}`;
}

/** 두 대표색이 한 벌 옷으로 읽힐 만큼 가까운지. 색을 모르면(어두운 옷) 폭 규칙에 맡긴다. */
function colorsClose(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  const parse = (hex: string): readonly [number, number, number] => {
    const int = Number.parseInt(hex.slice(1), 16);
    return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
  };
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  return Math.abs(ar - br) <= DRESS_COLOR_DISTANCE &&
    Math.abs(ag - bg) <= DRESS_COLOR_DISTANCE &&
    Math.abs(ab - bb) <= DRESS_COLOR_DISTANCE;
}

function bodyEntryForAspect(aspect: number): CharacterSlotEntry | null {
  const presetId = BODY_ASPECT_TABLE.find((row) => aspect >= row.minAspect)?.presetId ?? "webtoon-7";
  const direct = findCharacterSlotEntry(`body:${presetId}`);
  if (direct) return direct;
  // 카탈로그 구성이 바뀌었을 때의 폴백: 두신이 가장 가까운 body 항목.
  const wanted = Number(presetId.split("-").pop() ?? 7);
  let best: CharacterSlotEntry | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const entry of CHARACTER_SLOT_CATALOG.entries) {
    if (entry.slot !== "body" || entry.preview.kind !== "body") continue;
    const distance = Math.abs(entry.preview.headUnits - wanted);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = entry;
    }
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* 공개 API                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 2D 레퍼런스 이미지에서 체형/헤어/의상 프리셋 조합을 추천한다.
 *
 * 순수 함수이며 DOM·네트워크를 쓰지 않는다. 같은 입력에는 항상 같은 출력을 낸다.
 * 실루엣을 찾지 못하면 `{ ok: false }`를 돌려주고, 호출자(UI)는 수동 탐색 유도로
 * 대체한다.
 */
export function recommendReferencePresetCombination(
  image: ReferenceRecommendImage,
  options: ReferenceRecommendOptions = {},
): ReferencePresetCombination {
  const box = silhouetteBox(image);
  if (!box) {
    return {
      ok: false,
      reason: "이미지에서 인물 실루엣을 찾지 못했습니다. 흰 배경의 전신 설정화(PNG·JPG)를 올려 주세요.",
    };
  }
  const boxWidth = box.x1 - box.x0 + 1;
  const boxHeight = box.y1 - box.y0 + 1;
  const aspect = boxHeight / Math.max(1, boxWidth);
  const coverage = box.count / (image.width * image.height);
  const touchesEdge =
    box.x0 / image.width < EDGE_MARGIN_RATIO ||
    box.y0 / image.height < EDGE_MARGIN_RATIO ||
    (image.width - 1 - box.x1) / image.width < EDGE_MARGIN_RATIO ||
    (image.height - 1 - box.y1) / image.height < EDGE_MARGIN_RATIO;
  const capped: ReferenceRecommendConfidence =
    coverage < HIGH_CONFIDENCE_COVERAGE_MIN || coverage > HIGH_CONFIDENCE_COVERAGE_MAX || touchesEdge
      ? "low"
      : "high";

  const dimensions: ReferenceDimensionRecommendation[] = [];

  /* 체형 */
  const bodyEntry = bodyEntryForAspect(aspect);
  if (bodyEntry) {
    const heads = BODY_ASPECT_TABLE.find((row) => aspect >= row.minAspect)?.presetId.split("-").pop() ?? "?";
    const nearBoundary = BODY_ASPECT_TABLE.some(
      (row) => row.minAspect > 0 && Math.abs(aspect - row.minAspect) < 0.12,
    );
    const bodyConfidence: ReferenceRecommendConfidence =
      capped === "low" ? "low" : nearBoundary ? "medium" : "high";
    dimensions.push({
      dimension: "body",
      entry: bodyEntry,
      reason: `실루엣 세로:가로 비 ${aspect.toFixed(1)}:1 → 약 ${heads}두신`,
      evidenceColor: null,
      confidence: bodyConfidence,
    });
  }

  /* 헤어 — 몸통 기둥 바깥으로 삐져나온 어깨 높이 실루엣이 길이를 말해준다 */
  const crownWidth = Math.max(1, widthAt(image, box, 0.12));
  const jawWidth = Math.max(1, widthAt(image, box, 0.22));
  // 몸통 기둥: 0.45–0.60H에서 가장 좁은 행의 구간. 팔·옆머리가 섞인 넓은 행은 제외된다.
  // (비율 루프는 부동소수점 누적 오차를 피하려고 정수 스텝으로 돈다.)
  let torsoSpanX0 = box.x0;
  let torsoSpanX1 = box.x1 + 1;
  let torsoSpanWidth = boxWidth;
  for (let step = 0; step <= 3; step += 1) {
    const span = rowSpan(image, Math.round(box.y0 + (box.y1 - box.y0) * (0.45 + step * 0.05)));
    if (span.width > 0 && span.width < torsoSpanWidth) {
      torsoSpanWidth = span.width;
      torsoSpanX0 = span.x0;
      torsoSpanX1 = span.x1 + 1;
    }
  }
  const shoulderY = Math.round(box.y0 + (box.y1 - box.y0) * 0.3);
  const overhang = sideOverhang(image, shoulderY, torsoSpanX0, torsoSpanX1);
  const volumeRatio = crownWidth / jawWidth;
  const lengthRatio = overhang / Math.max(1, torsoSpanWidth);
  const hairStyle = lengthRatio >= LONG_HAIR_RATIO
    ? "long"
    : volumeRatio >= BOB_VOLUME_RATIO
      ? "bob"
      : "short";
  const hairEntry = findCharacterSlotEntry(`hair:${hairStyle}`);
  if (hairEntry) {
    const hairColorNote = options.hairColor ? ` · 머리색 추정 ${options.hairColor.toUpperCase()}` : "";
    const hairReason = hairStyle === "long"
      ? `어깨 높이에서 몸통 기둥 바깥으로 삐져나온 실루엣 (몸통 너비의 ${lengthRatio.toFixed(1)}배)${hairColorNote}`
      : hairStyle === "bob"
        ? `크라운이 턱선보다 ${volumeRatio.toFixed(1)}배 넓은 머리 볼륨${hairColorNote}`
        : `어깨 높이에 몸통 밖으로 삐져나온 머리 실루엣이 없음${hairColorNote}`;
    dimensions.push({
      dimension: "hair",
      entry: hairEntry,
      reason: hairReason,
      evidenceColor: options.hairColor ?? null,
      confidence: capped === "low" ? "low" : "medium",
    });
  }

  /* 다리 줄기 스캔 — 상의(원피스 판정)와 하의가 함께 쓴다 */
  let legSplitStartY = -1;
  let legSplitEndY = -1;
  for (let y = box.y0; y <= box.y1; y += 1) {
    if (rowProfile(image, y).runs >= 2) {
      if (legSplitStartY < 0) legSplitStartY = y;
      legSplitEndY = y;
    }
  }
  const legsSplit = legSplitStartY >= 0;

  /* 상의 — 원피스는 "엉덩이 아래까지 한 덩어리 + 상·하 색이 한 벌"일 때만 */
  const chestWidth = Math.max(1, widthAt(image, box, 0.35));
  const sleeveWidth = widthAt(image, box, 0.45);
  const belowHipWidth = widthAt(image, box, 0.7);
  const topColor = bandDominantColor(image, box, 0.3, 0.45);
  const bottomColor = bandDominantColor(image, box, 0.66, 0.92);
  const isDress = !legsSplit &&
    belowHipWidth / chestWidth >= DRESS_WIDTH_RATIO &&
    colorsClose(topColor, bottomColor);
  const topStyle = isDress ? "dress" : sleeveWidth / chestWidth >= HOODIE_WIDTH_RATIO ? "hoodie" : "tshirt";
  const topEntry = findCharacterSlotEntry(`top:${topStyle}`);
  if (topEntry) {
    const topReason = topStyle === "dress"
      ? `상의 실루엣이 엉덩이 아래까지 한 덩어리로 이어짐 — 하의는 원피스가 대신합니다`
      : topStyle === "hoodie"
        ? `소매·어깨 실루엣이 가슴보다 ${(sleeveWidth / chestWidth).toFixed(1)}배 넓게 퍼짐`
        : `몸통이 분리된 상·하 실루엣 — 기본 상의`;
    dimensions.push({
      dimension: "top",
      entry: topEntry,
      reason: topColor ? `${topReason} · 상의 색상 추정 ${topColor.toUpperCase()}` : topReason,
      evidenceColor: topColor,
      confidence: capped === "low" ? "low" : "medium",
    });
  }

  /* 하의 — 원피스가 아니면 다리 줄기의 길이·모양으로 판단 */
  if (!isDress) {
    const thighWidth = Math.max(1, widthAt(image, box, 0.66));
    const hemWidth = widthAt(image, box, 0.88);
    const legSpanRatio = legSplitEndY >= 0 ? (legSplitEndY - legSplitStartY + 1) / boxHeight : 0;
    const bottomStyle = legsSplit
      ? legSpanRatio <= SHORTS_LEG_RATIO ? "shorts" : "pants"
      : hemWidth / thighWidth >= PLEATED_FLARE_RATIO ? "pleated"
        : hemWidth / thighWidth >= LONGSKIRT_FLARE_RATIO ? "longskirt"
          : "pants";
    const bottomEntry = findCharacterSlotEntry(`bottom:${bottomStyle}`);
    if (bottomEntry) {
      const bottomReason = bottomStyle === "shorts"
        ? `다리 줄기가 허벅지 높이에서 끝남`
        : bottomStyle === "pants"
          ? `다리 실루엣이 두 줄기로 갈라짐`
          : bottomStyle === "pleated"
            ? `밑단이 허벅지보다 ${(hemWidth / thighWidth).toFixed(1)}배 넓게 퍼지는 한 줄기 실루엣`
            : `밑단이 살짝 퍼지는 한 줄기 실루엣`;
      dimensions.push({
        dimension: "bottom",
        entry: bottomEntry,
        reason: bottomColor ? `${bottomReason} · 하의 색상 추정 ${bottomColor.toUpperCase()}` : bottomReason,
        evidenceColor: bottomColor,
        confidence: capped === "low" ? "low" : "medium",
      });
    }
  }

  if (dimensions.length === 0) {
    return { ok: false, reason: "실루엣은 찾았지만 카탈로그에서 어울리는 프리셋을 고르지 못했습니다. 프리셋을 직접 골라 주세요." };
  }
  return { ok: true, dimensions: Object.freeze(dimensions), coverage };
}
