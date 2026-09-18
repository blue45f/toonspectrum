import { describe, expect, it } from "vitest";

import { STUDIO_COMPETITOR_CAPABILITY_CATALOG } from "@toonspectrum/studio-project-model";

import {
  STUDIO_COMPETITOR_CAPABILITY_EVALUATION,
  STUDIO_COMPETITOR_CAPABILITY_EVIDENCE_SPECS,
  STUDIO_COMPETITOR_CAPABILITY_RECORDS,
} from "./studio-competitor-capability-evidence";

describe("Studio competitor replacement capability evidence", () => {
  it("covers every planned capability exactly once and in canonical order", () => {
    expect(STUDIO_COMPETITOR_CAPABILITY_EVIDENCE_SPECS).toHaveLength(57);
    expect(STUDIO_COMPETITOR_CAPABILITY_RECORDS).toHaveLength(57);
    expect(STUDIO_COMPETITOR_CAPABILITY_RECORDS.map((record) => record.id)).toEqual(
      STUDIO_COMPETITOR_CAPABILITY_CATALOG.map((definition) => definition.id),
    );
  });

  it("has no unresolved repository implementation gaps", () => {
    expect(STUDIO_COMPETITOR_CAPABILITY_EVALUATION).toMatchObject({
      verifiedCount: 45,
      externalValidationPendingCount: 12,
      incompleteCount: 0,
      repositoryImplementationComplete: true,
      replacementClaimAllowed: false,
    });
  });

  it("keeps external validation pending instead of fabricating completion", () => {
    const pending = STUDIO_COMPETITOR_CAPABILITY_RECORDS.filter(
      (record) => record.externalValidationRequired,
    );
    expect(pending).toHaveLength(12);
    for (const record of pending) {
      expect(record.evidence).toEqual(expect.arrayContaining([
        expect.objectContaining({
          dimension: "external-validation",
          status: "pending",
        }),
      ]));
    }
  });

  it("binds every verified evidence dimension to a concrete repository reference", () => {
    for (const record of STUDIO_COMPETITOR_CAPABILITY_RECORDS) {
      for (const evidence of record.evidence) {
        expect(evidence.reference.trim()).not.toBe("");
        if (evidence.status === "verified") {
          expect(evidence.reference).not.toContain("TODO");
        }
      }
    }
  });
});
