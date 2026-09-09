import { describe, expect, it } from "vitest";

import {
  canPromoteCharacterCapabilityEvidence,
  normalizeCharacterCapabilityEvidence,
  presentCharacterCapabilityEvidence,
  type CharacterCapabilityEvidenceV1,
} from "./character-capability-evidence";

function evidence(overrides: Partial<CharacterCapabilityEvidenceV1> = {}): CharacterCapabilityEvidenceV1 {
  return {
    schemaVersion: 1,
    capabilityId: "semantic-render.part-id",
    level: "production",
    assetContentHash: "a".repeat(64),
    rendererRevision: "character-renderer-v4",
    observedAt: "2026-09-01T00:00:00.000Z",
    expiresAt: "2027-09-01T00:00:00.000Z",
    artifactRefs: ["artifact://golden/part-id"],
    approverId: "artist:qa-1",
    ...overrides,
  };
}

describe("character capability evidence", () => {
  it("reserves the user-facing supported label for valid production evidence", () => {
    expect(presentCharacterCapabilityEvidence(evidence(), Date.parse("2026-09-02T00:00:00Z"))).toEqual({
      label: "지원",
      production: true,
      tone: "good",
      evidenceCount: 1,
    });
    expect(presentCharacterCapabilityEvidence(
      evidence({ level: "fixture-validated", approverId: undefined }),
      Date.parse("2026-09-02T00:00:00Z"),
    ).production).toBe(false);
  });

  it("downgrades expired evidence and rejects unsupported production claims", () => {
    expect(presentCharacterCapabilityEvidence(evidence(), Date.parse("2028-01-01T00:00:00Z")).label).toBe("검증 중");
    expect(() => normalizeCharacterCapabilityEvidence(evidence({ artifactRefs: [] }))).toThrow(/Artifact/u);
  });

  it("allows only monotonic single-step promotion", () => {
    expect(canPromoteCharacterCapabilityEvidence("declared", "probed")).toBe(true);
    expect(canPromoteCharacterCapabilityEvidence("probed", "production")).toBe(false);
    expect(canPromoteCharacterCapabilityEvidence("production", "fixture-validated")).toBe(false);
  });
});
