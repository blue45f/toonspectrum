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


# 1. Restore the production build broken by the latest workspace integration.
asset_governance = "apps/web/src/domains/creator/studio-asset-governance.ts"
replace_once(asset_governance, "const passport: StudioAssetPassport = Object.freeze({", "const passport: StudioAssetPassport = Object.freeze<StudioAssetPassport>({")
replace_once(asset_governance, "const provider: StudioAssetProviderDefinition = Object.freeze({", "const provider: StudioAssetProviderDefinition = Object.freeze<StudioAssetProviderDefinition>({")
replace_once(asset_governance, "const plugin: StudioPluginManifest = Object.freeze({", "const plugin: StudioPluginManifest = Object.freeze<StudioPluginManifest>({")

write(
    "apps/web/src/domains/creator/studio-feature-registry.ts",
    '''/**
 * Canonical registry for advanced ToonStudio project capabilities.
 *
 * Route and document surfaces consume this single registry instead of importing feature modules
 * by ad-hoc string paths. Keeping the module values here also makes a missing integration file a
 * compile-time failure rather than a production-only lazy-route failure.
 */

import * as archiveManifest from "./studio-archive-manifest";
import * as assetPassport from "./studio-asset-passport";
import * as assetProvider from "./studio-asset-provider";
import * as fontAudit from "./studio-font-audit";
import * as marketplaceSubmission from "./studio-marketplace-submission";
import * as pluginRegistry from "./studio-plugin-registry";
import * as publishingConnector from "./studio-publishing-connector";
import * as publishingPackage from "./studio-publishing-package";
import * as rightsGraph from "./studio-rights-graph";

export const STUDIO_FEATURE_MODULE_REGISTRY = Object.freeze({
  archiveManifest,
  assetPassport,
  assetProvider,
  fontAudit,
  marketplaceSubmission,
  pluginRegistry,
  publishingConnector,
  publishingPackage,
  rightsGraph,
});

export type StudioFeatureModuleId = keyof typeof STUDIO_FEATURE_MODULE_REGISTRY;

export const STUDIO_FEATURE_CAPABILITY_COUNT = Object.keys(
  STUDIO_FEATURE_MODULE_REGISTRY,
).length;

export function studioFeatureModule(id: StudioFeatureModuleId) {
  return STUDIO_FEATURE_MODULE_REGISTRY[id];
}
''',
)
write(
    "apps/web/src/domains/creator/studio-feature-registry.test.ts",
    '''import { describe, expect, it } from "vitest";

import {
  STUDIO_FEATURE_CAPABILITY_COUNT,
  STUDIO_FEATURE_MODULE_REGISTRY,
  studioFeatureModule,
} from "./studio-feature-registry";

describe("studio feature registry", () => {
  it("owns every route-reachable advanced capability in one complete registry", () => {
    expect(STUDIO_FEATURE_CAPABILITY_COUNT).toBe(9);
    expect(Object.keys(STUDIO_FEATURE_MODULE_REGISTRY).sort()).toEqual([
      "archiveManifest",
      "assetPassport",
      "assetProvider",
      "fontAudit",
      "marketplaceSubmission",
      "pluginRegistry",
      "publishingConnector",
      "publishingPackage",
      "rightsGraph",
    ]);
    expect(studioFeatureModule("assetPassport")).toBe(
      STUDIO_FEATURE_MODULE_REGISTRY.assetPassport,
    );
  });
});
''',
)

replace_once(
    "apps/web/src/domains/creator/studio-shell/StudioDocumentWorkspaceDock.tsx",
    '''  if (projection.kind === "localization") {
    return <StudioLocalizationPanel projectId={projectId} locale={locale} />;
  }
  if (projection.kind === "review") {
    return <StudioReviewPanel projectId={projectId} locale={locale} />;
  }
  return (
    <StudioProjectFeatureSuitePanel
      projectId={projectId}
      section={projection.section}
      view={projection.view}
      locale={locale}
    />
  );''',
    '''  if (projection.kind === "suite") {
    return (
      <StudioProjectFeatureSuitePanel
        projectId={projectId}
        section={projection.section}
        view={projection.view}
        locale={locale}
      />
    );
  }
  if (projection.kind === "localization") {
    return <StudioLocalizationPanel projectId={projectId} locale={locale} />;
  }
  return <StudioReviewPanel projectId={projectId} locale={locale} />;''',
)

route_registry = "apps/web/src/domains/creator/studio-route-registry.ts"
route_content = read(route_registry)
route_anchor = "\nexport function auditStudioRouteRegistry(): StudioRouteRegistryAudit {"
if route_anchor not in route_content:
    raise RuntimeError("studio route registry audit anchor not found")
route_helpers = '''

const STUDIO_EXTERNAL_TOKEN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{7,255}$/u;

export function validateStudioExternalToken(value: unknown): value is string {
  return typeof value === "string" && STUDIO_EXTERNAL_TOKEN_PATTERN.test(value);
}

function requireStudioExternalToken(token: string): string {
  if (!validateStudioExternalToken(token)) {
    throw new Error("A valid external token is required.");
  }
  return token;
}

function studioExternalEntryHref(
  path: "/studio/review" | "/studio/present" | "/studio/join",
  parameter: "shareToken" | "presentationToken" | "invite",
  token: string,
): string {
  const query = new URLSearchParams({ [parameter]: requireStudioExternalToken(token) });
  return `${path}?${query.toString()}`;
}

export function studioExternalReviewHref(token: string): string {
  return studioExternalEntryHref("/studio/review", "shareToken", token);
}

export function studioExternalPresentationHref(token: string): string {
  return studioExternalEntryHref("/studio/present", "presentationToken", token);
}

export function studioExternalJoinHref(token: string): string {
  return studioExternalEntryHref("/studio/join", "invite", token);
}
'''
write(route_registry, route_content.replace(route_anchor, route_helpers + route_anchor, 1))
replace_once("apps/web/src/domains/creator/studio-shell/StudioExternalEntryRoutes.tsx", '<Container size="narrow">', '<Container size="prose">')

project_delivery = "apps/web/src/domains/creator/studio-shell/StudioProjectDeliveryPanel.tsx"
replace_once(
    project_delivery,
    "const [connectorId, setConnectorId] = useState(CONNECTORS[1].id);",
    '''const [connectorId, setConnectorId] = useState<(typeof CONNECTORS)[number]["id"]>(
    CONNECTORS[1].id,
  );''',
)
replace_once(
    project_delivery,
    "onChange={(event) => setConnectorId(event.target.value)}",
    '''onChange={(event) => {
                  const connector = CONNECTORS.find(
                    (candidate) => candidate.id === event.target.value,
                  );
                  if (connector) setConnectorId(connector.id);
                }}''',
)
replace_once(
    "apps/web/src/domains/creator/studio-shell/StudioTemplatesPage.tsx",
    'const [selectedId, setSelectedId] = useState(STUDIO_TEMPLATE_CATALOG[0]?.id ?? "");',
    'const [selectedId, setSelectedId] = useState<string>(STUDIO_TEMPLATE_CATALOG[0]?.id ?? "");',
)
replace_once(
    "apps/web/src/domains/creator/studio-template-catalog.ts",
    '''const TEMPLATE_BY_ID = new Map(
  STUDIO_TEMPLATE_CATALOG.map((template) => [template.id, template]),
);''',
    '''const TEMPLATE_BY_ID: ReadonlyMap<string, StudioTemplateCatalogItem> = new Map(
  STUDIO_TEMPLATE_CATALOG.map((template) => [template.id, template]),
);''',
)

# 2. Make composition availability honest and compile only real runtime seams.
write(
    "apps/web/src/domains/creator/brush/studio-brush-composition-runtime.ts",
    '''/**
 * Product-runtime authority for Brush Studio composition choices.
 *
 * The catalogue intentionally contains research and adapter-ready nodes. This module is the much
 * smaller allow-list of choices that the current live, settled and export renderers actually
 * consume. Unsupported selections remain round-trippable metadata, but they never impersonate a
 * connected pixel backend or collapse into an unrelated legacy effect.
 */

import { resolveStudioBrushRenderFamily } from "../studio-brush";
import {
  STUDIO_BRUSH_COMPOSITION_SLOT_IDS,
  STUDIO_BRUSH_OIL_PROGRAM_KEYS,
  studioBrushEngineProgramSetWithComposition,
  studioBrushEngineProgramSetWithOil,
  studioBrushEngineProgramSetWithWatercolor,
  studioBrushEngineProgramSetWithoutOil,
  studioBrushEngineProgramSetWithoutWatercolor,
  studioOilProgramSetForBrush,
  type StudioBrushCompositionProgramSet,
  type StudioBrushCompositionSlotId,
  type StudioBrushEngineProgramSet,
  type StudioBrushOilProgramSet,
} from "./studio-brush-engine-program-set";

interface StudioBrushRuntimeSlotMap {
  readonly [slot: string]: readonly string[] | undefined;
}

const OIL_RUNTIME_NODES: StudioBrushRuntimeSlotMap = Object.freeze({
  deposition: Object.freeze(["loaded-paint", "height-paint"]),
  pickup: Object.freeze(["no-pickup", "simple-reservoir"]),
  physics: Object.freeze(["no-physics", "bristle-webgpu"]),
});

const WATERCOLOR_RUNTIME_NODES: StudioBrushRuntimeSlotMap = Object.freeze({
  surface: Object.freeze(["smooth-paper", "watercolor-paper", "paper-fiber-field"]),
  physics: Object.freeze(["no-physics", "wet-diffusion-webgpu", "inkwash-fluid"]),
});

function runtimeNodesForFamily(family: string): StudioBrushRuntimeSlotMap {
  if (family === "oil" || family === "brush") return OIL_RUNTIME_NODES;
  if (family === "watercolor") return WATERCOLOR_RUNTIME_NODES;
  return Object.freeze({});
}

export function isStudioBrushCompositionRuntimeSelectable(
  family: string,
  slot: StudioBrushCompositionSlotId,
  nodeId: string,
): boolean {
  return runtimeNodesForFamily(family)[slot]?.includes(nodeId) === true;
}

export interface StudioBrushCompositionRuntimeSelection {
  readonly slot: StudioBrushCompositionSlotId;
  readonly nodeId: string;
}

export interface StudioBrushCompositionRuntimePlan {
  readonly connectedSelections: readonly StudioBrushCompositionRuntimeSelection[];
  readonly unavailableSelections: readonly StudioBrushCompositionRuntimeSelection[];
}

export function planStudioBrushCompositionRuntime(
  family: string,
  composition: StudioBrushCompositionProgramSet,
): StudioBrushCompositionRuntimePlan {
  const connectedSelections: StudioBrushCompositionRuntimeSelection[] = [];
  const unavailableSelections: StudioBrushCompositionRuntimeSelection[] = [];
  for (const slot of STUDIO_BRUSH_COMPOSITION_SLOT_IDS) {
    const nodeId = composition[slot];
    if (!nodeId) continue;
    const selection = Object.freeze({ slot, nodeId });
    if (isStudioBrushCompositionRuntimeSelectable(family, slot, nodeId)) {
      connectedSelections.push(selection);
    } else {
      unavailableSelections.push(selection);
    }
  }
  return Object.freeze({
    connectedSelections: Object.freeze(connectedSelections),
    unavailableSelections: Object.freeze(unavailableSelections),
  });
}

export function constrainStudioBrushCompositionToRuntime(input: {
  readonly family: string;
  readonly current: StudioBrushCompositionProgramSet;
  readonly requested: StudioBrushCompositionProgramSet;
}): StudioBrushCompositionProgramSet {
  const next: Partial<Record<StudioBrushCompositionSlotId, string>> = {
    ...input.current,
  };
  for (const slot of STUDIO_BRUSH_COMPOSITION_SLOT_IDS) {
    const nodeId = input.requested[slot];
    if (nodeId && isStudioBrushCompositionRuntimeSelectable(input.family, slot, nodeId)) {
      next[slot] = nodeId;
    }
  }
  return Object.freeze(next);
}

function oilProgramsEqual(
  left: StudioBrushOilProgramSet,
  right: StudioBrushOilProgramSet,
): boolean {
  return STUDIO_BRUSH_OIL_PROGRAM_KEYS.every((key) => left[key] === right[key]);
}

export function compileStudioBrushCompositionRuntimeProgramSet(input: {
  readonly brushId: string;
  readonly family: string;
  readonly current?: StudioBrushEngineProgramSet | null;
  readonly composition: StudioBrushCompositionProgramSet;
}): StudioBrushEngineProgramSet {
  let next = studioBrushEngineProgramSetWithComposition(input.current, input.composition);

  if (input.family === "oil" || input.family === "brush") {
    const baseline = studioOilProgramSetForBrush(input.brushId);
    const derived: StudioBrushOilProgramSet = {
      bristlePhysics: input.composition.physics === "bristle-webgpu"
        ? true
        : input.composition.physics === "no-physics"
          ? false
          : baseline.bristlePhysics,
      bristleLoadDynamics: input.composition.pickup === "simple-reservoir"
        ? true
        : input.composition.pickup === "no-pickup"
          ? false
          : baseline.bristleLoadDynamics,
      impastoRelief: input.composition.deposition === "height-paint"
        ? true
        : input.composition.deposition === "loaded-paint"
          ? false
          : baseline.impastoRelief,
    };
    next = oilProgramsEqual(derived, baseline)
      ? studioBrushEngineProgramSetWithoutOil(next)
        ?? studioBrushEngineProgramSetWithComposition(null, input.composition)
      : studioBrushEngineProgramSetWithOil(next, derived);
  }

  if (input.family === "watercolor") {
    if (input.composition.physics === "inkwash-fluid") {
      next = studioBrushEngineProgramSetWithWatercolor(next, {
        livingInkBakeProgramId: "sumi-flow-bake",
      });
    } else if (input.composition.surface === "paper-fiber-field") {
      next = studioBrushEngineProgramSetWithWatercolor(next, {
        wetEdgeBloomProgramId: "fiber-feather",
      });
    } else {
      next = studioBrushEngineProgramSetWithoutWatercolor(next)
        ?? studioBrushEngineProgramSetWithComposition(null, input.composition);
    }
  }

  return next;
}

export function resolveStudioBrushRuntimeProgramSet(
  brushId: string | null | undefined,
  current: StudioBrushEngineProgramSet | null | undefined,
): StudioBrushEngineProgramSet | null {
  if (!current?.composition) return current ?? null;
  const resolvedBrushId = brushId?.trim() || "pen";
  return compileStudioBrushCompositionRuntimeProgramSet({
    brushId: resolvedBrushId,
    family: resolveStudioBrushRenderFamily(resolvedBrushId),
    current,
    composition: current.composition,
  });
}
''',
)
write(
    "apps/web/src/domains/creator/brush/studio-brush-composition-runtime.test.ts",
    '''import { describe, expect, it } from "vitest";

import { createStudioBrushCompositionBaseline } from "./studio-brush-composition-catalog";
import {
  compileStudioBrushCompositionRuntimeProgramSet,
  constrainStudioBrushCompositionToRuntime,
  isStudioBrushCompositionRuntimeSelectable,
  planStudioBrushCompositionRuntime,
  resolveStudioBrushRuntimeProgramSet,
} from "./studio-brush-composition-runtime";

describe("Brush Studio composition product runtime", () => {
  it("exposes only fields current product renderers actually consume", () => {
    expect(isStudioBrushCompositionRuntimeSelectable("oil", "physics", "bristle-webgpu")).toBe(true);
    expect(isStudioBrushCompositionRuntimeSelectable("oil", "carrier", "krita-hairy-carrier")).toBe(false);
    expect(isStudioBrushCompositionRuntimeSelectable("watercolor", "surface", "paper-fiber-field")).toBe(true);
    expect(isStudioBrushCompositionRuntimeSelectable("pen", "pattern", "kaleido-symmetry")).toBe(false);
  });

  it("does not collapse unavailable providers into unrelated oil booleans", () => {
    const baseline = createStudioBrushCompositionBaseline("oil--filbert-ribbon", "oil");
    const compiled = compileStudioBrushCompositionRuntimeProgramSet({
      brushId: "oil--filbert-ribbon",
      family: "oil",
      current: {
        version: 1,
        oil: { bristlePhysics: true, bristleLoadDynamics: true, impastoRelief: true },
      },
      composition: {
        ...baseline,
        carrier: "krita-hairy-carrier",
        tip: "normal-map-tip",
        pickup: "pigment-painter-reservoir",
        physics: "no-physics",
      },
    });
    expect(compiled.composition).toMatchObject({
      carrier: "krita-hairy-carrier",
      tip: "normal-map-tip",
      pickup: "pigment-painter-reservoir",
      physics: "no-physics",
    });
    expect(compiled.oil).toEqual({
      bristlePhysics: false,
      bristleLoadDynamics: false,
      impastoRelief: false,
    });
  });

  it("maps supported oil authorities into visible runtime programs", () => {
    const baseline = createStudioBrushCompositionBaseline("oil--filbert-ribbon", "oil");
    const compiled = compileStudioBrushCompositionRuntimeProgramSet({
      brushId: "oil--filbert-ribbon",
      family: "oil",
      composition: {
        ...baseline,
        deposition: "height-paint",
        pickup: "simple-reservoir",
        physics: "bristle-webgpu",
      },
    });
    expect(compiled.oil).toEqual({
      bristlePhysics: true,
      bristleLoadDynamics: true,
      impastoRelief: true,
    });
  });

  it("recompiles persisted graphs at the render boundary and removes stale overrides", () => {
    const baseline = createStudioBrushCompositionBaseline("oil--filbert-ribbon", "oil");
    const resolved = resolveStudioBrushRuntimeProgramSet("oil--filbert-ribbon", {
      version: 1,
      oil: { bristlePhysics: true, bristleLoadDynamics: true, impastoRelief: true },
      composition: {
        ...baseline,
        deposition: "loaded-paint",
        pickup: "no-pickup",
        physics: "no-physics",
      },
    });
    expect(resolved?.oil).toEqual({
      bristlePhysics: false,
      bristleLoadDynamics: false,
      impastoRelief: false,
    });
  });

  it("constrains UI recipes without destroying unavailable metadata", () => {
    const baseline = createStudioBrushCompositionBaseline("oil--filbert-ribbon", "oil");
    const constrained = constrainStudioBrushCompositionToRuntime({
      family: "oil",
      current: { ...baseline, pigment: "open-km-wgsl" },
      requested: { ...baseline, pigment: "mixbox-lut", pickup: "simple-reservoir" },
    });
    expect(constrained.pigment).toBe("open-km-wgsl");
    expect(constrained.pickup).toBe("simple-reservoir");
    const plan = planStudioBrushCompositionRuntime("oil", constrained);
    expect(plan.connectedSelections.map(({ slot }) => slot).sort()).toEqual([
      "deposition",
      "physics",
      "pickup",
    ]);
    expect(plan.unavailableSelections.some(({ slot }) => slot === "pigment")).toBe(true);
  });
});
''',
)

catalog_path = "apps/web/src/domains/creator/brush/studio-brush-composition-catalog.ts"
catalog = read(catalog_path)
old_import = '''import {
  STUDIO_BRUSH_COMPOSITION_SLOT_IDS,
  STUDIO_BRUSH_OIL_PROGRAM_KEYS,
  studioBrushEngineProgramSetWithComposition,
  studioBrushEngineProgramSetWithOil,
  studioBrushEngineProgramSetWithWatercolor,
  studioBrushEngineProgramSetWithoutComposition,
  studioBrushEngineProgramSetWithoutOil,
  studioBrushEngineProgramSetWithoutWatercolor,
  studioOilProgramSetForBrush,
  type StudioBrushCompositionProgramSet,
  type StudioBrushCompositionSlotId,
  type StudioBrushEngineProgramSet,
  type StudioBrushOilProgramSet,
} from "./studio-brush-engine-program-set";'''
new_import = '''import {
  STUDIO_BRUSH_COMPOSITION_SLOT_IDS,
  studioBrushEngineProgramSetWithoutComposition,
  studioBrushEngineProgramSetWithoutOil,
  studioBrushEngineProgramSetWithoutWatercolor,
  studioOilProgramSetForBrush,
  type StudioBrushCompositionProgramSet,
  type StudioBrushCompositionSlotId,
  type StudioBrushEngineProgramSet,
} from "./studio-brush-engine-program-set";
import { compileStudioBrushCompositionRuntimeProgramSet } from "./studio-brush-composition-runtime";'''
if catalog.count(old_import) != 1:
    raise RuntimeError("catalog import block drifted")
catalog = catalog.replace(old_import, new_import, 1)
catalog = catalog.replace(
    '''export interface StudioBrushCompositionRecipe {
  readonly id: string;
  readonly name: string;''',
    '''export interface StudioBrushCompositionRecipe {
  readonly id: string;
  readonly families: readonly string[];
  readonly name: string;''',
    1,
)
recipe_families = {
    'Object.freeze({ id: "clean-ink",': 'Object.freeze({ id: "clean-ink", families: Object.freeze(["pen", "gpen", "perfect", "calligraphy"]),',
    'Object.freeze({ id: "living-chroma",': 'Object.freeze({ id: "living-chroma", families: Object.freeze(["watercolor"]),',
    'Object.freeze({ id: "mineral-wash",': 'Object.freeze({ id: "mineral-wash", families: Object.freeze(["watercolor"]),',
    'Object.freeze({ id: "natural-graphite",': 'Object.freeze({ id: "natural-graphite", families: Object.freeze(["pencil", "pastel", "dry-media"]),',
    'Object.freeze({ id: "impasto-mixer",': 'Object.freeze({ id: "impasto-mixer", families: Object.freeze(["oil", "brush"]),',
    'Object.freeze({ id: "dripping-neon",': 'Object.freeze({ id: "dripping-neon", families: Object.freeze(["watercolor"]),',
    'Object.freeze({ id: "foliage-flow",': 'Object.freeze({ id: "foliage-flow", families: Object.freeze(["stamp", "screentone"]),',
}
for old, new in recipe_families.items():
    if catalog.count(old) != 1:
        raise RuntimeError(f"recipe marker drifted: {old}")
    catalog = catalog.replace(old, new, 1)
catalog = catalog.replace(
    'tip: "normal-map-tip", surface: "canvas-weave", deposition: "height-paint", pigment: "open-km-wgsl", pickup: "pigment-painter-reservoir", physics: "bristle-webgpu", pattern: "no-pattern", feedback: "hover-footprint", output: "hybrid-proxy"',
    'tip: "bristle-tuft", surface: "canvas-weave", deposition: "height-paint", pigment: "rgb-color", pickup: "simple-reservoir", physics: "bristle-webgpu", pattern: "no-pattern", feedback: "hover-footprint", output: "raster-tiles"',
    1,
)
compile_start = catalog.index("function oilProgramsEqual(")
compile_end = catalog.index("\nexport function resetStudioBrushCompositionProgramSet", compile_start)
catalog = catalog[:compile_start] + '''/** Persist the graph and compile only choices backed by current product renderers. */
export function compileStudioBrushCompositionProgramSet(input: {
  readonly brushId: string;
  readonly family: string;
  readonly current?: StudioBrushEngineProgramSet | null;
  readonly composition: StudioBrushCompositionProgramSet;
}): StudioBrushEngineProgramSet {
  const complete = completeSelection(input.brushId, input.family, input.composition);
  return compileStudioBrushCompositionRuntimeProgramSet({ ...input, composition: complete });
}
''' + catalog[compile_end:]
write(catalog_path, catalog)

composer_path = "apps/web/src/domains/creator/brush/StudioBrushCompositionComposer.tsx"
composer = read(composer_path)
composer = composer.replace(
    '''import {
  STUDIO_BRUSH_COMPOSITION_SLOT_IDS,
  type StudioBrushCompositionSlotId,
  type StudioBrushEngineProgramSet,
} from "./studio-brush-engine-program-set";''',
    '''import {
  STUDIO_BRUSH_COMPOSITION_SLOT_IDS,
  type StudioBrushCompositionSlotId,
  type StudioBrushEngineProgramSet,
} from "./studio-brush-engine-program-set";
import {
  constrainStudioBrushCompositionToRuntime,
  isStudioBrushCompositionRuntimeSelectable,
  planStudioBrushCompositionRuntime,
} from "./studio-brush-composition-runtime";''',
    1,
)
composer = composer.replace(
    '''  const customized = Boolean(programSet?.composition);

  function applyComposition(composition: CompleteStudioBrushComposition) {
    onChange(compileStudioBrushCompositionProgramSet({
      brushId,
      family,
      current: programSet,
      composition,
    }));
  }

  function updateSlot(slot: StudioBrushCompositionSlotId, value: string) {
    applyComposition(Object.freeze({ ...plan.composition, [slot]: value }));
  }''',
    '''  const customized = Boolean(programSet?.composition);
  const runtimePlan = planStudioBrushCompositionRuntime(family, plan.composition);
  const recipes = STUDIO_BRUSH_COMPOSITION_RECIPES
    .filter((recipe) => recipe.families.includes(family))
    .map((recipe) => ({
      recipe,
      available: STUDIO_BRUSH_COMPOSITION_SLOT_IDS.some((slot) => {
        const nodeId = recipe.composition[slot];
        return Boolean(nodeId && isStudioBrushCompositionRuntimeSelectable(family, slot, nodeId));
      }),
    }));

  function applyComposition(composition: CompleteStudioBrushComposition) {
    const constrained = constrainStudioBrushCompositionToRuntime({
      family,
      current: plan.composition,
      requested: composition,
    });
    onChange(compileStudioBrushCompositionProgramSet({
      brushId,
      family,
      current: programSet,
      composition: constrained,
    }));
  }

  function updateSlot(slot: StudioBrushCompositionSlotId, value: string) {
    if (!isStudioBrushCompositionRuntimeSelectable(family, slot, value)) return;
    applyComposition(Object.freeze({ ...plan.composition, [slot]: value }));
  }''',
    1,
)
composer = composer.replace("{STUDIO_BRUSH_COMPOSITION_RECIPES.map((recipe) => (", "{recipes.map(({ recipe, available }) => (", 1)
composer = composer.replace(
    '''              type="button"
              onClick={() => applyComposition(recipe.composition)}
              className="min-h-16 rounded-xl border border-line bg-card px-2.5 py-2 text-left transition-colors hover:border-accent/40 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"''',
    '''              type="button"
              disabled={!available}
              onClick={() => {
                if (available) applyComposition(recipe.composition);
              }}
              className="min-h-16 rounded-xl border border-line bg-card px-2.5 py-2 text-left transition-colors hover:border-accent/40 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-line disabled:hover:bg-card"''',
    1,
)
composer = composer.replace(
    '''                {recipe.description}
              </span>''',
    '''                {recipe.description}
                {!available ? " · 현재 출력 미연결" : ""}
              </span>''',
    1,
)
composer = composer.replace("{plan.integrationCounts.connected}/{STUDIO_BRUSH_COMPOSITION_SLOT_IDS.length}", "{runtimePlan.connectedSelections.length}/{STUDIO_BRUSH_COMPOSITION_SLOT_IDS.length}", 1)
composer = composer.replace(
    '''                const selected = options.find((entry) => entry.id === selectedId) ?? null;
                return (''',
    '''                const selected = options.find((entry) => entry.id === selectedId) ?? null;
                const runtimeSelectable = selected
                  ? isStudioBrushCompositionRuntimeSelectable(family, slot, selected.id)
                  : false;
                return (''',
    1,
)
composer = composer.replace(
    '''                          {INTEGRATION_LABELS[selected.integration]}''',
    '''                          {runtimeSelectable
                            ? "바로 적용"
                            : `${INTEGRATION_LABELS[selected.integration]} · 출력 미연결`}''',
    1,
)
composer = composer.replace(
    '''                      {options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.label} · {INTEGRATION_LABELS[option.integration]}
                        </option>
                      ))}''',
    '''                      {options.map((option) => {
                        const available = isStudioBrushCompositionRuntimeSelectable(
                          family,
                          slot,
                          option.id,
                        );
                        return (
                          <option key={option.id} value={option.id} disabled={!available}>
                            {option.label} · {available ? "바로 적용" : "현재 출력 미연결"}
                          </option>
                        );
                      })}''',
    1,
)
issues_anchor = "\n      {plan.issues.length > 0 ? ("
if issues_anchor not in composer:
    raise RuntimeError("composer issue anchor missing")
composer = composer.replace(
    issues_anchor,
    '''
      {runtimePlan.unavailableSelections.length > 0 ? (
        <p
          className="mt-3 rounded-lg border border-line bg-bg-2/45 px-2.5 py-2 text-[0.62rem] leading-relaxed text-fg-3"
          data-studio-brush-runtime-unavailable="true"
        >
          현재 렌더러가 직접 소비하지 않는 {runtimePlan.unavailableSelections.length}개 슬롯은
          읽기 전용입니다. 선택 가능한 항목만 실제 획·정착·내보내기에 반영됩니다.
        </p>
      ) : null}
''' + issues_anchor,
    1,
)
write(composer_path, composer)

controls_test = "apps/web/src/domains/creator/brush/StudioBrushEngineProgramControls.test.tsx"
test_content = read(controls_test)
old_test = '''  it("persists a distinctive pattern selection instead of reducing it to a scalar", () => {
    const onChange = vi.fn();
    render(
      <StudioBrushEngineProgramControls brushId="pen" programSet={null} onChange={onChange} />,
    );
    openExpertGraph();
    fireEvent.change(screen.getByLabelText("패턴·문양 선택"), {
      target: { value: "kaleido-symmetry" },
    });
    const next = onChange.mock.calls[0]![0];
    expect(next?.composition?.pattern).toBe("kaleido-symmetry");
    expect(next?.composition?.carrier).toBe("webgpu-causal-ink");
  });'''
new_test = '''  it("keeps catalogue-only pattern providers read-only in the product composer", () => {
    const onChange = vi.fn();
    render(
      <StudioBrushEngineProgramControls brushId="pen" programSet={null} onChange={onChange} />,
    );
    openExpertGraph();
    const select = screen.getByLabelText("패턴·문양 선택") as HTMLSelectElement;
    const kaleido = Array.from(select.options).find((option) => option.value === "kaleido-symmetry");
    expect(kaleido?.disabled).toBe(true);
    fireEvent.change(select, { target: { value: "kaleido-symmetry" } });
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/읽기 전용입니다/u)).toBeTruthy();
  });'''
if test_content.count(old_test) != 1:
    raise RuntimeError("controls inert-pattern test drifted")
write(controls_test, test_content.replace(old_test, new_test, 1))

# 3. Consume composition from live, committed and export pixel authorities.
studio_draw = "apps/web/src/domains/creator/brush/StudioDrawNode.tsx"
draw = read(studio_draw)
if draw.count("el.brushEnginePrograms") < 4:
    raise RuntimeError("StudioDrawNode direct program reads drifted")
draw = draw.replace("el.brushEnginePrograms", "runtimeEnginePrograms")
draw = draw.replace(
    '''import {
  resolveStudioCapturedBrushDynamicsPresetId,
} from "./studio-brush-dynamics";''',
    '''import {
  resolveStudioCapturedBrushDynamicsPresetId,
} from "./studio-brush-dynamics";
import { resolveStudioBrushRuntimeProgramSet } from "./studio-brush-composition-runtime";''',
    1,
)
draw = draw.replace(
    '''  const activeDraft = resolvedRenderPurpose === "drawing-draft";
  const durableDocumentRender = resolvedRenderPurpose === "document";
  const kind = el.kind ?? "freehand";''',
    '''  const activeDraft = resolvedRenderPurpose === "drawing-draft";
  const durableDocumentRender = resolvedRenderPurpose === "document";
  const kind = el.kind ?? "freehand";
  const runtimeEnginePrograms = resolveStudioBrushRuntimeProgramSet(
    el.brush,
    el.brushEnginePrograms,
  );''',
    1,
)
write(studio_draw, draw)

svg_export = "apps/web/src/domains/creator/export/studio-svg-export-freehand-media.ts"
svg = read(svg_export)
if svg.count("el.brushEnginePrograms") < 3:
    raise RuntimeError("SVG direct program reads drifted")
svg = svg.replace("el.brushEnginePrograms", "runtimeEnginePrograms")
svg = svg.replace(
    '''import {
  planStudioAngledNibStrokeLocalCoverage,
  type StudioStrokeLocalCoveragePolygon,
} from "../brush/studio-stroke-local-coverage";''',
    '''import {
  planStudioAngledNibStrokeLocalCoverage,
  type StudioStrokeLocalCoveragePolygon,
} from "../brush/studio-stroke-local-coverage";
import { resolveStudioBrushRuntimeProgramSet } from "../brush/studio-brush-composition-runtime";''',
    1,
)
svg = svg.replace(
    '''): string {
  const perfectProfile = resolveStudioPerfectFreehandProfile(brush);''',
    '''): string {
  const runtimeEnginePrograms = resolveStudioBrushRuntimeProgramSet(
    brush,
    el.brushEnginePrograms,
  );
  const perfectProfile = resolveStudioPerfectFreehandProfile(brush);''',
    1,
)
write(svg_export, svg)

live_overlay = "apps/web/src/domains/creator/live/studio-live-retained-media-overlay.ts"
live = read(live_overlay)
if live.count("element.brushEnginePrograms?.oil") != 1:
    raise RuntimeError("live oil direct read drifted")
live = live.replace("element.brushEnginePrograms?.oil", "runtimeEnginePrograms?.oil", 1)
live = live.replace(
    '''import {
  mapStudioBrushAliasPressure,
  studioBrushAliasEffectiveDiameter,
} from "../brush/studio-brush-alias-profile";''',
    '''import {
  mapStudioBrushAliasPressure,
  studioBrushAliasEffectiveDiameter,
} from "../brush/studio-brush-alias-profile";
import { resolveStudioBrushRuntimeProgramSet } from "../brush/studio-brush-composition-runtime";''',
    1,
)
live = live.replace(
    '''      const brush = element.brush ?? "oil";
      const planInput = {''',
    '''      const brush = element.brush ?? "oil";
      const runtimeEnginePrograms = resolveStudioBrushRuntimeProgramSet(
        brush,
        element.brushEnginePrograms,
      );
      const planInput = {''',
    1,
)
write(live_overlay, live)

write(
    "apps/web/src/domains/creator/brush/studio-brush-composition-runtime-boundary.test.ts",
    '''import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../../../../../..");
function source(path: string): string {
  return readFileSync(resolve(root, path), "utf8");
}

describe("Brush Studio composition runtime product boundary", () => {
  it("routes live, committed and export pixels through the composition authority", () => {
    for (const path of [
      "apps/web/src/domains/creator/brush/StudioDrawNode.tsx",
      "apps/web/src/domains/creator/live/studio-live-retained-media-overlay.ts",
      "apps/web/src/domains/creator/export/studio-svg-export-freehand-media.ts",
    ]) {
      const content = source(path);
      expect(content, path).toContain("resolveStudioBrushRuntimeProgramSet");
      expect(content, path).not.toContain("brushEnginePrograms?.oil");
      expect(content, path).not.toContain("brushEnginePrograms?.watercolor");
    }
  });

  it("does not expose inert catalogue choices as writable product controls", () => {
    const composer = source("apps/web/src/domains/creator/brush/StudioBrushCompositionComposer.tsx");
    expect(composer).toContain("isStudioBrushCompositionRuntimeSelectable");
    expect(composer).toContain("disabled={!available}");
    expect(composer).toContain("현재 출력 미연결");
    expect(composer).toContain("constrainStudioBrushCompositionToRuntime");
  });
});
''',
)

print("Applied production build and brush runtime patches.")
