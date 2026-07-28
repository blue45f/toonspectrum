/**
 * Runtime decision registry for third-party drawing libraries.
 *
 * These entries describe narrow specialist roles, not competing document engines. ToonSpectrum's
 * canonical stroke plan remains the only source of persistence, replay, collaboration and export
 * truth; every external library is therefore explicitly non-authoritative.
 */

export const STUDIO_DRAWING_LIBRARY_STRATEGY_VERSION =
  "studio-drawing-library-strategy-v1" as const;

export type StudioDrawingLibraryProductLayer =
  | "live-stroke-geometry"
  | "input-stabilization"
  | "rough-shape-rendering"
  | "settled-procedural-raster"
  | "object-selection-overlay"
  | "vector-geometry"
  | "quality-benchmark"
  | "scene-model";

export type StudioDrawingLibraryRuntimeInstallation =
  | "installed-active"
  | "installed-opt-in"
  | "installed-isolated-provider"
  | "not-installed-benchmark-only"
  | "not-installed-rejected";

export type StudioDrawingLibraryDecision =
  | "runtime-pressure-outline"
  | "opt-in-input-stabilizer"
  | "runtime-rough-shape-renderer"
  | "isolated-settled-only-provider"
  | "runtime-object-selection-overlay"
  | "isolated-vector-geometry-provider"
  | "benchmark-oracle-only"
  | "rejected-duplicate-scene-model";

export interface StudioDrawingLibraryStrategy {
  readonly registryVersion: typeof STUDIO_DRAWING_LIBRARY_STRATEGY_VERSION;
  readonly id: string;
  readonly displayName: string;
  readonly packageName: string;
  readonly license: string;
  readonly productLayer: StudioDrawingLibraryProductLayer;
  readonly decision: StudioDrawingLibraryDecision;
  readonly runtimeInstallation: StudioDrawingLibraryRuntimeInstallation;
  /** External libraries must never own persisted/replayed document meaning. */
  readonly canonicalAuthority: false;
  readonly maintenanceNote: string;
  readonly riskNotes: readonly string[];
}

function strategy(
  value: Omit<
    StudioDrawingLibraryStrategy,
    "registryVersion" | "canonicalAuthority"
  >
): StudioDrawingLibraryStrategy {
  return Object.freeze({
    registryVersion: STUDIO_DRAWING_LIBRARY_STRATEGY_VERSION,
    ...value,
    canonicalAuthority: false,
    riskNotes: Object.freeze([...value.riskNotes]),
  });
}

export const STUDIO_DRAWING_LIBRARY_STRATEGIES: readonly StudioDrawingLibraryStrategy[] =
  Object.freeze([
    strategy({
      id: "perfect-freehand",
      displayName: "perfect-freehand",
      packageName: "perfect-freehand",
      license: "MIT",
      productLayer: "live-stroke-geometry",
      decision: "runtime-pressure-outline",
      runtimeInstallation: "installed-active",
      maintenanceNote:
        "Stable, focused outline generator with a deliberately small renderer-neutral API.",
      riskNotes: [
        "It emits outline coordinates and does not own compositing, texture, history or persistence.",
        "Real pointer pressure requires simulatePressure=false at the adapter boundary.",
      ],
    }),
    strategy({
      id: "lazy-brush",
      displayName: "lazy-brush",
      packageName: "lazy-brush",
      license: "MIT",
      productLayer: "input-stabilization",
      decision: "opt-in-input-stabilizer",
      runtimeInstallation: "installed-opt-in",
      maintenanceNote:
        "Small, stable stateful leash implementation suitable for an explicit precision mode.",
      riskNotes: [
        "Mutable brush state must be reset per stroke and must not be mutated by predicted samples.",
        "Default pen input remains direct; mandatory lazy stabilization would add visible latency.",
      ],
    }),
    strategy({
      id: "roughjs",
      displayName: "Rough.js",
      packageName: "roughjs",
      license: "MIT",
      productLayer: "rough-shape-rendering",
      decision: "runtime-rough-shape-renderer",
      runtimeInstallation: "installed-active",
      maintenanceNote:
        "Stable Canvas/SVG/generator library retained for intentionally hand-drawn shapes.",
      riskNotes: [
        "A deterministic seed must be persisted or the same shape can replay differently.",
        "It is a shape style provider, not the freehand brush or scene authority.",
      ],
    }),
    strategy({
      id: "p5-brush",
      displayName: "p5.brush",
      packageName: "p5.brush",
      license: "MIT",
      productLayer: "settled-procedural-raster",
      decision: "isolated-settled-only-provider",
      runtimeInstallation: "installed-isolated-provider",
      maintenanceNote:
        "Actively maintained specialist; the verified adapter currently exposes only flow fields, hatching and mass strokes.",
      riskNotes: [
        "Runs only in a dedicated Worker on a private OffscreenCanvas WebGL2 surface.",
        "Live-stage execution is forbidden; only copied settled pixels and deterministic receipts cross the provider boundary.",
        "Image and custom tips remain fail-closed until their real adapter path passes the same browser quality gates.",
      ],
    }),
    strategy({
      id: "konva",
      displayName: "Konva",
      packageName: "konva",
      license: "MIT",
      productLayer: "object-selection-overlay",
      decision: "runtime-object-selection-overlay",
      runtimeInstallation: "installed-active",
      maintenanceNote:
        "Actively maintained retained-mode canvas library already suited to transforms, text and selection overlays.",
      riskNotes: [
        "It must not become the canonical raster brush authority.",
        "Large retained node counts require culling and layer-cache discipline.",
      ],
    }),
    strategy({
      id: "paper",
      displayName: "Paper.js",
      packageName: "paper",
      license: "MIT",
      productLayer: "vector-geometry",
      decision: "isolated-vector-geometry-provider",
      runtimeInstallation: "installed-isolated-provider",
      maintenanceNote:
        "Mature, low-churn vector geometry provider with strong simplify, smooth and Boolean path operations.",
      riskNotes: [
        "Keep it dynamically isolated so its global/project state cannot own the Studio scene.",
        "Simplification tolerance changes geometry and must be explicit in canonical commands.",
      ],
    }),
    strategy({
      id: "signature-pad",
      displayName: "Signature Pad",
      packageName: "signature_pad",
      license: "MIT",
      productLayer: "quality-benchmark",
      decision: "benchmark-oracle-only",
      runtimeInstallation: "not-installed-benchmark-only",
      maintenanceNote:
        "Maintained reference implementation for velocity-filtered cubic Bézier handwriting.",
      riskNotes: [
        "Its width model is velocity-driven and does not use recorded pointer pressure for width.",
        "Direct runtime use would duplicate the canonical stroke sampler and final renderer.",
      ],
    }),
    strategy({
      id: "atrament",
      displayName: "Atrament",
      packageName: "atrament",
      license: "MIT (upstream repository; package metadata: SEE LICENSE)",
      productLayer: "quality-benchmark",
      decision: "benchmark-oracle-only",
      runtimeInstallation: "not-installed-benchmark-only",
      maintenanceNote:
        "Compact Canvas2D reference for adaptive thickness, pressure smoothing, erase and fill interactions.",
      riskNotes: [
        "Its direct Canvas ownership conflicts with canonical live/settled replay parity.",
        "Use its interaction behavior as an oracle, not as a document or renderer dependency.",
      ],
    }),
    strategy({
      id: "croquis",
      displayName: "croquis.js",
      packageName: "@disjukr/croquis-js",
      license: "MIT OR Apache-2.0",
      productLayer: "quality-benchmark",
      decision: "benchmark-oracle-only",
      runtimeInstallation: "not-installed-benchmark-only",
      maintenanceNote:
        "Stale but useful reference for pulled-string stabilization and snake-style stroke smoothing.",
      riskNotes: [
        "Low maintenance activity makes direct runtime adoption unsuitable.",
        "Its layer/history model would duplicate current Studio ownership.",
      ],
    }),
    strategy({
      id: "fabric",
      displayName: "Fabric.js",
      packageName: "fabric",
      license: "MIT",
      productLayer: "scene-model",
      decision: "rejected-duplicate-scene-model",
      runtimeInstallation: "not-installed-rejected",
      maintenanceNote:
        "Actively maintained object-canvas engine, but its strongest role overlaps the existing Konva scene layer.",
      riskNotes: [
        "A second retained object model would create duplicate selection, serialization and hit-test authorities.",
        "Its basic PencilBrush does not justify the migration and integration cost.",
      ],
    }),
  ]);

const STRATEGY_BY_ID = new Map(
  STUDIO_DRAWING_LIBRARY_STRATEGIES.map((entry) => [entry.id, entry])
);

export function resolveStudioDrawingLibraryStrategy(
  id: unknown
): StudioDrawingLibraryStrategy | null {
  return typeof id === "string" ? STRATEGY_BY_ID.get(id) ?? null : null;
}

export function listStudioDrawingLibraryStrategiesByLayer(
  layer: StudioDrawingLibraryProductLayer
): readonly StudioDrawingLibraryStrategy[] {
  return Object.freeze(
    STUDIO_DRAWING_LIBRARY_STRATEGIES.filter(
      (entry) => entry.productLayer === layer
    )
  );
}

export interface StudioDrawingLibraryStrategyValidationCandidate {
  readonly id: unknown;
  readonly canonicalAuthority: unknown;
}

export interface StudioDrawingLibraryStrategyValidation {
  readonly valid: boolean;
  readonly duplicateIds: readonly string[];
  readonly conflictingCanonicalAuthorityIds: readonly string[];
}

/**
 * Validates registry ownership invariants independently of TypeScript. This also protects data
 * loaded from generated manifests or tests that bypass compile-time literal types.
 */
export function validateStudioDrawingLibraryStrategies(
  entries: readonly StudioDrawingLibraryStrategyValidationCandidate[] =
    STUDIO_DRAWING_LIBRARY_STRATEGIES
): StudioDrawingLibraryStrategyValidation {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const conflicts = new Set<string>();

  entries.forEach((entry, index) => {
    const id =
      typeof entry.id === "string" && entry.id.trim().length > 0
        ? entry.id
        : `<invalid:${index}>`;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
    if (entry.canonicalAuthority !== false) conflicts.add(id);
  });

  const duplicateIds = Object.freeze([...duplicates].sort());
  const conflictingCanonicalAuthorityIds = Object.freeze(
    [...conflicts].sort()
  );
  return Object.freeze({
    valid:
      duplicateIds.length === 0
      && conflictingCanonicalAuthorityIds.length === 0,
    duplicateIds,
    conflictingCanonicalAuthorityIds,
  });
}
