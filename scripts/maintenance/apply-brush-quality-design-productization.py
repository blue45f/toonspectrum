from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    target = ROOT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one match, found {count}: {old[:120]!r}")
    write(path, content.replace(old, new, 1))


legacy_catalog_path = (
    "apps/web/src/domains/creator/brush-lab/brush-studio-v5-quality-catalog.ts"
)
legacy_catalog = read(legacy_catalog_path)
legacy_import = (
    'import type { BrushCatalogEntry } from "./brush-studio-v5-quality-types";\n'
)
if legacy_catalog.count(legacy_import) != 1:
    raise RuntimeError("V5 quality catalog import drifted")

canonical_header = '''/**
 * Canonical taxonomy for the 72 Brush Studio quality designs.
 *
 * These are user-facing design intents, not 72 independent pixel backends. Product code maps each
 * design to one installed, replay-safe catalogue brush while preserving the original name,
 * material group, signature and engine vocabulary as searchable aliases.
 */
export interface StudioBrushQualityDesign {
  readonly id: string;
  readonly group: string;
  readonly name: string;
  readonly signature: string;
  readonly engine: string;
  readonly quick: boolean;
}

'''
canonical_catalog = legacy_catalog.replace(legacy_import, canonical_header, 1)
canonical_catalog = canonical_catalog.replace(
    "BrushCatalogEntry",
    "StudioBrushQualityDesign",
)
canonical_catalog = canonical_catalog.replace(
    "BRUSH_QUALITY_CATALOG",
    "STUDIO_BRUSH_QUALITY_DESIGNS",
)
canonical_catalog = canonical_catalog.replace(
    "brushQualityCatalogGroups",
    "studioBrushQualityDesignGroups",
)
write(
    "apps/web/src/domains/creator/brush/studio-brush-quality-design-catalog.ts",
    canonical_catalog,
)

write(
    legacy_catalog_path,
    '''import {
  STUDIO_BRUSH_QUALITY_DESIGNS,
  studioBrushQualityDesignGroups,
} from "../brush/studio-brush-quality-design-catalog";

import type { BrushCatalogEntry } from "./brush-studio-v5-quality-types";

/**
 * Compatibility facade for the V5 quality workbench.
 *
 * The canonical 72-design taxonomy now lives beside the normal product brush catalogue so the
 * standard desktop and mobile brush pickers can consume the same vocabulary.
 */
export const BRUSH_QUALITY_CATALOG: readonly BrushCatalogEntry[] =
  STUDIO_BRUSH_QUALITY_DESIGNS;

export const brushQualityCatalogGroups = studioBrushQualityDesignGroups;
''',
)

write(
    "apps/web/src/domains/creator/brush/studio-brush-quality-design-bridge.ts",
    '/**\n * Product bridge for the 72 Brush Studio V5 quality designs.\n *\n * The design taxonomy is intentionally not another renderer catalogue. Every design resolves to\n * one shipped, replay-safe product brush and enriches that item with the original design name,\n * id, material group, signature and engine vocabulary. This keeps saved document identities\n * stable while making the complete design language discoverable from the normal brush library.\n */\n\nimport {\n  STUDIO_BRUSH_QUALITY_DESIGNS,\n  type StudioBrushQualityDesign,\n} from "./studio-brush-quality-design-catalog";\n\nimport type { StudioBrushCatalogItem } from "./studio-brush-catalog-core";\n\nexport const STUDIO_BRUSH_QUALITY_DESIGN_COUNT = 72 as const;\n\nexport const STUDIO_BRUSH_QUALITY_DESIGN_PRODUCT_TARGETS: Readonly<\n  Record<string, string>\n> = Object.freeze({\n  "clean-ink": "pen",\n  "mesh-ink": "perfect-ink",\n  "comic-gpen": "gpen",\n  "croquis-capsule": "perfect-ink",\n  "chisel-calligraphy": "fountain-pen",\n  "natural-ink": "ink-brush",\n  "dry-sumi": "ink-wash--fiber-feather",\n  "rough-comic": "web-rough-ink",\n  "flat-marker": "marker",\n  "chisel-marker": "perfect-marker",\n  "alcohol-bloom": "watercolor--edge-bloom",\n  "one-wash": "highlighter",\n  "graphite-line": "pencil",\n  "side-graphite": "pencil--side-shade",\n  "grain-pencil": "pencil-grain",\n  "natural-graphite": "pencil",\n  "dual-graphite": "pencil-grain",\n  "compressed-charcoal": "charcoal--compressed-edge",\n  "vine-charcoal": "charcoal--compressed-edge",\n  "hairy-charcoal": "charcoal--compressed-edge",\n  "wax-crayon": "crayon",\n  "powder-chalk": "chalk",\n  "velvet-pastel": "pastel",\n  "oil-pastel": "oil-pastel",\n  "clean-watercolor": "watercolor",\n  "granular-watercolor": "watercolor--granular",\n  "backrun": "watercolor--edge-bloom",\n  "wet-edge-stamp": "watercolor--edge-bloom",\n  "living-watercolor": "watercolor",\n  "living-ink": "inkwash-pen",\n  "water-brush": "inkwash-water-brush",\n  "loaded-water": "watercolor",\n  "dense-sumi": "ink-wash--sumi-core",\n  "fiber-sumi": "ink-wash--fiber-feather",\n  "chroma-halo": "ink-wash--chroma-halo",\n  "white-gouache": "inkwash-white-ink",\n  "dendritic": "web-multi-agent",\n  "thin-film-wash": "web-gravity-drip",\n  "matte-gouache": "gouache--matte-body",\n  "polymer-acrylic": "oil--flat-ribbon",\n  "oil-filbert": "oil--filbert-ribbon",\n  "natural-oil": "oil--filbert-ribbon",\n  "hairy-oil": "oil--filbert-ribbon",\n  "dry-fan": "brush",\n  "impasto": "oil--impasto-ribbon",\n  "tube-extrusion": "paint-tube",\n  "palette-knife": "palette-knife-edge",\n  "pigment-blender": "web-blend-softener",\n  "soft-air": "airbrush",\n  "hard-air": "hard-airbrush",\n  "grit-air": "airbrush",\n  "equal-spray": "spray",\n  "burst": "splatter",\n  "physics-splatter": "splatter",\n  "neon": "neon",\n  "glitter": "glitter",\n  "dot-tone": "screentone",\n  "line-tone": "screentone",\n  "gradient-tone": "screentone",\n  "cross-hatch": "web-cross-hatch-pen",\n  "contour-rake": "web-cross-hatch-pen",\n  "radial-burst": "web-radial-burst",\n  "fabric": "fabric-texture",\n  "brick": "web-grid-ink",\n  "foliage": "web-scatter-stamp",\n  "fur": "web-fur-strand",\n  "stitch": "web-dash-stitch",\n  "scatter": "web-scatter-stamp",\n  "swarm": "web-multi-agent",\n  "kaleido": "web-kaleido-ink",\n  "spiro": "web-spiro-orbit",\n  "rainbow": "web-rainbow-flow",\n});\n\nexport interface StudioBrushQualityDesignProjection {\n  readonly design: StudioBrushQualityDesign;\n  readonly productCatalogId: string;\n}\n\nexport function studioBrushQualityDesignProductId(\n  designId: unknown,\n): string | null {\n  return typeof designId === "string"\n    ? STUDIO_BRUSH_QUALITY_DESIGN_PRODUCT_TARGETS[designId] ?? null\n    : null;\n}\n\nexport function projectStudioBrushQualityDesigns(\n  catalogItems: readonly StudioBrushCatalogItem[],\n): readonly StudioBrushQualityDesignProjection[] {\n  const productIds = new Set(catalogItems.map((item) => item.id));\n  return Object.freeze(\n    STUDIO_BRUSH_QUALITY_DESIGNS.flatMap((design) => {\n      const productCatalogId = studioBrushQualityDesignProductId(design.id);\n      return productCatalogId && productIds.has(productCatalogId)\n        ? [Object.freeze({ design, productCatalogId })]\n        : [];\n    }),\n  );\n}\n\nexport function auditStudioBrushQualityDesignBridge(\n  catalogItems: readonly StudioBrushCatalogItem[],\n): readonly string[] {\n  const issues: string[] = [];\n  const designsById = new Map(\n    STUDIO_BRUSH_QUALITY_DESIGNS.map((design) => [design.id, design]),\n  );\n  const productsById = new Map(catalogItems.map((item) => [item.id, item]));\n\n  if (STUDIO_BRUSH_QUALITY_DESIGNS.length !== STUDIO_BRUSH_QUALITY_DESIGN_COUNT) {\n    issues.push(\n      `expected ${STUDIO_BRUSH_QUALITY_DESIGN_COUNT} quality designs, found ${STUDIO_BRUSH_QUALITY_DESIGNS.length}`,\n    );\n  }\n  if (designsById.size !== STUDIO_BRUSH_QUALITY_DESIGNS.length) {\n    issues.push("quality design ids must be unique");\n  }\n\n  for (const design of STUDIO_BRUSH_QUALITY_DESIGNS) {\n    const productCatalogId = studioBrushQualityDesignProductId(design.id);\n    if (!productCatalogId) {\n      issues.push(`${design.id} has no product brush target`);\n      continue;\n    }\n    const target = productsById.get(productCatalogId);\n    if (!target) {\n      issues.push(`${design.id} targets missing product brush ${productCatalogId}`);\n      continue;\n    }\n    if (target.operation !== "paint") {\n      issues.push(`${design.id} targets non-paint product brush ${productCatalogId}`);\n    }\n  }\n\n  for (const designId of Object.keys(STUDIO_BRUSH_QUALITY_DESIGN_PRODUCT_TARGETS)) {\n    if (!designsById.has(designId)) {\n      issues.push(`stale quality design target mapping: ${designId}`);\n    }\n  }\n\n  return Object.freeze(issues);\n}\n\nfunction designAliases(design: StudioBrushQualityDesign): readonly string[] {\n  return Object.freeze([\n    design.id,\n    design.name,\n    design.group,\n    design.signature,\n    design.engine,\n    `V5 ${design.name}`,\n    `Brush Studio ${design.name}`,\n  ]);\n}\n\nexport function attachStudioBrushQualityDesignAliases(\n  catalogItems: readonly StudioBrushCatalogItem[],\n): readonly StudioBrushCatalogItem[] {\n  const issues = auditStudioBrushQualityDesignBridge(catalogItems);\n  if (issues.length > 0) {\n    throw new Error(`Invalid Studio brush quality design bridge: ${issues.join("; ")}`);\n  }\n\n  const aliasesByProductId = new Map<string, string[]>();\n  for (const { design, productCatalogId } of projectStudioBrushQualityDesigns(catalogItems)) {\n    const aliases = aliasesByProductId.get(productCatalogId) ?? [];\n    aliases.push(...designAliases(design));\n    aliasesByProductId.set(productCatalogId, aliases);\n  }\n\n  return Object.freeze(\n    catalogItems.map((item) => {\n      const designSearchAliases = aliasesByProductId.get(item.id);\n      if (!designSearchAliases) return item;\n      const searchAliases = Object.freeze(\n        [...new Set([...(item.searchAliases ?? []), ...designSearchAliases])]\n          .filter((value) => value.trim().length > 0),\n      );\n      return Object.freeze({ ...item, searchAliases });\n    }),\n  );\n}\n',
)

catalog_path = "apps/web/src/domains/creator/brush/studio-brush-catalog.ts"
replace_once(
    catalog_path,
    '''import {
  STUDIO_BRUSH_QUALITY_PORTFOLIO,
  STUDIO_BRUSH_QUALITY_PORTFOLIO_IDS,
} from "./studio-brush-quality-portfolio";''',
    '''import { attachStudioBrushQualityDesignAliases } from "./studio-brush-quality-design-bridge";
import {
  STUDIO_BRUSH_QUALITY_PORTFOLIO,
  STUDIO_BRUSH_QUALITY_PORTFOLIO_IDS,
} from "./studio-brush-quality-portfolio";''',
)
replace_once(
    catalog_path,
    '''export const STUDIO_ALL_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] = [
  ...STUDIO_CORE_BRUSH_CATALOG_ITEMS,
  ...STUDIO_PRO_BRUSH_CATALOG_ITEMS,
];''',
    '''const STUDIO_REGISTERED_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  Object.freeze([
    ...STUDIO_CORE_BRUSH_CATALOG_ITEMS,
    ...STUDIO_PRO_BRUSH_CATALOG_ITEMS,
  ]);

/**
 * Complete product catalogue enriched with the 72 Brush Studio quality-design names.
 *
 * The bridge adds search vocabulary only: catalogue ids, renderer ids and saved-document
 * snapshots stay unchanged.
 */
export const STUDIO_ALL_BRUSH_CATALOG_ITEMS: readonly StudioBrushCatalogItem[] =
  attachStudioBrushQualityDesignAliases(STUDIO_REGISTERED_BRUSH_CATALOG_ITEMS);''',
)

selection_path = "apps/web/src/domains/creator/brush/studio-brush-selection.ts"
replace_once(
    selection_path,
    " * One fail-closed selector for the complete 234-tool catalogue.",
    " * One fail-closed selector for the complete registered product catalogue.",
)

panel_path = (
    "apps/web/src/domains/creator/brush-lab/StudioBrushLegacyCataloguePanel.tsx"
)
replace_once(
    panel_path,
    '''import Link from "@/compat/router-link";

import { BRUSH_QUALITY_CATALOG } from "./brush-studio-v5-quality-catalog";''',
    '''import Link from "@/compat/router-link";

import { studioBrushCatalogItemById } from "../brush/studio-brush-catalog";
import { studioBrushQualityDesignProductId } from "../brush/studio-brush-quality-design-bridge";
import { BRUSH_QUALITY_CATALOG } from "./brush-studio-v5-quality-catalog";''',
)
replace_once(
    panel_path,
    '''          <p className="mt-1 max-w-4xl text-xs leading-5 text-fg-3">
            과거 72종 설계를 숨기지 않고 모두 검색할 수 있습니다. 선택하면 재료·물리·패턴 의미가
            가장 가까운 V6 레시피에서 시작하며, 픽셀 동일 변환으로 표시하지 않습니다.
          </p>''',
    '''          <p className="mt-1 max-w-4xl text-xs leading-5 text-fg-3">
            72종 설계 이름·ID·재질 설명은 이제 일반 브러시 선택 창에서도 검색할 수 있습니다.
            여기서는 각 설계가 실제 렌더러를 가진 제품 브러시와 어떤 V6 편집 시작점으로 이어지는지
            함께 확인하며, 픽셀 동일 변환으로 표시하지 않습니다.
          </p>''',
)
replace_once(
    panel_path,
    '''            {filtered.map((entry) => {
              const recipeId = resolveLegacyBrushV6RecipeId(entry);
              return (''',
    '''            {filtered.map((entry) => {
              const recipeId = resolveLegacyBrushV6RecipeId(entry);
              const productCatalogId = studioBrushQualityDesignProductId(entry.id);
              const productBrush = productCatalogId
                ? studioBrushCatalogItemById(productCatalogId)
                : null;
              return (''',
)
replace_once(
    panel_path,
    '''                  key={entry.id}
                  href={successionHref(baseHref, entry.id, recipeId)}
                  className="group rounded-2xl border border-line bg-panel/55 p-3.5 transition-colors hover:border-accent/45 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"''',
    '''                  key={entry.id}
                  href={successionHref(baseHref, entry.id, recipeId)}
                  data-studio-brush-quality-product-target={productCatalogId ?? undefined}
                  className="group rounded-2xl border border-line bg-panel/55 p-3.5 transition-colors hover:border-accent/45 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"''',
)
replace_once(
    panel_path,
    '''                  <span className="mt-2 block text-xs leading-5 text-fg-3">{entry.signature}</span>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">
                    {recipeNames.get(recipeId) ?? recipeId}로 열기''',
    '''                  <span className="mt-2 block text-xs leading-5 text-fg-3">{entry.signature}</span>
                  <span className="mt-2 block rounded-lg border border-line bg-card/70 px-2.5 py-1.5 text-[0.68rem] font-semibold text-fg-2">
                    일반 브러시 · {productBrush?.name ?? productCatalogId ?? "연결 확인 필요"}
                  </span>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">
                    {recipeNames.get(recipeId) ?? recipeId}로 편집하기''',
)

write(
    "apps/web/src/domains/creator/brush/studio-brush-quality-design-bridge.test.ts",
    '''import { describe, expect, it } from "vitest";

import {
  STUDIO_ALL_BRUSH_CATALOG_ITEMS,
  STUDIO_BRUSH_CATALOG_COUNTS,
  filterStudioBrushCatalogItems,
} from "./studio-brush-catalog";
import {
  STUDIO_BRUSH_QUALITY_DESIGN_COUNT,
  auditStudioBrushQualityDesignBridge,
  projectStudioBrushQualityDesigns,
  studioBrushQualityDesignProductId,
} from "./studio-brush-quality-design-bridge";
import {
  STUDIO_BRUSH_QUALITY_DESIGNS,
  studioBrushQualityDesignGroups,
} from "./studio-brush-quality-design-catalog";

describe("Studio brush quality-design product bridge", () => {
  it("keeps one canonical 72-design taxonomy with complete product targets", () => {
    expect(STUDIO_BRUSH_QUALITY_DESIGNS).toHaveLength(
      STUDIO_BRUSH_QUALITY_DESIGN_COUNT,
    );
    expect(new Set(STUDIO_BRUSH_QUALITY_DESIGNS.map((design) => design.id)).size)
      .toBe(STUDIO_BRUSH_QUALITY_DESIGN_COUNT);
    expect(studioBrushQualityDesignGroups()).toHaveLength(6);
    expect(auditStudioBrushQualityDesignBridge(STUDIO_ALL_BRUSH_CATALOG_ITEMS))
      .toEqual([]);
    expect(projectStudioBrushQualityDesigns(STUDIO_ALL_BRUSH_CATALOG_ITEMS))
      .toHaveLength(STUDIO_BRUSH_QUALITY_DESIGN_COUNT);
  });

  it("adds discovery vocabulary without inventing new persisted catalogue ids", () => {
    expect(STUDIO_ALL_BRUSH_CATALOG_ITEMS).toHaveLength(
      STUDIO_BRUSH_CATALOG_COUNTS.total,
    );
    expect(new Set(STUDIO_ALL_BRUSH_CATALOG_ITEMS.map((item) => item.id)).size)
      .toBe(STUDIO_ALL_BRUSH_CATALOG_ITEMS.length);

    for (const design of STUDIO_BRUSH_QUALITY_DESIGNS) {
      const productCatalogId = studioBrushQualityDesignProductId(design.id);
      expect(productCatalogId, design.id).not.toBeNull();
      const product = STUDIO_ALL_BRUSH_CATALOG_ITEMS.find(
        (item) => item.id === productCatalogId,
      );
      expect(product, `${design.id} product target`).toBeDefined();
      expect(product?.searchAliases, `${design.id} aliases`).toEqual(
        expect.arrayContaining([
          design.id,
          design.name,
          design.group,
          design.signature,
          design.engine,
        ]),
      );

      for (const query of [design.id, design.name]) {
        const results = filterStudioBrushCatalogItems({
          operation: "paint",
          query,
        });
        expect(
          results.some((item) => item.id === productCatalogId),
          `${design.id} should resolve from query ${query}`,
        ).toBe(true);
      }
    }
  });
});
''',
)

write(
    "docs/rewrite/brush-quality-design-productization-20260912.md",
    '''# 브러시 품질 설계 72종 제품화 방향

## 결정

V5의 72종 품질 설계를 일반 캔버스에 72개의 새 렌더러 ID로 복제하지 않는다. 현재 제품에는
이미 core·pro 브러시 카탈로그와 저장 문서의 안정적인 ID가 있고, 여러 V5 설계는 동일한 렌더
권위를 공유한다. 별도 ID를 늘리면 이름만 다른 중복 브러시와 지원되지 않는 엔진 표시가 다시
생긴다.

대신 72종을 **정본 설계 택소노미**로 승격하고, 각 설계를 실제 live·commit·export 경로가 있는
제품 브러시 하나에 연결한다.

## 사용자 경험

- 일반 데스크톱·모바일 브러시 선택 창에서 72종의 이름, 영문 ID, 재질 그룹, 질감 설명,
  원래 엔진 이름으로 검색할 수 있다.
- 검색 결과는 별도 가상 브러시가 아니라 현재 제품 렌더러가 있는 정본 브러시다.
- Brush Editor의 72종 승계 화면에서는 일반 브러시 대상과 V6 편집 시작점을 함께 표시한다.
- 저장 문서의 `brushCatalogId`, 실제 `brush` 렌더러 ID, 즐겨찾기와 최근 사용 ID는 변경하지 않는다.

## 런타임 경계

PR #1327에서 조합 프로그램의 live·commit·export 경계 연결이 완료됐다. 이 변경은 그 경계를
우회하지 않으며, 아직 제품 픽셀 백엔드가 없는 V6 연구 노드를 일반 브러시처럼 노출하지 않는다.
V6는 사용자 제작·검증 레이어로 유지하고, 제품으로 승격된 조합만 기존 카탈로그와 런타임 계약을
통해 적용한다.

## 영구 계약

- 설계 항목은 정확히 72개이며 ID가 유일하다.
- 모든 설계는 등록된 paint 브러시 하나에 연결된다.
- 설계 이름과 ID 검색은 연결된 제품 브러시를 반환한다.
- 설계 택소노미를 추가해도 등록된 제품 카탈로그 ID 수는 변하지 않는다.
''',
)

print("Applied Brush Studio 72-design productization bridge.")
