import { BRUSH_STUDIO_V6_RECIPE_SEEDS } from "../brush-lab/brush-studio-v6-recipe-catalog";
import { brushStudioV6Topology } from "../brush-lab/brush-studio-v6-topology-catalog";
import { studioBrushDefaultSizeProfile } from "./studio-brush-default-size-policy";
import {
  resolveStudioBrushEngineLaneLabelKo,
  studioBrushEngineLaneRowById,
} from "./studio-brush-engine-lane-catalog";
import { studioBrushPackDescriptorById } from "./studio-brush-pack-index";
import { describeStudioBrushRuntimeSemantics } from "./studio-brush-semantic-quality";
import { studioV6RecipeIdFromCatalogId } from "./studio-brush-v6-id";

import type { BrushStudioV6RecipeSeed } from "../brush-lab/brush-studio-v6-recipe-catalog";
import type { StudioBrushTrayItem } from "../studio-creative-ux";

export type StudioBrushEngineStageRole =
  | "motion" | "carrier" | "tip" | "surface" | "deposition" | "pickup"
  | "pigment" | "physics" | "pattern" | "finish" | "output";

export interface StudioBrushEngineStage {
  readonly role: StudioBrushEngineStageRole;
  readonly roleLabel: string;
  readonly id: string;
  readonly label: string;
  readonly provider: string;
}

export interface StudioBrushProductProfile {
  readonly engineFamilyId: string;
  readonly engineFamilyLabel: string;
  readonly engineSummary: string;
  readonly engineStages: readonly StudioBrushEngineStage[];
  readonly traits: readonly string[];
  readonly behaviorSummary: string;
  readonly size: ReturnType<typeof studioBrushDefaultSizeProfile>;
  readonly searchTerms: readonly string[];
}

export interface StudioBrushEngineFamilyOption {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}

type ProductProfileItem = Pick<
  StudioBrushTrayItem,
  "id" | "name" | "hint" | "defaultWidth" | "mediaGroup" | "previewStyle"
> & { readonly runtimeBrushId?: string };

const ROLE_LABELS: Readonly<Record<StudioBrushEngineStageRole, string>> = Object.freeze({
  motion: "입력 보정", carrier: "획 생성", tip: "촉", surface: "바탕", deposition: "도포",
  pickup: "픽업", pigment: "안료", physics: "물리", pattern: "패턴", finish: "마감", output: "출력",
});

const NODE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "motion-direct": "Direct Motion", "motion-adaptive-ema": "Adaptive EMA",
  "motion-spring": "Spring Motion", "motion-google-ink": "Google Ink Modeler",
  "motion-brush-inertia": "Brush Inertia", "motion-lazy-leash": "Lazy Leash",
  "carrier-webgpu-centerline": "WebGPU Centerline", "carrier-perfect-outline": "Perfect Freehand Outline",
  "carrier-google-mesh": "Google Ink Mesh", "carrier-webgpu-ribbon": "WebGPU Tilt Ribbon",
  "carrier-libmypaint-dabs": "libmypaint Dabs", "carrier-hokusai-dabs": "Hokusai Dabs",
  "carrier-krita-hairy": "Krita Hairy Carrier", "carrier-webgpu-particles": "WebGPU Particle Stream",
  "carrier-p5-flow": "p5.brush Flow Carrier", "tip-round-sdf": "Round SDF",
  "tip-chisel-sdf": "Chisel SDF", "tip-grain-exemplar": "Captured Grain Tip",
  "tip-krita-dual": "Krita Dual Tip", "tip-pigment-normal": "Normal-mapped Tip",
  "tip-motif-atlas": "Motif Atlas", "surface-smooth": "Smooth Film", "surface-kent": "Kent Paper",
  "surface-coldpress": "Cold-press Watercolor", "surface-printmaking": "Printmaking Tooth",
  "surface-linen": "Linen Canvas", "surface-porous": "Porous Fiber",
  "surface-realbrush": "Captured Material Surface", "deposit-ink": "Ink Deposit",
  "deposit-marker": "Marker Deposit", "deposit-dry": "Dry Deposit", "deposit-wet": "Wet Deposit",
  "deposit-oil": "Oil Deposit", "deposit-particles": "Particle Deposit", "deposit-light": "Light Deposit",
  "pickup-none": "No Pickup", "pickup-krita-smudge": "Krita Color Smudge",
  "pickup-pigment-reservoir": "Local Pigment Reservoir", "pigment-rgb": "RGB / OKLab",
  "pigment-spectral": "Spectral WGSL", "pigment-open-km": "Open K/S WGSL",
  "pigment-painter-lut": "Pigment Painter LUT", "pigment-mixbox": "Mixbox Latent Pigment",
  "pigment-inkwash-density": "Inkwash Optical Density", "physics-dry-contact": "Dry Contact",
  "physics-porous-paper": "Porous Paper", "physics-inkwash": "Inkwash Wet Flow",
  "physics-thin-film": "Thin-film Gravity", "physics-bristle": "Bristle Dynamics",
  "physics-particles": "Particle Ballistics", "physics-reaction": "Reaction–Diffusion",
  "physics-height": "Height Field", "pattern-none": "No Pattern", "pattern-dot-tone": "Document Dot Tone",
  "pattern-cross-hatch": "Contour Cross Hatch", "pattern-weave": "Fabric Weave",
  "pattern-brick": "Brick Mortar", "pattern-foliage": "Foliage Cluster",
  "pattern-stitch": "Stitch / Chain", "pattern-kaleido": "Kaleido Graph",
  "pattern-flow-field": "Flow-field Mass", "pattern-rainbow": "Rainbow Flow",
  "finish-edge-bloom": "Edge Bloom", "finish-wet-sheen": "Wet Sheen",
  "finish-relief": "Relief Lighting", "finish-neon": "Neon Bloom", "finish-grain": "Grain Boost",
  "finish-chroma": "Chromatic Fringe", "output-contact-canvas-svg": "Canvas Contacts + SVG",
  "output-raster-tiles": "Raster Tile Authority", "output-hybrid": "Hybrid Editable Authority",
  "output-vector": "Vector Authority",
});

const CLASSIC_ENGINE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  "causal-ink": "연속 잉크", "stamp-dabs": "스탬프 다브", "calligraphy-segments": "캘리그래피 세그먼트",
  "perfect-outline": "Perfect Freehand 외곽선", "capsule-outline": "캡슐 외곽선",
  "highlighter-path": "원패스 하이라이터", "neon-halo": "네온 헤일로", "glow-halo": "글로우 헤일로",
  "particle-scatter": "파티클 산란", "angled-ribbon": "각진 리본", "watercolor-dabs": "수채 다브",
  "oil-ribbon": "오일 리본", "dynamic-dabs": "동적 다브", "pencil-path": "연필 패스",
  "screentone-dots": "스크린톤 도트",
});

const V6_DEFAULT_SLOTS = Object.freeze({
  motion: "motion-adaptive-ema", carrier: "carrier-webgpu-centerline", tip: "tip-round-sdf",
  surface: "surface-smooth", deposition: "deposit-ink", pickup: "pickup-none", pigment: "pigment-rgb",
  physics: Object.freeze([] as string[]), pattern: "pattern-none", finish: Object.freeze([] as string[]),
  output: "output-contact-canvas-svg",
});

const V6_SEED_BY_ID = new Map(BRUSH_STUDIO_V6_RECIPE_SEEDS.map((seed) => [seed.id, seed]));
const PROFILE_CACHE = new Map<string, StudioBrushProductProfile>();

function unique(values: readonly (string | null | undefined | false)[]): readonly string[] {
  return Object.freeze(Array.from(new Set(values.filter((value): value is string =>
    typeof value === "string" && value.trim().length > 0))));
}

function humanizeNodeId(id: string): string {
  return id
    .replace(/^(motion|carrier|tip|surface|deposit|pickup|pigment|physics|pattern|finish|output)-/u, "")
    .split("-")
    .map((part) => part ? `${part[0]!.toUpperCase()}${part.slice(1)}` : part)
    .join(" ");
}

function nodeLabel(id: string): string {
  return brushStudioV6Topology(id)?.label ?? NODE_LABELS[id] ?? humanizeNodeId(id);
}

function nodeProvider(id: string): string {
  if (brushStudioV6Topology(id)) return "ToonSpectrum CPU Topology";
  if (id.includes("google")) return "Google Ink";
  if (id.includes("perfect")) return "Perfect Freehand";
  if (id.includes("libmypaint")) return "libmypaint";
  if (id.includes("hokusai")) return "Hokusai";
  if (id.includes("krita")) return "Krita";
  if (id.includes("p5-")) return "p5.brush";
  if (id.includes("mixbox")) return "Mixbox";
  if (id.includes("open-km")) return "Open K/M";
  if (id.includes("painter")) return "Pigment.Painter";
  if (id.includes("inkwash")) return "Inkwash";
  if (id.includes("webgpu") || /^(tip|surface|deposit|physics|pattern|finish)-/u.test(id)) {
    return "ToonSpectrum WebGPU";
  }
  return "ToonSpectrum";
}

function engineStage(role: StudioBrushEngineStageRole, id: string): StudioBrushEngineStage {
  return Object.freeze({ role, roleLabel: ROLE_LABELS[role], id, label: nodeLabel(id), provider: nodeProvider(id) });
}

function resolveV6Stages(seed: BrushStudioV6RecipeSeed): readonly StudioBrushEngineStage[] {
  const source = seed.delta.slots ?? {};
  const stages: StudioBrushEngineStage[] = [
    engineStage("motion", source.motion ?? V6_DEFAULT_SLOTS.motion),
    engineStage("carrier", source.carrier ?? V6_DEFAULT_SLOTS.carrier),
    engineStage("tip", source.tip ?? V6_DEFAULT_SLOTS.tip),
    engineStage("surface", source.surface ?? V6_DEFAULT_SLOTS.surface),
    engineStage("deposition", source.deposition ?? V6_DEFAULT_SLOTS.deposition),
  ];
  const pickup = source.pickup ?? V6_DEFAULT_SLOTS.pickup;
  if (pickup !== "pickup-none") stages.push(engineStage("pickup", pickup));
  stages.push(engineStage("pigment", source.pigment ?? V6_DEFAULT_SLOTS.pigment));
  for (const id of source.physics ?? V6_DEFAULT_SLOTS.physics) stages.push(engineStage("physics", id));
  const pattern = source.pattern ?? V6_DEFAULT_SLOTS.pattern;
  if (pattern !== "pattern-none") stages.push(engineStage("pattern", pattern));
  for (const id of source.finish ?? V6_DEFAULT_SLOTS.finish) stages.push(engineStage("finish", id));
  stages.push(engineStage("output", source.output ?? V6_DEFAULT_SLOTS.output));
  return Object.freeze(stages);
}

function v6Family(carrierId: string): readonly [id: string, label: string, provider: string] {
  const topology = brushStudioV6Topology(carrierId);
  if (topology) return ["cpu-topology", "CPU 위상·물리", "ToonSpectrum CPU Topology"];
  if (carrierId.includes("perfect")) return ["perfect-freehand", "Perfect Freehand", "Perfect Freehand"];
  if (carrierId.includes("google")) return ["google-ink", "Google Ink", "Google Ink"];
  if (carrierId.includes("libmypaint")) return ["libmypaint", "libmypaint", "libmypaint"];
  if (carrierId.includes("hokusai")) return ["hokusai", "Hokusai", "Hokusai"];
  if (carrierId.includes("krita")) return ["krita-hairy", "Krita 강모", "Krita"];
  if (carrierId.includes("p5-")) return ["p5-brush", "p5.brush", "p5.brush"];
  if (carrierId.includes("particles")) return ["webgpu-particles", "WebGPU 파티클", "ToonSpectrum WebGPU"];
  if (carrierId.includes("ribbon")) return ["webgpu-ribbon", "WebGPU 리본", "ToonSpectrum WebGPU"];
  return ["webgpu-ink", "WebGPU 잉크", "ToonSpectrum WebGPU"];
}

function v6Traits(seed: BrushStudioV6RecipeSeed, stages: readonly StudioBrushEngineStage[]): readonly string[] {
  const ids = stages.map((stage) => stage.id);
  const tuning = seed.delta.tuning;
  const traits: string[] = [];
  const add = (condition: boolean, label: string) => { if (condition && !traits.includes(label)) traits.push(label); };
  add(
    ids.includes("output-vector") || ids.includes("carrier-perfect-outline"),
    "벡터 선화",
  );
  add(ids.includes("carrier-perfect-outline"), "정밀 테이퍼");
  add((tuning?.size ?? 18) <= 4, "극세 제도");
  add(ids.includes("tip-chisel-sdf"), "틸트 치즐");
  add(ids.includes("tip-grain-exemplar"), "캡처 입자 촉");
  add(ids.includes("tip-krita-dual"), "듀얼 촉");
  add(ids.includes("carrier-krita-hairy") || ids.includes("physics-bristle"), "개별 강모");
  add(ids.includes("surface-linen"), "리넨 결");
  add(ids.includes("physics-dry-contact"), "마른 접촉");
  add(ids.includes("physics-height"), "입체 물감");
  add(ids.includes("deposit-wet") || ids.includes("physics-inkwash"), "습식 번짐");
  add(ids.includes("physics-porous-paper"), "종이 흡수");
  add((tuning?.granulation ?? 0) >= 0.55, "고과립");
  add(ids.includes("physics-reaction"), "반응·결정");
  add(ids.includes("pickup-krita-smudge") || ids.includes("pickup-pigment-reservoir"), "색 픽업");
  add(ids.includes("physics-particles") || ids.includes("deposit-particles"), "입자 분사");
  add(ids.includes("pattern-cross-hatch"), "교차 해칭");
  add(ids.includes("pattern-dot-tone"), "문서 고정 망점");
  add(ids.includes("pattern-rainbow"), "색 흐름");
  add(ids.includes("pigment-mixbox"), "Mixbox 혼색");
  add(ids.includes("pigment-spectral") || ids.includes("pigment-open-km"), "실감 혼색");
  add(ids.includes("pigment-inkwash-density"), "먹 광학밀도");
  add(ids.includes("finish-edge-bloom"), "가장자리 농축");
  add(ids.includes("finish-grain"), "표면 질감");
  add(ids.includes("finish-neon"), "네온 발광");
  add(true, "필압 반응");
  return Object.freeze(traits.slice(0, 5));
}

function sizeClassLabel(width: number): StudioBrushProductProfile["size"]["sizeClassLabel"] {
  if (width <= 3) return "극세";
  if (width <= 8) return "세필";
  if (width <= 18) return "중간";
  if (width <= 32) return "광폭";
  return "초광폭";
}

function actualSizeProfile(item: ProductProfileItem, authoredWidth: number): StudioBrushProductProfile["size"] {
  const policy = studioBrushDefaultSizeProfile(item.mediaGroup, authoredWidth);
  const defaultWidth = Math.max(1, Math.min(240, Math.round(item.defaultWidth)));
  if (defaultWidth === policy.defaultWidth) return policy;
  const lowerRatio = item.mediaGroup === "ink" || item.mediaGroup === "pencil" || item.mediaGroup === "tone" ? 0.45 : 0.34;
  const upperRatio = item.mediaGroup === "airbrush" || item.mediaGroup === "watercolor" || item.mediaGroup === "fx" ? 1.9 : 1.65;
  return Object.freeze({
    sourceWidth: authoredWidth,
    defaultWidth,
    recommendedMin: Math.max(1, Math.round(defaultWidth * lowerRatio)),
    recommendedMax: Math.min(80, Math.max(defaultWidth, Math.round(defaultWidth * upperRatio))),
    sizeClassLabel: sizeClassLabel(defaultWidth),
    normalized: Math.round(authoredWidth) !== defaultWidth,
  });
}

function makeV6Profile(item: ProductProfileItem, seed: BrushStudioV6RecipeSeed): StudioBrushProductProfile {
  const stages = resolveV6Stages(seed);
  const carrier = stages.find((stage) => stage.role === "carrier")!;
  const [engineFamilyId, baseFamilyLabel, primaryProvider] = v6Family(carrier.id);
  const secondaryProvider = stages.map((stage) => stage.provider)
    .find((provider) => provider !== primaryProvider && !provider.startsWith("ToonSpectrum"));
  const engineFamilyLabel = secondaryProvider ? `${baseFamilyLabel} + ${secondaryProvider}` : baseFamilyLabel;
  const traits = v6Traits(seed, stages);
  const authoredWidth = seed.delta.tuning?.size ?? 18;
  const engineSummary = stages
    .filter((stage) => !["motion", "output"].includes(stage.role))
    .map((stage) => stage.label)
    .join(" → ");
  const searchTerms = unique([
    seed.group, seed.description, engineFamilyId, engineFamilyLabel, engineSummary, ...traits,
    ...stages.flatMap((stage) => [stage.roleLabel, stage.id, stage.label, stage.provider]),
  ]);
  return Object.freeze({
    engineFamilyId,
    engineFamilyLabel,
    engineSummary,
    engineStages: stages,
    traits,
    behaviorSummary: item.hint,
    size: actualSizeProfile(item, authoredWidth),
    searchTerms,
  });
}

function classicProvider(item: ProductProfileItem, engine: string, variant: string): string {
  const signature = `${item.id} ${engine} ${variant}`.toLocaleLowerCase("en-US");
  if (signature.includes("perfect")) return "Perfect Freehand";
  if (signature.includes("google")) return "Google Ink";
  if (signature.includes("mypaint")) return "libmypaint";
  if (signature.includes("krita")) return "Krita";
  if (signature.includes("klecks")) return "Klecks";
  return "ToonSpectrum";
}

function makeClassicProfile(item: ProductProfileItem): StudioBrushProductProfile {
  const descriptor = studioBrushPackDescriptorById(item.id);
  const runtimeBrushId = item.runtimeBrushId ?? descriptor?.runtimeBrushId ?? item.id;
  const semantic = describeStudioBrushRuntimeSemantics(item.id, runtimeBrushId);
  const lane = studioBrushEngineLaneRowById(item.id);
  const laneLabel = resolveStudioBrushEngineLaneLabelKo(item.id);
  const engine = semantic?.engine ?? "dynamic-dabs";
  const variant = semantic?.engineVariant ?? "catalog-profile";
  const engineFamilyLabel = laneLabel ?? CLASSIC_ENGINE_LABELS[engine] ?? "절차형 브러시";
  const provider = classicProvider(item, engine, variant);
  const stages: StudioBrushEngineStage[] = [
    Object.freeze({ role: "carrier", roleLabel: ROLE_LABELS.carrier, id: engine, label: engineFamilyLabel, provider }),
  ];
  if (semantic) {
    stages.push(
      Object.freeze({ role: "tip", roleLabel: ROLE_LABELS.tip, id: semantic.tip, label: semantic.tipLabelKo, provider }),
      Object.freeze({ role: "surface", roleLabel: ROLE_LABELS.surface, id: semantic.texture, label: semantic.textureLabelKo, provider }),
      Object.freeze({ role: "motion", roleLabel: ROLE_LABELS.motion, id: semantic.dynamics, label: semantic.dynamicsLabelKo, provider }),
    );
  }
  const traits = unique([
    semantic?.tipLabelKo,
    semantic?.texture !== "none" ? semantic?.textureLabelKo : null,
    semantic?.dynamicsLabelKo,
    lane?.distinctness === "engine-variant" ? "독립 엔진 변형" : null,
    item.previewStyle === "calligraphy" ? "방향성 획" : null,
    item.previewStyle === "soft" ? "부드러운 가장자리" : null,
    item.previewStyle === "texture" ? "표면 질감" : null,
    item.previewStyle === "dots" ? "입자 산란" : null,
    item.previewStyle === "tone" ? "반복 톤" : null,
  ]).slice(0, 5);
  const engineSummary = semantic
    ? `${engineFamilyLabel} → ${semantic.tipLabelKo} → ${semantic.textureLabelKo} · ${semantic.dynamicsLabelKo}`
    : `${engineFamilyLabel} → ${item.hint}`;
  const authoredWidth = descriptor?.authoredWidth ?? item.defaultWidth;
  const engineStages = Object.freeze(stages);
  return Object.freeze({
    engineFamilyId: `classic-${lane?.lane ?? engine}`,
    engineFamilyLabel,
    engineSummary,
    engineStages,
    traits: Object.freeze([...traits]),
    behaviorSummary: item.hint,
    size: actualSizeProfile(item, authoredWidth),
    searchTerms: unique([
      engineFamilyLabel, engine, variant, provider, engineSummary, ...traits,
      ...engineStages.flatMap((stage) => [stage.id, stage.label, stage.provider, stage.roleLabel]),
    ]),
  });
}

/** Lightweight cached product metadata used by search, tiles and the focused-brush inspector. */
export function studioBrushProductProfile(item: ProductProfileItem): StudioBrushProductProfile {
  const cacheKey = `${item.id}\u0000${item.name}\u0000${item.defaultWidth}`;
  const cached = PROFILE_CACHE.get(cacheKey);
  if (cached) return cached;
  const recipeId = studioV6RecipeIdFromCatalogId(item.id);
  const seed = recipeId ? V6_SEED_BY_ID.get(recipeId) : undefined;
  const profile = seed ? makeV6Profile(item, seed) : makeClassicProfile(item);
  PROFILE_CACHE.set(cacheKey, profile);
  return profile;
}

export function studioBrushProductProfileSearchTerms(item: ProductProfileItem): readonly string[] {
  return studioBrushProductProfile(item).searchTerms;
}

export function listStudioBrushEngineFamilyOptions(
  items: readonly ProductProfileItem[],
): readonly StudioBrushEngineFamilyOption[] {
  const families = new Map<string, { label: string; count: number }>();
  for (const item of items) {
    const profile = studioBrushProductProfile(item);
    const current = families.get(profile.engineFamilyId);
    families.set(profile.engineFamilyId, {
      label: profile.engineFamilyLabel,
      count: (current?.count ?? 0) + 1,
    });
  }
  return Object.freeze(
    [...families.entries()]
      .map(([id, value]) => Object.freeze({ id, ...value }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "ko-KR")),
  );
}
