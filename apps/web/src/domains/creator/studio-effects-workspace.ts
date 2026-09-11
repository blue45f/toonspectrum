/**
 * Purpose-built effect recipes and deterministic stack diagnostics.
 *
 * This module intentionally composes the existing StudioAdjustmentStack only. It does not add a
 * second effect document model or claim a renderer that the Studio does not have. As a result,
 * recipe application automatically inherits the existing save, undo, filter-mask, Worker and
 * export boundaries.
 */

import {
  STUDIO_ADJUSTMENT_ENGINE_IDS,
  STUDIO_ADJUSTMENT_STACK_MAX_SERIALIZED_BYTES,
  admitStudioAdjustmentStack,
  createEmptyStudioAdjustmentStack,
  normalizeStudioAdjustmentStack,
  studioAdjustmentDefaultParams,
  studioAdjustmentEngineLabel,
  studioAdjustmentStackSerializedByteLength,
  type StudioAdjustmentEngineId,
  type StudioAdjustmentEntry,
  type StudioAdjustmentStack,
} from "./studio-adjustment-stack";

export const STUDIO_EFFECT_RECIPE_VERSION = 1 as const;

export const STUDIO_EFFECT_RECIPE_CATEGORY_ORDER = [
  "restore",
  "line-art",
  "color",
  "light",
  "motion",
  "print",
  "stylize",
] as const;

export type StudioEffectRecipeCategory =
  (typeof STUDIO_EFFECT_RECIPE_CATEGORY_ORDER)[number];

export type StudioEffectRecipeApplyMode = "append" | "replace";
export type StudioEffectCostTier = "light" | "balanced" | "heavy";
export type StudioEffectDiagnosticSeverity = "info" | "warning";

export interface StudioEffectRecipeEntry {
  readonly engine: StudioAdjustmentEngineId;
  readonly opacity?: number;
  readonly params?: Readonly<Record<string, number | string | boolean>>;
}

export interface StudioEffectRecipe {
  readonly version: typeof STUDIO_EFFECT_RECIPE_VERSION;
  readonly id: string;
  readonly category: StudioEffectRecipeCategory;
  readonly title: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly featured?: boolean;
  readonly entries: readonly StudioEffectRecipeEntry[];
}

export interface StudioEffectRecipeApplicationReceipt {
  readonly status: "accepted" | "invalid-structure" | "serialized-byte-budget-exceeded" | "unknown-recipe";
  readonly stack: StudioAdjustmentStack;
  readonly recipe: StudioEffectRecipe | null;
  readonly mode: StudioEffectRecipeApplyMode;
  readonly addedCount: number;
  readonly replacedCount: number;
  readonly serializedBytes: number;
  readonly maximumSerializedBytes: number;
}

export interface StudioEffectDiagnosticMessage {
  readonly id: string;
  readonly severity: StudioEffectDiagnosticSeverity;
  readonly title: string;
  readonly detail: string;
}

export interface StudioEffectStackDiagnostics {
  readonly entryCount: number;
  readonly activeCount: number;
  readonly disabledCount: number;
  readonly zeroOpacityCount: number;
  /** Relative renderer work only. This is intentionally not presented as milliseconds. */
  readonly costPoints: number;
  readonly tier: StudioEffectCostTier;
  readonly recommendedPreviewScale: 1 | 0.75 | 0.5;
  readonly expensiveEngineCount: number;
  readonly messages: readonly StudioEffectDiagnosticMessage[];
}

const RECIPE = (
  value: Omit<StudioEffectRecipe, "version">,
): StudioEffectRecipe => Object.freeze({
  version: STUDIO_EFFECT_RECIPE_VERSION,
  ...value,
  tags: Object.freeze([...value.tags]),
  entries: Object.freeze(value.entries.map((entry) => Object.freeze({
    ...entry,
    ...(entry.params ? { params: Object.freeze({ ...entry.params }) } : {}),
  }))),
});

/**
 * Curated production recipes. Every step maps to a renderer-backed engine in
 * STUDIO_ADJUSTMENT_ENGINE_IDS. Values are deliberately restrained so a recipe is a useful first
 * pass rather than a one-click irreversible "final look".
 */
export const STUDIO_EFFECT_RECIPES: readonly StudioEffectRecipe[] = Object.freeze([
  RECIPE({
    id: "scan-rescue",
    category: "restore",
    title: "스캔 원고 복원",
    description: "JPEG 블록과 종이 노이즈를 줄인 뒤 먹선 경계를 다시 정돈합니다.",
    tags: ["스캔", "복원", "노이즈", "JPEG", "cleanup", "lineart"],
    featured: true,
    entries: [
      {
        engine: "jpeg-artifact-reduction",
        params: {
          deblockStrength: 0.62,
          deringStrength: 0.36,
          boundaryThreshold: 7,
          protectedEdgeThreshold: 96,
          ringingThreshold: 20,
          inkLumaThreshold: 66,
        },
      },
      {
        engine: "edge-aware-denoise",
        opacity: 0.82,
        params: { radius: 1, strength: 0.62, rangeThreshold: 58 },
      },
      {
        engine: "line-cleanup",
        opacity: 0.72,
        params: { threshold: 0.57, strength: 0.38 },
      },
      {
        engine: "smart-sharpen",
        opacity: 0.42,
        params: { amount: 44, radius: 1 },
      },
    ],
  }),
  RECIPE({
    id: "crisp-ink",
    category: "line-art",
    title: "또렷한 먹선",
    description: "명암 범위를 정리하고 미세 선을 보강해 축소 후에도 읽히는 선화를 만듭니다.",
    tags: ["먹선", "선화", "펜선", "인킹", "ink", "sharp"],
    featured: true,
    entries: [
      {
        engine: "levels",
        params: { black: 10, white: 246, gamma: 0.96, outBlack: 0, outWhite: 255 },
      },
      {
        engine: "difference-of-gaussians",
        opacity: 0.34,
        params: { smallSigma: 0.7, largeSigma: 1.7, threshold: 2, strength: 8 },
      },
      {
        engine: "smart-sharpen",
        opacity: 0.62,
        params: { amount: 58, radius: 1 },
      },
    ],
  }),
  RECIPE({
    id: "photo-webtoon-soft",
    category: "color",
    title: "사진 → 부드러운 웹툰",
    description: "색 경계를 보존하며 면을 단순화하고 윤곽을 가볍게 되살립니다.",
    tags: ["사진", "웹툰", "배경", "셀채색", "photo", "webtoon"],
    featured: true,
    entries: [
      {
        engine: "surface-blur",
        opacity: 0.74,
        params: { strength: 64, radius: 3 },
      },
      {
        engine: "cutout",
        opacity: 0.34,
        params: { strength: 72, levels: 5, smoothing: 78, radius: 2, contrast: 10 },
      },
      {
        engine: "smart-sharpen",
        opacity: 0.48,
        params: { amount: 46, radius: 1 },
      },
    ],
  }),
  RECIPE({
    id: "cel-color-pop",
    category: "color",
    title: "셀 채색 팝",
    description: "계조를 조금 단순화하고 중간톤 대비와 채도를 올려 컷의 가독성을 높입니다.",
    tags: ["셀채색", "채도", "팝", "애니", "cel", "color"],
    entries: [
      { engine: "posterize", opacity: 0.28, params: { levels: 6 } },
      {
        engine: "brightness-contrast",
        params: { brightness: 0.03, contrast: 13 },
      },
      {
        engine: "hue-saturation",
        opacity: 0.72,
        params: { hue: 0, saturation: 0.14 },
      },
      {
        engine: "smart-sharpen",
        opacity: 0.35,
        params: { amount: 38, radius: 1 },
      },
    ],
  }),
  RECIPE({
    id: "cinematic-panel",
    category: "color",
    title: "시네마틱 컷",
    description: "S 커브, 청록 그림자·따뜻한 하이라이트와 미세 필름 입자를 조합합니다.",
    tags: ["시네마틱", "그레이딩", "영화", "필름", "cinematic", "grade"],
    featured: true,
    entries: [
      { engine: "curves", params: { preset: "soft-contrast" } },
      { engine: "shadow-highlight", opacity: 0.5, params: {
        shadows: 22,
        shadowsWidth: 48,
        highlights: 12,
        highlightsWidth: 54,
        midtoneContrast: 8,
      } },
      { engine: "color-balance", opacity: 0.66, params: { preset: "cinematic" } },
      { engine: "film-grain-pro", opacity: 0.16, params: {
        amount: 18,
        scale: 1,
        detail: 42,
        seed: 1337,
        centerX: 50,
        centerY: 50,
        angle: 0,
      } },
    ],
  }),
  RECIPE({
    id: "night-neon",
    category: "light",
    title: "야간 네온",
    description: "차가운 색조 위에 윤곽 발광과 제한된 색수차를 더해 밤 장면을 강조합니다.",
    tags: ["야간", "네온", "발광", "도시", "night", "neon", "glow"],
    featured: true,
    entries: [
      { engine: "color-balance", opacity: 0.72, params: { preset: "cool" } },
      { engine: "glowing-edges", opacity: 0.28, params: {
        strength: 58,
        detail: 2,
        glow: 60,
        radius: 4,
        threshold: 26,
      } },
      { engine: "diffuse-glow", opacity: 0.58, params: {
        strength: 42,
        radius: 8,
        threshold: 64,
        grain: 4,
        seed: 1337,
      } },
      { engine: "chromatic-aberration", opacity: 0.22, params: { offset: 2 } },
    ],
  }),
  RECIPE({
    id: "dream-bloom",
    category: "light",
    title: "회상·몽환 블룸",
    description: "아주 약한 소프트닝과 따뜻한 확산광으로 회상 컷의 공기를 만듭니다.",
    tags: ["회상", "몽환", "블룸", "로맨스", "dream", "bloom"],
    featured: true,
    entries: [
      { engine: "gaussian-blur", opacity: 0.16, params: { radius: 4, strength: 42 } },
      { engine: "diffuse-glow", opacity: 0.74, params: {
        strength: 46,
        radius: 11,
        threshold: 61,
        grain: 3,
        seed: 2048,
      } },
      { engine: "color-balance", opacity: 0.32, params: { preset: "warm" } },
      { engine: "film-grain-pro", opacity: 0.07, params: {
        amount: 12,
        scale: 1,
        detail: 36,
        seed: 2026,
        centerX: 50,
        centerY: 50,
        angle: 0,
      } },
    ],
  }),
  RECIPE({
    id: "dramatic-rays",
    category: "light",
    title: "극적 빛줄기",
    description: "광원 중심을 조절할 수 있는 빛줄기와 확산광을 조합해 집중선을 만듭니다.",
    tags: ["빛줄기", "광원", "역광", "극적", "rays", "light"],
    entries: [
      { engine: "god-rays", opacity: 0.68, params: {
        amount: 58,
        scale: 8,
        detail: 138,
        seed: 1337,
        centerX: 30,
        centerY: 18,
        angle: 0,
      } },
      { engine: "diffuse-glow", opacity: 0.42, params: {
        strength: 34,
        radius: 7,
        threshold: 68,
        grain: 2,
        seed: 1337,
      } },
      { engine: "color-balance", opacity: 0.22, params: { preset: "warm" } },
    ],
  }),
  RECIPE({
    id: "focus-pull",
    category: "light",
    title: "인물 초점 분리",
    description: "영역 초점 블러로 중심 피사체를 남기고 주변 시선을 부드럽게 정리합니다.",
    tags: ["인물", "초점", "심도", "보케", "focus", "portrait"],
    entries: [
      { engine: "field-iris-blur", params: {
        focusCenterX: 0.5,
        focusCenterY: 0.44,
        focusRadius: 0.22,
        feather: 0.34,
        maximumBlurRadius: 6,
        sampleCount: 17,
        apertureBlades: 7,
      } },
    ],
  }),
  RECIPE({
    id: "speed-impact",
    category: "motion",
    title: "속도·충격",
    description: "방향성 블러와 절제된 색수차로 액션 컷의 진행 방향을 강조합니다.",
    tags: ["액션", "속도", "충격", "모션", "speed", "impact"],
    featured: true,
    entries: [
      { engine: "motion-blur", opacity: 0.68, params: { radius: 16, strength: 76, angle: 0 } },
      { engine: "chromatic-aberration", opacity: 0.28, params: { offset: 3 } },
      { engine: "smart-sharpen", opacity: 0.22, params: { amount: 34, radius: 1 } },
    ],
  }),
  RECIPE({
    id: "glitch-panel",
    category: "motion",
    title: "디지털 글리치",
    description: "미세 파형 왜곡, RGB 노이즈와 색수차를 겹쳐 시스템 오류·불안 장면을 만듭니다.",
    tags: ["글리치", "오류", "사이버", "왜곡", "glitch", "digital"],
    entries: [
      { engine: "wave-warp", opacity: 0.18, params: {
        amount: 18,
        scale: 18,
        detail: 36,
        seed: 337,
        centerX: 50,
        centerY: 50,
        angle: 0,
        interpolation: "bilinear",
      } },
      { engine: "rgb-noise", opacity: 0.22, params: {
        amount: 20,
        scale: 1,
        detail: 42,
        seed: 2048,
        centerX: 50,
        centerY: 50,
        angle: 0,
      } },
      { engine: "chromatic-aberration", opacity: 0.66, params: { offset: 5 } },
    ],
  }),
  RECIPE({
    id: "mono-screentone",
    category: "print",
    title: "흑백 스크린톤",
    description: "회색조와 출력 레벨을 정리한 뒤 단색 망점으로 인쇄 원고 느낌을 만듭니다.",
    tags: ["흑백", "스크린톤", "망점", "만화", "mono", "halftone"],
    featured: true,
    entries: [
      { engine: "grayscale" },
      { engine: "levels", params: { black: 8, white: 248, gamma: 0.92, outBlack: 0, outWhite: 255 } },
      { engine: "color-halftone", opacity: 0.86, params: {
        dotSize: 4,
        angle: 45,
        mode: "mono",
        strength: 88,
      } },
    ],
  }),
  RECIPE({
    id: "retro-print",
    category: "print",
    title: "레트로 컬러 인쇄",
    description: "제한된 계조, CMYK 망점과 필름 열화를 조합해 빈티지 잡지 인쇄를 재현합니다.",
    tags: ["레트로", "CMYK", "인쇄", "빈티지", "retro", "print"],
    entries: [
      { engine: "posterize", opacity: 0.32, params: { levels: 6 } },
      { engine: "color-halftone", opacity: 0.52, params: {
        dotSize: 3,
        angle: 15,
        mode: "cmyk",
        strength: 72,
      } },
      { engine: "retro-film", opacity: 0.58, params: {
        strength: 74,
        grain: 18,
        grainSize: 2,
        fade: 12,
        chromatic: 1,
        seed: 1337,
      } },
    ],
  }),
  RECIPE({
    id: "photocopy-zine",
    category: "print",
    title: "복사기 진(Zine)",
    description: "고대비 복사 질감과 제한된 디더·입자로 거친 독립출판 분위기를 만듭니다.",
    tags: ["복사", "진", "펑크", "디더", "photocopy", "zine"],
    entries: [
      { engine: "photocopy", opacity: 0.9, params: {
        amount: 88,
        scale: 2,
        detail: 132,
        seed: 1337,
        centerX: 50,
        centerY: 50,
        angle: 0,
      } },
      { engine: "ordered-dither", opacity: 0.22, params: { strength: 58, detail: 4 } },
      { engine: "film-grain-pro", opacity: 0.2, params: {
        amount: 24,
        scale: 1,
        detail: 76,
        seed: 7331,
        centerX: 50,
        centerY: 50,
        angle: 0,
      } },
    ],
  }),
  RECIPE({
    id: "watercolor-paper",
    category: "stylize",
    title: "수채 종이",
    description: "번짐·과립·종이 질감을 한 스택으로 구성하고 미세 인쇄 입자를 더합니다.",
    tags: ["수채", "종이", "과립", "일러스트", "watercolor", "paper"],
    featured: true,
    entries: [
      { engine: "watercolor", opacity: 0.88, params: {
        strength: 72,
        spread: 4,
        bleed: 58,
        granulation: 48,
        paper: 52,
        seed: 112,
      } },
      { engine: "film-grain-pro", opacity: 0.1, params: {
        amount: 13,
        scale: 2,
        detail: 62,
        seed: 112,
        centerX: 50,
        centerY: 50,
        angle: 0,
      } },
    ],
  }),
]);

const CATEGORY_LABELS: Readonly<Record<StudioEffectRecipeCategory, string>> = Object.freeze({
  restore: "복원",
  "line-art": "선화",
  color: "색감",
  light: "빛·초점",
  motion: "동작·왜곡",
  print: "인쇄·톤",
  stylize: "재질·화풍",
});

export function studioEffectRecipeCategoryLabel(category: StudioEffectRecipeCategory): string {
  return CATEGORY_LABELS[category];
}

export function studioEffectRecipeById(recipeId: string): StudioEffectRecipe | null {
  return STUDIO_EFFECT_RECIPES.find((recipe) => recipe.id === recipeId) ?? null;
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function studioEffectSearchTokens(value: string): readonly string[] {
  const normalized = normalizeSearchText(value).slice(0, 256);
  if (!normalized) return [];
  return normalized.split(/\s+/u).filter(Boolean).slice(0, 12);
}

export function searchStudioEffectRecipes(
  query: string,
  category: StudioEffectRecipeCategory | "all" = "all",
): readonly StudioEffectRecipe[] {
  const needles = studioEffectSearchTokens(query);
  return STUDIO_EFFECT_RECIPES.filter((recipe) => {
    if (category !== "all" && recipe.category !== category) return false;
    if (needles.length === 0) return true;
    const haystack = normalizeSearchText([
      recipe.title,
      recipe.description,
      studioEffectRecipeCategoryLabel(recipe.category),
      ...recipe.tags,
    ].join(" "));
    return needles.every((needle) => haystack.includes(needle));
  });
}

function nextRecipeRun(
  existingIds: ReadonlySet<string>,
  recipeId: string,
): number {
  const prefix = `fxr-${recipeId}-`;
  let highest = 0;
  for (const id of existingIds) {
    if (!id.startsWith(prefix)) continue;
    const match = id.slice(prefix.length).match(/^(\d+)-/u);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest + 1;
}

function recipeEntries(
  base: StudioAdjustmentStack,
  recipe: StudioEffectRecipe,
): StudioAdjustmentEntry[] {
  const ids = new Set(base.entries.map((entry) => entry.id));
  const run = nextRecipeRun(ids, recipe.id);
  return recipe.entries.map((entry, index) => {
    if (!STUDIO_ADJUSTMENT_ENGINE_IDS.includes(entry.engine)) {
      throw new Error(`Unsupported effect recipe engine: ${entry.engine}`);
    }
    const id = `fxr-${recipe.id}-${run}-${index + 1}`.slice(0, 80);
    ids.add(id);
    const opacity = entry.opacity === undefined
      ? undefined
      : Math.max(0, Math.min(1, entry.opacity));
    return {
      id,
      engine: entry.engine,
      enabled: true,
      ...(opacity !== undefined && opacity < 1 ? { opacity } : {}),
      params: {
        ...studioAdjustmentDefaultParams(entry.engine),
        ...entry.params,
      },
    };
  });
}

export function applyStudioEffectRecipe(
  stack: unknown,
  recipeId: string,
  mode: StudioEffectRecipeApplyMode = "append",
): StudioEffectRecipeApplicationReceipt {
  const current = normalizeStudioAdjustmentStack(stack);
  const recipe = studioEffectRecipeById(recipeId);
  if (!recipe) {
    return {
      status: "unknown-recipe",
      stack: current,
      recipe: null,
      mode,
      addedCount: 0,
      replacedCount: 0,
      serializedBytes: studioAdjustmentStackSerializedByteLength(current),
      maximumSerializedBytes: STUDIO_ADJUSTMENT_STACK_MAX_SERIALIZED_BYTES,
    };
  }

  const base = mode === "replace" ? createEmptyStudioAdjustmentStack() : current;
  const additions = recipeEntries(base, recipe);
  const admission = admitStudioAdjustmentStack({
    version: base.version,
    entries: [...base.entries, ...additions],
  }, current);
  const accepted = admission.status === "accepted";

  return {
    status: admission.status,
    stack: admission.stack,
    recipe,
    mode,
    addedCount: accepted ? additions.length : 0,
    replacedCount: accepted && mode === "replace" ? current.entries.length : 0,
    serializedBytes: admission.serializedBytes,
    maximumSerializedBytes: admission.maximumSerializedBytes,
  };
}

function nextDuplicateId(entries: readonly StudioAdjustmentEntry[], sourceId: string): string {
  const existing = new Set(entries.map((entry) => entry.id));
  const stem = `${sourceId}-copy`.slice(0, 72);
  if (!existing.has(stem)) return stem;
  let suffix = 2;
  while (existing.has(`${stem}-${suffix}`.slice(0, 80))) suffix += 1;
  return `${stem}-${suffix}`.slice(0, 80);
}

/** Duplicate next to the source, preserving its exact engine parameters and opacity. */
export function duplicateStudioEffectEntry(
  stack: unknown,
  entryId: string,
): StudioAdjustmentStack {
  const current = normalizeStudioAdjustmentStack(stack);
  const sourceIndex = current.entries.findIndex((entry) => entry.id === entryId);
  if (sourceIndex < 0) return current;
  const source = current.entries[sourceIndex]!;
  const duplicate: StudioAdjustmentEntry = {
    ...source,
    id: nextDuplicateId(current.entries, source.id),
    params: { ...source.params },
  };
  return admitStudioAdjustmentStack({
    version: current.version,
    entries: [
      ...current.entries.slice(0, sourceIndex + 1),
      duplicate,
      ...current.entries.slice(sourceIndex + 1),
    ],
  }, current).stack;
}

/** Reset parameters and opacity while preserving the entry identity and visibility state. */
export function resetStudioEffectEntry(
  stack: unknown,
  entryId: string,
): StudioAdjustmentStack {
  const current = normalizeStudioAdjustmentStack(stack);
  if (!current.entries.some((entry) => entry.id === entryId)) return current;
  return admitStudioAdjustmentStack({
    version: current.version,
    entries: current.entries.map((entry) => entry.id === entryId
      ? {
        id: entry.id,
        engine: entry.engine,
        enabled: entry.enabled,
        params: studioAdjustmentDefaultParams(entry.engine),
      }
      : entry),
  }, current).stack;
}

const HEAVY_ENGINES = new Set<StudioAdjustmentEngineId>([
  "lens-blur",
  "field-iris-blur",
  "tilt-shift-blur",
  "selective-gaussian-blur",
  "surface-blur",
  "edge-aware-denoise",
  "dust-scratches",
  "watercolor",
  "diffuse-glow",
  "god-rays",
  "stained-glass",
]);

const BLUR_ENGINES = new Set<StudioAdjustmentEngineId>([
  "blur",
  "gaussian-blur",
  "motion-blur",
  "spin-blur",
  "zoom-blur",
  "lens-blur",
  "field-iris-blur",
  "tilt-shift-blur",
  "selective-gaussian-blur",
  "tileable-blur",
  "surface-blur",
  "dust-scratches",
  "diffuse-glow",
]);

const GEOMETRY_ENGINES = new Set<StudioAdjustmentEngineId>([
  "wave-warp",
  "ripple-warp",
  "fisheye",
  "twirl",
  "pinch-bloat",
  "lens-distortion",
  "polar-coordinates",
  "offset",
]);

const MONO_OR_THRESHOLD_ENGINES = new Set<StudioAdjustmentEngineId>([
  "grayscale",
  "ink-threshold",
  "line-extraction",
  "photocopy",
  "ordered-dither",
]);

const BASE_COST_POINTS: Readonly<Record<StudioAdjustmentEngineId, number>> = Object.freeze({
  "brightness-contrast": 1,
  "shadow-highlight": 2,
  levels: 1,
  curves: 1,
  "hue-saturation": 1,
  "color-balance": 1,
  "channel-mixer": 1,
  "gradient-map": 1,
  invert: 1,
  grayscale: 1,
  sepia: 1,
  posterize: 1,
  exposure: 1,
  blur: 2,
  sharpen: 2,
  "smart-sharpen": 3,
  "unsharp-mask": 3,
  "median-despeckle": 3,
  "high-pass": 2,
  noise: 2,
  "film-grain-pro": 2,
  "rgb-noise": 2,
  "salt-pepper": 2,
  "line-cleanup": 3,
  "screentone-removal": 4,
  "jpeg-artifact-reduction": 5,
  "edge-aware-denoise": 7,
  "dust-scratches": 6,
  "difference-of-gaussians": 4,
  "color-to-alpha": 3,
  screentone: 3,
  "color-halftone": 4,
  pixelate: 2,
  "ink-threshold": 2,
  "line-extraction": 3,
  "chromatic-aberration": 3,
  "edge-detect": 3,
  emboss: 3,
  solarize: 2,
  "oil-paint": 6,
  morphology: 3,
  offset: 3,
  "custom-convolution": 3,
  clouds: 4,
  "gaussian-blur": 4,
  "motion-blur": 5,
  "spin-blur": 6,
  "zoom-blur": 6,
  "lens-blur": 8,
  "field-iris-blur": 10,
  "tilt-shift-blur": 9,
  "selective-gaussian-blur": 7,
  "tileable-blur": 5,
  "surface-blur": 6,
  "crystal-mosaic": 5,
  "pencil-sketch": 4,
  crosshatch: 4,
  "ordered-dither": 2,
  "glowing-edges": 5,
  cutout: 4,
  "retro-film": 4,
  watercolor: 7,
  "diffuse-glow": 5,
  "wave-warp": 5,
  "ripple-warp": 5,
  fisheye: 5,
  twirl: 5,
  "pinch-bloat": 5,
  "lens-distortion": 5,
  "perlin-texture": 5,
  pointillize: 6,
  "stained-glass": 7,
  "poster-edges": 5,
  photocopy: 4,
  "normal-map": 5,
  "god-rays": 8,
  "polar-coordinates": 6,
});

function numericParam(
  entry: StudioAdjustmentEntry,
  key: string,
  fallback = 0,
): number {
  const value = entry.params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function entryCostPoints(entry: StudioAdjustmentEntry): number {
  let cost = BASE_COST_POINTS[entry.engine];
  if (BLUR_ENGINES.has(entry.engine)) {
    const radius = Math.max(
      numericParam(entry, "radius"),
      numericParam(entry, "maximumBlurRadius"),
    );
    if (radius >= 18) cost += 3;
    else if (radius >= 8) cost += 1;
  }
  const samples = numericParam(entry, "sampleCount");
  if (samples >= 40) cost += 4;
  else if (samples >= 24) cost += 2;
  const detail = numericParam(entry, "detail");
  if (detail >= 180) cost += 2;
  return cost;
}

function duplicateEngineLabels(entries: readonly StudioAdjustmentEntry[]): string[] {
  const counts = new Map<StudioAdjustmentEngineId, number>();
  for (const entry of entries) counts.set(entry.engine, (counts.get(entry.engine) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([engine]) => studioAdjustmentEngineLabel(engine));
}

/**
 * Hardware-independent heuristic. It detects composition risks; it is not a frame-time benchmark.
 */
export function diagnoseStudioEffectStack(stack: unknown): StudioEffectStackDiagnostics {
  const current = normalizeStudioAdjustmentStack(stack);
  const zeroOpacityCount = current.entries.filter((entry) => entry.enabled && entry.opacity === 0).length;
  const active = current.entries.filter((entry) => entry.enabled && entry.opacity !== 0);
  const disabledCount = current.entries.length - active.length - zeroOpacityCount;
  const costPoints = active.reduce((sum, entry) => sum + entryCostPoints(entry), 0);
  const tier: StudioEffectCostTier = costPoints <= 8
    ? "light"
    : costPoints <= 26
      ? "balanced"
      : "heavy";
  const recommendedPreviewScale = tier === "heavy" ? 0.5 : tier === "balanced" ? 0.75 : 1;
  const expensive = active.filter((entry) => HEAVY_ENGINES.has(entry.engine));
  const blurEntries = active.filter((entry) => BLUR_ENGINES.has(entry.engine));
  const geometryEntries = active.filter((entry) => GEOMETRY_ENGINES.has(entry.engine));
  const messages: StudioEffectDiagnosticMessage[] = [];

  if (active.length === 0) {
    messages.push({
      id: "empty-stack",
      severity: "info",
      title: "활성 효과 없음",
      detail: "레시피를 적용하거나 아래 카탈로그에서 필터를 추가하면 원본을 유지한 채 시작할 수 있습니다.",
    });
  }
  if (active.length >= 12) {
    messages.push({
      id: "long-stack",
      severity: "warning",
      title: "긴 효과 스택",
      detail: `활성 효과가 ${active.length}개입니다. 결과가 비슷한 항목을 합치거나 비활성 항목을 정리하면 조절과 미리보기가 빨라집니다.`,
    });
  }
  if (expensive.length >= 3) {
    messages.push({
      id: "expensive-stack",
      severity: "warning",
      title: "고비용 효과 중첩",
      detail: `${expensive.slice(0, 3).map((entry) => studioAdjustmentEngineLabel(entry.engine)).join(" · ")} 등이 함께 활성화되어 있습니다. 편집 중에는 50% 미리보기를 권장합니다.`,
    });
  }
  if (blurEntries.length >= 3) {
    messages.push({
      id: "blur-stack",
      severity: "warning",
      title: "블러 계열 중첩",
      detail: `블러·복원 계열이 ${blurEntries.length}개 겹칩니다. 큰 반경 효과를 앞쪽에 두고 세부 보정은 뒤쪽에 두면 의도를 추적하기 쉽습니다.`,
    });
  }
  if (geometryEntries.length >= 2) {
    messages.push({
      id: "geometry-stack",
      severity: "warning",
      title: "기하 왜곡 중첩",
      detail: `${geometryEntries.map((entry) => studioAdjustmentEngineLabel(entry.engine)).join(" · ")} 순서에 따라 가장자리와 중심점이 크게 달라집니다. 내보내기 전 전체 캔버스 경계를 확인하세요.`,
    });
  }

  const colorToAlphaIndex = active.findIndex((entry) => entry.engine === "color-to-alpha");
  if (colorToAlphaIndex >= 0 && colorToAlphaIndex < active.length - 1) {
    messages.push({
      id: "alpha-order",
      severity: "warning",
      title: "투명화 이후 효과 있음",
      detail: "색상 투명화 뒤의 블러·왜곡은 반투명 가장자리를 다시 만들 수 있습니다. 필터 마스크와 알파 가장자리를 확대 확인하세요.",
    });
  }

  const firstMonoIndex = active.findIndex((entry) => MONO_OR_THRESHOLD_ENGINES.has(entry.engine));
  if (firstMonoIndex >= 0) {
    const laterColorGrade = active.slice(firstMonoIndex + 1).some((entry) =>
      entry.engine === "hue-saturation"
      || entry.engine === "color-balance"
      || entry.engine === "channel-mixer"
      || entry.engine === "gradient-map"
    );
    if (laterColorGrade) {
      messages.push({
        id: "mono-color-order",
        severity: "info",
        title: "단색 변환 뒤 색 보정",
        detail: "현재 순서는 원본 색 보정보다 단색 결과의 틴팅에 가깝습니다. 원본 색을 보정하려면 색 효과를 단색 변환 앞쪽으로 이동하세요.",
      });
    }
  }

  const duplicates = duplicateEngineLabels(active);
  if (duplicates.length > 0) {
    messages.push({
      id: "duplicate-engines",
      severity: "info",
      title: "동일 엔진 반복",
      detail: `${duplicates.join(" · ")}이 3회 이상 반복됩니다. 의도적인 다단 처리인지 불투명도와 순서를 확인하세요.`,
    });
  }
  if (zeroOpacityCount > 0) {
    messages.push({
      id: "zero-opacity",
      severity: "info",
      title: "0% 효과 정리 가능",
      detail: `불투명도 0% 항목 ${zeroOpacityCount}개는 렌더 체인에서 제외됩니다. 비교용이 아니라면 삭제해 스택을 단순화하세요.`,
    });
  }

  return {
    entryCount: current.entries.length,
    activeCount: active.length,
    disabledCount,
    zeroOpacityCount,
    costPoints,
    tier,
    recommendedPreviewScale,
    expensiveEngineCount: expensive.length,
    messages,
  };
}

export function studioEffectCostTierLabel(tier: StudioEffectCostTier): string {
  switch (tier) {
    case "light": return "가벼움";
    case "balanced": return "균형";
    case "heavy": return "고부하";
  }
}

export function estimateStudioEffectRecipeCost(recipe: StudioEffectRecipe): StudioEffectStackDiagnostics {
  const receipt = applyStudioEffectRecipe(undefined, recipe.id, "replace");
  return diagnoseStudioEffectStack(receipt.stack);
}
