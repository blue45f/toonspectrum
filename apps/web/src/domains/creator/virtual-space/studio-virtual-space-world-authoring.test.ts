import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearStudioWorldAuthoringDraft,
  parseStudioWorldAuthoringImport,
  readStudioWorldAuthoringDraft,
  studioWorldDraftStorageKey,
  studioWorldManifestToTiledMap,
  writeStudioWorldAuthoringDraft,
} from "./studio-virtual-space-world-authoring";
import {
  DEFAULT_STUDIO_WORLD_MANIFEST,
  validateStudioWorldManifest,
} from "./studio-virtual-space-world-manifest";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("Virtual Studio world authoring", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", new MemoryStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("round-trips the editable manifest through Tiled JSON", () => {
    const tiled = studioWorldManifestToTiledMap(DEFAULT_STUDIO_WORLD_MANIFEST);
    const restored = parseStudioWorldAuthoringImport(
      JSON.stringify(tiled),
      DEFAULT_STUDIO_WORLD_MANIFEST,
    );

    expect(validateStudioWorldManifest(restored)).toEqual([]);
    expect(restored).toMatchObject({
      id: DEFAULT_STUDIO_WORLD_MANIFEST.id,
      version: DEFAULT_STUDIO_WORLD_MANIFEST.version,
      width: DEFAULT_STUDIO_WORLD_MANIFEST.width,
      height: DEFAULT_STUDIO_WORLD_MANIFEST.height,
      backgroundUrl: DEFAULT_STUDIO_WORLD_MANIFEST.backgroundUrl,
    });
    expect(restored.rooms.map((room) => room.id)).toEqual(
      DEFAULT_STUDIO_WORLD_MANIFEST.rooms.map((room) => room.id),
    );
    expect(restored.props.map((prop) => prop.id)).toEqual(
      DEFAULT_STUDIO_WORLD_MANIFEST.props.map((prop) => prop.id),
    );
    expect(restored.colliders).toHaveLength(DEFAULT_STUDIO_WORLD_MANIFEST.colliders.length);
    expect(tiled).toMatchObject({
      width: DEFAULT_STUDIO_WORLD_MANIFEST.width,
      height: DEFAULT_STUDIO_WORLD_MANIFEST.height,
      tilewidth: 1,
      tileheight: 1,
    });
  });

  it("exports odd integer pixel dimensions as valid integer Tiled dimensions", () => {
    const manifest = { ...DEFAULT_STUDIO_WORLD_MANIFEST, width: 869, height: 813 };
    const tiled = studioWorldManifestToTiledMap(manifest);
    expect(tiled).toMatchObject({ width: 869, height: 813, tilewidth: 1, tileheight: 1 });
    expect(validateStudioWorldManifest({ ...manifest, width: 869.5 })).toContain(
      "world dimensions must be integer pixels between 32 and 10000",
    );
  });

  it("persists a valid project-scoped browser draft and clears it", () => {
    const projectId = "authoring-demo";
    const manifest = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      version: DEFAULT_STUDIO_WORLD_MANIFEST.version + 1,
      rooms: DEFAULT_STUDIO_WORLD_MANIFEST.rooms.map((room, index) =>
        index === 0 ? { ...room, labelEn: "Edited Lounge" } : room
      ),
    };

    expect(writeStudioWorldAuthoringDraft(projectId, manifest)).toBe(true);
    expect(localStorage.getItem(studioWorldDraftStorageKey(projectId))).toBeTruthy();
    const restored = readStudioWorldAuthoringDraft(projectId);
    expect(restored?.version).toBe(manifest.version);
    expect(restored?.rooms[0]).toMatchObject({ labelEn: "Edited Lounge" });

    clearStudioWorldAuthoringDraft(projectId);
    expect(readStudioWorldAuthoringDraft(projectId)).toBeNull();
  });

  it("does not persist invalid drafts", () => {
    const invalid = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      rooms: [],
    };

    expect(writeStudioWorldAuthoringDraft("bad-world", invalid)).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it("does not persist a draft that would hide the editor behind an unsafe world", () => {
    const invalid = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      props: [],
      colliders: [{
        x: 0,
        y: 0,
        width: DEFAULT_STUDIO_WORLD_MANIFEST.width,
        height: DEFAULT_STUDIO_WORLD_MANIFEST.height,
      }],
    };

    expect(writeStudioWorldAuthoringDraft("blocked-world", invalid)).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it("accepts a direct manifest import and rejects unsupported JSON", () => {
    const imported = parseStudioWorldAuthoringImport(
      JSON.stringify(DEFAULT_STUDIO_WORLD_MANIFEST),
      DEFAULT_STUDIO_WORLD_MANIFEST,
    );
    expect(imported.id).toBe(DEFAULT_STUDIO_WORLD_MANIFEST.id);

    expect(() => parseStudioWorldAuthoringImport(
      JSON.stringify({ nope: true }),
      DEFAULT_STUDIO_WORLD_MANIFEST,
    )).toThrow("Unsupported world JSON format");
  });

  it("rejects direct JSON with missing required interaction and portal fields", () => {
    const malformed = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      interactions: [{
        id: "missing-interaction-fields",
        zoneId: DEFAULT_STUDIO_WORLD_MANIFEST.rooms[0]!.id,
      }],
      portals: [{
        id: "missing-portal-radius",
        point: { x: 420, y: 520 },
        targetPoint: { x: 430, y: 530 },
      }],
    };

    expect(() => parseStudioWorldAuthoringImport(
      JSON.stringify(malformed),
      DEFAULT_STUDIO_WORLD_MANIFEST,
    )).toThrow(/interaction geometry is invalid|interaction action is invalid/u);
    expect(() => parseStudioWorldAuthoringImport(
      JSON.stringify({ ...malformed, interactions: DEFAULT_STUDIO_WORLD_MANIFEST.interactions }),
      DEFAULT_STUDIO_WORLD_MANIFEST,
    )).toThrow(/portal geometry is invalid/u);
  });

  it("rejects direct JSON whose required entity id is missing", () => {
    const [firstRoom, ...remainingRooms] = DEFAULT_STUDIO_WORLD_MANIFEST.rooms;
    const malformed = {
      ...DEFAULT_STUDIO_WORLD_MANIFEST,
      rooms: [{ ...firstRoom, id: undefined }, ...remainingRooms],
    };

    expect(() => parseStudioWorldAuthoringImport(
      JSON.stringify(malformed),
      DEFAULT_STUDIO_WORLD_MANIFEST,
    )).toThrow(/invalid room id/u);
  });
});
