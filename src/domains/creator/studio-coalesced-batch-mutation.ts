export interface StudioCoalescedBatchMutationInput {
  readonly authoritativeSampleCount: number;
  readonly gpuPinned: boolean;
  readonly fixedRateFilterActive: boolean;
  readonly immediateCausalInput: boolean;
  readonly mutableDirectSurfaceActive: boolean;
}

/**
 * Decides when one browser delivery should clone a private stroke draft exactly once and then
 * mutate it for every coalesced hardware sample. Fixed-rate input already owns an equivalent
 * array reuse contract and must not pay a redundant outer clone.
 */
export function shouldOwnStudioCoalescedBatchDraft(
  input: StudioCoalescedBatchMutationInput
): boolean {
  if (!Number.isFinite(input.authoritativeSampleCount) || input.authoritativeSampleCount < 1) {
    return false;
  }
  if (input.gpuPinned) return !input.fixedRateFilterActive;
  return input.immediateCausalInput
    && !input.mutableDirectSurfaceActive;
}
