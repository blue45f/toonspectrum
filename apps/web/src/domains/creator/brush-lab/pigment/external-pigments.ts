import spectral from "spectral.js";
import { prepareKmLayerComparison } from "./km-layer-comparison";
// 3.2.0's root package points to missing index.* files; use its audited, DOM-idle ESM build.
import colorMix from "colormix/dist/index.mjs";

import { kmLayerSpectrum, kmRatioFromReflectance, openKmInfiniteReflectance, openKmMixCoefficients } from "./kubelka-munk";

export type ExternalPigmentProvider = "spectral-js-v3" | "open-km-spectral-v1" | "colormix-lab-v3";
export const EXTERNAL_PIGMENT_PROVIDERS = Object.freeze([
  { id: "spectral-js-v3", nodeId: "pigment-spectral-js", label: "Spectral.js · 분광 K/S", version: "3.0.0" },
  { id: "open-km-spectral-v1", nodeId: "pigment-open-km-spectral", label: "open-km · 합성 분광 K/S", version: "1" },
  { id: "colormix-lab-v3", nodeId: "pigment-colormix-lab", label: "ColorMix.js · Lab 비교", version: "3.2.0" },
] as const);

export function isExternalPigmentProvider(id: string): id is ExternalPigmentProvider {
  return EXTERNAL_PIGMENT_PROVIDERS.some((entry) => entry.id === id);
}

function validateHex(value: string): string {
  if (!/^#[0-9a-f]{6}$/iu.test(value)) throw new TypeError("Pigment color must be #RRGGBB");
  return value.toLowerCase();
}
function validateRatio(value: number): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("Mix ratio must be in [0,1]");
}
function encodeColorMix(color: InstanceType<typeof colorMix.Color>): string {
  const values = [color.getRed(), color.getGreen(), color.getBlue()];
  if (!values.every(Number.isFinite)) throw new Error("ColorMix produced a non-finite color");
  return `#${values.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("")}`;
}

/** Spectral.js white basis peaks at 1.00116; normalize only synthetic physical-model inputs. */
function physicalReflectance(values: readonly number[]): number[] {
  if (!values.every((r) => Number.isFinite(r) && r >= 0)) throw new Error("Invalid reconstructed spectrum");
  return values.map((r) => Math.max(Number.EPSILON, Math.min(1, r)));
}

/** Prepare RGB->spectrum once per pair; only the bounded palette is computed, never per dab. */
export function prepareExternalPigmentPair(
  primary: string, secondary: string, provider: ExternalPigmentProvider,
): (ratio: number) => string {
  const a = validateHex(primary), b = validateHex(secondary);
  if (!isExternalPigmentProvider(provider)) throw new Error("Unknown external pigment provider");
  let mix: (t: number) => string;
  if (provider === "colormix-lab-v3") {
    const first = new colorMix.Color(a), second = new colorMix.Color(b);
    mix = (t) => {
      const percent = t * 100;
      // Use complementary percentages: the upstream implementation requires sum === 100.
      return encodeColorMix(colorMix.mix([first, second], [100 - percent, percent]));
    };
  } else {
    const first = new spectral.Color(a), second = new spectral.Color(b);
    if (provider === "spectral-js-v3") {
      mix = (t) => spectral.mix([first, 1 - t], [second, t]).toString({ method: "map" }).toLowerCase();
    } else {
      // Open-km's separate K,S mixture. RGB supplies only reconstructed R and therefore K/S.
      // S=1 is an EXPLICIT approximation, not a measured pigment database or mass recipe.
      const firstK = physicalReflectance(first.R).map(kmRatioFromReflectance);
      const secondK = physicalReflectance(second.R).map(kmRatioFromReflectance);
      mix = (t) => {
        const r = firstK.map((k, i) => {
          const optical = openKmMixCoefficients([k, secondK[i]!], [1, 1], [1 - t, t]);
          return openKmInfiniteReflectance(optical.k, optical.s);
        });
        return new spectral.Color(r).toString({ method: "map" }).toLowerCase();
      };
    }
  }
  return (ratio) => {
    validateRatio(ratio);
    // RGB endpoint correction is part of this versioned authoring adapter, not the KM equations.
    if (ratio === 0 || a === b) return a;
    if (ratio === 1) return b;
    return validateHex(mix(ratio));
  };
}

export function createExternalPigmentPalette(
  first: string, second: string, provider: ExternalPigmentProvider, steps = 33,
): readonly string[] {
  if (!Number.isInteger(steps) || steps < 2 || steps > 257) throw new RangeError("Palette steps must be 2..257");
  const mix = prepareExternalPigmentPair(first, second, provider);
  return Object.freeze(Array.from({ length: steps }, (_, i) => mix(i / (steps - 1))));
}

/** Optical feasibility probe: synthetic spectrum, assumed S, no canvas pickup or physical units. */
export function simulatePigmentLayer(
  color: string, substrate: string, thickness: number, scattering = 1,
): string {
  validateHex(color); validateHex(substrate);
  if (!Number.isFinite(scattering) || scattering <= 0 || scattering > 100) {
    throw new RangeError("Synthetic scattering must be in (0,100]");
  }
  const pigment = new spectral.Color(color);
  const paper = new spectral.Color(substrate);
  const ratios = physicalReflectance(pigment.R).map(kmRatioFromReflectance);
  const reflectance = kmLayerSpectrum(
    ratios.map((ratio) => ratio * scattering),
    ratios.map(() => scattering), thickness, physicalReflectance(paper.R),
  );
  if (thickness === 0) return substrate.toLowerCase();
  return new spectral.Color(reflectance).toString({ method: "map" }).toLowerCase();
}

/** Prepared optical comparison only: RGB reconstruction + assumed S=1, not measured pigment data. */
export function prepareSyntheticPigmentLayers(primary: string, secondary: string, substrate: string) {
  const first = new spectral.Color(validateHex(primary)), second = new spectral.Color(validateHex(secondary));
  const baseHex = validateHex(substrate), paper = new spectral.Color(baseHex);
  const pigment = (color: InstanceType<typeof spectral.Color>) => {
    const absorption = physicalReflectance(color.R).map(kmRatioFromReflectance);
    return { absorption, scattering: absorption.map(() => 1) };
  };
  const evaluate = prepareKmLayerComparison(pigment(first), pigment(second), physicalReflectance(paper.R));
  const encode = (values: readonly number[]) => new spectral.Color([...values]).toString({ method: "map" }).toLowerCase();
  return (firstThickness: number, secondThickness: number) => {
    const result = evaluate(firstThickness, secondThickness);
    if (firstThickness === 0 && secondThickness === 0) {
      return Object.freeze({ premixed: baseHex, firstOnSecond: baseHex, secondOnFirst: baseHex });
    }
    return Object.freeze({ premixed: encode(result.premixed), firstOnSecond: encode(result.firstOnSecond), secondOnFirst: encode(result.secondOnFirst) });
  };
}
