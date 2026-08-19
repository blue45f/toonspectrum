/**
 * Provider feature / execution contracts (V13 §5.1, §9).
 *
 * Plane capability strings cannot express mask depth, isolation, or transport.
 * These contracts are the planner/compiler input for Vello-first, Skia-complete
 * routing.
 */

export type ProviderSupportLevel =
  | "native"
  | "lowered"
  | "texture-island"
  | "reference"
  | "unsupported";

export interface ProviderFeatureConstraints {
  readonly isolatedOnly?: boolean;
  readonly maxMaskDepth?: number;
  readonly maxFilterRadius?: number;
  readonly supportedFormats?: readonly string[];
  readonly supportedColorSpaces?: readonly string[];
  readonly externalTexture?: boolean;
}

export interface ProviderFeatureContract {
  readonly feature: string;
  readonly support: ProviderSupportLevel;
  readonly constraints?: ProviderFeatureConstraints;
}

export interface ProviderExecutionContract {
  readonly host: "js" | "wasm";
  readonly accelerator: "webgpu" | "webgl" | "cpu";
  readonly thread: "main" | "worker";
  readonly deviceInterop: "shared-device" | "external-image" | "none";
  readonly output: "gpu-texture" | "image-bitmap" | "pixels";
}

export const V13_RENDER_FEATURES = [
  "render.vector.fill",
  "render.vector.stroke",
  "render.vector.gradient",
  "render.vector.gradient.sweep",
  "render.group.opacity",
  "render.group.clip",
  "render.text.simple",
  "render.text.paragraph",
  "render.image",
  "render.external-texture",
  "render.mask",
  "render.filter.image",
  "render.filter.simple",
  "render.blend.backdrop",
  "render.path-effect",
] as const;
export type V13RenderFeature = (typeof V13_RENDER_FEATURES)[number];

function native(feature: V13RenderFeature): ProviderFeatureContract {
  return { feature, support: "native" };
}

function lowered(feature: V13RenderFeature, lowering: string): ProviderFeatureContract {
  return { feature, support: "lowered", constraints: { supportedFormats: [lowering] } };
}

function textureIsland(feature: V13RenderFeature): ProviderFeatureContract {
  return { feature, support: "texture-island", constraints: { isolatedOnly: true } };
}

function unsupported(feature: V13RenderFeature): ProviderFeatureContract {
  return { feature, support: "unsupported" };
}

/** Vello Classic GPU — path-heavy fill/stroke/clip accelerator. */
export const VELLO_CLASSIC_FEATURE_CONTRACTS: readonly ProviderFeatureContract[] = [
  native("render.vector.fill"),
  native("render.vector.stroke"),
  native("render.vector.gradient"),
  native("render.vector.gradient.sweep"),
  native("render.group.opacity"),
  native("render.group.clip"),
  lowered("render.text.simple", "glyph-path"),
  unsupported("render.text.paragraph"),
  unsupported("render.image"),
  unsupported("render.external-texture"),
  unsupported("render.mask"),
  unsupported("render.filter.image"),
  unsupported("render.filter.simple"),
  unsupported("render.blend.backdrop"),
  unsupported("render.path-effect"),
];

/**
 * Vello Hybrid compositor lane — Classic path islands plus external texture
 * binding. This is not the upstream sparse-strip Hybrid GPU API.
 */
export const VELLO_HYBRID_FEATURE_CONTRACTS: readonly ProviderFeatureContract[] = [
  native("render.vector.fill"),
  native("render.vector.stroke"),
  native("render.vector.gradient"),
  native("render.vector.gradient.sweep"),
  native("render.group.opacity"),
  native("render.group.clip"),
  lowered("render.text.simple", "glyph-path"),
  textureIsland("render.text.paragraph"),
  native("render.image"),
  native("render.external-texture"),
  textureIsland("render.mask"),
  textureIsland("render.filter.image"),
  lowered("render.filter.simple", "compositor-pass"),
  unsupported("render.blend.backdrop"),
  unsupported("render.path-effect"),
];

export const SKIA_GPU_FEATURE_CONTRACTS: readonly ProviderFeatureContract[] = [
  native("render.vector.fill"),
  native("render.vector.stroke"),
  native("render.vector.gradient"),
  native("render.vector.gradient.sweep"),
  native("render.group.opacity"),
  native("render.group.clip"),
  native("render.text.simple"),
  native("render.text.paragraph"),
  native("render.image"),
  textureIsland("render.external-texture"),
  native("render.mask"),
  native("render.filter.image"),
  native("render.filter.simple"),
  native("render.blend.backdrop"),
  native("render.path-effect"),
];

export const SKIA_CPU_REFERENCE_FEATURE_CONTRACTS: readonly ProviderFeatureContract[] =
  SKIA_GPU_FEATURE_CONTRACTS.map((contract) =>
    contract.support === "native"
      ? { ...contract, support: "reference" as const }
      : contract,
  );

export const VELLO_CLASSIC_EXECUTION: ProviderExecutionContract = {
  host: "wasm",
  accelerator: "webgpu",
  thread: "main",
  deviceInterop: "shared-device",
  output: "gpu-texture",
};

export const VELLO_HYBRID_EXECUTION: ProviderExecutionContract = {
  host: "js",
  accelerator: "webgpu",
  thread: "main",
  deviceInterop: "shared-device",
  output: "gpu-texture",
};

export const SKIA_GPU_EXECUTION: ProviderExecutionContract = {
  host: "wasm",
  accelerator: "webgl",
  thread: "worker",
  deviceInterop: "external-image",
  output: "image-bitmap",
};

export const SKIA_CPU_REFERENCE_EXECUTION: ProviderExecutionContract = {
  host: "wasm",
  accelerator: "cpu",
  thread: "worker",
  deviceInterop: "none",
  output: "pixels",
};

export function supportForFeature(
  contracts: readonly ProviderFeatureContract[],
  feature: string,
): ProviderFeatureContract {
  return contracts.find((contract) => contract.feature === feature)
    ?? { feature, support: "unsupported" };
}

export function velloCanOwnFeature(feature: string, hybrid: boolean): boolean {
  const contract = supportForFeature(
    hybrid ? VELLO_HYBRID_FEATURE_CONTRACTS : VELLO_CLASSIC_FEATURE_CONTRACTS,
    feature,
  );
  return contract.support === "native" || contract.support === "lowered";
}

export function skiaMustCompleteFeature(feature: string): boolean {
  if (velloCanOwnFeature(feature, true)) return false;
  const skia = supportForFeature(SKIA_GPU_FEATURE_CONTRACTS, feature);
  return skia.support === "native" || skia.support === "lowered";
}
