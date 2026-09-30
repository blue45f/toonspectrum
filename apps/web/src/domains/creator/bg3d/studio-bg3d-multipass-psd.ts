/**
 * studio-bg3d-multipass-psd.ts
 *
 * Webtoon Shaper식 "선화/음영/밑색/배경" 4레이어 PSD 파이프라인의 bg3d 구현.
 *
 * Shaper의 핵심 차별화는 "선화/그림자/밑색이 레이어 분리된 PSD 출력"이다. 이 모듈은
 * bg3d 장면의 분리 렌더 패스를 그 표준 구조로 조립하는 순수 파이프라인이다:
 *
 *  - 선화(Line): LT 주선+질감선과 캐릭터 외곽선 패스를 합친 잉크 레이어 (normal, 맨 위)
 *  - 음영(Shading): LT 톤과 캐릭터 그림자 패스를 합친 곱하기 레이어 (multiply)
 *  - 밑색(Flat): LT 컬러와 캐릭터 밑색을 합친 베이스 컬러 레이어 (normal)
 *  - 배경(Background): 캐릭터를 제외한 배경 분리 렌더 (normal, 맨 아래)
 *
 * 렌더러·DOM·캡처 코드는 임포트하지 않는다. 입력은 이미 렌더된 RGBA8 패스이며,
 * 만들 수 없는 패스는 절대 빈 레이어로 위조하지 않고 `skipped`에 한글 사유를 남긴다
 * (character-shaper-psd-assembly와 같은 정직성 규약).
 *
 * PSD 인코딩은 프로젝트 표준인 `ag-psd`를 재사용하고, 예산은
 * `studio-bg3d-shot-psd-contract`의 컷 PSD 예산(캔버스 2,097,152px·최대 4레이어·
 * 합계 8,388,608px)을 그대로 따른다.
 */

import { writePsdUint8Array, type BlendMode, type Layer, type Psd } from "ag-psd";

import {
  STUDIO_BG3D_SHOT_PSD_MAX_AGGREGATE_LAYER_PIXELS,
  STUDIO_BG3D_SHOT_PSD_MAX_CANVAS_PIXELS,
  STUDIO_BG3D_SHOT_PSD_MAX_LAYERS,
  STUDIO_BG3D_SHOT_PSD_MAX_OUTPUT_BYTES,
  STUDIO_BG3D_SHOT_PSD_MIME,
} from "./studio-bg3d-shot-psd-contract";

/* -------------------------------------------------------------------------- */
/* 공개 타입                                                                    */
/* -------------------------------------------------------------------------- */

/** 표준 4레이어 ID — PSD 패널 순서(위→아래)와 동일하다. */
export type Bg3dMultiPassPsdLayerId = "line" | "shade" | "flat" | "background";

export const BG3D_MULTIPASS_PSD_LAYER_ORDER: readonly Bg3dMultiPassPsdLayerId[] =
  Object.freeze(["line", "shade", "flat", "background"]);

export const BG3D_MULTIPASS_PSD_LAYER_LABELS: Readonly<Record<Bg3dMultiPassPsdLayerId, string>> =
  Object.freeze({
    line: "01_선화 (Line)",
    shade: "02_음영 (Shading)",
    flat: "03_밑색 (Flat)",
    background: "04_배경 (Background)",
  });

const BG3D_MULTIPASS_PSD_BLEND_MODES: Readonly<Record<Bg3dMultiPassPsdLayerId, BlendMode>> =
  Object.freeze({
    line: "normal",
    shade: "multiply",
    flat: "normal",
    background: "normal",
  });

/** 합성 입력 — 각 패스는 straight-alpha RGBA8, 좌상단 원점, 모두 같은 크기. */
export interface Bg3dMultiPassPsdScenePasses {
  /** LT 주선 레이어. */
  readonly mainLine?: Uint8ClampedArray;
  /** LT 질감선 레이어. */
  readonly textureLine?: Uint8ClampedArray;
  /** LT 톤 레이어(음영 계열). */
  readonly tone?: Uint8ClampedArray;
  /** LT 컬러 레이어(베이스 컬러). */
  readonly color?: Uint8ClampedArray;
  /** 배경 분리 렌더 — 캐릭터를 제외한 배경만 담은 프레임. */
  readonly background?: Uint8ClampedArray;
}

export type Bg3dMultiPassPsdCharacterPassId = "line" | "shadow" | "flat" | "highlight";

/**
 * 캐릭터 셰이퍼 semantic pass의 최소 구조형. character-shaper-contract의
 * CharacterSemanticPass와 구조 호환되며, 도메인 경계를 넘지 않기 위해
 * 타입만 로컬로 정의한다(값 임포트는 없다).
 */
export interface Bg3dMultiPassPsdCharacterPass {
  readonly id: Bg3dMultiPassPsdCharacterPassId;
  readonly rgba: Uint8ClampedArray;
}

export interface ComposeBg3dMultiPassPsdInput {
  readonly width: number;
  readonly height: number;
  readonly scene: Bg3dMultiPassPsdScenePasses;
  /** 캐릭터+배경 합성본용 — 같은 파이프라인으로 합성된다. */
  readonly characterPasses?: readonly Bg3dMultiPassPsdCharacterPass[];
}

export interface Bg3dMultiPassPsdLayerInput {
  readonly id: Bg3dMultiPassPsdLayerId;
  readonly rgba: Uint8ClampedArray;
}

export interface Bg3dMultiPassPsdSkip {
  readonly pass: Bg3dMultiPassPsdLayerId | Bg3dMultiPassPsdCharacterPassId | "character";
  readonly reason: string;
}

export interface ComposeBg3dMultiPassPsdResult {
  readonly width: number;
  readonly height: number;
  /** PSD 패널 순서(위→아래): 선화 → 음영 → 밑색 → 배경. 비어 위조된 레이어는 없다. */
  readonly layers: readonly Bg3dMultiPassPsdLayerInput[];
  readonly skipped: readonly Bg3dMultiPassPsdSkip[];
  readonly includedCharacter: boolean;
}

export interface BuildBg3dMultiPassPsdInput {
  readonly title: string;
  readonly width: number;
  readonly height: number;
  readonly layers: readonly Bg3dMultiPassPsdLayerInput[];
  readonly skipped?: readonly Bg3dMultiPassPsdSkip[];
  /** 미리보기에서 끈 레이어는 PSD에서도 숨김으로 기록된다. */
  readonly hiddenLayerIds?: ReadonlySet<Bg3dMultiPassPsdLayerId>;
  readonly includedCharacter?: boolean;
}

export interface Bg3dMultiPassPsdReceipt {
  readonly width: number;
  readonly height: number;
  readonly layerNames: readonly string[];
  readonly skipped: readonly Bg3dMultiPassPsdSkip[];
  readonly byteLength: number;
  readonly includedCharacter: boolean;
}

export interface Bg3dMultiPassPsdResult {
  readonly blob: Blob;
  readonly receipt: Bg3dMultiPassPsdReceipt;
}

export const BG3D_MULTIPASS_PSD_MIME = STUDIO_BG3D_SHOT_PSD_MIME;

/* -------------------------------------------------------------------------- */
/* 순수 픽셀 연산 (straight-alpha RGBA8)                                          */
/* -------------------------------------------------------------------------- */

function assertRgbaShape(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  label: string,
): void {
  if (!(rgba instanceof Uint8ClampedArray) || rgba.length !== width * height * 4) {
    throw new TypeError(`${label} 패스의 크기가 ${width}×${height}와 맞지 않습니다.`);
  }
}

function assertCanvasSize(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) || width < 1 ||
    !Number.isSafeInteger(height) || height < 1
  ) {
    throw new RangeError("멀티패스 PSD 캔버스 크기가 올바르지 않습니다.");
  }
}

function isEmptyRgba(rgba: Uint8ClampedArray): boolean {
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] > 0) return false;
  }
  return true;
}

/**
 * 선화 합성 — 여러 잉크 패스 중 픽셀마다 가장 진한(알파 최대) 획의 색을 유지한다.
 * 전부 비어 있으면 null (빈 레이어 위조 금지).
 */
function mergeLineInk(
  passes: readonly (Uint8ClampedArray | undefined)[],
): Uint8ClampedArray | null {
  const present = passes.filter((pass): pass is Uint8ClampedArray => !!pass);
  if (present.length === 0) return null;
  const length = present[0].length;
  const out = new Uint8ClampedArray(length);
  let visible = false;
  for (let i = 0; i < length; i += 4) {
    let best = 0;
    let bestIndex = -1;
    for (let p = 0; p < present.length; p += 1) {
      const alpha = present[p][i + 3];
      if (alpha > best) {
        best = alpha;
        bestIndex = p;
      }
    }
    if (bestIndex < 0) continue;
    const source = present[bestIndex];
    out[i] = source[i];
    out[i + 1] = source[i + 1];
    out[i + 2] = source[i + 2];
    out[i + 3] = best;
    visible = true;
  }
  return visible ? out : null;
}

/** straight-alpha source-over 합성: `top`을 `base` 위에 얹는다. */
export function compositeSourceOver(
  base: Uint8ClampedArray,
  top: Uint8ClampedArray,
): Uint8ClampedArray<ArrayBuffer> {
  if (base.length !== top.length) {
    throw new TypeError("합성할 두 패스의 크기가 다릅니다.");
  }
  const out = new Uint8ClampedArray(base.length);
  for (let i = 0; i < base.length; i += 4) {
    const sa = top[i + 3] / 255;
    const da = base[i + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) continue;
    out[i] = (top[i] * sa + base[i] * da * (1 - sa)) / outA;
    out[i + 1] = (top[i + 1] * sa + base[i + 1] * da * (1 - sa)) / outA;
    out[i + 2] = (top[i + 2] * sa + base[i + 2] * da * (1 - sa)) / outA;
    out[i + 3] = outA * 255;
  }
  return out;
}

/**
 * multiply 블렌드 합성: `shade` 레이어를 multiply로 `base` 위에 얹은 결과.
 * 포토샵/클립스튜디오의 곱하기 레이어와 같은 byte/sRGB 합성이다.
 */
export function compositeMultiplyBlend(
  base: Uint8ClampedArray,
  shade: Uint8ClampedArray,
): Uint8ClampedArray<ArrayBuffer> {
  if (base.length !== shade.length) {
    throw new TypeError("곱하기 합성할 두 패스의 크기가 다릅니다.");
  }
  const out = new Uint8ClampedArray(base.length);
  for (let i = 0; i < base.length; i += 4) {
    const sa = shade[i + 3] / 255;
    const da = base[i + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) continue;
    for (let c = 0; c < 3; c += 1) {
      const multiplied = (base[i + c] * shade[i + c]) / 255;
      out[i + c] = (multiplied * sa + base[i + c] * da * (1 - sa)) / outA;
    }
    out[i + 3] = outA * 255;
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* 패스 합성 — 장면 패스 + 캐릭터 패스 → 표준 4레이어                              */
/* -------------------------------------------------------------------------- */

function pickCharacterPass(
  passes: readonly Bg3dMultiPassPsdCharacterPass[] | undefined,
  id: Bg3dMultiPassPsdCharacterPassId,
): Uint8ClampedArray | undefined {
  return passes?.find((pass) => pass.id === id)?.rgba;
}

/**
 * 분리 렌더 패스를 표준 4레이어로 합성한다. 캐릭터 패스가 있으면 같은 구조에
 * 합성해 "캐릭터+배경 합성본"을 만든다 — 별도 파이프라인이 아니다.
 */
export function composeBg3dMultiPassLayers(
  input: ComposeBg3dMultiPassPsdInput,
): ComposeBg3dMultiPassPsdResult {
  const { width, height, scene } = input;
  assertCanvasSize(width, height);
  const characterPasses = input.characterPasses ?? [];
  const check = (rgba: Uint8ClampedArray | undefined, label: string) => {
    if (rgba) assertRgbaShape(rgba, width, height, label);
  };
  check(scene.mainLine, "장면 주선");
  check(scene.textureLine, "장면 질감선");
  check(scene.tone, "장면 톤");
  check(scene.color, "장면 컬러");
  check(scene.background, "배경 분리 렌더");
  for (const pass of characterPasses) {
    assertRgbaShape(pass.rgba, width, height, `캐릭터 ${pass.id}`);
  }

  const layers: Bg3dMultiPassPsdLayerInput[] = [];
  const skipped: Bg3dMultiPassPsdSkip[] = [];
  const characterLine = pickCharacterPass(characterPasses, "line");
  const characterShadow = pickCharacterPass(characterPasses, "shadow");
  const characterFlat = pickCharacterPass(characterPasses, "flat");
  const characterHighlight = pickCharacterPass(characterPasses, "highlight");
  const includedCharacter =
    characterLine !== undefined || characterShadow !== undefined ||
    characterFlat !== undefined || characterHighlight !== undefined;

  // 선화: 장면 주선 + 질감선 + 캐릭터 외곽선
  const line = mergeLineInk([scene.mainLine, scene.textureLine, characterLine]);
  if (line) layers.push({ id: "line", rgba: line });
  else skipped.push({ pass: "line", reason: "추출된 선화 패스가 없어 선화 레이어를 만들지 않았습니다." });

  // 음영: 장면 톤 × 캐릭터 그림자를 하나의 곱하기 레이어로
  const tonePresent = scene.tone && !isEmptyRgba(scene.tone);
  const shadowPresent = characterShadow && !isEmptyRgba(characterShadow);
  if (tonePresent && shadowPresent) {
    layers.push({ id: "shade", rgba: compositeMultiplyBlend(scene.tone!, characterShadow!) });
  } else if (tonePresent) {
    layers.push({ id: "shade", rgba: scene.tone! });
  } else if (shadowPresent) {
    layers.push({ id: "shade", rgba: characterShadow! });
  } else {
    skipped.push({ pass: "shade", reason: "음영으로 쓸 톤·그림자 패스가 없어 음영 레이어를 만들지 않았습니다." });
  }
  if (characterHighlight && !isEmptyRgba(characterHighlight)) {
    skipped.push({
      pass: "highlight",
      reason: "하이라이트는 4레이어(선화/음영/밑색/배경) PSD 예산에 별도 레이어를 두지 않아 저장하지 않았습니다.",
    });
  }

  // 밑색: 장면 컬러 위에 캐릭터 밑색
  const colorPresent = scene.color && !isEmptyRgba(scene.color);
  const flatPresent = characterFlat && !isEmptyRgba(characterFlat);
  if (colorPresent && flatPresent) {
    layers.push({ id: "flat", rgba: compositeSourceOver(scene.color!, characterFlat!) });
  } else if (colorPresent) {
    layers.push({ id: "flat", rgba: scene.color! });
  } else if (flatPresent) {
    layers.push({ id: "flat", rgba: characterFlat! });
  } else {
    skipped.push({ pass: "flat", reason: "베이스 컬러 패스가 없어 밑색 레이어를 만들지 않았습니다." });
  }

  // 배경: 배경 분리 렌더 그대로 (위조하지 않음)
  if (scene.background && !isEmptyRgba(scene.background)) {
    layers.push({ id: "background", rgba: scene.background });
  } else {
    skipped.push({ pass: "background", reason: "배경 분리 렌더가 없어 배경 레이어를 만들지 않았습니다." });
  }

  if (layers.length === 0) {
    throw new Error("PSD로 저장할 레이어가 없습니다. 분리 렌더 패스를 먼저 준비해 주세요.");
  }
  return { width, height, layers: Object.freeze(layers), skipped: Object.freeze(skipped), includedCharacter };
}

/* -------------------------------------------------------------------------- */
/* 미리보기 합성 — PSD imageData와 출력 전 미리보기가 공유하는 합성               */
/* -------------------------------------------------------------------------- */

/**
 * 표준 4레이어를 화면 합성 순서(배경→밑색→음영(multiply)→선화)로 합친다.
 * `visible`에 없는 레이어는 제외한다 — 미리보기 토글과 PSD hidden 플래그가 공유한다.
 */
export function compositeMultiPassPsdPreview(
  width: number,
  height: number,
  layers: readonly Bg3dMultiPassPsdLayerInput[],
  visible?: ReadonlySet<Bg3dMultiPassPsdLayerId>,
): Uint8ClampedArray {
  assertCanvasSize(width, height);
  const byId = new Map<Bg3dMultiPassPsdLayerId, Uint8ClampedArray>();
  for (const layer of layers) {
    assertRgbaShape(layer.rgba, width, height, BG3D_MULTIPASS_PSD_LAYER_LABELS[layer.id]);
    byId.set(layer.id, layer.rgba);
  }
  const shown = (id: Bg3dMultiPassPsdLayerId) => (visible ? visible.has(id) : true);
  let canvas = new Uint8ClampedArray(width * height * 4);
  const background = byId.get("background");
  if (background && shown("background")) canvas = compositeSourceOver(canvas, background);
  const flat = byId.get("flat");
  if (flat && shown("flat")) canvas = compositeSourceOver(canvas, flat);
  const shade = byId.get("shade");
  if (shade && shown("shade")) canvas = compositeMultiplyBlend(canvas, shade);
  const line = byId.get("line");
  if (line && shown("line")) canvas = compositeSourceOver(canvas, line);
  return canvas;
}

/* -------------------------------------------------------------------------- */
/* PSD 조립 (ag-psd 재사용)                                                      */
/* -------------------------------------------------------------------------- */

function escapeXml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function titleXmp(title: string): string {
  return [
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(title)}</rdf:li></rdf:Alt></dc:title>`,
    "</rdf:Description>",
    "</rdf:RDF>",
    "</x:xmpmeta>",
    '<?xpacket end="w"?>',
  ].join("");
}

function admitMultiPassPsdLayers(
  width: number,
  height: number,
  layers: readonly Bg3dMultiPassPsdLayerInput[],
): void {
  if (layers.length < 1) throw new RangeError("PSD로 저장할 레이어가 없습니다.");
  if (layers.length > STUDIO_BG3D_SHOT_PSD_MAX_LAYERS) {
    throw new RangeError(
      `멀티패스 PSD는 최대 ${STUDIO_BG3D_SHOT_PSD_MAX_LAYERS}레이어까지 지원합니다.`,
    );
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels < 1) {
    throw new RangeError("멀티패스 PSD 캔버스 크기가 올바르지 않습니다.");
  }
  if (pixels > STUDIO_BG3D_SHOT_PSD_MAX_CANVAS_PIXELS) {
    throw new RangeError(
      `멀티패스 PSD 캔버스는 ${STUDIO_BG3D_SHOT_PSD_MAX_CANVAS_PIXELS.toLocaleString("ko-KR")}px까지 지원합니다.`,
    );
  }
  if (pixels * layers.length > STUDIO_BG3D_SHOT_PSD_MAX_AGGREGATE_LAYER_PIXELS) {
    throw new RangeError("멀티패스 PSD 레이어 합계 픽셀이 예산을 넘습니다. 해상도를 낮춰 주세요.");
  }
}

/**
 * 합성된 4레이어를 ag-psd로 PSD 파일로 조립한다.
 * `children[0]`이 패널 맨 위이므로 선화→음영→밑색→배경 순서 그대로 넣는다.
 */
export function buildBg3dMultiPassPsd(input: BuildBg3dMultiPassPsdInput): Bg3dMultiPassPsdResult {
  const { width, height } = input;
  assertCanvasSize(width, height);
  const ordered = [...BG3D_MULTIPASS_PSD_LAYER_ORDER]
    .map((id) => input.layers.find((layer) => layer.id === id))
    .filter((layer): layer is Bg3dMultiPassPsdLayerInput => !!layer);
  if (ordered.length === 0) throw new Error("PSD로 저장할 레이어가 없습니다.");
  const seen = new Set<Bg3dMultiPassPsdLayerId>();
  for (const layer of ordered) {
    if (seen.has(layer.id)) throw new TypeError("멀티패스 PSD 레이어 ID가 중복되었습니다.");
    seen.add(layer.id);
    assertRgbaShape(layer.rgba, width, height, BG3D_MULTIPASS_PSD_LAYER_LABELS[layer.id]);
  }
  admitMultiPassPsdLayers(width, height, ordered);

  const hidden = input.hiddenLayerIds ?? new Set<Bg3dMultiPassPsdLayerId>();
  const children: Layer[] = ordered.map((layer) => ({
    name: BG3D_MULTIPASS_PSD_LAYER_LABELS[layer.id],
    top: 0,
    left: 0,
    bottom: height,
    right: width,
    opacity: 1,
    blendMode: BG3D_MULTIPASS_PSD_BLEND_MODES[layer.id],
    hidden: hidden.has(layer.id),
    imageData: { width, height, data: layer.rgba },
  }));

  const visibleForPreview = new Set(
    BG3D_MULTIPASS_PSD_LAYER_ORDER.filter((id) => seen.has(id) && !hidden.has(id)),
  );
  const psd: Psd = {
    width,
    height,
    children,
    // ag-psd는 레이어를 합성하지 않고 검은 합성 이미지를 쓰므로, 캡처된 외관을 미리보기로 저장한다.
    imageData: {
      width,
      height,
      data: compositeMultiPassPsdPreview(width, height, ordered, visibleForPreview),
    },
    imageResources: { xmpMetadata: titleXmp(input.title) },
  };

  let bytes: Uint8Array;
  try {
    bytes = writePsdUint8Array(psd, {
      noBackground: true,
      generateThumbnail: false,
      trimImageData: false,
      compress: false,
    });
  } catch (error) {
    throw new Error(
      `PSD 파일을 만들지 못했습니다: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }
  if (
    bytes.byteLength < 6 ||
    bytes.byteLength > STUDIO_BG3D_SHOT_PSD_MAX_OUTPUT_BYTES ||
    bytes[0] !== 0x38 || bytes[1] !== 0x42 || bytes[2] !== 0x50 || bytes[3] !== 0x53 ||
    bytes[4] !== 0 || bytes[5] !== 1
  ) {
    throw new RangeError("멀티패스 PSD 결과가 signature, version 또는 출력 예산을 벗어났습니다.");
  }
  const blobBuffer = bytes.buffer instanceof ArrayBuffer &&
    bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes.buffer
    : Uint8Array.from(bytes).buffer;

  return {
    blob: new Blob([blobBuffer], { type: BG3D_MULTIPASS_PSD_MIME }),
    receipt: {
      width,
      height,
      layerNames: Object.freeze(children.map((layer) => layer.name ?? "")),
      skipped: Object.freeze([...(input.skipped ?? [])]),
      byteLength: bytes.byteLength,
      includedCharacter: input.includedCharacter ?? false,
    },
  };
}

/** 영수증 요약 문구 — 패널 상태 배너용. */
export function multiPassPsdResultMessage(receipt: Bg3dMultiPassPsdReceipt): string {
  const parts = [`PSD 저장 완료 — 레이어 ${receipt.layerNames.length}개`];
  if (receipt.includedCharacter) parts.push("캐릭터 합성 포함");
  if (receipt.skipped.length > 0) parts.push(`건너뜀 ${receipt.skipped.length}건`);
  return parts.join(" · ");
}
