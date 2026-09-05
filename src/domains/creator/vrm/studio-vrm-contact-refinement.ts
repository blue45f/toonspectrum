/** Bounded, transactional search over the current normalized finger flexion.
 * This improves a joint-to-contact distance, not mesh-level collision detection.
 */
export interface StudioVrmContactRefinementInput {
  readonly initial: readonly number[];
  readonly limits: readonly number[];
  readonly goal: number;
  readonly measure: () => number | null;
  readonly apply: (angles: readonly number[]) => void;
  readonly maxPasses?: number;
  readonly minImprovement?: number;
}
export interface StudioVrmContactRefinementResult {
  readonly angles: readonly number[];
  readonly before: number | null;
  readonly after: number | null;
  readonly acceptedPasses: number;
  readonly reason: "invalid" | "already-contact" | "improved" | "no-improvement";
}
const finiteDistance = (value: number | null): value is number => (
  typeof value === "number" && Number.isFinite(value) && value >= 0
);

export function refineStudioVrmContact(input: StudioVrmContactRefinementInput): StudioVrmContactRefinementResult {
  let best = [...input.initial];
  let before: number | null = null;
  let after: number | null = null;
  let acceptedPasses = 0;
  let reason: StudioVrmContactRefinementResult["reason"] = "invalid";
  const result = (): StudioVrmContactRefinementResult => ({ angles: [...best], before, after, acceptedPasses, reason });
  const passes = input.maxPasses ?? 4;
  const improvement = input.minImprovement ?? 0.0006;
  if (!Number.isFinite(input.goal) || input.goal < 0
    || !Number.isFinite(passes) || passes < 0 || !Number.isFinite(improvement) || improvement <= 0
    || best.length === 0 || best.length !== input.limits.length
    || !best.every(Number.isFinite) || !input.limits.every((limit) => Number.isFinite(limit) && limit > 0)) return result();
  try {
    before = input.measure();
    if (!finiteDistance(before)) return result();
    after = before;
    if (before <= input.goal) {
      reason = "already-contact";
      return result();
    }
    for (let pass = 0; pass < Math.min(6, Math.floor(passes)); pass += 1) {
      const baseline = [...best];
      const previous = after;
      // Probe small changes first. Never accept a worse candidate or amplify an
      // already rejected trial. Both sides use the sign of their actual runtime pose.
      for (const factor of [1.08, 1.18, 1.32]) {
        const candidate = baseline.map((angle, index) => (
          Math.abs(angle) < 1e-4 ? angle
            : Math.sign(angle) * Math.min(Math.max(Math.abs(angle), input.limits[index]), Math.abs(angle) * factor)
        ));
        if (candidate.every((angle, index) => Math.abs(angle - baseline[index]) < 1e-10)) continue;
        input.apply(candidate);
        const distance = input.measure();
        if (finiteDistance(distance) && distance < after - improvement) {
          best = candidate;
          after = distance;
        }
        input.apply(best);
        if (after <= input.goal) break;
      }
      if (after >= previous - improvement) break;
      acceptedPasses += 1;
      if (after <= input.goal) break;
    }
    reason = acceptedPasses > 0 ? "improved" : "no-improvement";
  } catch {
    // A malformed bone or measurement must not leave a trial pose on screen.
    reason = "invalid";
    best = [...input.initial];
    after = finiteDistance(before) ? before : null;
    acceptedPasses = 0;
  } finally {
    input.apply(best);
  }
  return result();
}

export function sameStudioVrmContactValues(a: readonly number[], b: readonly number[], epsilon = 1e-7): boolean {
  return a.length === b.length && a.every((value, index) => (
    Number.isFinite(value) && Number.isFinite(b[index]) && Math.abs(value - b[index]) <= epsilon
  ));
}
