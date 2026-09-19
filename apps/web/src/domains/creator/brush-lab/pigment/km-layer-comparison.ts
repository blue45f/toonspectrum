import { kmLayer, kmOver, openKmMixCoefficients } from "./kubelka-munk";

export interface KmPigmentSpectrum {
  /** Matching wavelength grid; K and S have the same inverse-length unit. */
  readonly absorption: readonly number[];
  readonly scattering: readonly number[];
}
export interface KmLayerComparison {
  readonly premixed: readonly number[];
  readonly firstOnSecond: readonly number[];
  readonly secondOnFirst: readonly number[];
}

function snapshot(values: readonly number[], bands: number, maximum: number): readonly number[] {
  if (!Array.isArray(values) || values.length !== bands) throw new RangeError("Spectral grids must match");
  const copy: number[] = [];
  // Indexed validation deliberately rejects sparse arrays as well as non-finite values.
  for (let i = 0; i < bands; i += 1) {
    const value = values[i];
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
      throw new RangeError("Invalid spectral coefficient");
    }
    copy.push(value);
  }
  return Object.freeze(copy);
}

/**
 * Compare a homogeneous mixture and the two possible layer orders on the SAME substrate.
 * Thickness is a matching length unit, not pixel coverage, opacity, or pigment mass.
 * Callers own wavelength alignment and the provenance/calibration of supplied K and S.
 * All intermediate values remain spectral: there is no RGB round-trip between layers.
 * Input arrays are copied once to prevent later asset edits from mutating a prepared recipe.
 */
export function prepareKmLayerComparison(
  first: KmPigmentSpectrum, second: KmPigmentSpectrum, substrate: readonly number[],
): (firstThickness: number, secondThickness: number) => KmLayerComparison {
  const bands = first.absorption.length;
  if (!Number.isInteger(bands) || bands < 1 || bands > 256) throw new RangeError("Spectral band count must be 1..256");
  const firstK = snapshot(first.absorption, bands, 1e24), firstS = snapshot(first.scattering, bands, 1e24);
  const secondK = snapshot(second.absorption, bands, 1e24), secondS = snapshot(second.scattering, bands, 1e24);
  const base = snapshot(substrate, bands, 1);
  return (firstThickness, secondThickness) => {
    for (const d of [firstThickness, secondThickness]) {
      if (!Number.isFinite(d) || d < 0 || d > 1e24) throw new RangeError("Invalid layer thickness");
    }
    const total = firstThickness + secondThickness;
    if (total > 1e24) throw new RangeError("Total optical thickness exceeds supported range");
    if (total === 0) return Object.freeze({ premixed: base, firstOnSecond: base, secondOnFirst: base });
    const premixed: number[] = [], firstOnSecond: number[] = [], secondOnFirst: number[] = [];
    for (let band = 0; band < bands; band += 1) {
      const a = kmLayer(firstK[band]!, firstS[band]!, firstThickness);
      const b = kmLayer(secondK[band]!, secondS[band]!, secondThickness);
      const mixture = openKmMixCoefficients(
        [firstK[band]!, secondK[band]!], [firstS[band]!, secondS[band]!],
        [firstThickness, secondThickness],
      );
      premixed.push(kmOver(kmLayer(mixture.k, mixture.s, total), base[band]!));
      firstOnSecond.push(kmOver(a, kmOver(b, base[band]!)));
      secondOnFirst.push(kmOver(b, kmOver(a, base[band]!)));
    }
    return Object.freeze({
      premixed: Object.freeze(premixed), firstOnSecond: Object.freeze(firstOnSecond),
      secondOnFirst: Object.freeze(secondOnFirst),
    });
  };
}
