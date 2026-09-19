import { describe, expect, it } from "vitest";

import { summarizeVerifiedGlbAdmission } from "./lib/verified-glb-admission-report";

import type { StudioBg3dGlbValidationSuccess } from "../apps/web/src/domains/creator/bg3d/studio-bg3d-glb-validation";

describe("bounded GLB audit receipts", () => {
  it("retains byte/hash/metric proof without serializing large owned binary data", () => {
    const bytes = new Uint8Array(8 * 1024 * 1024);
    const admission = { ok: true, code: "valid", profile: "mobile", verifiedSha256: `sha256:${"a".repeat(64)}`,
      verifiedBytes: bytes, cumulativeBytesAfter: bytes.length, usesBasisTextures: false,
      requiresBasisTextures: false, metrics: { triangles: 24 } } as unknown as StudioBg3dGlbValidationSuccess;
    const output = summarizeVerifiedGlbAdmission(admission);
    expect(output.verifiedByteLength).toBe(bytes.length);expect(output.verifiedSha256).toBe(admission.verifiedSha256);
    expect(output.metrics).toBe(admission.metrics);expect(output).not.toHaveProperty("verifiedBytes");
    expect(JSON.stringify(output).length).toBeLessThan(1024);expect(bytes.length).toBe(8 * 1024 * 1024);
  });
});
