from pathlib import Path
import shutil


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text(encoding="utf-8")
    if new and new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one patch anchor, found {count}")
    file.write_text(text.replace(old, new, 1), encoding="utf-8")


stack = "src/domains/creator/studio-adjustment-stack.ts"
replace_once(
    stack,
    'import type { InkWash } from "./brush/studio-ink-wash";\n',
    '''import type { InkWash } from "./brush/studio-ink-wash";
import {
  STUDIO_FILTER_PACK_LABELS,
  STUDIO_FILTER_UNION_WAVE_KINDS,
  type StudioFilterUnionWaveKind,
} from "./filter/studio-filter-pack-registry";
import type { StudioFilterUnionWave } from "./filter/studio-filter-union-wave";
''',
)
replace_once(
    stack,
    '''  "retro-film",
  "watercolor",
  "diffuse-glow",
] as const;''',
    '''  "retro-film",
  "watercolor",
  "diffuse-glow",
  /** Deterministic geometry, material, print and light filters shared with the full Filter Gallery. */
  ...STUDIO_FILTER_UNION_WAVE_KINDS,
] as const;''',
)
replace_once(
    stack,
    '''export type StudioAdjustmentEngineId = (typeof STUDIO_ADJUSTMENT_ENGINE_IDS)[number];

/** Every recognized engine is discoverable; legacy stacks and the add catalog cannot drift. */''',
    '''export type StudioAdjustmentEngineId = (typeof STUDIO_ADJUSTMENT_ENGINE_IDS)[number];

const STUDIO_ADJUSTMENT_UNION_WAVE_ENGINE_SET = new Set<string>(
  STUDIO_FILTER_UNION_WAVE_KINDS,
);

function isStudioAdjustmentUnionWaveEngine(
  engine: StudioAdjustmentEngineId,
): engine is StudioFilterUnionWaveKind {
  return STUDIO_ADJUSTMENT_UNION_WAVE_ENGINE_SET.has(engine);
}

const STUDIO_ADJUSTMENT_UNION_WAVE_DEFAULT_PARAMS: Readonly<
  Record<StudioFilterUnionWaveKind, Readonly<Record<string, number | string | boolean>>>
> = Object.freeze({
  "wave-warp": { amount: 42, scale: 28, detail: 50, seed: 1_337, centerX: 50, centerY: 50, angle: 0, interpolation: "bilinear" },
  "ripple-warp": { amount: 38, scale: 22, detail: 50, seed: 1_337, centerX: 50, centerY: 50, angle: 0, interpolation: "bilinear" },
  fisheye: { amount: 52, scale: 24, detail: 50, seed: 1_337, centerX: 50, centerY: 50, angle: 0, interpolation: "bilinear" },
  twirl: { amount: 46, scale: 24, detail: 50, seed: 1_337, centerX: 50, centerY: 50, angle: 0, interpolation: "bilinear" },
  "pinch-bloat": { amount: 44, scale: 24, detail: 50, seed: 1_337, centerX: 50, centerY: 50, angle: 0, interpolation: "bilinear" },
  "lens-distortion": { amount: 34, scale: 100, detail: 50, seed: 1_337, centerX: 50, centerY: 50, angle: 0, interpolation: "bilinear" },
  "film-grain-pro": { amount: 34, scale: 1, detail: 50, seed: 1_337, centerX: 50, centerY: 50, angle: 0 },
  "salt-pepper": { amount: 22, scale: 24, detail: 50, seed: 7_331, centerX: 50, centerY: 50, angle: 0 },
  "rgb-noise": { amount: 30, scale: 1, detail: 50, seed: 2_048, centerX: 50, centerY: 50, angle: 0 },
  "perlin-texture": { amount: 42, scale: 32, detail: 153, seed: 404, centerX: 50, centerY: 50, angle: 0 },
  pointillize: { amount: 86, scale: 9, detail: 50, seed: 1_886, centerX: 50, centerY: 50, angle: 0 },
  "stained-glass": { amount: 88, scale: 12, detail: 96, seed: 1_440, centerX: 50, centerY: 50, angle: 0 },
  "poster-edges": { amount: 82, scale: 6, detail: 92, seed: 1_337, centerX: 50, centerY: 50, angle: 0 },
  photocopy: { amount: 94, scale: 2, detail: 148, seed: 1_337, centerX: 50, centerY: 50, angle: 0 },
  "normal-map": { amount: 100, scale: 1, detail: 110, seed: 1_337, centerX: 50, centerY: 50, angle: 0 },
  "god-rays": { amount: 68, scale: 7, detail: 152, seed: 1_337, centerX: 28, centerY: 20, angle: 0 },
  "polar-coordinates": { amount: 100, scale: 24, detail: 50, seed: 1_337, centerX: 50, centerY: 50, angle: 0, mode: "rectangular-to-polar", interpolation: "bilinear" },
});

/** Every recognized engine is discoverable; legacy stacks and the add catalog cannot drift. */''',
)
replace_once(
    stack,
    '''): Record<string, number | string | boolean> {
  switch (engine) {''',
    '''): Record<string, number | string | boolean> {
  if (isStudioAdjustmentUnionWaveEngine(engine)) {
    return { ...STUDIO_ADJUSTMENT_UNION_WAVE_DEFAULT_PARAMS[engine] };
  }
  switch (engine) {''',
)
replace_once(
    stack,
    '''export function studioAdjustmentEngineLabel(engine: StudioAdjustmentEngineId): string {
  switch (engine) {''',
    '''export function studioAdjustmentEngineLabel(engine: StudioAdjustmentEngineId): string {
  if (isStudioAdjustmentUnionWaveEngine(engine)) {
    return STUDIO_FILTER_PACK_LABELS[engine];
  }
  switch (engine) {''',
)
replace_once(stack, "  detail?: Detail;\n};", "  detail?: Detail;\n  filterUnionWave?: StudioFilterUnionWave;\n};")
replace_once(
    stack,
    '''  const out: StudioAdjustmentEntryFilterFields = {};
  const p = entry.params;
  switch (entry.engine) {''',
    '''  const out: StudioAdjustmentEntryFilterFields = {};
  const p = entry.params;
  if (isStudioAdjustmentUnionWaveEngine(entry.engine)) {
    const defaults = STUDIO_ADJUSTMENT_UNION_WAVE_DEFAULT_PARAMS[entry.engine];
    const number = (
      key: "amount" | "scale" | "detail" | "seed" | "centerX" | "centerY" | "angle",
      fallback: number,
      min: number,
      max: number,
    ) => Math.min(max, Math.max(min, finiteNumber(p[key], fallback)));
    out.filterUnionWave = {
      kind: entry.engine,
      amount: number("amount", Number(defaults.amount), -100, 100),
      scale: number("scale", Number(defaults.scale), 1, 200),
      detail: number("detail", Number(defaults.detail), 0, 255),
      seed: Math.round(number("seed", Number(defaults.seed), 0, 9_999)),
      centerX: number("centerX", Number(defaults.centerX), 0, 100),
      centerY: number("centerY", Number(defaults.centerY), 0, 100),
      angle: number("angle", Number(defaults.angle), -180, 180),
      mode: p.mode === "polar-to-rectangular"
        ? "polar-to-rectangular"
        : "rectangular-to-polar",
      interpolation: p.interpolation === "nearest" ? "nearest" : "bilinear",
    };
    return out;
  }
  switch (entry.engine) {''',
)

stack_test = "src/domains/creator/studio-adjustment-stack.test.ts"
replace_once(
    stack_test,
    'import { describe, expect, it } from "vitest";\n\n',
    'import { describe, expect, it } from "vitest";\n\nimport { STUDIO_FILTER_UNION_WAVE_KINDS } from "./filter/studio-filter-pack-registry";\n\n',
)
replace_once(
    stack_test,
    '''      "retro-film",
      "watercolor",
      "diffuse-glow",
    ]));
  });''',
    '''      "retro-film",
      "watercolor",
      "diffuse-glow",
      ...STUDIO_FILTER_UNION_WAVE_KINDS,
    ]));
    expect(STUDIO_ADJUSTMENT_ENGINE_IDS).toHaveLength(77);
  });

  it("projects every Filter Gallery union engine into an editable non-destructive operation", () => {
    for (const engine of STUDIO_FILTER_UNION_WAVE_KINDS) {
      const params = studioAdjustmentDefaultParams(engine);
      const fields = studioAdjustmentOperationToFilterFields({
        id: `union-${engine}`,
        engine,
        enabled: true,
        params,
      });
      expect(fields.filterUnionWave).toMatchObject({
        kind: engine,
        amount: params.amount,
      });
      expect(fields.filterUnionWave?.amount).not.toBe(0);
    }
  });

  it("clamps union-wave geometry and preserves polar mode and interpolation", () => {
    expect(studioAdjustmentOperationToFilterFields({
      id: "fisheye-clamped",
      engine: "fisheye",
      enabled: true,
      params: { amount: 999, centerX: -20, centerY: 180, interpolation: "nearest" },
    }).filterUnionWave).toMatchObject({
      kind: "fisheye",
      amount: 100,
      centerX: 0,
      centerY: 100,
      interpolation: "nearest",
    });

    expect(studioAdjustmentOperationToFilterFields({
      id: "polar-reverse",
      engine: "polar-coordinates",
      enabled: true,
      params: { amount: 75, mode: "polar-to-rectangular", interpolation: "nearest" },
    }).filterUnionWave).toMatchObject({
      kind: "polar-coordinates",
      amount: 75,
      mode: "polar-to-rectangular",
      interpolation: "nearest",
    });
  });''',
)

catalog_test = "src/domains/creator/filter/studio-filter-catalog.test.ts"
replace_once(catalog_test, 'import { STUDIO_FILTER_UNION_WAVE_KINDS } from "./studio-filter-union-wave";\n', "")
replace_once(
    catalog_test,
    '''    expect([...catalogIds].sort()).toEqual(
      [...STUDIO_ADJUSTMENT_ENGINE_IDS, ...STUDIO_FILTER_UNION_WAVE_KINDS].sort(),
    );''',
    '''    expect([...catalogIds].sort()).toEqual([...STUDIO_ADJUSTMENT_ENGINE_IDS].sort());''',
)
replace_once(
    catalog_test,
    'it("covers every smart-filter engine and the deterministic union wave exactly once", () => {',
    'it("covers every smart-filter engine exactly once", () => {',
)

quality = "src/domains/creator/filter/studio-filter-catalog-output-quality.test.ts"
replace_once(
    quality,
    '''import {
  STUDIO_FILTER_PACK_DEFS,
  studioFilterPackValuesToPatch,
} from "./studio-filter-pack";''',
    '''import { STUDIO_FILTER_PACK_DEFS } from "./studio-filter-pack";''',
)
replace_once(
    quality,
    '''import {
  STUDIO_FILTER_UNION_WAVE_KINDS,
  type StudioFilterUnionWaveKind,
} from "./studio-filter-union-wave";''',
    '''import { STUDIO_FILTER_UNION_WAVE_KINDS } from "./studio-filter-union-wave";''',
)
replace_once(
    quality,
    "type CatalogEngineId = StudioAdjustmentEngineId | StudioFilterUnionWaveKind;",
    "type CatalogEngineId = StudioAdjustmentEngineId;",
)
replace_once(
    quality,
    '''function fieldsFor(
  engine: CatalogEngineId,
  stage: QualityStage,
): ImageFilterFields {
  if (STUDIO_ADJUSTMENT_ENGINE_IDS.includes(engine as StudioAdjustmentEngineId)) {
    const adjustmentEngine = engine as StudioAdjustmentEngineId;
    const monotonic = MONOTONIC_ADJUSTMENT_PARAMS[adjustmentEngine];
    const params = stage === "default"
      ? studioAdjustmentDefaultParams(adjustmentEngine)
      : stage === "low" && monotonic
        ? monotonic.low
        : stage === "high" && monotonic
          ? monotonic.high
          : effectiveAdjustmentParams(adjustmentEngine);
    return studioAdjustmentOperationToFilterFields({
      id: `quality-${adjustmentEngine}-${stage}`,
      engine: adjustmentEngine,
      enabled: true,
      params: { ...params },
    });
  }
  const unionEngine = engine as StudioFilterUnionWaveKind;
  const values: Record<string, number> = {};
  if (stage === "low") values.amount = 20;
  else if (stage === "high") values.amount = 80;
  if (unionEngine === "god-rays") values.detail = 20;
  return studioFilterPackValuesToPatch(unionEngine, values);
}''',
    '''function fieldsFor(
  engine: CatalogEngineId,
  stage: QualityStage,
): ImageFilterFields {
  const monotonic = MONOTONIC_ADJUSTMENT_PARAMS[engine];
  let params: Readonly<Record<string, number | string | boolean>>;
  if (stage === "default") {
    params = studioAdjustmentDefaultParams(engine);
  } else if (stage === "low" && monotonic) {
    params = monotonic.low;
  } else if (stage === "high" && monotonic) {
    params = monotonic.high;
  } else if (STUDIO_FILTER_UNION_WAVE_KINDS.some((candidate) => candidate === engine)) {
    params = {
      ...studioAdjustmentDefaultParams(engine),
      ...(stage === "low" ? { amount: 20 } : {}),
      ...(stage === "high" ? { amount: 80 } : {}),
      ...(engine === "god-rays" ? { detail: 20 } : {}),
    };
  } else {
    params = effectiveAdjustmentParams(engine);
  }
  return studioAdjustmentOperationToFilterFields({
    id: `quality-${engine}-${stage}`,
    engine,
    enabled: true,
    params: { ...params },
  });
}''',
)
replace_once(
    quality,
    '''    const executableIds = [
      ...STUDIO_ADJUSTMENT_ENGINE_IDS,
      ...STUDIO_FILTER_UNION_WAVE_KINDS,
    ];''',
    '''    const executableIds = [...STUDIO_ADJUSTMENT_ENGINE_IDS];''',
)
replace_once(
    quality,
    '''      ...NON_MONOTONIC_ADJUSTMENT_ENGINES,
    ];''',
    '''      ...NON_MONOTONIC_ADJUSTMENT_ENGINES,
      ...STUDIO_FILTER_UNION_WAVE_KINDS,
    ];''',
)
for old, new in [
    ('''    for (const engine of [
      ...STUDIO_ADJUSTMENT_ENGINE_IDS,
      ...STUDIO_FILTER_UNION_WAVE_KINDS,
    ]) {''', '''    for (const engine of STUDIO_ADJUSTMENT_ENGINE_IDS) {'''),
    ('''      for (const engine of [
        ...STUDIO_ADJUSTMENT_ENGINE_IDS,
        ...STUDIO_FILTER_UNION_WAVE_KINDS,
      ]) {''', '''      for (const engine of STUDIO_ADJUSTMENT_ENGINE_IDS) {'''),
    ('''      const outputs = [
        ...STUDIO_ADJUSTMENT_ENGINE_IDS,
        ...STUDIO_FILTER_UNION_WAVE_KINDS,
      ].map((engine) => ({''', '''      const outputs = STUDIO_ADJUSTMENT_ENGINE_IDS.map((engine) => ({'''),
]:
    file = Path(quality)
    text = file.read_text(encoding="utf-8")
    count = text.count(old)
    if count == 0:
        continue
    file.write_text(text.replace(old, new), encoding="utf-8")

panel = "src/domains/creator/StudioSmartFiltersPanel.tsx"
replace_once(
    panel,
    '''import {
  STUDIO_FILTER_GROUP_ORDER,
  searchStudioFilterCatalog,
  studioFilterCatalogEntry,
  studioFilterGroupLabel,
} from "./filter/studio-filter-catalog";
''',
    '''import {
  STUDIO_FILTER_GROUP_ORDER,
  searchStudioFilterCatalog,
  studioFilterCatalogEntry,
  studioFilterGroupLabel,
} from "./filter/studio-filter-catalog";
import { StudioSmartFilterUnionControls } from "./filter/StudioSmartFilterUnionControls";
''',
)
replace_once(
    panel,
    '''      {controls.map((spec) => (
        <NumericParameterControl
''',
    '''      <StudioSmartFilterUnionControls
        engine={entry.engine}
        params={entry.params}
        onChange={onChange}
      />
      {controls.map((spec) => (
        <NumericParameterControl
''',
)

panel_test = "src/domains/creator/StudioSmartFiltersPanel.test.tsx"
file = Path(panel_test)
text = file.read_text(encoding="utf-8")
if "사용 가능한 필터 60개" in text:
    if text.count("사용 가능한 필터 60개") != 2:
        raise SystemExit("Smart Filter panel catalog counter drifted")
    text = text.replace("사용 가능한 필터 60개", "사용 가능한 필터 77개")
    file.write_text(text, encoding="utf-8")
replace_once(
    panel_test,
    '    expect(html).toContain("색상 투명화");\n',
    '''    expect(html).toContain("색상 투명화");
    expect(html).toContain("사인 웨이브");
    expect(html).toContain("스테인드글라스");
    expect(html).toContain("볼류메트릭 광선");
    expect(html).toContain("극좌표 변환");
''',
)

staging = Path(".github/filter-upgrade-parts")
if staging.exists():
    shutil.rmtree(staging)
