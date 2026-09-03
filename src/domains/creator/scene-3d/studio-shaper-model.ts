import { writePsdUint8Array, type Layer, type Psd } from "ag-psd";

import {
  STUDIO_MANNEQUIN_BODY_PRESETS,
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS,
  STUDIO_MANNEQUIN_HEAD_PRESETS,
  clampStudioMannequinBodyParams,
  type StudioMannequinBodyParams,
  type StudioMannequinBodyPresetId,
  type StudioMannequinHeadPresetId,
} from "./studio-mannequin-model";

export type ShaperPresetCategory =
  | "face"
  | "eye"
  | "pupil"
  | "nose"
  | "lip"
  | "ear"
  | "hair"
  | "body"
  | "top"
  | "bottom"
  | "shoes"
  | "accessories"
  | "bodypose"
  | "handpose";

export type ShaperCategoryCapability = "live" | "routed" | "planned";

export interface ShaperCategoryMeta {
  readonly id: ShaperPresetCategory;
  readonly label: string;
  readonly description: string;
  readonly capability: ShaperCategoryCapability;
  readonly capabilityLabel: string;
  readonly unavailableReason?: string;
}

/**
 * The public benchmark exposes fourteen character slots. This catalogue keeps all fourteen visible
 * but distinguishes real mannequin controls from VRM-only routes and asset slots that do not yet
 * have an authored runtime. A planned slot is never selectable and is never silently substituted.
 */
export const SHAPER_CATEGORIES: readonly ShaperCategoryMeta[] = Object.freeze([
  {
    id: "face",
    label: "얼굴형",
    description: "얼굴 너비와 턱 길이를 실제 마네킹 메시 비율에 적용합니다.",
    capability: "live",
    capabilityLabel: "실제 적용",
  },
  {
    id: "eye",
    label: "눈 크기",
    description: "눈 형태를 가장하지 않고 현재 메시가 지원하는 눈 크기만 조절합니다.",
    capability: "live",
    capabilityLabel: "크기 적용",
  },
  {
    id: "pupil",
    label: "눈동자",
    description: "홍채·동공을 독립 에셋으로 교체하는 슬롯입니다.",
    capability: "planned",
    capabilityLabel: "에셋 필요",
    unavailableReason: "현재 데생 인형에는 홍채 메시와 눈동자 텍스처 슬롯이 없습니다.",
  },
  {
    id: "nose",
    label: "코 높이",
    description: "콧대 형태를 가장하지 않고 현재 메시가 지원하는 높이 축만 조절합니다.",
    capability: "live",
    capabilityLabel: "높이 적용",
  },
  {
    id: "lip",
    label: "입",
    description: "입 모양·표정 메시를 선택하는 슬롯입니다.",
    capability: "planned",
    capabilityLabel: "에셋 필요",
    unavailableReason: "입 모양을 바꿀 독립 메시 또는 blendshape가 데생 인형에 없습니다.",
  },
  {
    id: "ear",
    label: "귀",
    description: "인간형·판타지형 귀 에셋 슬롯입니다.",
    capability: "planned",
    capabilityLabel: "에셋 필요",
    unavailableReason: "귀를 독립 교체할 수 있는 안정 ID 메시가 아직 없습니다.",
  },
  {
    id: "hair",
    label: "헤어",
    description: "헤어 메시·앞머리·그라디언트는 VRM 캐릭터 워크숍에서 편집합니다.",
    capability: "routed",
    capabilityLabel: "VRM에서 지원",
    unavailableReason: "데생 인형은 비율·포즈 참고용입니다. 헤어 제작은 3D 캐릭터 편집기를 사용합니다.",
  },
  {
    id: "body",
    label: "체형",
    description: "신장·두신·어깨·골반·팔다리·체형 블렌드를 실제 메시로 재생성합니다.",
    capability: "live",
    capabilityLabel: "실제 적용",
  },
  {
    id: "top",
    label: "상의",
    description: "상의 에셋을 장착하는 슬롯입니다.",
    capability: "planned",
    capabilityLabel: "에셋 필요",
    unavailableReason: "상의 카드는 실제 의상 메시와 라이선스 메타데이터가 연결된 뒤 활성화됩니다.",
  },
  {
    id: "bottom",
    label: "하의",
    description: "하의 에셋을 장착하는 슬롯입니다.",
    capability: "planned",
    capabilityLabel: "에셋 필요",
    unavailableReason: "하의 카드는 실제 의상 메시와 충돌 검사 계약이 연결된 뒤 활성화됩니다.",
  },
  {
    id: "shoes",
    label: "신발",
    description: "신발 에셋을 장착하는 슬롯입니다.",
    capability: "planned",
    capabilityLabel: "에셋 필요",
    unavailableReason: "발 크기·지면 접촉을 보존하는 신발 리그 어댑터가 아직 없습니다.",
  },
  {
    id: "accessories",
    label: "액세서리",
    description: "안경·귀걸이·헤드폰 등을 장착하는 슬롯입니다.",
    capability: "planned",
    capabilityLabel: "에셋 필요",
    unavailableReason: "장착 본과 라이선스가 검증된 액세서리 카탈로그가 아직 없습니다.",
  },
  {
    id: "bodypose",
    label: "전신 포즈",
    description: "검증된 데생 인형 포즈를 한 번에 적용합니다.",
    capability: "live",
    capabilityLabel: "실제 적용",
  },
  {
    id: "handpose",
    label: "손 포즈",
    description: "손·팔 연출이 포함된 포즈 레시피를 실제 관절에 적용합니다.",
    capability: "live",
    capabilityLabel: "실제 적용",
  },
]);

export interface ShaperPresetItem {
  readonly id: string;
  readonly category: ShaperPresetCategory;
  readonly label: string;
  readonly description: string;
  readonly tags: readonly string[];
}

export const SHAPER_PRESETS: readonly ShaperPresetItem[] = Object.freeze([
  { id: "face-oval", category: "face", label: "웹툰 계란형", description: "좁은 얼굴과 짧은 턱의 균형형", tags: ["로맨스", "기본"] },
  { id: "face-round", category: "face", label: "부드러운 둥근형", description: "넓은 볼과 짧은 턱", tags: ["친근", "코미디"] },
  { id: "face-sharp", category: "face", label: "샤프 V라인", description: "좁은 얼굴과 긴 턱", tags: ["액션", "판타지"] },
  { id: "face-square", category: "face", label: "각진 성숙형", description: "넓은 얼굴과 긴 턱", tags: ["성숙", "드라마"] },
  { id: "face-chibi", category: "face", label: "SD 치비형", description: "넓은 얼굴과 짧은 턱, 큰 눈", tags: ["SD", "개그"] },

  { id: "eye-small", category: "eye", label: "작은 눈", description: "현재 기준의 88% 크기", tags: ["성숙", "차분"] },
  { id: "eye-standard", category: "eye", label: "표준 눈", description: "메시 원본 눈 크기", tags: ["기본"] },
  { id: "eye-large", category: "eye", label: "큰 눈", description: "현재 기준의 115% 크기", tags: ["웹툰", "로맨스"] },
  { id: "eye-chibi", category: "eye", label: "SD 큰 눈", description: "허용 범위 안의 최대 강조", tags: ["SD", "코미디"] },

  { id: "nose-low", category: "nose", label: "낮은 코", description: "현재 기준의 86% 높이", tags: ["부드러움"] },
  { id: "nose-standard", category: "nose", label: "표준 코", description: "메시 원본 코 높이", tags: ["기본"] },
  { id: "nose-high", category: "nose", label: "높은 코", description: "현재 기준의 118% 높이", tags: ["성숙", "판타지"] },

  { id: "body-standard", category: "body", label: "중성 7등신", description: "균형 잡힌 데생 기준 체형", tags: ["기본"] },
  { id: "body-slim-female", category: "body", label: "슬림 여성형", description: "좁은 어깨와 긴 다리의 여성형", tags: ["로맨스", "현대"] },
  { id: "body-slim-male", category: "body", label: "슬림 남성형", description: "가늘고 긴 청소년 비율", tags: ["학원", "현대"] },
  { id: "body-muscular", category: "body", label: "근육 히어로형", description: "넓은 어깨와 높은 근육 블렌드", tags: ["액션"] },
  { id: "body-tall", category: "body", label: "장신 모델형", description: "8.8등신과 긴 팔다리", tags: ["패션", "드라마"] },
  { id: "body-chibi", category: "body", label: "SD 3등신", description: "작은 신장과 큰 머리 비율", tags: ["SD", "개그"] },

  { id: "pose-stand", category: "bodypose", label: "기본 기립", description: "정면 확인에 적합한 중립 포즈", tags: ["기본"] },
  { id: "pose-hip", category: "bodypose", label: "시크한 짝다리", description: "비대칭 실루엣의 캐릭터 포즈", tags: ["일상", "로맨스"] },
  { id: "pose-run", category: "bodypose", label: "달리기", description: "전진감이 큰 액션 포즈", tags: ["액션"] },
  { id: "pose-sit", category: "bodypose", label: "의자 앉기", description: "상체와 하체가 접힌 일상 포즈", tags: ["일상"] },
  { id: "pose-sword", category: "bodypose", label: "발도 자세", description: "무게 중심이 낮은 전투 포즈", tags: ["액션", "판타지"] },

  { id: "hand-open", category: "handpose", label: "손바닥 펼침", description: "열린 손과 자연스러운 팔 연출", tags: ["기본"] },
  { id: "hand-fist", category: "handpose", label: "주먹", description: "힘을 준 팔·손 연출", tags: ["액션"] },
  { id: "hand-peace", category: "handpose", label: "V 사인", description: "사진·일상 장면의 손 연출", tags: ["일상", "코미디"] },
  { id: "hand-point", category: "handpose", label: "가리키기", description: "시선을 유도하는 팔·손 연출", tags: ["연출"] },
  { id: "hand-chin", category: "handpose", label: "턱 괴기", description: "생각하거나 쉬는 장면의 연출", tags: ["일상", "드라마"] },
]);

export type ShaperPresetSelection = Record<ShaperPresetCategory, string>;

export const DEFAULT_SHAPER_SELECTION: Readonly<ShaperPresetSelection> = Object.freeze({
  face: "face-oval",
  eye: "eye-standard",
  pupil: "pupil-unavailable",
  nose: "nose-standard",
  lip: "lip-unavailable",
  ear: "ear-unavailable",
  hair: "hair-vrm-route",
  body: "body-standard",
  top: "top-unavailable",
  bottom: "bottom-unavailable",
  shoes: "shoes-unavailable",
  accessories: "accessories-unavailable",
  bodypose: "pose-stand",
  handpose: "hand-open",
});

const BODY_PRESET_MAP: Readonly<Record<string, StudioMannequinBodyPresetId>> = Object.freeze({
  "body-standard": "neutral",
  "body-slim-female": "female",
  "body-slim-male": "slender",
  "body-muscular": "bodybuilder",
  "body-tall": "model",
  "body-chibi": "chibi3",
});

const FACE_PRESET_MAP: Readonly<Record<string, StudioMannequinHeadPresetId>> = Object.freeze({
  "face-oval": "anime",
  "face-round": "round",
  "face-sharp": "sharp",
  "face-chibi": "chibi",
});

export function getShaperCategory(
  category: ShaperPresetCategory,
): ShaperCategoryMeta {
  return SHAPER_CATEGORIES.find((candidate) => candidate.id === category)
    ?? SHAPER_CATEGORIES[0]!;
}

export function isShaperCategoryInteractive(category: ShaperPresetCategory): boolean {
  return getShaperCategory(category).capability === "live";
}

export function countShaperLiveCategories(): number {
  return SHAPER_CATEGORIES.filter((category) => category.capability === "live").length;
}

/**
 * The preview and runtime handler share this pure planner so a preset card cannot promise a shape
 * different from the mesh that will be committed.
 */
export function applyShaperSelectionToBodyParams(
  current: StudioMannequinBodyParams,
  selection: ShaperPresetSelection,
): StudioMannequinBodyParams {
  const bodyPresetId = BODY_PRESET_MAP[selection.body];
  const bodyPreset = bodyPresetId ? STUDIO_MANNEQUIN_BODY_PRESETS[bodyPresetId] : null;
  let next: StudioMannequinBodyParams = bodyPreset
    ? { ...bodyPreset.params }
    : { ...current };

  const facePresetId = FACE_PRESET_MAP[selection.face];
  if (facePresetId) {
    next = { ...next, ...STUDIO_MANNEQUIN_HEAD_PRESETS[facePresetId].params };
  } else if (selection.face === "face-square") {
    next = { ...next, faceWidth: 1.15, chinLength: 1.05 };
  }

  const eyeScale = selection.eye === "eye-small"
    ? 0.88
    : selection.eye === "eye-large"
      ? 1.15
      : selection.eye === "eye-chibi"
        ? 1.28
        : STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS.eyeScale;
  const noseHeight = selection.nose === "nose-low"
    ? 0.86
    : selection.nose === "nose-high"
      ? 1.18
      : STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS.noseHeight;

  return clampStudioMannequinBodyParams({
    ...next,
    eyeScale,
    noseHeight,
  });
}

export type ShaperStyleRecipeId =
  | "school-romance"
  | "fantasy-action"
  | "modern-drama"
  | "chibi-comedy";

/** Historical name kept for saved commands; the UI presents these as deterministic style recipes. */
export type ShaperAiArchetype = ShaperStyleRecipeId;

export interface ShaperStyleRecipe {
  readonly id: ShaperStyleRecipeId;
  readonly label: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly selection: ShaperPresetSelection;
}

export const SHAPER_STYLE_RECIPES: readonly ShaperStyleRecipe[] = Object.freeze([
  {
    id: "school-romance",
    label: "학원 로맨스",
    description: "계란형 얼굴, 큰 눈, 슬림 여성형, 짝다리와 V 사인",
    tags: ["로맨스", "현대"],
    selection: {
      ...DEFAULT_SHAPER_SELECTION,
      face: "face-oval",
      eye: "eye-large",
      nose: "nose-low",
      body: "body-slim-female",
      bodypose: "pose-hip",
      handpose: "hand-peace",
    },
  },
  {
    id: "fantasy-action",
    label: "판타지 액션",
    description: "샤프한 얼굴, 높은 코, 근육형 체형과 발도 자세",
    tags: ["액션", "판타지"],
    selection: {
      ...DEFAULT_SHAPER_SELECTION,
      face: "face-sharp",
      eye: "eye-standard",
      nose: "nose-high",
      body: "body-muscular",
      bodypose: "pose-sword",
      handpose: "hand-fist",
    },
  },
  {
    id: "modern-drama",
    label: "현대 드라마",
    description: "각진 얼굴, 작은 눈, 장신 체형과 차분한 기립 포즈",
    tags: ["현대", "드라마"],
    selection: {
      ...DEFAULT_SHAPER_SELECTION,
      face: "face-square",
      eye: "eye-small",
      nose: "nose-high",
      body: "body-tall",
      bodypose: "pose-stand",
      handpose: "hand-chin",
    },
  },
  {
    id: "chibi-comedy",
    label: "SD 코미디",
    description: "치비 얼굴·체형, 큰 눈과 달리기 포즈",
    tags: ["SD", "코미디"],
    selection: {
      ...DEFAULT_SHAPER_SELECTION,
      face: "face-chibi",
      eye: "eye-chibi",
      nose: "nose-low",
      body: "body-chibi",
      bodypose: "pose-run",
      handpose: "hand-open",
    },
  },
]);

/** Compatibility alias. No model inference is claimed by this deterministic recipe catalogue. */
export const SHAPER_AI_ARCHETYPES = SHAPER_STYLE_RECIPES;

export function recommendShaperPreset(archetypeId: ShaperAiArchetype): ShaperPresetSelection {
  const found = SHAPER_STYLE_RECIPES.find((recipe) => recipe.id === archetypeId);
  return found ? { ...found.selection } : { ...DEFAULT_SHAPER_SELECTION };
}

// Compatibility data contracts retained for previously saved UI state. The mannequin panel no
// longer exposes a fake drawing toggle; real direct painting lives in the VRM surface editor.
export interface ShaperSurfacePoint {
  readonly x: number;
  readonly y: number;
  readonly pressure?: number;
}

export interface ShaperSurfaceStroke {
  readonly id: string;
  readonly points: readonly ShaperSurfacePoint[];
  readonly color: string;
  readonly size: number;
  readonly mode: "pen" | "eraser";
}

export interface ShaperSurfaceDrawState {
  readonly active: boolean;
  readonly brushMode: "pen" | "eraser";
  readonly color: string;
  readonly size: number;
  readonly strokes: readonly ShaperSurfaceStroke[];
}

export const DEFAULT_SHAPER_SURFACE_DRAW_STATE: Readonly<ShaperSurfaceDrawState> = Object.freeze({
  active: false,
  brushMode: "pen",
  color: "#1e1e1e",
  size: 3,
  strokes: [],
});

export interface ShaperPsdLayerBuffer {
  readonly id: string;
  readonly name: string;
  readonly data: Uint8ClampedArray;
}

export interface ShaperPsdRenderBuffers {
  readonly width: number;
  readonly height: number;
  /** Composite fallback used when semantic layers are unavailable. */
  readonly flatColor: Uint8ClampedArray;
  readonly semanticLayers?: readonly ShaperPsdLayerBuffer[];
  readonly lineArt?: Uint8ClampedArray;
  readonly drawStrokes?: Uint8ClampedArray;
  readonly highlights?: Uint8ClampedArray;
  readonly shadowCel?: Uint8ClampedArray;
}

const MAX_SHAPER_PSD_PIXELS = 4_194_304;
const MAX_SHAPER_PSD_OUTPUT_BYTES = 192 * 1024 * 1024;

function assertLayerBuffer(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  label: string,
): void {
  if (!(data instanceof Uint8ClampedArray) || data.byteLength !== width * height * 4) {
    throw new TypeError(`${label} RGBA 크기가 PSD 캔버스와 일치하지 않습니다.`);
  }
}

/** Alpha and luminance edges for a useful editable line layer, not an opaque rectangle outline. */
export function createShaperLineArtFromComposite(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Uint8ClampedArray {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1) {
    throw new RangeError("선화 생성 크기가 올바르지 않습니다.");
  }
  if (width * height > MAX_SHAPER_PSD_PIXELS) {
    throw new RangeError("선화 생성 픽셀 예산을 초과했습니다.");
  }
  assertLayerBuffer(rgba, width, height, "합성 렌더");
  const output = new Uint8ClampedArray(rgba.length);
  const luminanceAt = (pixel: number): number => {
    const offset = pixel * 4;
    return rgba[offset]! * 0.2126 + rgba[offset + 1]! * 0.7152 + rgba[offset + 2]! * 0.0722;
  };
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const alpha = rgba[offset + 3]!;
      if (alpha < 8) continue;
      const alphaRight = rgba[(pixel + 1) * 4 + 3]!;
      const alphaDown = rgba[(pixel + width) * 4 + 3]!;
      const gx = luminanceAt(pixel + 1) - luminanceAt(pixel - 1);
      const gy = luminanceAt(pixel + width) - luminanceAt(pixel - width);
      const strength = Math.sqrt(gx * gx + gy * gy);
      const silhouette = alphaRight < alpha * 0.45 || alphaDown < alpha * 0.45;
      if (!silhouette && strength < 34) continue;
      const inkAlpha = silhouette
        ? Math.min(255, Math.max(110, alpha))
        : Math.min(210, Math.round((strength - 28) * 3.1));
      output[offset] = 24;
      output[offset + 1] = 22;
      output[offset + 2] = 21;
      output[offset + 3] = inkAlpha;
    }
  }
  return output;
}

export function buildShaperLayeredPsd(buffers: ShaperPsdRenderBuffers): Blob {
  const { width, height } = buffers;
  if (
    !Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width < 1
    || height < 1
    || width * height > MAX_SHAPER_PSD_PIXELS
  ) {
    throw new RangeError("캐릭터 PSD 크기가 허용 범위를 벗어났습니다.");
  }
  assertLayerBuffer(buffers.flatColor, width, height, "전체 렌더");
  const layers: Layer[] = [];
  const addLayer = (name: string, data: Uint8ClampedArray | undefined, opacity = 1) => {
    if (!data) return;
    assertLayerBuffer(data, width, height, name);
    layers.push({
      name,
      top: 0,
      left: 0,
      bottom: height,
      right: width,
      opacity,
      imageData: { width, height, data },
    });
  };

  const semanticLayers = buffers.semanticLayers?.filter((layer) => layer.data.length > 0) ?? [];
  if (semanticLayers.length > 0) {
    for (const layer of semanticLayers) addLayer(`캐릭터 · ${layer.name}`, layer.data);
  } else {
    addLayer("캐릭터 · 전체 컬러 렌더", buffers.flatColor);
  }
  addLayer("캐릭터 · 음영 패스", buffers.shadowCel);
  addLayer("캐릭터 · 하이라이트 패스", buffers.highlights);
  addLayer("캐릭터 · 표면 드로잉", buffers.drawStrokes);
  addLayer("캐릭터 · 선화", buffers.lineArt);

  const psd: Psd = {
    width,
    height,
    children: layers.reverse(),
  };
  const bytes = writePsdUint8Array(psd, {
    noBackground: true,
    generateThumbnail: false,
    trimImageData: false,
    compress: false,
  });
  if (bytes.byteLength > MAX_SHAPER_PSD_OUTPUT_BYTES) {
    throw new RangeError("캐릭터 PSD 결과가 192 MiB 출력 예산을 초과했습니다.");
  }
  return new Blob([Uint8Array.from(bytes)], { type: "image/vnd.adobe.photoshop" });
}

export const SHAPER_DEFAULT_PREVIEW_PARAMS: StudioMannequinBodyParams = Object.freeze({
  ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  ...STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS,
});
