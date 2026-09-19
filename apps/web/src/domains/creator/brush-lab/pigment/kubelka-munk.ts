import { openKmInfiniteReflectance } from "./vendor/open-km";

export { openKmInfiniteReflectance, openKmMixCoefficients } from "./vendor/open-km";

/** Two-flux, homogeneous, diffuse layer. K,S in inverse length; thickness in matching length. */
export interface KmLayer { readonly reflectance: number; readonly transmittance: number; }

export function kmLayer(k: number, s: number, thickness: number): KmLayer {
  for (const value of [k, s, thickness]) {
    if (!Number.isFinite(value) || value < 0 || value > 1e24) {
      throw new RangeError("Optical inputs must be finite, nonnegative and <= 1e24");
    }
  }
  if (thickness === 0 || k === 0 && s === 0) return { reflectance: 0, transmittance: 1 };
  if (s === 0) return { reflectance: 0, transmittance: Math.exp(-k * thickness) };
  if (k === 0) {
    const t = 1 / (1 + s * thickness);
    return { reflectance: 1 - t, transmittance: t };
  }
  const rate = Math.sqrt(k) * Math.sqrt(k + 2 * s);
  const z = rate * thickness;
  // tanh(z)/z has an analytic limit at zero, including nearly nonabsorbing white paint.
  if (z < 1e-4) {
    const z2 = z * z;
    const tanhc = 1 - z2 / 3 + 2 * z2 * z2 / 15;
    const denominator = 1 + (k + s) * thickness * tanhc;
    return {
      reflectance: s * thickness * tanhc / denominator,
      transmittance: (1 - z2 / 2 + 5 * z2 * z2 / 24) / denominator,
    };
  }
  const e = Math.exp(-z);
  const e2 = e * e;
  const tanh = -Math.expm1(-2 * z) / (1 + e2);
  const denominator = rate + (k + s) * tanh;
  return {
    reflectance: s * tanh / denominator,
    transmittance: rate * (2 * e / (1 + e2)) / denominator,
  };
}

/** Add internal diffuse reflections, not alpha compositing. Specular interfaces are excluded. */
export function kmOver(layer: KmLayer, substrate: number): number {
  const { reflectance: r, transmittance: t } = layer;
  if (![r, t, substrate].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
    || r + t > 1 + 1e-12) throw new RangeError("Invalid passive layer or substrate reflectance");
  if (r === 1 && t === 0) return 1;
  const result = r + t * t * substrate / (1 - r * substrate);
  return Math.min(1, Math.max(0, result));
}

/** R-infinity identifies K/S only; absolute K and S require extra measurements/assumptions. */
export function kmRatioFromReflectance(reflectance: number): number {
  if (!Number.isFinite(reflectance) || reflectance <= 0 || reflectance > 1) {
    throw new RangeError("Opaque reflectance must be in (0, 1]");
  }
  return (1 - reflectance) * (1 - reflectance) / (2 * reflectance);
}

export function kmOpaqueSpectrum(k: readonly number[], s: readonly number[]): number[] {
  if (k.length === 0 || k.length !== s.length) throw new RangeError("Spectral grids must match");
  return k.map((value, i) => openKmInfiniteReflectance(value, s[i]!));
}

export function kmLayerSpectrum(
  k: readonly number[], s: readonly number[], thickness: number, substrate: readonly number[],
): number[] {
  if (k.length === 0 || k.length !== s.length || k.length !== substrate.length) {
    throw new RangeError("Spectral grids must match");
  }
  return k.map((value, i) => kmOver(kmLayer(value, s[i]!, thickness), substrate[i]!));
}
