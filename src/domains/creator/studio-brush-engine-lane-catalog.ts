/**
 * Engine-lane brush shelf — same medium, distinct product engines.
 * Id: `{base}--{lane}` e.g. oil--filbert-ribbon, watercolor--granular.
 */
export const STUDIO_BRUSH_ENGINE_LANE_CATALOG_VERSION =
  "studio-brush-engine-lane-catalog-v1" as const;

export type StudioBrushEngineLaneId =
  | "causal-ink"
  | "perfect-outline"
  | "oil-ribbon"
  | "oil-extrude"
  | "wet-dabs"
  | "wet-stamp"
  | "dry-dynamic"
  | "spray-dynamic"
  | "spray-stamp"
  | "particle-fx"
  | "angled-ribbon"
  | "pencil-path"
  | "stamp-tone";

export interface StudioBrushEngineLaneCatalogRow {
  readonly id: string;
  readonly name: string;
  readonly baseId: string;
  readonly lane: StudioBrushEngineLaneId;
  readonly defaultWidth: number;
  readonly defaultOpacity: number;
  readonly searchAliases: readonly string[];
  readonly family: string;
  readonly engine: string;
  readonly engineVariant: string;
  readonly canonicalId: string;
  readonly preview: string;
  readonly tip: string;
  readonly texture: string;
  readonly dynamics: string;
  readonly distinctness: "unique" | "profile-variant" | "engine-variant";
}

export interface StudioBrushEngineLaneWatercolorMaterial {
  readonly spacingRatio: number;
  readonly coreRadiusScale: number;
  readonly coreOpacityScale: number;
  readonly diffuseRadiusScale: number;
  readonly diffuseOpacityScale: number;
}

export interface StudioBrushEngineLaneStampTuning {
  readonly spacingRatio: number;
  readonly flow: number;
  readonly hardness: number;
  readonly minSizeRatio: number;
  readonly sizeScale: number;
}

type Row = StudioBrushEngineLaneCatalogRow;

function r(
  id: string,
  name: string,
  baseId: string,
  lane: StudioBrushEngineLaneId,
  w: number,
  o: number,
  aliases: readonly string[],
  family: string,
  engine: string,
  engineVariant: string,
  canonicalId: string,
  preview: string,
  tip: string,
  texture: string,
  dynamics: string,
  distinctness: Row["distinctness"],
): Row {
  return Object.freeze({
    id, name, baseId, lane, defaultWidth: w, defaultOpacity: o,
    searchAliases: Object.freeze([...aliases]),
    family, engine, engineVariant, canonicalId, preview, tip, texture, dynamics, distinctness,
  });
}

export const STUDIO_BRUSH_ENGINE_LANE_CATALOG_ROWS: readonly StudioBrushEngineLaneCatalogRow[] =
  Object.freeze([
    r("oil--filbert-ribbon", "유화 · 필버트 리본", "oil", "oil-ribbon", 26, 0.93, ["필버트 유화", "oil filbert"], "oil", "oil-ribbon", "filbert-lanes", "oil", "oil", "bristle", "procedural-bristle", "bristle-pressure", "engine-variant"),
    r("oil--flat-ribbon", "유화 · 플랫 리본", "oil", "oil-ribbon", 28, 0.94, ["플랫 유화", "oil flat"], "oil", "oil-ribbon", "flat-lanes", "oil", "oil", "hard", "procedural-bristle", "bristle-pressure", "engine-variant"),
    r("oil--impasto-ribbon", "유화 · 임파스토 리본", "oil", "oil-ribbon", 30, 0.97, ["임파스토 유화"], "oil", "oil-ribbon", "impasto-lanes", "oil", "oil", "bristle", "procedural-bristle", "bristle-pressure", "engine-variant"),
    r("oil--tube-extrude", "유화 · 튜브 릴리프", "oil", "oil-extrude", 32, 0.96, ["튜브 유화"], "oil", "dynamic-dabs", "extruded-bead-ribbon", "paint-tube", "oil", "hard", "procedural-bristle", "mapped-dabs", "profile-variant"),
    r("oil--knife-edge", "유화 · 팔레트 나이프", "oil", "oil-extrude", 34, 0.98, ["팔레트 나이프"], "oil", "dynamic-dabs", "palette-knife-blade", "paint-tube", "oil", "hard", "none", "mapped-dabs", "engine-variant"),
    r("acrylic--stiff-ribbon", "아크릴 · 경질 리본", "acrylic", "oil-ribbon", 22, 0.96, ["경질 아크릴"], "oil", "oil-ribbon", "acrylic-stiff-lanes", "oil", "oil", "hard", "procedural-bristle", "bristle-pressure", "engine-variant"),
    r("acrylic--polymer-flat", "아크릴 · 폴리머 평면", "acrylic", "oil-extrude", 24, 0.95, ["아크릴 평붓"], "oil", "dynamic-dabs", "acrylic-polymer-flat", "paint-tube", "oil", "hard", "none", "mapped-dabs", "engine-variant"),
    r("watercolor--granular", "수채 · 과립 번짐", "watercolor", "wet-dabs", 30, 0.52, ["과립 수채"], "watercolor", "watercolor-dabs", "granular", "watercolor", "soft", "sponge", "procedural-grain", "watercolor-pressure", "engine-variant"),
    r("watercolor--dense-core", "수채 · 농밀 코어", "watercolor", "wet-dabs", 26, 0.62, ["농밀 수채"], "watercolor", "watercolor-dabs", "dense-core", "watercolor", "soft", "bristle", "wet-edge", "watercolor-pressure", "engine-variant"),
    r("watercolor--edge-stamp", "수채 · 웻엣지 스탬프", "watercolor", "wet-stamp", 28, 0.58, ["웻엣지 수채"], "stamp", "stamp-dabs", "watercolor", "wash-brush", "soft", "stamp-wet-edge", "wet-edge", "stamp-pressure-flow", "profile-variant"),
    r("ink-wash--sumi-core", "수묵 · 농묵 코어", "ink-wash", "wet-dabs", 28, 0.72, ["농묵"], "watercolor", "watercolor-dabs", "sumi-dense", "watercolor", "soft", "bristle", "wet-edge", "watercolor-pressure", "engine-variant"),
    r("ink-wash--bleed-halo", "수묵 · 번짐 후광", "ink-wash", "wet-dabs", 36, 0.48, ["수묵 번짐"], "watercolor", "watercolor-dabs", "bleed-halo", "watercolor", "soft", "soft-diffuse", "soft-gradient", "watercolor-pressure", "engine-variant"),
    r("gouache--matte-body", "과슈 · 매트 바디", "gouache", "wet-dabs", 24, 0.92, ["매트 과슈"], "watercolor", "watercolor-dabs", "matte-body", "watercolor", "soft", "hard", "none", "watercolor-pressure", "engine-variant"),
    r("gouache--flat-stamp", "과슈 · 평면 스탬프", "gouache", "wet-stamp", 26, 0.9, ["과슈 스탬프"], "stamp", "stamp-dabs", "ink", "ink-brush", "solid", "stamp-ink", "none", "stamp-pressure-flow", "profile-variant"),
    r("charcoal--vine-soft", "목탄 · 바인 소프트", "charcoal", "dry-dynamic", 14, 0.7, ["바인 목탄"], "dry-media", "dynamic-dabs", "charcoal-vine", "dry-media", "texture", "sponge", "custom-alpha-capable", "mapped-dabs", "engine-variant"),
    r("charcoal--compressed-edge", "목탄 · 압축 모서리", "charcoal", "dry-dynamic", 12, 0.88, ["압축 목탄"], "dry-media", "dynamic-dabs", "charcoal-compressed", "dry-media", "texture", "hard", "custom-alpha-capable", "mapped-dabs", "engine-variant"),
    r("crayon--wax-scrape", "크레용 · 왁스 스크레이프", "crayon", "dry-dynamic", 16, 0.9, ["왁스 크레용"], "dry-media", "dynamic-dabs", "crayon-wax-scrape", "dry-media", "texture", "hard", "custom-alpha-capable", "mapped-dabs", "engine-variant"),
    r("chalk--klecks-powder", "초크 · 클레크스 가루", "chalk", "dry-dynamic", 18, 0.78, ["클레크스 초크"], "dry-media", "dynamic-dabs", "chalk-klecks", "dry-media", "texture", "sponge", "custom-alpha-capable", "mapped-dabs", "engine-variant"),
    r("pastel--cake-soft", "파스텔 · 케이크 소프트", "pastel", "dry-dynamic", 22, 0.7, ["소프트 파스텔"], "pastel", "dynamic-dabs", "pastel-cake", "pastel", "soft", "sponge", "custom-alpha-capable", "mapped-dabs", "engine-variant"),
    r("oil-pastel--waxy-film", "오일파스텔 · 왁스 필름", "oil-pastel", "dry-dynamic", 20, 0.88, ["오일 파스텔 필름"], "pastel", "dynamic-dabs", "oil-pastel-film", "pastel", "soft", "bristle", "custom-alpha-capable", "mapped-dabs", "engine-variant"),
    r("pencil--side-shade", "연필 · 측면 음영", "pencil", "pencil-path", 10, 0.68, ["측면 연필"], "pencil", "pencil-path", "side-shade", "pencil", "dashed", "grain", "procedural-grain", "grain-jitter", "engine-variant"),
    r("pencil--stamp-grain", "연필 · 그레인 스탬프", "pencil", "spray-stamp", 5, 0.9, ["그레인 연필 스탬프"], "stamp", "stamp-dabs", "pencil", "pencil-grain", "texture", "stamp-pencil", "procedural-grain", "stamp-pressure-flow", "profile-variant"),
    r("pencil--erodible-wear", "연필 · 마모 심", "pencil", "dry-dynamic", 8, 0.84, ["마모 연필 레인"], "pencil", "dynamic-dabs", "progressive-wear-ribbon", "erodible-pencil", "texture", "grain", "procedural-grain", "mapped-dabs", "profile-variant"),
    r("airbrush--klecks-grit", "에어브러시 · 클레크스 그릿", "airbrush", "spray-dynamic", 36, 0.66, ["클레크스 에어"], "airbrush", "dynamic-dabs", "airbrush-klecks-grit", "airbrush", "soft", "soft-particle", "custom-alpha-capable", "mapped-dabs", "engine-variant"),
    r("airbrush--hard-envelope", "에어브러시 · 하드 엔벨로프", "airbrush", "spray-dynamic", 30, 0.78, ["하드 에어 레인"], "airbrush", "dynamic-dabs", "connected-hard-envelope", "hard-airbrush", "solid", "hard", "none", "mapped-dabs", "profile-variant"),
    r("airbrush--stamp-soft", "에어브러시 · 소프트 스탬프", "airbrush", "spray-stamp", 34, 0.8, ["소프트 스탬프 에어"], "stamp", "stamp-dabs", "airbrush", "airbrush-fine", "soft", "stamp-airbrush", "soft-gradient", "stamp-pressure-flow", "profile-variant"),
    r("spray--equal-area", "스프레이 · 등면적 산란", "spray", "spray-dynamic", 44, 0.52, ["등면적 스프레이"], "airbrush", "dynamic-dabs", "spray-equal-area", "airbrush", "dots", "flake", "custom-alpha-capable", "mapped-dabs", "engine-variant"),
    r("splatter--burst-cloud", "스플래터 · 버스트 클라우드", "splatter", "spray-dynamic", 48, 0.68, ["버스트 스플래터"], "airbrush", "dynamic-dabs", "splatter-burst", "airbrush", "dots", "flake", "custom-alpha-capable", "mapped-dabs", "engine-variant"),
    r("pen--perfect-taper", "펜 · 퍼펙트 테이퍼", "pen", "perfect-outline", 8, 1, ["퍼펙트 펜"], "perfect", "perfect-outline", "ink-taper", "perfect-ink", "calligraphy", "pressure-round", "none", "outline-pressure", "profile-variant"),
    r("gpen--causal-round", "G펜 · 연속 원형", "gpen", "causal-ink", 7, 1, ["연속 G펜"], "pen", "causal-ink", "round", "pen", "solid", "round", "none", "causal-pressure", "profile-variant"),
    r("calligraphy--perfect-chisel", "캘리 · 퍼펙트 치즐", "calligraphy", "perfect-outline", 14, 0.98, ["퍼펙트 캘리"], "perfect", "perfect-outline", "marker-flat", "perfect-marker", "solid", "round", "none", "outline-pressure", "profile-variant"),
    r("marker--chisel-ribbon", "마커 · 치즐 리본", "marker", "angled-ribbon", 18, 0.7, ["치즐 마커"], "brush", "angled-ribbon", "minus-30deg", "brush", "wavy", "angled-ribbon", "none", "ribbon-pressure", "profile-variant"),
    r("marker--soft-dynamic", "마커 · 소프트 다이나믹", "marker", "spray-dynamic", 20, 0.58, ["소프트 마커 레인"], "airbrush", "dynamic-dabs", "soft-brush", "airbrush", "soft", "round", "custom-alpha-capable", "mapped-dabs", "engine-variant"),
    r("brush--oil-lanes", "붓 · 오일 레인 강모", "brush", "oil-ribbon", 16, 0.94, ["강모 붓 리본"], "oil", "oil-ribbon", "bristle-lanes", "oil", "oil", "bristle", "procedural-bristle", "bristle-pressure", "profile-variant"),
    r("brush--dry-rake", "붓 · 드라이 갈퀴", "brush", "dry-dynamic", 18, 0.82, ["드라이 갈퀴 붓"], "dry-media", "dynamic-dabs", "brush-dry-rake", "dry-media", "texture", "bristle", "custom-alpha-capable", "mapped-dabs", "engine-variant"),
    r("glitter--star-field", "글리터 · 스타필드", "glitter", "particle-fx", 28, 0.92, ["스타필드 글리터"], "glitter", "particle-scatter", "star-dust", "glitter", "glitter", "spark", "procedural-spark", "seeded-particles", "engine-variant"),
    r("screentone--sparse-grid", "스크린톤 · 성긴 격자", "screentone", "stamp-tone", 24, 0.88, ["성긴 스크린톤"], "screentone", "screentone-dots", "sparse-grid", "screentone", "tone", "tone-dot", "tone-grid", "global-grid", "engine-variant"),
    r("ink-particle--scatter-cloud", "잉크입자 · 산란 구름", "ink-particle", "spray-dynamic", 20, 0.85, ["산란 잉크입자"], "ink-particle", "dynamic-dabs", "ink-scatter-cloud", "ink-particle", "dots", "flake", "custom-alpha-capable", "mapped-dabs", "engine-variant"),
  ]);

const LANE_ID_RE = /^([a-z0-9-]+)--([a-z0-9-]+)$/u;

export function isStudioBrushEngineLaneId(brushId: string): boolean {
  return LANE_ID_RE.test(brushId);
}

export function resolveStudioBrushEngineLaneBaseId(
  brushId: string | null | undefined,
): string | null {
  if (!brushId) return null;
  return LANE_ID_RE.exec(brushId.trim().toLowerCase())?.[1] ?? null;
}

export function listStudioBrushEngineLaneIds(): readonly string[] {
  return Object.freeze(STUDIO_BRUSH_ENGINE_LANE_CATALOG_ROWS.map((row) => row.id));
}

export function studioBrushEngineLaneRowById(
  brushId: string | null | undefined,
): StudioBrushEngineLaneCatalogRow | null {
  if (!brushId) return null;
  return STUDIO_BRUSH_ENGINE_LANE_CATALOG_ROWS.find((row) => row.id === brushId) ?? null;
}

export function listStudioBrushEngineLanePresets(): readonly {
  id: string;
  name: string;
  defaultWidth: number;
  defaultOpacity: number;
  searchAliases: readonly string[];
}[] {
  return Object.freeze(
    STUDIO_BRUSH_ENGINE_LANE_CATALOG_ROWS.map((row) =>
      Object.freeze({
        id: row.id,
        name: row.name,
        defaultWidth: row.defaultWidth,
        defaultOpacity: row.defaultOpacity,
        searchAliases: row.searchAliases,
      }),
    ),
  );
}

export function studioBrushEngineLaneDiameterScale(
  brushId: string | null | undefined,
): number | null {
  if (!brushId || !isStudioBrushEngineLaneId(brushId)) return null;
  let hash = 2166136261;
  for (let i = 0; i < brushId.length; i++) {
    hash ^= brushId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 0.84 + (((hash >>> 0) % 10_000) / 10_000) * 0.52;
}

export function resolveStudioBrushEngineLaneDynamicsPresetId(
  brushId: string | null | undefined,
): "ink-particle" | "airbrush" | "dry-media" | null {
  const row = studioBrushEngineLaneRowById(brushId);
  if (!row || row.engine !== "dynamic-dabs") return null;
  const v = row.engineVariant;
  if (
    v.includes("airbrush") || v.includes("spray") || v.includes("splatter")
    || v === "soft-brush" || v === "connected-hard-envelope"
  ) return "airbrush";
  if (
    v.includes("charcoal") || v.includes("crayon") || v.includes("chalk")
    || v.includes("pastel") || v.includes("dry") || v === "brush-dry-rake"
  ) return "dry-media";
  return "ink-particle";
}

const ENGINE_LANE_WATERCOLOR_MATERIAL: Readonly<
  Record<string, StudioBrushEngineLaneWatercolorMaterial>
> = Object.freeze({
  "watercolor--granular": Object.freeze({
    spacingRatio: 0.28, coreRadiusScale: 0.62, coreOpacityScale: 1.15,
    diffuseRadiusScale: 1.95, diffuseOpacityScale: 0.42,
  }),
  "watercolor--dense-core": Object.freeze({
    spacingRatio: 0.16, coreRadiusScale: 0.95, coreOpacityScale: 1.85,
    diffuseRadiusScale: 1.15, diffuseOpacityScale: 0.38,
  }),
  "ink-wash--sumi-core": Object.freeze({
    spacingRatio: 0.14, coreRadiusScale: 0.88, coreOpacityScale: 2.05,
    diffuseRadiusScale: 1.25, diffuseOpacityScale: 0.4,
  }),
  "ink-wash--bleed-halo": Object.freeze({
    spacingRatio: 0.24, coreRadiusScale: 0.55, coreOpacityScale: 1.2,
    diffuseRadiusScale: 2.15, diffuseOpacityScale: 0.48,
  }),
  "gouache--matte-body": Object.freeze({
    spacingRatio: 0.2, coreRadiusScale: 1.05, coreOpacityScale: 1.65,
    diffuseRadiusScale: 0.9, diffuseOpacityScale: 0.22,
  }),
});

const ENGINE_LANE_STAMP_TUNING: Readonly<
  Record<string, StudioBrushEngineLaneStampTuning>
> = Object.freeze({
  "watercolor--edge-stamp": Object.freeze({
    spacingRatio: 0.055, flow: 0.18, hardness: 0.18, minSizeRatio: 0.48, sizeScale: 1.12,
  }),
  "gouache--flat-stamp": Object.freeze({
    spacingRatio: 0.22, flow: 0.92, hardness: 0.95, minSizeRatio: 0.12, sizeScale: 1.05,
  }),
  "airbrush--stamp-soft": Object.freeze({
    spacingRatio: 0.08, flow: 0.11, hardness: 0.04, minSizeRatio: 0.78, sizeScale: 1.18,
  }),
  "pencil--stamp-grain": Object.freeze({
    spacingRatio: 0.17, flow: 0.48, hardness: 0.72, minSizeRatio: 0.28, sizeScale: 0.92,
  }),
});

const ENGINE_LANE_LABEL_KO: Readonly<Record<StudioBrushEngineLaneId, string>> = Object.freeze({
  "causal-ink": "연속 잉크",
  "perfect-outline": "퍼펙트 아웃라인",
  "oil-ribbon": "오일 리본",
  "oil-extrude": "튜브·나이프",
  "wet-dabs": "웻 다브",
  "wet-stamp": "웻 스탬프",
  "dry-dynamic": "드라이 다이나믹",
  "spray-dynamic": "스프레이 다이나믹",
  "spray-stamp": "소프트 스탬프",
  "particle-fx": "파티클 FX",
  "angled-ribbon": "각진 리본",
  "pencil-path": "연필 패스",
  "stamp-tone": "톤 스탬프",
});

export function resolveStudioBrushEngineLaneWatercolorMaterial(
  brushId: string | null | undefined,
): StudioBrushEngineLaneWatercolorMaterial | null {
  if (!brushId) return null;
  return ENGINE_LANE_WATERCOLOR_MATERIAL[brushId] ?? null;
}

export function resolveStudioBrushEngineLaneStampTuning(
  brushId: string | null | undefined,
): StudioBrushEngineLaneStampTuning | null {
  if (!brushId) return null;
  return ENGINE_LANE_STAMP_TUNING[brushId] ?? null;
}

export function resolveStudioBrushEngineLaneLabelKo(
  brushId: string | null | undefined,
): string | null {
  const row = studioBrushEngineLaneRowById(brushId);
  return row ? (ENGINE_LANE_LABEL_KO[row.lane] ?? row.lane) : null;
}
