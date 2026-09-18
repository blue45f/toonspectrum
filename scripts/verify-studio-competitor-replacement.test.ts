import { describe, expect, it } from "vitest";

import { verifyReplacementProgram } from "./verify-studio-competitor-replacement.mts";

describe("Studio competitor replacement program", () => {
  it("binds all 57 workstreams to repository evidence without overclaiming", async () => {
    await expect(verifyReplacementProgram()).resolves.toEqual({
      manifestPath: "docs/benchmarks/studio-competitor-replacement-program.json",
      workstreams: 57,
      evidencePaths: 123,
      implemented: 52,
      validationHarnesses: 4,
      externalValidationRequired: 1,
      replacementClaimAllowed: false,
    });
  });
});
