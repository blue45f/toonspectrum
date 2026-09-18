import { describe, expect, it } from "vitest";

import {
  readStudioProjectGraphCache,
  STUDIO_PROJECT_GRAPH_CACHE_TTL_MS,
  studioProjectGraphCacheKey,
  writeStudioProjectGraphCache,
} from "./studio-project-graph-cache";

const NOW = Date.parse("2026-09-17T06:00:00.000Z");

class MemoryStorage {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function record() {
  return {
    id: "project-1",
    workId: "work-1",
    schemaVersion: 3 as const,
    authorityVersion: "project-graph-v3" as const,
    ownerUserId: "owner-1",
    createdAt: "2026-09-17T05:00:00.000Z",
    updatedAt: "2026-09-17T05:30:00.000Z",
    access: {
      view: true,
      comment: true,
      edit: true,
      manageMembers: true,
      respondInvite: false,
      owner: true,
      role: "owner" as const,
    },
    artifacts: [],
  };
}

describe("Studio ProjectGraph metadata cache", () => {
  it("writes the same bounded metadata snapshot under project and work aliases", () => {
    const storage = new MemoryStorage();
    expect(writeStudioProjectGraphCache({ storage, record: record(), now: NOW })).toBe(true);
    expect(readStudioProjectGraphCache({ storage, alias: "project-1", now: NOW }))
      .toMatchObject({ record: { workId: "work-1" }, stale: false });
    expect(readStudioProjectGraphCache({ storage, alias: "work-1", now: NOW }))
      .toMatchObject({ record: { id: "project-1" }, stale: false });
  });

  it("expires metadata without touching the durable OPFS document authority", () => {
    const storage = new MemoryStorage();
    writeStudioProjectGraphCache({ storage, record: record(), now: NOW });
    const later = NOW + STUDIO_PROJECT_GRAPH_CACHE_TTL_MS + 1;
    expect(readStudioProjectGraphCache({ storage, alias: "work-1", now: later }))
      .toBeNull();
    expect(storage.getItem(studioProjectGraphCacheKey("work-1")!)).toBeNull();
  });

  it("rejects forged aliases and corrupt records fail-closed", () => {
    const storage = new MemoryStorage();
    const key = studioProjectGraphCacheKey("work-1")!;
    storage.setItem(key, JSON.stringify({
      schema: 1,
      alias: "other-work",
      cachedAt: NOW,
      expiresAt: NOW + STUDIO_PROJECT_GRAPH_CACHE_TTL_MS,
      record: record(),
    }));
    expect(readStudioProjectGraphCache({ storage, alias: "work-1", now: NOW }))
      .toBeNull();
    expect(storage.getItem(key)).toBeNull();
  });
});
