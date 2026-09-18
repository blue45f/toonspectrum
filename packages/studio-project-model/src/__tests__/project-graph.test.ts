import { describe, expect, it } from "vitest";

import {
  capabilityLedgerEntrySchema,
  isoTimestampSchema,
  reviewAnchorSchema,
  scopeContains,
  scopeRefSchema,
  sha256Schema,
  studioEntityIdSchema,
  studioProjectScope,
} from "../project-graph";

const PROJECT_ID = "project-demo";
const EPISODE_SCOPE = {
  projectId: PROJECT_ID,
  kind: "episode" as const,
  id: "episode-12",
  ancestors: [{ kind: "project" as const, id: PROJECT_ID }],
};

describe("Studio ProjectGraph identities", () => {
  it("accepts stable identifiers and exact lowercase SHA-256 digests", () => {
    expect(studioEntityIdSchema.parse("cut:12.37")) .toBe("cut:12.37");
    expect(sha256Schema.parse("a".repeat(64))).toBe("a".repeat(64));
    expect(studioEntityIdSchema.safeParse(" bad id ").success).toBe(false);
    expect(sha256Schema.safeParse("A".repeat(64)).success).toBe(false);
  });

  it("requires canonical UTC timestamps", () => {
    expect(isoTimestampSchema.parse("2026-09-17T00:00:00.000Z"))
      .toBe("2026-09-17T00:00:00.000Z");
    expect(isoTimestampSchema.safeParse("2026-09-17T09:00:00+09:00").success)
      .toBe(false);
  });
});

describe("Studio ProjectGraph scopes", () => {
  it("creates a canonical project scope", () => {
    expect(studioProjectScope(PROJECT_ID)).toEqual({
      projectId: PROJECT_ID,
      kind: "project",
      id: PROJECT_ID,
      ancestors: [],
    });
  });

  it("accepts ordered hierarchy and rejects a mismatched project", () => {
    expect(scopeRefSchema.parse(EPISODE_SCOPE)).toEqual(EPISODE_SCOPE);
    expect(scopeRefSchema.safeParse({
      ...EPISODE_SCOPE,
      projectId: "another-project",
    }).success).toBe(false);
  });

  it("recognizes nested work without crossing project boundaries", () => {
    const project = studioProjectScope(PROJECT_ID);
    expect(scopeContains(project, scopeRefSchema.parse(EPISODE_SCOPE))).toBe(true);
    expect(scopeContains(scopeRefSchema.parse(EPISODE_SCOPE), project)).toBe(false);
    expect(scopeContains(project, studioProjectScope("another-project"))).toBe(false);
  });

  it("rejects duplicate and out-of-order ancestors", () => {
    expect(scopeRefSchema.safeParse({
      projectId: PROJECT_ID,
      kind: "cut",
      id: "cut-1",
      ancestors: [
        { kind: "episode", id: "episode-12" },
        { kind: "project", id: PROJECT_ID },
      ],
    }).success).toBe(false);
    expect(scopeRefSchema.safeParse({
      projectId: PROJECT_ID,
      kind: "cut",
      id: "cut-1",
      ancestors: [
        { kind: "project", id: PROJECT_ID },
        { kind: "project", id: PROJECT_ID },
      ],
    }).success).toBe(false);
  });
});

describe("Studio review anchors", () => {
  it("binds every location comment to an immutable artifact revision and scope", () => {
    expect(reviewAnchorSchema.parse({
      artifactId: "artifact-canvas",
      revisionId: "revision-review-1",
      scope: EPISODE_SCOPE,
      target: {
        type: "region",
        pageId: "page-1",
        x: 0.1,
        y: 0.2,
        width: 0.3,
        height: 0.4,
      },
    })).toMatchObject({
      artifactId: "artifact-canvas",
      revisionId: "revision-review-1",
    });
  });

  it("rejects a region outside normalized page bounds", () => {
    expect(reviewAnchorSchema.safeParse({
      artifactId: "artifact-canvas",
      revisionId: "revision-review-1",
      scope: EPISODE_SCOPE,
      target: {
        type: "region",
        pageId: "page-1",
        x: 0.8,
        y: 0.2,
        width: 0.3,
        height: 0.4,
      },
    }).success).toBe(false);
  });
});

describe("capability evidence ledger", () => {
  const base = {
    id: "capability-2d-roundtrip",
    status: "roundtrip-ready" as const,
    domainOwner: "studio-2d",
    title: "PSD 구조 왕복",
    productArea: "2D 호환성",
    description: "PSD 가져오기와 다시 내보내기의 보존 수준을 기록합니다.",
    requiredChecks: ["import", "render-diff", "export", "reopen"],
    passedChecks: ["import", "render-diff"],
    evidence: [{
      kind: "roundtrip" as const,
      reference: "tests/fixtures/psd/roundtrip.json",
      summary: "레이어와 픽셀 비교 결과",
      recordedAt: "2026-09-17T00:00:00.000Z",
    }],
    remainingGaps: ["텍스트 왕복"],
    supportedDevices: ["desktop" as const, "web" as const],
  };

  it("parses evidence-backed status", () => {
    expect(capabilityLedgerEntrySchema.parse(base).status)
      .toBe("roundtrip-ready");
  });

  it("does not allow an undeclared check to be marked passed", () => {
    expect(capabilityLedgerEntrySchema.safeParse({
      ...base,
      passedChecks: [...base.passedChecks, "expert-signoff"],
    }).success).toBe(false);
  });
});
