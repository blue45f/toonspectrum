import { describe, expect, it } from "vitest";

import type { StudioAsyncKeyValueStore } from "../studio-local-database";

import {
  createStudioDrawingInputProfileLibraryRepository,
  normalizeStudioDrawingInputProfileName,
  parseStudioDrawingInputProfileLibrary,
  STUDIO_DRAWING_INPUT_CUSTOM_PROFILE_LIMIT,
} from "./studio-drawing-input-profile-library";

function memoryStore(): StudioAsyncKeyValueStore {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => {
      values.set(key, value);
    },
    delete: async (key) => {
      values.delete(key);
    },
  };
}

const snapshot = {
  stabilizer: 5,
  stabilizerMode: "adaptive" as const,
  postCorrection: 2,
  pressureCurveId: "linear" as const,
  stampMinSize: 0.08,
};

describe("studio drawing input custom profile library", () => {
  it("normalizes artist names without control characters or unbounded text", () => {
    expect(normalizeStudioDrawingInputProfileName("  내\n  G펜\u0000 프로필  ")).toBe("내 G펜 프로필");
    expect(normalizeStudioDrawingInputProfileName("x".repeat(200)).length).toBeLessThanOrEqual(40);
  });

  it("fails closed on malformed persisted envelopes", () => {
    expect(parseStudioDrawingInputProfileLibrary("not json", 10)).toMatchObject({
      revision: 0,
      profiles: [],
      malformed: true,
    });
    expect(parseStudioDrawingInputProfileLibrary(JSON.stringify({ v: 99 }), 10)).toMatchObject({
      revision: 0,
      profiles: [],
      malformed: true,
    });
  });

  it("saves, updates and deletes one named profile through the SQLite-style KV contract", async () => {
    const repository = createStudioDrawingInputProfileLibraryRepository(
      memoryStore(),
      async (operation) => operation(),
    );

    const saved = await repository.saveProfile({
      id: "input:inking",
      name: "웹툰 선화",
      snapshot,
      now: 100,
    });
    expect(saved.revision).toBe(1);
    expect(saved.profiles).toEqual([
      expect.objectContaining({
        id: "input:inking",
        name: "웹툰 선화",
        createdAt: 100,
        updatedAt: 100,
        snapshot,
      }),
    ]);

    const updated = await repository.saveProfile({
      id: "input:inking",
      name: "마감 선화",
      snapshot: { ...snapshot, stabilizer: 7, stabilizerMode: "precision" },
      now: 200,
    });
    expect(updated.revision).toBe(2);
    expect(updated.profiles[0]).toMatchObject({
      id: "input:inking",
      name: "마감 선화",
      createdAt: 100,
      updatedAt: 200,
      snapshot: { stabilizer: 7, stabilizerMode: "precision" },
    });

    const removed = await repository.deleteProfile("input:inking");
    expect(removed.revision).toBe(3);
    expect(removed.profiles).toEqual([]);
  });

  it("keeps newest profiles first and enforces the bounded library size", async () => {
    const repository = createStudioDrawingInputProfileLibraryRepository(
      memoryStore(),
      async (operation) => operation(),
    );

    for (let index = 0; index < STUDIO_DRAWING_INPUT_CUSTOM_PROFILE_LIMIT + 4; index += 1) {
      await repository.saveProfile({
        id: `input:${index}`,
        name: `프로필 ${index}`,
        snapshot: { ...snapshot, stabilizer: index % 11 },
        now: index + 1,
      });
    }

    const loaded = await repository.load();
    expect(loaded.profiles).toHaveLength(STUDIO_DRAWING_INPUT_CUSTOM_PROFILE_LIMIT);
    expect(loaded.profiles[0]?.id).toBe(`input:${STUDIO_DRAWING_INPUT_CUSTOM_PROFILE_LIMIT + 3}`);
    expect(loaded.profiles.at(-1)?.id).toBe("input:4");
  });
});
