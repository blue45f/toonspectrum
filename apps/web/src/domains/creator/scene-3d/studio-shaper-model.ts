/**
 * studio-shaper-model.ts
 *
 * ToonStudio's independent webtoon-character recipe contract.
 *
 * The catalogue is broader than the procedural mannequin renderer. Consumers must publish an
 * explicit capability set and never present a catalogue selection as applied when no runtime owns
 * that category.
 *
 * Provides:
 * 1. 14-Category Modular Presets (face, eye, pupil, nose, lip, ear, hair, body, top, bottom, shoes, accessories, bodypose, handpose)
 * 2. 3D Surface Texture Drawing Engine (Model Surface Painting / UV texture overlay)
 * 3. AI-driven Preset Recommendation (Style-based 1-click preset composition)
 * 4. Multi-layer PSD Export for Webtoon Pipeline (Line Art, Draw Stroke, Highlight, Cel Shadow, Flat Color)
 */

import { writePsdUint8Array, type Layer, type Psd } from "ag-psd";

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

export interface ShaperCategoryMeta {
  readonly id: ShaperPresetCategory;
  readonly label: string;
  readonly description: string;
}

export const SHAPER_CATEGORIES: readonly ShaperCategoryMeta[] = Object.freeze([
  { id: "face", label: "얼굴형", description: "턱선, 광대, 이마 비율 등 기본 안면 윤곽" },
  { id: "eye", label: "눈", description: "순정, 액션, 반달눈 등 웹툰 캐릭터 눈매" },
  { id: "pupil", label: "눈동자", description: "하이라이트, 홍채 텍스처 및 시선 연출" },
  { id: "nose", label: "코", description: "오뚝한 콧날, 점코, 음영 콧대" },
  { id: "lip", label: "입", description: "미소, 앙다문 입, 살짝 벌린 입술" },
  { id: "ear", label: "귀", description: "인간형 둥근 귀, 판타지 엘프귀, 동물귀" },
  { id: "hair", label: "헤어", description: "숏컷, 시스루뱅, 롱헤어, 투블럭, 포니테일" },
  { id: "body", label: "체형", description: "표준, 미소년/소녀 슬림, 근육형, 장신, SD 3등신" },
  { id: "top", label: "상의", description: "교복 셔츠, 후드티, 정장 수트, 무협 도복" },
  { id: "bottom", label: "하의", description: "플리츠 스커트, 슬랙스, 청바지, 도복 바지" },
  { id: "shoes", label: "신발", description: "스니커즈, 로퍼, 가죽 구두, 롱부츠" },
  { id: "accessories", label: "악세사리", description: "뿔테 안경, 헤드폰, 귀걸이, 리본 타이" },
  { id: "bodypose", label: "포즈", description: "기본 기립, 짝다리, 달리기, 앉기, 전투 돌진" },
  { id: "handpose", label: "손 포즈", description: "주먹, 손바닥 펼침, V 사인, 가리키기, 펜 쥐기" },
]);

export interface ShaperPresetItem {
  readonly id: string;
  readonly category: ShaperPresetCategory;
  readonly label: string;
  readonly icon?: string;
  readonly meta?: Record<string, unknown>;
}

export const SHAPER_PRESETS: readonly ShaperPresetItem[] = Object.freeze([
  // Face
  { id: "face-oval", category: "face", label: "갸름한 달걀형" },
  { id: "face-round", category: "face", label: "둥근 동안형" },
  { id: "face-sharp", category: "face", label: "날카로운 V라인" },
  { id: "face-square", category: "face", label: "각진 성숙형" },
  { id: "face-chibi", category: "face", label: "볼록한 SD형" },

  // Eye
  { id: "eye-romance", category: "eye", label: "순정 반짝눈" },
  { id: "eye-cat", category: "eye", label: "도도한 고양이눈" },
  { id: "eye-gentle", category: "eye", label: "온화한 반달눈" },
  { id: "eye-action", category: "eye", label: "강렬한 소년만화눈" },

  // Pupil
  { id: "pupil-star", category: "pupil", label: "별빛 하이라이트" },
  { id: "pupil-basic", category: "pupil", label: "표준 하이라이트" },
  { id: "pupil-vertical", category: "pupil", label: "세로 동공 (마족/수인)" },

  // Nose
  { id: "nose-dot", category: "nose", label: "귀여운 점코" },
  { id: "nose-straight", category: "nose", label: "오뚝한 직선코" },
  { id: "nose-bridge", category: "nose", label: "선명한 콧날 음영" },

  // Lip
  { id: "lip-smile", category: "lip", label: "자연스러운 미소" },
  { id: "lip-closed", category: "lip", label: "단정한 일자입" },
  { id: "lip-open", category: "lip", label: "살짝 벌린 입" },

  // Ear
  { id: "ear-human", category: "ear", label: "표준 인간 귀" },
  { id: "ear-elf", category: "ear", label: "엘프 뾰족귀" },
  { id: "ear-animal", category: "ear", label: "동물 쫑긋귀" },

  // Hair
  { id: "hair-short", category: "hair", label: "내추럴 숏컷" },
  { id: "hair-bob", category: "hair", label: "시스루 뱅 단발" },
  { id: "hair-long-straight", category: "hair", label: "긴 생머리" },
  { id: "hair-dandy", category: "hair", label: "투블럭 댄디컷" },
  { id: "hair-ponytail", category: "hair", label: "하이 포니테일" },
  { id: "hair-wavy", category: "hair", label: "풍성한 웨이브" },
  { id: "hair-none", category: "hair", label: "착용 안 함" },

  // Body
  { id: "body-standard", category: "body", label: "표준 7.5등신" },
  { id: "body-slim-female", category: "body", label: "슬림 미소녀" },
  { id: "body-slim-male", category: "body", label: "슬림 미소년" },
  { id: "body-muscular", category: "body", label: "근육형 히어로" },
  { id: "body-tall", category: "body", label: "장신 8.5등신" },
  { id: "body-chibi", category: "body", label: "SD 귀여운 3등신" },

  // Top
  { id: "top-school", category: "top", label: "교복 셔츠&넥타이" },
  { id: "top-hoodie", category: "top", label: "오버핏 후드티" },
  { id: "top-suit", category: "top", label: "슬림핏 정장 자켓" },
  { id: "top-martial", category: "top", label: "무협 수련 도복" },
  { id: "top-none", category: "top", label: "착용 안 함" },

  // Bottom
  { id: "bottom-skirt", category: "bottom", label: "플리츠 스커트" },
  { id: "bottom-slacks", category: "bottom", label: "테이퍼드 슬랙스" },
  { id: "bottom-jeans", category: "bottom", label: "스트레이트 데님" },
  { id: "bottom-martial", category: "bottom", label: "도복 배기 팬츠" },
  { id: "bottom-none", category: "bottom", label: "착용 안 함" },

  // Shoes
  { id: "shoes-sneakers", category: "shoes", label: "캔버스 운동화" },
  { id: "shoes-loafer", category: "shoes", label: "클래식 로퍼" },
  { id: "shoes-boots", category: "shoes", label: "워커 부츠" },
  { id: "shoes-none", category: "shoes", label: "착용 안 함" },

  // Accessories
  { id: "acc-glasses", category: "accessories", label: "블랙 뿔테 안경" },
  { id: "acc-headphones", category: "accessories", label: "오버이어 헤드폰" },
  { id: "acc-earring", category: "accessories", label: "실버 링 귀걸이" },
  { id: "acc-cap", category: "accessories", label: "야구 모자" },
  { id: "acc-beanie", category: "accessories", label: "니트 비니" },
  { id: "acc-none", category: "accessories", label: "없음" },

  // Bodypose
  { id: "pose-stand", category: "bodypose", label: "기본 당당한 기립" },
  { id: "pose-hip", category: "bodypose", label: "시크한 짝다리" },
  { id: "pose-run", category: "bodypose", label: "역동적인 달리기" },
  { id: "pose-sit", category: "bodypose", label: "의자에 앉기" },
  { id: "pose-sword", category: "bodypose", label: "발도 자세" },

  // Handpose
  { id: "hand-fist", category: "handpose", label: "주먹" },
  { id: "hand-open", category: "handpose", label: "손바닥 펼침" },
  { id: "hand-peace", category: "handpose", label: "승리의 V" },
  { id: "hand-point", category: "handpose", label: "앞으로 가리키기" },
  { id: "hand-chin", category: "handpose", label: "턱 괴기" },
]);

export type ShaperPresetSelection = Record<ShaperPresetCategory, string>;

export const SHAPER_MANNEQUIN_SUPPORTED_CATEGORIES = Object.freeze([
  "face",
  "eye",
  "nose",
  "body",
  "bodypose",
  "handpose",
] as const satisfies readonly ShaperPresetCategory[]);

export const DEFAULT_SHAPER_SELECTION: Readonly<ShaperPresetSelection> = Object.freeze({
  face: "face-oval",
  eye: "eye-romance",
  pupil: "pupil-basic",
  nose: "nose-straight",
  lip: "lip-smile",
  ear: "ear-human",
  hair: "hair-short",
  body: "body-standard",
  top: "top-school",
  bottom: "bottom-skirt",
  shoes: "shoes-sneakers",
  accessories: "acc-none",
  bodypose: "pose-stand",
  handpose: "hand-open",
});

// ── 3D Surface Drawing Engine ────────────────────────────────────────────────

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

// ── AI Preset Recommendation Archetypes ──────────────────────────────────────

export type ShaperAiArchetype =
  | "school-romance"
  | "fantasy-action"
  | "modern-thriller"
  | "chibi-comedy";

export const SHAPER_AI_ARCHETYPES: readonly {
  readonly id: ShaperAiArchetype;
  readonly label: string;
  readonly description: string;
  readonly selection: ShaperPresetSelection;
}[] = Object.freeze([
  {
    id: "school-romance",
    label: "학원 로맨스 주인공",
    description: "순정 반짝눈, 갸름한 달걀형, 단정한 교복과 스니커즈 조합",
    selection: {
      face: "face-oval",
      eye: "eye-romance",
      pupil: "pupil-star",
      nose: "nose-dot",
      lip: "lip-smile",
      ear: "ear-human",
      hair: "hair-bob",
      body: "body-slim-female",
      top: "top-school",
      bottom: "bottom-skirt",
      shoes: "shoes-sneakers",
      accessories: "acc-none",
      bodypose: "pose-hip",
      handpose: "hand-peace",
    },
  },
  {
    id: "fantasy-action",
    label: "판타지 모험가 / 이세계 액션",
    description: "강렬한 소년만화 눈매, 엘프 귀, 수련 도복과 워커 부츠 조합",
    selection: {
      face: "face-sharp",
      eye: "eye-action",
      pupil: "pupil-vertical",
      nose: "nose-straight",
      lip: "lip-closed",
      ear: "ear-elf",
      hair: "hair-short",
      body: "body-muscular",
      top: "top-martial",
      bottom: "bottom-martial",
      shoes: "shoes-boots",
      accessories: "acc-earring",
      bodypose: "pose-sword",
      handpose: "hand-fist",
    },
  },
  {
    id: "modern-thriller",
    label: "현대 느와르 / 냉철한 전문가",
    description: "도도한 고양이눈, 슬림핏 정장 수트, 클래식 로퍼와 뿔테 안경 조합",
    selection: {
      face: "face-square",
      eye: "eye-cat",
      pupil: "pupil-basic",
      nose: "nose-bridge",
      lip: "lip-closed",
      ear: "ear-human",
      hair: "hair-dandy",
      body: "body-tall",
      top: "top-suit",
      bottom: "bottom-slacks",
      shoes: "shoes-loafer",
      accessories: "acc-glasses",
      bodypose: "pose-stand",
      handpose: "hand-chin",
    },
  },
  {
    id: "chibi-comedy",
    label: "일상 개그 / 귀여운 SD 캐릭터",
    description: "통통한 볼살, 3등신 체형, 오버핏 후드티와 귀여운 동물귀 조합",
    selection: {
      face: "face-chibi",
      eye: "eye-gentle",
      pupil: "pupil-star",
      nose: "nose-dot",
      lip: "lip-smile",
      ear: "ear-animal",
      hair: "hair-wavy",
      body: "body-chibi",
      top: "top-hoodie",
      bottom: "bottom-jeans",
      shoes: "shoes-sneakers",
      accessories: "acc-headphones",
      bodypose: "pose-run",
      handpose: "hand-open",
    },
  },
]);

export function recommendShaperPreset(archetypeId: ShaperAiArchetype): ShaperPresetSelection {
  const found = SHAPER_AI_ARCHETYPES.find((a) => a.id === archetypeId);
  return found ? { ...found.selection } : { ...DEFAULT_SHAPER_SELECTION };
}

// ── Multi-layer PSD generation for ToonStudio ────────────────────────────

export interface ShaperPsdRenderBuffers {
  readonly width: number;
  readonly height: number;
  readonly lineArt?: Uint8ClampedArray; // [선화]
  readonly drawStrokes?: Uint8ClampedArray; // [모델에 직접 그리기]
  readonly highlights?: Uint8ClampedArray; // [하이라이트]
  readonly shadowCel?: Uint8ClampedArray; // [그림자]
  readonly flatColor: Uint8ClampedArray; // [밑색]
}

export function buildShaperLayeredPsd(buffers: ShaperPsdRenderBuffers): Blob {
  const { width, height } = buffers;
  const layers: Layer[] = [];

  const addLayer = (name: string, data?: Uint8ClampedArray, opacity = 1) => {
    if (!data || data.length === 0) return;
    layers.push({
      name,
      top: 0,
      left: 0,
      bottom: height,
      right: width,
      opacity,
      imageData: {
        width,
        height,
        data,
      },
    });
  };

  // PSD layers are ordered bottom-to-top in PSD specification:
  // 1. Flat Color (밑색)
  addLayer("ToonStudio 3D · 밑색 (Flat)", buffers.flatColor);

  // 2. Shadow Cel (그림자)
  if (buffers.shadowCel) {
    addLayer("ToonStudio 3D · 음영 (Shadow)", buffers.shadowCel);
  }

  // 3. Highlights (하이라이트)
  if (buffers.highlights) {
    addLayer("ToonStudio 3D · 하이라이트 (Highlight)", buffers.highlights);
  }

  // 4. Surface Drawn Strokes (모델 직접 드로잉)
  if (buffers.drawStrokes) {
    addLayer("ToonStudio 3D · 3D 드로잉 (Drawn Lines)", buffers.drawStrokes);
  }

  // 5. Line Art (선화 잉크)
  if (buffers.lineArt) {
    addLayer("ToonStudio 3D · 주선 (Line Art)", buffers.lineArt);
  }

  // If no optional layers are present, duplicate base or ensure at least 1 child
  if (layers.length === 0) {
    addLayer("ToonStudio 3D · 메인 렌더", buffers.flatColor);
  }

  const psd: Psd = {
    width,
    height,
    children: layers.reverse(), // Reverse to display top-to-bottom in layer panels
  };

  const bytes = writePsdUint8Array(psd, {
    noBackground: true,
    generateThumbnail: false,
    trimImageData: false,
    compress: false,
  });

  const copy = new Uint8Array(bytes);
  return new Blob([copy], { type: "image/vnd.adobe.photoshop" });
}

// ── English labels (i18n) ────────────────────────────────────────────────────

/** Category labels in English, keyed by category id. */
export const SHAPER_CATEGORY_LABEL_EN: Readonly<Record<ShaperPresetCategory, string>> =
  Object.freeze({
    face: "Face Shape",
    eye: "Eyes",
    pupil: "Pupils",
    nose: "Nose",
    lip: "Lips",
    ear: "Ears",
    hair: "Hair",
    body: "Body",
    top: "Tops",
    bottom: "Bottoms",
    shoes: "Shoes",
    accessories: "Accessories",
    bodypose: "Pose",
    handpose: "Hand Pose",
  });

/** Category descriptions in English, keyed by category id. */
export const SHAPER_CATEGORY_DESCRIPTION_EN: Readonly<Record<ShaperPresetCategory, string>> =
  Object.freeze({
    face: "Jawline, cheekbones, and forehead proportions",
    eye: "Webtoon character eyes — romance, action, crescent",
    pupil: "Highlights, iris texture, and gaze direction",
    nose: "Upturned nose, dot nose, shaded bridge",
    lip: "Smile, closed lips, slightly parted lips",
    ear: "Round human ears, fantasy elf ears, animal ears",
    hair: "Short, see-through bangs, long hair, two-block, ponytail",
    body: "Standard, slim, muscular, tall, SD 3-head figures",
    top: "School shirt, hoodie, suit, martial-arts uniform",
    bottom: "Pleated skirt, slacks, jeans, uniform pants",
    shoes: "Sneakers, loafers, leather shoes, long boots",
    accessories: "Glasses, headphones, earrings, caps, beanies",
    bodypose: "Standing, contrapposto, running, sitting, sword draw",
    handpose: "Fist, open palm, V sign, pointing, pen grip",
  });

/** Preset labels in English, keyed by preset id. */
export const SHAPER_PRESET_LABEL_EN: Readonly<Record<string, string>> = Object.freeze({
  // Face
  "face-oval": "Slim oval face",
  "face-round": "Round youthful face",
  "face-sharp": "Sharp V-line face",
  "face-square": "Mature square face",
  "face-chibi": "Puffy SD face",
  // Eye
  "eye-romance": "Sparkling romance eyes",
  "eye-cat": "Haughty cat eyes",
  "eye-gentle": "Gentle crescent eyes",
  "eye-action": "Intense shonen eyes",
  // Pupil
  "pupil-star": "Starlight highlight",
  "pupil-basic": "Standard highlight",
  "pupil-vertical": "Vertical pupil (demon/beast)",
  // Nose
  "nose-dot": "Cute dot nose",
  "nose-straight": "Straight refined nose",
  "nose-bridge": "Defined nose bridge shading",
  // Lip
  "lip-smile": "Natural smile",
  "lip-closed": "Neat straight lips",
  "lip-open": "Slightly parted lips",
  // Ear
  "ear-human": "Standard human ears",
  "ear-elf": "Elf pointed ears",
  "ear-animal": "Animal perky ears",
  // Hair
  "hair-short": "Natural short cut",
  "hair-bob": "See-through bang bob",
  "hair-long-straight": "Long straight hair",
  "hair-dandy": "Two-block dandy cut",
  "hair-ponytail": "High ponytail",
  "hair-wavy": "Voluminous waves",
  "hair-none": "No hair",
  // Body
  "body-standard": "Standard 7.5 heads",
  "body-slim-female": "Slim shojo figure",
  "body-slim-male": "Slim bishonen figure",
  "body-muscular": "Muscular hero",
  "body-tall": "Tall 8.5 heads",
  "body-chibi": "SD cute 3 heads",
  // Top
  "top-school": "School shirt & tie",
  "top-hoodie": "Oversized hoodie",
  "top-suit": "Slim-fit suit jacket",
  "top-martial": "Martial-arts uniform top",
  "top-none": "No top",
  // Bottom
  "bottom-skirt": "Pleated skirt",
  "bottom-slacks": "Tapered slacks",
  "bottom-jeans": "Straight denim",
  "bottom-martial": "Uniform baggy pants",
  "bottom-none": "No bottom",
  // Shoes
  "shoes-sneakers": "Canvas sneakers",
  "shoes-loafer": "Classic loafers",
  "shoes-boots": "Walker boots",
  "shoes-none": "No shoes",
  // Accessories
  "acc-glasses": "Black rimmed glasses",
  "acc-headphones": "Over-ear headphones",
  "acc-earring": "Silver ring earring",
  "acc-cap": "Baseball cap",
  "acc-beanie": "Knit beanie",
  "acc-none": "None",
  // Bodypose
  "pose-stand": "Confident standing",
  "pose-hip": "Chic contrapposto",
  "pose-run": "Dynamic running",
  "pose-sit": "Sitting on a chair",
  "pose-sword": "Sword-draw stance",
  // Handpose
  "hand-fist": "Fist",
  "hand-open": "Open palm",
  "hand-peace": "Victory V",
  "hand-point": "Pointing forward",
  "hand-chin": "Chin rest",
});

/** AI archetype labels/descriptions in English, keyed by archetype id. */
export const SHAPER_AI_ARCHETYPE_EN: Readonly<
  Record<ShaperAiArchetype, { readonly label: string; readonly description: string }>
> = Object.freeze({
  "school-romance": {
    label: "School romance lead",
    description: "Sparkling romance eyes, slim oval face, neat school uniform with sneakers",
  },
  "fantasy-action": {
    label: "Fantasy adventurer / isekai action",
    description: "Intense shonen eyes, elf ears, martial-arts uniform with walker boots",
  },
  "modern-thriller": {
    label: "Modern noir / cool professional",
    description: "Haughty cat eyes, slim-fit suit, classic loafers with rimmed glasses",
  },
  "chibi-comedy": {
    label: "Daily comedy / cute SD character",
    description: "Chubby cheeks, 3-head figure, oversized hoodie with cute animal ears",
  },
});

// ── Appearance (dress-up) contract ─────────────────────────────────────────────

/** Categories editable in the outfit tab (preview + save, not mannequin-applied). */
export const SHAPER_APPEARANCE_CATEGORIES = Object.freeze([
  "hair",
  "accessories",
  "top",
  "bottom",
  "shoes",
] as const);

export type ShaperAppearanceCategory = (typeof SHAPER_APPEARANCE_CATEGORIES)[number];

/**
 * Where each accessory attaches — shown as a hover tooltip so users learn
 * the anchor point before picking an item.
 */
export const SHAPER_APPEARANCE_ANCHOR_HINTS: Readonly<
  Record<string, { readonly ko: string; readonly en: string }>
> = Object.freeze({
  "acc-glasses": { ko: "얼굴 — 눈 앞에 착용", en: "Face — worn over the eyes" },
  "acc-headphones": { ko: "머리 — 귀 위에 착용", en: "Head — worn over the ears" },
  "acc-earring": { ko: "귀 — 귓불에 부착", en: "Ear — attached to the earlobe" },
  "acc-cap": { ko: "머리 — 정수리에 착용", en: "Head — worn on the crown" },
  "acc-beanie": { ko: "머리 — 정수리에 착용", en: "Head — worn on the crown" },
  "acc-none": { ko: "부착 없음", en: "No attachment" },
});

/** Per-item tint color, keyed by preset id. */
export type ShaperItemColorMap = Record<string, string>;

/** Quick-pick swatches for item tint colors. */
export const SHAPER_ITEM_COLOR_SWATCHES: readonly string[] = Object.freeze([
  "#1f2937",
  "#7c2d12",
  "#b45309",
  "#eab308",
  "#f3f4f6",
  "#ef4444",
  "#f97316",
  "#22c55e",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
]);

export interface ShaperAppearanceState {
  readonly selection: Partial<Record<ShaperAppearanceCategory, string>>;
  readonly colors: ShaperItemColorMap;
}

export const DEFAULT_SHAPER_APPEARANCE_STATE: Readonly<ShaperAppearanceState> = Object.freeze({
  selection: Object.freeze({
    hair: "hair-short",
    accessories: "acc-none",
    top: "top-school",
    bottom: "bottom-skirt",
    shoes: "shoes-sneakers",
  }),
  colors: Object.freeze({}),
});

// ── Body slider contract ───────────────────────────────────────────────────────

/** The five body sliders the panel exposes; mapped onto StudioMannequinBodyParams. */
export interface ShaperBodySliderValues {
  readonly heightCm: number;
  readonly headCount: number;
  readonly build: number;
  readonly shoulderWidth: number;
  /** Mannequin field name is pelvisWidth. */
  readonly hipWidth: number;
}

export const DEFAULT_SHAPER_BODY_SLIDERS: Readonly<ShaperBodySliderValues> = Object.freeze({
  heightCm: 170,
  headCount: 7.5,
  build: 1,
  shoulderWidth: 1,
  hipWidth: 1,
});

/** Slider values synced when a body preset card is picked. Keyed by body preset id. */
export const SHAPER_BODY_PRESET_SLIDERS: Readonly<Record<string, ShaperBodySliderValues>> =
  Object.freeze({
    "body-standard": { heightCm: 170, headCount: 7.5, build: 1, shoulderWidth: 1, hipWidth: 1 },
    "body-slim-female": { heightCm: 165, headCount: 7.5, build: 0.6, shoulderWidth: 0.85, hipWidth: 1.05 },
    "body-slim-male": { heightCm: 175, headCount: 7.5, build: 0.6, shoulderWidth: 0.9, hipWidth: 0.9 },
    "body-muscular": { heightCm: 182, headCount: 7.5, build: 2.2, shoulderWidth: 1.2, hipWidth: 1 },
    "body-tall": { heightCm: 186, headCount: 8.5, build: 0.9, shoulderWidth: 1, hipWidth: 0.95 },
    "body-chibi": { heightCm: 120, headCount: 3, build: 1.4, shoulderWidth: 1.15, hipWidth: 1.15 },
  });
