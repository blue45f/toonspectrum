import type { DrawEl } from "./studio-element-model";

/**
 * The retained causal carrier is intentionally wider than the Living Ink material footprint for
 * the same catalogue size. Keep the pre-receipt shadow close to the measured physical wash so the
 * artist does not see a broad opaque ribbon collapse into a thinner wet mark at handoff.
 *
 * The factor is pinned by the production long-stroke corpus: 40.44 px retained cross-section vs
 * 27.77 px canonical watercolor cross-section (0.687). 0.7 preserves a small fail-visible margin
 * while matching the nominal 28 px brush. Only this disposable projection changes; StrokeIR,
 * fallback geometry, collaboration and the canonical Living Ink recipe retain the source width.
 */
export const STUDIO_LIVING_INK_VECTOR_SHADOW_WIDTH_SCALE = 0.7 as const;

export function studioLivingInkVectorShadowElement(element: DrawEl): DrawEl {
  return {
    ...element,
    strokeWidth: Math.max(
      0.5,
      element.strokeWidth * STUDIO_LIVING_INK_VECTOR_SHADOW_WIDTH_SCALE,
    ),
  };
}
