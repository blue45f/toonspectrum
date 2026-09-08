import * as THREE from "three";

import {
  STUDIO_VRM_TEXTURE_PAINT_CHANNELS,
  studioVrmTexturePaintChannelEncoding,
  type StudioVrmTexturePaintChannel,
} from "./studio-vrm-texture-paint-channel";

type PaintMaterial = THREE.Material & {
  map?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
  metalnessMap?: THREE.Texture | null;
  emissiveMap?: THREE.Texture | null;
  alphaMap?: THREE.Texture | null;
  roughness?: number;
  metalness?: number;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  isMeshStandardMaterial?: boolean;
  isMToonMaterial?: boolean;
};

type TextureProperty = "map" | "roughnessMap" | "metalnessMap" | "emissiveMap" | "alphaMap";
const TEXTURE_PROPERTIES: Readonly<Record<StudioVrmTexturePaintChannel, TextureProperty>> = {
  baseColor: "map",
  roughness: "roughnessMap",
  metalness: "metalnessMap",
  emissive: "emissiveMap",
  opacity: "alphaMap",
};

interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

interface ChannelSource {
  readonly channel: StudioVrmTexturePaintChannel;
  readonly original: THREE.Texture | null;
  readonly factors: readonly [number, number, number];
  readonly width: number;
  readonly height: number;
}

interface MaterialChannel {
  readonly channel: StudioVrmTexturePaintChannel;
  readonly material: PaintMaterial;
  readonly property: TextureProperty;
  readonly source: THREE.Texture;
  readonly original: THREE.Texture | null;
  readonly originalFactor: number | THREE.Color | null;
  readonly originalEmissiveIntensity: number | undefined;
  readonly originalTransparent: boolean;
  current: THREE.Texture;
  applied: boolean;
}

function validFactor(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function dimensions(texture: THREE.Texture | null): { width: number; height: number } {
  const image = texture?.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number } | undefined;
  return {
    width: image?.naturalWidth || image?.width || 2_048,
    height: image?.naturalHeight || image?.height || 2_048,
  };
}

function fromSrgb(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function toSrgb(value: number): number {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
}

export function studioVrmMaterialSupportsPaintChannel(
  material: THREE.Material,
  channel: StudioVrmTexturePaintChannel,
): boolean {
  const candidate = material as PaintMaterial;
  switch (channel) {
    case "baseColor": return "map" in candidate;
    case "roughness": return candidate.isMeshStandardMaterial === true && validFactor(candidate.roughness);
    case "metalness": return candidate.isMeshStandardMaterial === true && validFactor(candidate.metalness);
    case "emissive": return "emissiveMap" in candidate && candidate.emissive?.isColor === true
      && [candidate.emissive.r, candidate.emissive.g, candidate.emissive.b].every(validFactor);
    case "opacity": return "alphaMap" in candidate;
  }
}

/**
 * Isolates logical channels even when a glTF material shares one packed texture between slots.
 * Source clones only borrow immutable image bytes. Editable canvases remain runtime-owned.
 */
export class StudioVrmTexturePaintMaterialChannels {
  private readonly materials = new Map<THREE.Material, Map<StudioVrmTexturePaintChannel, MaterialChannel>>();
  private readonly sources = new Map<THREE.Texture, ChannelSource>();
  private readonly shared = new WeakMap<THREE.Texture, Map<string, THREE.Texture>>();

  supportedChannels(scene: THREE.Object3D): readonly StudioVrmTexturePaintChannel[] {
    const supported = new Set<StudioVrmTexturePaintChannel>();
    scene.traverse((object) => {
      const material = (object as THREE.Mesh).material;
      if (!material) return;
      for (const candidate of Array.isArray(material) ? material : [material]) {
        for (const channel of STUDIO_VRM_TEXTURE_PAINT_CHANNELS) {
          if (studioVrmMaterialSupportsPaintChannel(candidate, channel)) supported.add(channel);
        }
      }
    });
    return STUDIO_VRM_TEXTURE_PAINT_CHANNELS.filter((channel) => supported.has(channel));
  }

  channelOf(source: THREE.Texture): StudioVrmTexturePaintChannel {
    return this.sources.get(source)?.channel ?? "baseColor";
  }

  get(material: THREE.Material, channel: StudioVrmTexturePaintChannel): THREE.Texture | null {
    const candidate = material as PaintMaterial;
    if (channel === "baseColor") return candidate.map ?? null;
    if (!studioVrmMaterialSupportsPaintChannel(material, channel)) return null;
    const previous = this.materials.get(material)?.get(channel);
    if (previous) {
      const expected = previous.applied ? previous.current : previous.original;
      if (candidate[previous.property] !== expected) throw new Error("paint-channel-source-changed");
      return previous.current;
    }
    const property = TEXTURE_PROPERTIES[channel];
    const original = candidate[property] ?? null;
    const originalFactor = channel === "roughness" ? candidate.roughness!
      : channel === "metalness" ? candidate.metalness!
        : channel === "emissive" ? candidate.emissive!.clone() : null;
    const emissiveEnabled = candidate.emissiveIntensity === 0 ? 0 : 1;
    const factors: readonly [number, number, number] = originalFactor instanceof THREE.Color
      ? [originalFactor.r * emissiveEnabled, originalFactor.g * emissiveEnabled, originalFactor.b * emissiveEnabled]
      : [originalFactor ?? 1, originalFactor ?? 1, originalFactor ?? 1];
    const template = original ?? candidate.map ?? null;
    const size = dimensions(template);
    const sharingKey = `${channel}:${original ? "texture" : "constant"}:${factors.join(",")}`;
    let source = template ? this.shared.get(template)?.get(sharingKey) : undefined;
    if (!source) {
      source = original ? original.clone()
        : template ? new THREE.Texture().copy(template) : new THREE.Texture({ ...size });
      if (!original) {
        source.format = THREE.RGBAFormat;
        source.type = THREE.UnsignedByteType;
      }
      source.name = `${material.name || "material"}-${channel}`;
      source.colorSpace = studioVrmTexturePaintChannelEncoding(channel).colorSpace === "srgb"
        ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      this.sources.set(source, { channel, original, factors, ...size });
      if (template) {
        let entries = this.shared.get(template);
        if (!entries) this.shared.set(template, entries = new Map());
        entries.set(sharingKey, source);
      }
    }
    let entries = this.materials.get(material);
    if (!entries) this.materials.set(material, entries = new Map());
    entries.set(channel, {
      material: candidate, channel, property, source, original, originalFactor,
      originalEmissiveIntensity: candidate.emissiveIntensity,
      originalTransparent: material.transparent,
      current: source,
      applied: false,
    });
    return source;
  }

  set(material: THREE.Material, channel: StudioVrmTexturePaintChannel, texture: THREE.Texture | null): void {
    if (channel === "baseColor") {
      (material as PaintMaterial).map = texture;
      return;
    }
    const state = this.materials.get(material)?.get(channel);
    if (!state || !texture) throw new Error("paint-channel-binding-missing");
    if (texture === state.source) {
      state.material[state.property] = state.original;
      this.restoreFactors(state);
      state.current = state.source;
      state.applied = false;
      return;
    }
    state.current = texture;
    state.applied = true;
    state.material[state.property] = texture;
    if (channel === "roughness") state.material.roughness = 1;
    if (channel === "metalness") state.material.metalness = 1;
    if (channel === "emissive") {
      state.material.emissive!.setRGB(1, 1, 1);
      if (state.material.emissiveIntensity === 0) state.material.emissiveIntensity = 1;
    }
    if (channel === "opacity") state.material.transparent = true;
  }

  async read(
    source: THREE.Texture,
    signal: AbortSignal,
    read: (texture: THREE.Texture, signal: AbortSignal) => Promise<Pixels> | Pixels,
  ): Promise<Pixels> {
    const description = this.sources.get(source);
    if (!description) return read(source, signal);
    if (!Number.isSafeInteger(description.width) || !Number.isSafeInteger(description.height)
      || description.width < 1 || description.height < 1
      || description.width > 4_096 || description.height > 4_096) {
      throw new RangeError("paint-channel-dimensions-invalid");
    }
    const pixels = description.original
      ? await read(source, signal)
      : { width: description.width, height: description.height,
          data: new Uint8ClampedArray(description.width * description.height * 4) };
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const { channel, original, factors } = description;
    for (let offset = 0; offset < pixels.data.length; offset += 4) {
      if (channel === "emissive") {
        for (let component = 0; component < 3; component += 1) {
          const input = original ? fromSrgb(pixels.data[offset + component]! / 255) : 1;
          pixels.data[offset + component] = Math.round(toSrgb(input * factors[component]!) * 255);
        }
      } else {
        const component = channel === "metalness" ? 2 : 1;
        const input = original ? pixels.data[offset + component]! / 255 : 1;
        const value = Math.round(input * factors[0] * 255);
        pixels.data[offset] = value;
        pixels.data[offset + 1] = value;
        pixels.data[offset + 2] = value;
      }
      pixels.data[offset + 3] = 255;
    }
    return pixels;
  }

  dispose(): void {
    for (const states of this.materials.values()) {
      for (const state of states.values()) {
        if (state.applied && state.material[state.property] === state.current) {
          state.material[state.property] = state.original;
          this.restoreFactors(state);
          state.material.needsUpdate = true;
        }
      }
    }
    for (const source of this.sources.keys()) source.dispose();
    this.sources.clear();
    this.materials.clear();
  }

  private restoreFactors(state: MaterialChannel): void {
    if (state.channel === "roughness") state.material.roughness = state.originalFactor as number;
    if (state.channel === "metalness") state.material.metalness = state.originalFactor as number;
    if (state.channel === "emissive") {
      state.material.emissive!.copy(state.originalFactor as THREE.Color);
      if (state.originalEmissiveIntensity !== undefined) {
        state.material.emissiveIntensity = state.originalEmissiveIntensity;
      }
    }
    if (state.channel === "opacity") state.material.transparent = state.originalTransparent;
  }
}
