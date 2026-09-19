/**
 * Audited scalar port of lwander/open-km's pigment_to_srgb / reflectance_mix kernels.
 * Upstream: 24222a131c94cdaf8cbbe76c0c228d44a536c99a (MIT, Lars Wander 2023).
 * License and byte-preserved original are beside this file. No upstream demo DOM/GL side effects.
 * Changes: validation, stable inverse, arbitrary pigment count; no synthetic demo spectra,
 * hard-coded Saunderson correction, or approximate gamma 2.2. Observer/encoding belong to caller.
 */
export function openKmInfiniteReflectance(k: number, s: number): number {
  if (!Number.isFinite(k) || !Number.isFinite(s) || k < 0 || s < 0) {
    throw new RangeError("K and S must be finite and nonnegative");
  }
  if (s === 0) {
    if (k === 0) throw new RangeError("A transparent medium has no opaque-limit reflectance");
    return 0;
  }
  const ratio = k / s;
  if (ratio === Infinity) return 0;
  // Rationalized 1 + K/S - sqrt((K/S)^2 + 2*K/S), avoiding catastrophic cancellation.
  return 1 / (1 + ratio + Math.sqrt(ratio) * Math.sqrt(ratio + 2));
}

export function openKmMixCoefficients(
  k: readonly number[], s: readonly number[], weights: readonly number[],
): Readonly<{ k: number; s: number }> {
  if (k.length === 0 || k.length !== s.length || k.length !== weights.length) {
    throw new RangeError("K, S and concentration arrays must have equal nonzero lengths");
  }
  let total = 0;
  for (let i = 0; i < k.length; i += 1) {
    if (![k[i], s[i], weights[i]].every((n) => Number.isFinite(n) && n! >= 0)) {
      throw new RangeError("Optical coefficients and concentrations must be finite and nonnegative");
    }
    total += weights[i]!;
  }
  if (!(total > 0) || !Number.isFinite(total)) throw new RangeError("Invalid total concentration");
  let km = 0, sm = 0;
  for (let i = 0; i < k.length; i += 1) {
    const c = weights[i]! / total;
    km += c * k[i]!;
    sm += c * s[i]!;
  }
  if (!Number.isFinite(km) || !Number.isFinite(sm)) throw new RangeError("Optical mixture overflow");
  return Object.freeze({ k: km, s: sm });
}
