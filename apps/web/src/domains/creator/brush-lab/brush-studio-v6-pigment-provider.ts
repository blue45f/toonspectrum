import mixbox from "mixbox";
import {
  createExternalPigmentPalette, EXTERNAL_PIGMENT_PROVIDERS,
  isExternalPigmentProvider, prepareExternalPigmentPair,
  type ExternalPigmentProvider,
} from "./pigment/external-pigments";

import { mixStudioSpectralWgm } from "../studio-spectral-wgm-mix-v1";

import type { BrushStudioV6Rights } from "./brush-studio-v6-license-profile";

export type BrushStudioV6PigmentProviderId =
  | ExternalPigmentProvider
  | "rgb-linear-v1"
  | "spectral-wgm-v1"
  | "mixbox-js-v2"
  | "ks-reference-wgm-v1"
  | "inkwash-density-wgm-v1";

export interface BrushStudioV6PigmentProviderDescriptor {
  readonly id: BrushStudioV6PigmentProviderId;
  readonly nodeId: string;
  readonly label: string;
  readonly version: string;
  readonly rights: BrushStudioV6Rights;
  readonly execution: "native" | "legacy-reference";
}

type Rgb = Readonly<{ r: number; g: number; b: number }>;

function descriptor(
  value: BrushStudioV6PigmentProviderDescriptor,
): BrushStudioV6PigmentProviderDescriptor {
  return Object.freeze(value);
}

export const BRUSH_STUDIO_V6_PIGMENT_PROVIDERS = Object.freeze([
  ...EXTERNAL_PIGMENT_PROVIDERS.map((entry) => descriptor({ ...entry, rights: "permissive", execution: "native" })),
  descriptor({ id: "rgb-linear-v1", nodeId: "pigment-rgb", label: "RGB Linear", version: "1", rights: "internal", execution: "native" }),
  descriptor({ id: "spectral-wgm-v1", nodeId: "pigment-spectral", label: "Spectral WGM", version: "1", rights: "permissive", execution: "native" }),
  descriptor({ id: "mixbox-js-v2", nodeId: "pigment-mixbox", label: "Mixbox Latent Pigment", version: "2.0.0", rights: "noncommercial", execution: "native" }),
  descriptor({ id: "ks-reference-wgm-v1", nodeId: "pigment-open-km", label: "K/S Reference WGM", version: "1", rights: "internal", execution: "legacy-reference" }),
  descriptor({ id: "inkwash-density-wgm-v1", nodeId: "pigment-inkwash-density", label: "Inkwash Density WGM", version: "1", rights: "private-grant", execution: "legacy-reference" }),
] as const);

const PROVIDER_BY_NODE = new Map(
  BRUSH_STUDIO_V6_PIGMENT_PROVIDERS.map((entry) => [entry.nodeId, entry]),
);
const PROVIDER_BY_ID = new Map(
  BRUSH_STUDIO_V6_PIGMENT_PROVIDERS.map((entry) => [entry.id, entry]),
);

export class BrushStudioV6PigmentProviderUnavailableError extends Error {
  constructor(readonly pigmentNodeId: string) {
    super(`안료 프로바이더 ${pigmentNodeId}는 이 재료 런타임에 연결되지 않았습니다.`);
    this.name = "BrushStudioV6PigmentProviderUnavailableError";
  }
}

export function brushStudioV6PigmentProviderForNode(
  nodeId: string,
): BrushStudioV6PigmentProviderDescriptor | null {
  return PROVIDER_BY_NODE.get(nodeId) ?? null;
}

function unit(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function parseColor(hex: string): Rgb {
  const value = /^#[0-9a-f]{6}$/iu.test(hex)
    ? Number.parseInt(hex.slice(1), 16)
    : 0x111827;
  return Object.freeze({
    r: (value >>> 16) / 255,
    g: ((value >>> 8) & 255) / 255,
    b: (value & 255) / 255,
  });
}

function hexColor(color: Rgb | readonly number[]): string {
  const channels: readonly number[] = Array.isArray(color)
    ? color
    : [(color as Rgb).r, (color as Rgb).g, (color as Rgb).b];
  return `#${channels.slice(0, 3).map((channel) =>
    Math.round(unit(channel ?? 0) * 255).toString(16).padStart(2, "0")
  ).join("")}`;
}

function exactEndpoint(first: Rgb, second: Rgb, ratio: number): string | null {
  if (ratio === 0) return hexColor(first);
  if (ratio === 1) return hexColor(second);
  return null;
}

function mixWgm(first: Rgb, second: Rgb, ratio: number, spectral: boolean): string {
  return hexColor(mixStudioSpectralWgm(first, second, 1 - ratio, spectral ? 1 : 0));
}

function mixboxPalette(
  first: Rgb,
  second: Rgb,
  steps: number,
): readonly string[] {
  const firstLatent = mixbox.floatRgbToLatent([first.r, first.g, first.b]);
  const secondLatent = mixbox.floatRgbToLatent([second.r, second.g, second.b]);
  return Object.freeze(Array.from({ length: steps }, (_, index) => {
    const ratio = index / (steps - 1);
    const endpoint = exactEndpoint(first, second, ratio);
    if (endpoint) return endpoint;
    const latent = Array.from({ length: mixbox.LATENT_SIZE }, (__, channel) => {
      const left = firstLatent[channel] ?? 0;
      return left + ((secondLatent[channel] ?? left) - left) * ratio;
    });
    return hexColor(mixbox.latentToFloatRgb(latent));
  }));
}

export function createBrushStudioV6PigmentPalette(
  primary: string,
  secondary: string,
  providerId: BrushStudioV6PigmentProviderId,
  steps = 33,
): readonly string[] {
  if (!PROVIDER_BY_ID.has(providerId)) {
    throw new BrushStudioV6PigmentProviderUnavailableError(providerId);
  }
  if (!Number.isFinite(steps)) throw new RangeError("Palette steps must be finite");
  const count = Math.max(2, Math.min(257, Math.round(steps)));
  if (isExternalPigmentProvider(providerId)) return createExternalPigmentPalette(primary, secondary, providerId, count);
  const first = parseColor(primary);
  const second = parseColor(secondary);
  if (providerId === "mixbox-js-v2") return mixboxPalette(first, second, count);
  const spectral = providerId !== "rgb-linear-v1";
  return Object.freeze(Array.from({ length: count }, (_, index) => {
    const ratio = index / (count - 1);
    const endpoint = exactEndpoint(first, second, ratio);
    return endpoint ?? mixWgm(first, second, ratio, spectral);
  }));
}

export function mixBrushStudioV6PigmentColors(
  first: string,
  second: string,
  weight: number,
  providerId: BrushStudioV6PigmentProviderId = "spectral-wgm-v1",
): string {
  if (!PROVIDER_BY_ID.has(providerId)) throw new BrushStudioV6PigmentProviderUnavailableError(providerId);
  if (!Number.isFinite(weight)) throw new RangeError("Pigment weight must be finite");
  const ratio = unit(weight);
  if (isExternalPigmentProvider(providerId)) return prepareExternalPigmentPair(first, second, providerId)(ratio);
  if (ratio === 0) return hexColor(parseColor(first));
  if (ratio === 1) return hexColor(parseColor(second));
  if (providerId === "mixbox-js-v2") {
    const primary = parseColor(first);
    const secondary = parseColor(second);
    return hexColor(mixbox.lerpFloat(
      [primary.r, primary.g, primary.b],
      [secondary.r, secondary.g, secondary.b],
      ratio,
    ));
  }
  const provider = PROVIDER_BY_ID.get(providerId);
  if (!provider) throw new BrushStudioV6PigmentProviderUnavailableError(providerId);
  return mixWgm(parseColor(first), parseColor(second), ratio, providerId !== "rgb-linear-v1");
}
