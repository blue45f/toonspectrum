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
  readonly roles: readonly string[];
}

export const BRUSH_STUDIO_V6_PROVIDER_MANIFEST = Object.freeze([
  Object.freeze({
    id: "mixbox-js-v2", label: "Mixbox", version: "2.0.0",
    license: "CC-BY-NC-4.0", rights: "noncommercial", runtime: "javascript",
    integration: "connected", roles: Object.freeze(["pigment", "palette", "pickup"]),
  }),
  Object.freeze({
    id: "libmypaint-wasm-v1", label: "libmypaint", version: "1.6.1",
    license: "ISC", rights: "permissive", runtime: "wasm",
    integration: "connected", roles: Object.freeze(["natural-media", "myb", "dabs"]),
  }),
  Object.freeze({
    id: "hokusai-wasm-v1", label: "Hokusai", version: "0.3",
    license: "MIT OR Apache-2.0", rights: "permissive", runtime: "wasm",
    integration: "connected", roles: Object.freeze(["natural-media", "tiles", "myb"]),
  }),
  Object.freeze({
    id: "krita-paintop-gpl", label: "Krita PaintOps", version: "GPL source adapter",
    license: "GPL-3.0-or-later", rights: "copyleft", runtime: "wasm",
    integration: "adapter-ready",
    roles: Object.freeze(["hairy", "dual-tip", "color-smudge", "spray"]),
  }),
  Object.freeze({
    id: "google-ink-wasm", label: "Google Ink", version: "pinned commit",
    license: "Apache-2.0", rights: "permissive", runtime: "wasm",
    integration: "connected", roles: Object.freeze(["modeler", "mesh", "vector-ink"]),
  }),
  Object.freeze({
    id: "perfect-freehand", label: "Perfect Freehand", version: "1.2.3",
    license: "MIT", rights: "permissive", runtime: "javascript",
    integration: "connected", roles: Object.freeze(["outline", "vector-ink"]),
  }),
  Object.freeze({
    id: "p5-brush", label: "p5.brush", version: "2.2.1",
    license: "MIT", rights: "permissive", runtime: "webgl",
    integration: "adapter-ready",
    roles: Object.freeze(["flow-field", "procedural", "settled-generator"]),
  }),
  Object.freeze({
    id: "opentoonz-brush", label: "OpenToonz Brush", version: "source adapter",
    license: "BSD-3-Clause with component exceptions", rights: "permissive", runtime: "wasm",
    integration: "adapter-ready",
    roles: Object.freeze(["vector-stroke", "stabilization", "animation-ink"]),
  }),
] as const satisfies readonly BrushStudioV6ProviderManifestEntry[]);

export function brushStudioV6LicenseProfileAllows(
  profile: BrushStudioV6LicenseProfile,
  rights: BrushStudioV6Rights,
): boolean {
  if (rights === "internal" || rights === "permissive") return true;
  if (profile === "permissive-only") return false;
  if (rights === "copyleft") return true;
  return profile === "noncommercial-full";
}
