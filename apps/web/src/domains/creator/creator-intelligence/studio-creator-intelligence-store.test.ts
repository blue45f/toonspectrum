import { describe, expect, it } from "vitest";

import {
  createSavedSceneReference,
  loadStudioCreatorIntelligenceStore,
  patchStudioCreatorIntelligenceStore,
  saveStudioCreatorIntelligenceStore,
  type StudioCreatorIntelligenceStorage,
} from "./studio-creator-intelligence-store";

class MemoryStorage implements StudioCreatorIntelligenceStorage {
  readonly #values = new Map<string, string>();
  getItem(key: string) { return this.#values.get(key) ?? null; }
  setItem(key: string, value: string) { this.#values.set(key, value); }
  removeItem(key: string) { this.#values.delete(key); }
}

const reference = {
  id: "openverse:1",
  provider: "openverse" as const,
  title: "Pose",
  creator: "Artist",
  sourceUrl: "https://example.org/source",
  license: "CC0 1.0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  rightsStatus: "verify-source" as const,
  importable: false as const,
  fetchedAt: "2026-09-18T00:00:00.000Z",
  target: { kind: "project" as const, id: "alpha" },
  savedAt: "2026-09-18T00:10:00.000Z",
};
describe("Studio Creator Intelligence project store", () => {
  it("isolates project-scoped research state", () => {
    const storage = new MemoryStorage();
    const alpha = loadStudioCreatorIntelligenceStore(storage, "alpha");
    const saved = patchStudioCreatorIntelligenceStore(alpha, { references: [reference] }, new Date("2026-09-18T01:00:00Z"));
    expect(saveStudioCreatorIntelligenceStore(storage, saved)).toBe(true);

    expect(loadStudioCreatorIntelligenceStore(storage, "alpha").references).toHaveLength(1);
    expect(loadStudioCreatorIntelligenceStore(storage, "beta").references).toHaveLength(0);
  });

  it("deduplicates saved references without discarding provenance", () => {
    const current = loadStudioCreatorIntelligenceStore(new MemoryStorage(), "work-1");
    const next = patchStudioCreatorIntelligenceStore(current, {
      references: [reference, reference],
    });
    expect(next.references).toHaveLength(1);
    expect(next.references[0]).toMatchObject({
      sourceUrl: "https://example.org/source",
      license: "CC0 1.0",
      rightsStatus: "verify-source",
    });
  });

  it("allows the same source to be scoped independently to an episode or scene", () => {
    const current = loadStudioCreatorIntelligenceStore(new MemoryStorage(), "alpha");
    const sceneReference = { ...reference, target: { kind: "scene" as const, id: "scene-7" } };
    const next = patchStudioCreatorIntelligenceStore(current, { references: [reference, sceneReference] });
    expect(next.references).toHaveLength(2);
  });

  it("only creates scene records from resolved ready responses", () => {
    expect(createSavedSceneReference({ status: "disabled" })).toBeNull();
    const saved = createSavedSceneReference({
      status: "ready",
      date: "2026-09-18",
      location: { latitude: 37.57, longitude: 126.98, label: "Jongno, Seoul" },
      weather: {
        weatherCode: 1,
        temperatureMaxC: 24,
        temperatureMinC: 16,
        precipitationMm: 0,
        sunrise: "2026-09-18T06:15",
        sunset: "2026-09-18T18:35",
        daylightSeconds: 44_400,
        sunshineSeconds: 30_000,
      },
    }, new Date("2026-09-18T02:00:00Z"));
    expect(saved?.id).toBe("2026-09-18:37.57:126.98");
    expect(saved?.payload.location?.label).toBe("Jongno, Seoul");
  });
  it("reports write failures without claiming saved research", () => {
    const current = loadStudioCreatorIntelligenceStore(null, "alpha");
    const blocked: StudioCreatorIntelligenceStorage = {
      getItem: () => null, removeItem: () => undefined,
      setItem: () => { throw new Error("quota"); },
    };
    expect(saveStudioCreatorIntelligenceStore(blocked, current)).toBe(false);
    expect(saveStudioCreatorIntelligenceStore(null, current)).toBe(false);
  });
  it("rejects corrupt and foreign-project records", () => {
    const storage = new MemoryStorage();
    storage.setItem("toonspectrum:creator-intelligence:project:v1:alpha", "{");
    expect(loadStudioCreatorIntelligenceStore(storage, "alpha").references).toEqual([]);
    storage.setItem("toonspectrum:creator-intelligence:project:v1:alpha", JSON.stringify({
      ...loadStudioCreatorIntelligenceStore(null, "beta"), references: [reference],
    }));
    expect(loadStudioCreatorIntelligenceStore(storage, "alpha").references).toEqual([]);
  });
  it("rejects an unreadably large write and preserves the previous draft", () => {
    const storage = new MemoryStorage();
    const current = patchStudioCreatorIntelligenceStore(loadStudioCreatorIntelligenceStore(storage, "alpha"), { references: [reference] });
    expect(saveStudioCreatorIntelligenceStore(storage, current)).toBe(true);
    const oversized = patchStudioCreatorIntelligenceStore(current, {
      references: [{ ...reference, title: "x".repeat(750_000) }],
    });
    expect(saveStudioCreatorIntelligenceStore(storage, oversized)).toBe(false);
    expect(loadStudioCreatorIntelligenceStore(storage, "alpha").references[0]?.title).toBe("Pose");
  });

});
