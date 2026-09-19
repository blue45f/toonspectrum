import type { StudioBg3dGlbValidationSuccess } from "../../apps/web/src/domains/creator/bg3d/studio-bg3d-glb-validation";

/** A validation receipt is metadata, not a JSON copy of the entire verified binary model. */
export function summarizeVerifiedGlbAdmission(admission: StudioBg3dGlbValidationSuccess) {
  return Object.freeze({ ok: true as const, code: admission.code, profile: admission.profile,
    verifiedSha256: admission.verifiedSha256, verifiedByteLength: admission.verifiedBytes.byteLength,
    cumulativeBytesAfter: admission.cumulativeBytesAfter, usesBasisTextures: admission.usesBasisTextures,
    requiresBasisTextures: admission.requiresBasisTextures, metrics: admission.metrics });
}
