/** Owner-approved, single-metric headroom; never rewrites accepted measurements. */
export const STUDIO_GZIP_ALLOWANCE = Object.freeze({
  group: "static",
  key: "Studio route gzip",
  kind: "bytes",
  baselineValue: 1_927_782,
  normalCeiling: 1_966_337,
  extraBytes: 1_024,
  expiresAt: "2026-09-21T00:00:00+09:00",
  reason: "Owner requested temporary headroom after AR/VR CI closeout; remove after bundle optimization.",
});

/** Expiry, any other metric, or a changed baseline restores the ordinary ratchet. */
export function resolveTemporaryBundleCeiling(measurement, baselineValue, normalCeiling, now = Date.now()) {
  const policy = STUDIO_GZIP_ALLOWANCE;
  const eligible = Number.isFinite(now)
    && now < Date.parse(policy.expiresAt)
    && measurement.group === policy.group
    && measurement.key === policy.key
    && measurement.kind === policy.kind
    && baselineValue === policy.baselineValue
    && normalCeiling === policy.normalCeiling;
  return {
    ceiling: eligible ? normalCeiling + policy.extraBytes : normalCeiling,
    temporaryAllowance: eligible ? policy : null,
  };
}
