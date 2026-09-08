import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { authorizeContentUsage } from "./content-graph";

import type { RightsDecision, UsageContext, UsageDecision } from "./content-graph";

const NOW = "2026-09-08T09:00:00.000Z";
const rights: RightsDecision = {
  providerId: "approved-provider",
  commercialReadiness: "commercial-conditional",
  allowedMonetizationModels: ["free", "paid-export"],
  allowedSurfaces: ["research-board", "project-export"],
  metadataDisplay: true,
  descriptionDisplay: true,
  thumbnailDisplay: true,
  thumbnailCache: false,
  originalDownload: true,
  projectImport: true,
  transformation: true,
  aiInput: true,
  aiTraining: false,
  commercialUse: true,
  redistribution: true,
  attributionRequired: true,
  sourceUrl: "https://example.org/approved-source",
  reviewStatus: "verified",
  reviewedAt: "2026-09-01T00:00:00.000Z",
};
const usage: UsageContext = {
  monetization: "paid-export",
  surface: "project-export",
  commercialProject: true,
  willModify: true,
  willRedistribute: true,
  willUseForAi: true,
};

describe("content usage authorization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    { surface: "studio-import", permission: "projectImport" },
    { surface: "marketplace-download", permission: "originalDownload" },
  ] as const)("requires explicit $permission permission for $surface", ({ surface, permission }) => {
    const context: UsageContext = {
      ...usage,
      surface,
      commercialProject: false,
      willModify: false,
      willRedistribute: false,
      willUseForAi: false,
    };
    const snapshot: RightsDecision = { ...rights, allowedSurfaces: [surface] };
    for (const value of [false, null]) {
      expect(authorizeContentUsage({ ...snapshot, [permission]: value }, context)).toEqual({
        allowed: false,
        reason: "SURFACE_NOT_ALLOWED",
      });
    }
    expect(authorizeContentUsage(snapshot, context)).toEqual({ allowed: true });

    const unrelatedPermission = permission === "projectImport" ? "originalDownload" : "projectImport";
    expect(authorizeContentUsage({ ...snapshot, [unrelatedPermission]: null }, context))
      .toEqual({ allowed: true });
  });

  it.each([
    ["ai-input", "aiInput"],
    ["ai-training", "aiTraining"],
  ] as const)("requires the %s capability %s even when willUseForAi is false", (surface, permission) => {
    const context: UsageContext = { ...usage, surface, willUseForAi: false };
    const snapshot: RightsDecision = { ...rights, allowedSurfaces: [surface] };

    for (const value of [false, null]) {
      expect(authorizeContentUsage({ ...snapshot, [permission]: value }, context)).toEqual({
        allowed: false,
        reason: "SURFACE_NOT_ALLOWED",
      });
    }
    expect(authorizeContentUsage({ ...snapshot, [permission]: true }, context))
      .toEqual({ allowed: true });
  });

  it.each(["research-board", "studio-reference"] as const)(
    "preserves %s reference use without download or import permissions",
    (surface) => {
      const context: UsageContext = {
        ...usage,
        surface,
        commercialProject: false,
        willModify: false,
        willRedistribute: false,
        willUseForAi: false,
      };
      for (const value of [false, null]) {
        const snapshot: RightsDecision = {
          ...rights,
          allowedSurfaces: [surface],
          originalDownload: value,
          projectImport: value,
        };
        expect(authorizeContentUsage(snapshot, context)).toEqual({ allowed: true });
      }
    },
  );

  it("preserves verified permissions without an expiry", () => {
    expect(authorizeContentUsage(rights, usage)).toEqual({ allowed: true });
    vi.setSystemTime(new Date("2036-09-08T09:00:00.000Z"));
    expect(authorizeContentUsage(rights, usage)).toEqual({ allowed: true });
  });

  it.each([
    "2026-09-08T08:59:59.999Z",
    NOW,
    "2026-09-08T18:00:00.000+09:00",
  ])("rejects permissions at or after the expiry %s", (validUntil) => {
    expect(authorizeContentUsage({ ...rights, validUntil }, usage)).toEqual({
      allowed: false,
      reason: "RIGHTS_EXPIRED",
    });
  });

  it.each([
    "2026-09-08T09:00:00.001Z",
    "2026-09-08T18:00:00.001+09:00",
    "2027-01-01T00:00:00.000Z",
  ])("allows matching permissions before the expiry %s", (validUntil) => {
    expect(authorizeContentUsage({ ...rights, validUntil }, usage)).toEqual({ allowed: true });
  });

  it.each(["", " ", "not-a-date", "2026-09-08T25:00:00Z", "999999-01-01T00:00:00Z"])(
    "denies an unverifiable expiry %j instead of treating it as unlimited",
    (validUntil) => {
      expect(authorizeContentUsage({ ...rights, validUntil }, usage)).toEqual({
        allowed: false,
        reason: "RIGHTS_NOT_VERIFIED",
      });
    },
  );

  it("rechecks the same snapshot against the current clock for each use", () => {
    const snapshot = { ...rights, validUntil: "2026-09-08T09:00:00.001Z" };
    const original = structuredClone(snapshot);
    expect(authorizeContentUsage(snapshot, usage)).toEqual({ allowed: true });
    vi.setSystemTime(new Date(snapshot.validUntil));
    expect(authorizeContentUsage(snapshot, usage)).toEqual({ allowed: false, reason: "RIGHTS_EXPIRED" });
    expect(snapshot).toEqual(original);
  });

  it.each(["needs-review", "blocked"] as const)("keeps %s rights denied even with future expiry", (reviewStatus) => {
    expect(authorizeContentUsage({ ...rights, reviewStatus, validUntil: "2027-01-01T00:00:00Z" }, usage))
      .toEqual({ allowed: false, reason: "RIGHTS_NOT_VERIFIED" });
  });

  it("does not widen monetization or surface permissions before expiry", () => {
    const snapshot = { ...rights, validUntil: "2027-01-01T00:00:00Z" };
    expect(authorizeContentUsage(snapshot, { ...usage, monetization: "advertising" }))
      .toEqual({ allowed: false, reason: "MONETIZATION_NOT_ALLOWED" });
    expect(authorizeContentUsage(snapshot, { ...usage, surface: "marketplace-download" }))
      .toEqual({ allowed: false, reason: "SURFACE_NOT_ALLOWED" });
  });

  const capabilityCases: {
    permission: "commercialUse" | "transformation" | "redistribution" | "aiInput";
    requested: "commercialProject" | "willModify" | "willRedistribute" | "willUseForAi";
    reason: UsageDecision["reason"];
  }[] = [
    { permission: "commercialUse", requested: "commercialProject", reason: "COMMERCIAL_USE_NOT_ALLOWED" },
    { permission: "transformation", requested: "willModify", reason: "DERIVATIVES_NOT_ALLOWED" },
    { permission: "redistribution", requested: "willRedistribute", reason: "REDISTRIBUTION_NOT_ALLOWED" },
    { permission: "aiInput", requested: "willUseForAi", reason: "AI_INPUT_NOT_ALLOWED" },
  ];
  it.each(capabilityCases)("preserves explicit and unknown $permission restrictions", ({ permission, requested, reason }) => {
    for (const value of [false, null]) {
      const snapshot = { ...rights, [permission]: value, validUntil: "2027-01-01T00:00:00Z" };
      expect(authorizeContentUsage(snapshot, usage)).toEqual({ allowed: false, reason });
      expect(authorizeContentUsage(snapshot, { ...usage, [requested]: false })).toEqual({ allowed: true });
    }
  });
});
