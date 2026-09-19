export type BrushStudioV6Rights =
  | "internal"
  | "permissive"
  | "copyleft"
  | "noncommercial"
  | "private-grant";

export type BrushStudioV6LicenseProfile =
  | "permissive-only"
  | "source-available"
  | "noncommercial-full";

export type BrushStudioV6ProductPath =
  | "material-contact"
  | "standalone-engine"
  | "vector-runtime"
  | "settled-generator"
  | "research";

export type BrushStudioV6MaterialExecution =
  | "native"
  | "compatibility-adapter";

export const BRUSH_STUDIO_V6_DEFAULT_LICENSE_PROFILE =
  "noncommercial-full" as const satisfies BrushStudioV6LicenseProfile;

export interface BrushStudioV6ProviderManifestEntry {
  readonly id: string;
  readonly label: string;
  readonly version: string;
  readonly license: string;
  readonly rights: BrushStudioV6Rights;
  readonly runtime: "javascript" | "wasm" | "webgpu" | "webgl";
  readonly integration: "connected" | "adapter-ready" | "research";
  readonly productPath: BrushStudioV6ProductPath;
  readonly materialExecution?: BrushStudioV6MaterialExecution;
  readonly roles: readonly string[];
  readonly nodeIds: readonly string[];
}

function provider(entry: BrushStudioV6ProviderManifestEntry): BrushStudioV6ProviderManifestEntry {
  return Object.freeze({
    ...entry,
    roles: Object.freeze([...entry.roles]),
    nodeIds: Object.freeze([...entry.nodeIds]),
  });
}

const INTERNAL_MATERIAL_NODE_IDS = Object.freeze([
  "input-pointer-v3",
  "motion-direct", "motion-adaptive-ema", "motion-spring", "motion-brush-inertia", "motion-lazy-leash",
  "carrier-webgpu-centerline", "carrier-webgpu-ribbon", "carrier-webgpu-particles",
  "tip-round-sdf", "tip-chisel-sdf", "tip-grain-exemplar", "tip-motif-atlas",
  "surface-smooth", "surface-kent", "surface-coldpress", "surface-printmaking", "surface-linen", "surface-porous",
  "deposit-ink", "deposit-marker", "deposit-dry", "deposit-oil", "deposit-particles", "deposit-light",
  "pickup-none", "pickup-pigment-reservoir", "pigment-rgb",
  "physics-dry-contact", "physics-thin-film", "physics-bristle", "physics-particles", "physics-reaction", "physics-height",
  "physics-backrun-capillary", "physics-pigment-sedimentation", "physics-bristle-split-merge",
  "pattern-none", "pattern-dot-tone", "pattern-cross-hatch", "pattern-weave", "pattern-brick", "pattern-foliage",
  "pattern-stitch", "pattern-kaleido", "pattern-vector-flow", "pattern-vector-vortex", "pattern-vector-contour",
  "pattern-textile-satin", "pattern-textile-twill", "pattern-rainbow",
  "finish-edge-bloom", "finish-wet-sheen", "finish-relief", "finish-directional-relief", "finish-neon", "finish-grain",
  "output-contact-canvas-svg",
]);

export const BRUSH_STUDIO_V6_PROVIDER_MANIFEST = Object.freeze([
  provider({
    id: "toonspectrum-cpu-contact-v2", label: "ToonSpectrum Contact Kernel", version: "2",
    license: "Project license", rights: "internal", runtime: "javascript",
    integration: "connected", productPath: "material-contact", materialExecution: "native",
    roles: ["contact", "surface", "physics", "pattern", "output"], nodeIds: INTERNAL_MATERIAL_NODE_IDS,
  }),
  provider({
    id: "spectral-js-v3", label: "Spectral.js · 분광 K/S", version: "3.0.0",
    license: "MIT", rights: "permissive", runtime: "javascript",
    integration: "connected", productPath: "material-contact", materialExecution: "native",
    roles: ["pigment", "palette"], nodeIds: ["pigment-spectral-js"],
  }),
  provider({
    id: "open-km-spectral-v1", label: "open-km · 합성 분광 K/S", version: "1",
    license: "MIT (open-km + spectral.js)", rights: "permissive", runtime: "javascript",
    integration: "connected", productPath: "material-contact", materialExecution: "native",
    roles: ["pigment", "palette"], nodeIds: ["pigment-open-km-spectral"],
  }),
  provider({
    id: "colormix-lab-v3", label: "ColorMix.js · Lab 비교", version: "3.2.0",
    license: "MIT", rights: "permissive", runtime: "javascript",
    integration: "connected", productPath: "material-contact", materialExecution: "native",
    roles: ["pigment", "palette"], nodeIds: ["pigment-colormix-lab"],
  }),
  provider({
    id: "mixbox-js-v2", label: "Mixbox", version: "2.0.0",
    license: "CC-BY-NC-4.0", rights: "noncommercial", runtime: "javascript",
    integration: "connected", productPath: "material-contact", materialExecution: "native",
    roles: ["pigment", "palette", "pickup"], nodeIds: ["pigment-mixbox"],
  }),
  provider({
    id: "spectral-wgm-v1", label: "Spectral WGM", version: "1",
    license: "Project/permissive components", rights: "permissive", runtime: "javascript",
    integration: "connected", productPath: "material-contact", materialExecution: "native",
    roles: ["pigment", "palette"], nodeIds: ["pigment-spectral"],
  }),
  provider({
    id: "ks-reference-wgm-v1", label: "K/S Reference WGM", version: "1",
    license: "Project license", rights: "internal", runtime: "javascript",
    integration: "connected", productPath: "material-contact", materialExecution: "native",
    roles: ["pigment", "reference"], nodeIds: ["pigment-open-km"],
  }),
  provider({
    id: "inkwash-density-wgm-v1", label: "Inkwash Density Adapter", version: "1",
    license: "Private grant", rights: "private-grant", runtime: "javascript",
    integration: "connected", productPath: "material-contact", materialExecution: "native",
    roles: ["pigment", "inkwash", "reference", "wet-runtime"],
    nodeIds: ["pigment-inkwash-density", "deposit-wet", "physics-inkwash", "finish-chroma"],
  }),
  provider({
    id: "libmypaint-wasm-v1", label: "libmypaint", version: "1.6.1",
    license: "ISC", rights: "permissive", runtime: "wasm",
    integration: "connected", productPath: "standalone-engine",
    roles: ["natural-media", "myb", "dabs"], nodeIds: [],
  }),
  provider({
    id: "libmypaint-contact-adapter-v1", label: "libmypaint Contact Adapter", version: "1",
    license: "ISC + project adapter", rights: "permissive", runtime: "javascript",
    integration: "connected", productPath: "material-contact", materialExecution: "compatibility-adapter",
    roles: ["natural-media", "contact-adapter"], nodeIds: ["carrier-libmypaint-dabs"],
  }),
  provider({
    id: "hokusai-wasm-v1", label: "Hokusai", version: "0.3",
    license: "MIT OR Apache-2.0", rights: "permissive", runtime: "wasm",
    integration: "connected", productPath: "standalone-engine",
    roles: ["natural-media", "tiles", "myb"], nodeIds: [],
  }),
  provider({
    id: "hokusai-contact-adapter-v1", label: "Hokusai Contact Adapter", version: "1",
    license: "MIT OR Apache-2.0 + project adapter", rights: "permissive", runtime: "javascript",
    integration: "connected", productPath: "material-contact", materialExecution: "compatibility-adapter",
    roles: ["natural-media", "contact-adapter"], nodeIds: ["carrier-hokusai-dabs"],
  }),
  provider({
    id: "krita-paintop-gpl", label: "Krita PaintOps", version: "GPL source adapter",
    license: "GPL-3.0-or-later", rights: "copyleft", runtime: "wasm",
    integration: "adapter-ready", productPath: "standalone-engine",
    roles: ["hairy", "dual-tip", "color-smudge", "spray"], nodeIds: [],
  }),
  provider({
    id: "krita-contact-adapter-gpl-v1", label: "Krita-compatible Contact Adapter", version: "1",
    license: "GPL-compatible source profile", rights: "copyleft", runtime: "javascript",
    integration: "connected", productPath: "material-contact", materialExecution: "compatibility-adapter",
    roles: ["hairy", "dual-tip", "color-smudge", "contact-adapter"],
    nodeIds: ["carrier-krita-hairy", "tip-krita-dual", "pickup-krita-smudge"],
  }),
  provider({
    id: "perfect-freehand", label: "Perfect Freehand", version: "1.2.3",
    license: "MIT", rights: "permissive", runtime: "javascript",
    integration: "connected", productPath: "vector-runtime",
    roles: ["outline", "vector-ink"], nodeIds: [],
  }),
  provider({
    id: "perfect-outline-contact-adapter-v1", label: "Perfect Outline Contact Adapter", version: "1",
    license: "MIT + project adapter", rights: "permissive", runtime: "javascript",
    integration: "connected", productPath: "material-contact", materialExecution: "compatibility-adapter",
    roles: ["outline", "contact-adapter"], nodeIds: ["carrier-perfect-outline"],
  }),
  provider({
    id: "google-ink-wasm", label: "Google Ink", version: "pinned commit",
    license: "Apache-2.0", rights: "permissive", runtime: "wasm",
    integration: "connected", productPath: "vector-runtime",
    roles: ["modeler", "mesh", "vector-ink"],
    nodeIds: ["motion-google-ink", "carrier-google-mesh"],
  }),
  provider({
    id: "p5-brush", label: "p5.brush", version: "2.2.1",
    license: "MIT", rights: "permissive", runtime: "webgl",
    integration: "connected", productPath: "settled-generator",
    roles: ["flow-field", "procedural", "settled-generator"],
    nodeIds: ["carrier-p5-flow", "pattern-flow-field"],
  }),
  provider({
    id: "opentoonz-brush", label: "OpenToonz Brush", version: "source adapter",
    license: "BSD-3-Clause with component exceptions", rights: "permissive", runtime: "wasm",
    integration: "adapter-ready", productPath: "research",
    roles: ["vector-stroke", "stabilization", "animation-ink"], nodeIds: [],
  }),
  provider({
    id: "pigment-painter-lut-gpl", label: "Pigment Painter LUT", version: "source adapter",
    license: "GPL-compatible source profile", rights: "copyleft", runtime: "webgpu",
    integration: "adapter-ready", productPath: "research",
    roles: ["pigment", "lut"], nodeIds: ["pigment-painter-lut"],
  }),
  provider({
    id: "pigment-painter-contact-adapter-v1", label: "Normal Tip Contact Adapter", version: "1",
    license: "GPL-compatible source profile", rights: "copyleft", runtime: "javascript",
    integration: "connected", productPath: "material-contact", materialExecution: "compatibility-adapter",
    roles: ["normal-tip", "relief", "contact-adapter"], nodeIds: ["tip-pigment-normal"],
  }),
  provider({
    id: "realbrush-surface-adapter-v1", label: "Captured Surface Adapter", version: "1",
    license: "Project/asset-specific", rights: "internal", runtime: "javascript",
    integration: "connected", productPath: "material-contact", materialExecution: "compatibility-adapter",
    roles: ["surface", "contact-adapter"], nodeIds: ["surface-realbrush"],
  }),
  provider({
    id: "porous-paper-contact-adapter-v1", label: "Porous Paper Adapter", version: "1",
    license: "Project license", rights: "internal", runtime: "javascript",
    integration: "connected", productPath: "material-contact", materialExecution: "compatibility-adapter",
    roles: ["paper", "wet", "contact-adapter"], nodeIds: ["physics-porous-paper"],
  }),
  provider({
    id: "toonspectrum-output-research", label: "ToonSpectrum Output Research", version: "1",
    license: "Project license", rights: "internal", runtime: "webgpu",
    integration: "research", productPath: "research",
    roles: ["output"], nodeIds: ["output-raster-tiles", "output-hybrid", "output-vector"],
  }),
] as const satisfies readonly BrushStudioV6ProviderManifestEntry[]);

const PROVIDER_BY_ID = new Map(
  BRUSH_STUDIO_V6_PROVIDER_MANIFEST.map((entry) => [entry.id, entry]),
);
const PROVIDER_BY_NODE = new Map<string, BrushStudioV6ProviderManifestEntry>();
for (const entry of BRUSH_STUDIO_V6_PROVIDER_MANIFEST) {
  for (const nodeId of entry.nodeIds) {
    if (PROVIDER_BY_NODE.has(nodeId)) {
      throw new Error(`Brush node ${nodeId} has more than one provider manifest entry.`);
    }
    PROVIDER_BY_NODE.set(nodeId, entry);
  }
}

export function brushStudioV6ProviderManifestById(id: string): BrushStudioV6ProviderManifestEntry | null {
  return PROVIDER_BY_ID.get(id) ?? null;
}

export function brushStudioV6ProviderManifestForNode(
  nodeId: string,
): BrushStudioV6ProviderManifestEntry | null {
  if (nodeId.startsWith("carrier-cpu-") || nodeId.startsWith("surface-v7-")) {
    return PROVIDER_BY_ID.get("toonspectrum-cpu-contact-v2") ?? null;
  }
  return PROVIDER_BY_NODE.get(nodeId) ?? null;
}

export function brushStudioV6MaterialExecutionForNode(
  nodeId: string,
): BrushStudioV6MaterialExecution | null {
  const manifest = brushStudioV6ProviderManifestForNode(nodeId);
  if (manifest?.integration !== "connected" || manifest.productPath !== "material-contact") {
    return null;
  }
  return manifest.materialExecution ?? null;
}

export function brushStudioV6LicenseProfileAllows(
  profile: BrushStudioV6LicenseProfile,
  rights: BrushStudioV6Rights,
): boolean {
  if (rights === "internal" || rights === "permissive") return true;
  if (profile === "permissive-only") return false;
  if (rights === "copyleft") return true;
  return profile === "noncommercial-full";
}
