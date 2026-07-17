/**
 * Pure policy boundary for the Studio fixed-rate pointer sampler.
 *
 * This module deliberately knows nothing about React, Konva, brush preset ids, or persisted draw
 * elements. Callers resolve those richer values into one render family and two versioned causal
 * capability flags. Keeping the decision here prevents a new specialty brush from accidentally
 * entering the 5ms sampler while its renderer still replans an already-visible prefix.
 *
 * Stabilizer strength is intentionally not an input: an eligible standard-mode brush uses the
 * filtered cascade above zero and the canonical pass-through sampler at zero.
 */

export interface StudioFixedRateInputEligibility {
  readonly stabilizerMode: unknown;
  /** Eligibility is independent of strength; zero selects the canonical pass-through downstream. */
  readonly stabilizerStrength?: unknown;
  readonly drawMode: unknown;
  readonly brushFamily: unknown;
  /** True when the selected brush has a whole-stroke dynamics planner. */
  readonly hasBrushDynamics?: boolean;
  /** True only for the append-only, versioned stamp walker. */
  readonly causalStampV2?: boolean;
  /** True only for the append-only, versioned watercolor walker. */
  readonly causalWatercolorV2?: boolean;
}

/**
 * Whether authoritative samples may enter the deterministic 5ms input clock.
 *
 * Adaptive and precision modes retain their dedicated raw-cadence algorithms. Shape-like tools
 * replace an endpoint rather than append a freehand suffix, and legacy/specialty planners remain
 * outside until they have an explicit causal version flag.
 */
export function isStudioFixedRateInputEligible(
  input: StudioFixedRateInputEligibility
): boolean {
  if (input.stabilizerMode !== "standard") return false;
  if (input.hasBrushDynamics === true) return false;

  if (input.drawMode === "eraser") return true;
  if (input.drawMode !== "pen") return false;

  if (input.causalStampV2 === true) return true;
  if (input.brushFamily === "pen" || input.brushFamily === "marker") return true;
  return input.brushFamily === "watercolor" && input.causalWatercolorV2 === true;
}
