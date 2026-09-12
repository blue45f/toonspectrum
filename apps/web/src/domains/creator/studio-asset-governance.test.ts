import { describe, expect, it } from "vitest";

import {
  createDefaultStudioAssetGovernance,
  createDefaultStudioAssetGovernancePreferences,
  evaluateStudioAssetGovernance,
  readStudioAssetGovernancePreferences,
  studioAssetGovernanceStorageKey,
  writeStudioAssetGovernancePreferences,
  type StudioAssetGovernancePreferences,
} from "./studio-asset-governance";

class MemoryStorage {
  readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const NOW = "2026-09-11T12:00:00.000Z";

function readyPreferences(): StudioAssetGovernancePreferences {
  return Object.freeze({
    ...createDefaultStudioAssetGovernancePreferences(),
    providerAccountConnected: true,
    confirmedPluginPermissions: Object.freeze(["document-write"] as const),
  });
}

describe("Studio asset governance", () => {
  it("combines quality, rights, provider, font, extension and marketplace decisions", () => {
    const input = createDefaultStudioAssetGovernance("project-asset", NOW, readyPreferences());
    const report = evaluateStudioAssetGovernance(input);

    expect(report.status).toBe("ready");
    expect(report.usage.status).toBe("allowed");
    expect(report.provider.status).toBe("allowed");
    expect(report.entitlement.status).toBe("active");
    expect(report.rights.status).toBe("allowed");
    expect(report.fonts.status).toBe("allowed");
    expect(report.plugin.status).toBe("ready");
    expect(report.marketplace.status).toBe("ready");
    expect(report.attributionTexts).toEqual([
      "Brush by ToonStudio Assets",
      "Font: ToonStudio Dialogue",
    ]);
  });

  it("requires a provider connection and explicit elevated extension permission", () => {
    const report = evaluateStudioAssetGovernance(
      createDefaultStudioAssetGovernance("project-asset", NOW),
    );

    expect(report.status).toBe("blocked");
    expect(report.provider).toMatchObject({ status: "blocked", code: "authentication-required" });
    expect(report.plugin).toMatchObject({ status: "confirmation" });
    expect(report.blockingCount).toBeGreaterThan(0);
    expect(report.reviewCount).toBeGreaterThan(0);
  });

  it("blocks prohibited AI training and excessive team seats", () => {
    const report = evaluateStudioAssetGovernance(createDefaultStudioAssetGovernance(
      "project-asset",
      NOW,
      Object.freeze({
        ...readyPreferences(),
        teamSeats: 6,
        usesForAiTraining: true,
      }),
    ));
    const usageCodes = report.usage.findings.map((finding) => finding.code);

    expect(report.status).toBe("blocked");
    expect(usageCodes).toContain("seat-limit-exceeded");
    expect(usageCodes).toContain("ai-training");
    expect(report.entitlement.codes).toContain("seat-limit-exceeded");
  });

  it("persists only project-scoped governance preferences and recovers malformed data", () => {
    const storage = new MemoryStorage();
    const expected = readyPreferences();

    writeStudioAssetGovernancePreferences(storage, "project-a", expected);
    expect(readStudioAssetGovernancePreferences(storage, "project-a")).toEqual(expected);
    expect(readStudioAssetGovernancePreferences(storage, "project-b"))
      .toEqual(createDefaultStudioAssetGovernancePreferences());
    expect(storage.values.has(studioAssetGovernanceStorageKey("project-a"))).toBe(true);

    storage.setItem(studioAssetGovernanceStorageKey("project-a"), "{invalid");
    expect(readStudioAssetGovernancePreferences(storage, "project-a"))
      .toEqual(createDefaultStudioAssetGovernancePreferences());
  });
});
