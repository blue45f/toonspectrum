import { afterEach, describe, expect, it, vi } from "vitest";

import { studioAutosaveKey, type StudioAutosavePayload } from "../apps/web/src/domains/creator/studio-autosave";
import { createStudioAutosaveSqliteStore } from "../apps/web/src/domains/creator/studio-autosave-sqlite-store";

import { readStoredDocument } from "./verify-studio-living-ink-integration.mjs";

import type { Page } from "playwright";

const guestKey = studioAutosaveKey({});
const savedAt = "2026-09-08T00:00:01.000Z";
const receipt = { canonicalPngSha256: `sha256:${"a".repeat(64)}`, journal: [{ kind: "deposit" }] };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function snapshot(pipeline = "causal-deposit-v3-segmented"): StudioAutosavePayload {
  return {
    version: 2,
    savedAt,
    currentPageId: "current",
    pagesList: [
      { id: "first", canvasH: 1080, elements: [{ id: "other-page", type: "rect" }] },
      { id: "current", canvasH: 1080, elements: [
        { id: "source", type: "draw", hidden: true, points: [10, 20, 30, 40],
          brushDynamics: { version: 1, depositPipeline: pipeline, seed: 123 } },
        { id: "canonical", type: "image", src: "data:image/png;base64,fixture", livingInkReceipt: receipt },
      ] },
    ],
  };
}

function fixture(compatibilityRaw: string | null = null) {
  const rows = new Map<string, string>();
  const database = {
    kvGet: vi.fn(async (_namespace: string, key: string) => rows.get(key) ?? null),
    kvSet: vi.fn(async (_namespace: string, key: string, value: string) => { rows.set(key, value); }),
  };
  const sqlite = createStudioAutosaveSqliteStore(database);
  const bridge = {
    moduleUrl: "fixture-opfs", sqliteModuleUrl: "fixture-sqlite", lastError: null,
    open: vi.fn(async () => null), openSqlite: vi.fn(async () => sqlite),
  };
  vi.stubGlobal("window", {
    localStorage: {
      length: compatibilityRaw ? 1 : 0,
      key: () => guestKey,
      getItem: (key: string) => key === guestKey ? compatibilityRaw : null,
    },
    __studioVerifyDurableAutosaveBridge: bridge,
  });
  // Run the real page callbacks and shipped SQLite encoder/decoder on a memory KV port.
  // No browser authority result or normalized payload is fabricated by this fixture.
  const page = {
    evaluate: async <Arg, Result>(callback: (arg: Arg) => Result, arg: Arg) => callback(arg),
  } as unknown as Page;
  return { page, rows, database, sqlite, bridge };
}

describe("Living Ink verifier observes durable product autosaves", () => {
  it.each([
    ["causal-deposit-v3-segmented", 2],
    ["causal-deposit-v4-taper-spacing", 3],
  ] as const)("reads %s through the shipped decoder with no localStorage record", async (pipeline, version) => {
    const f = fixture();
    await f.sqlite.write(guestKey, snapshot(pipeline));
    const envelope = JSON.parse(f.rows.get(guestKey)!);
    const stored = JSON.parse(envelope.payload);
    expect(stored.version).toBe(version);
    if (version === 3) {
      expect(stored.kind).toBe("studio-taper-spacing-autosave");
      expect(stored.pagesList).toBeUndefined();
    }
    f.database.kvSet.mockClear();

    const observed = await readStoredDocument(f.page);
    expect(observed).toEqual({
      key: guestKey, savedAt, raw: expect.any(String),
      elements: [
        { id: "source", type: "draw", hidden: true, pointCount: 2, src: null, livingInkReceipt: null },
        { id: "canonical", type: "image", hidden: false, pointCount: 0,
          src: "data:image/png;base64,fixture", livingInkReceipt: receipt },
      ],
    });
    const recovered = JSON.parse(observed.raw!);
    expect(recovered.version).toBe(version);
    expect(recovered.pagesList).toEqual(snapshot(pipeline).pagesList);
    expect(recovered.kind).toBeUndefined();
    expect(f.bridge.open).toHaveBeenCalledWith(guestKey, true);
    expect(f.database.kvSet).not.toHaveBeenCalled();
  });

  it("keeps explicit document scope and the first-page fallback without reading a different guest document", async () => {
    const f = fixture();
    const ownedKey = studioAutosaveKey({ userId: "qa-owner", workId: "qa-owned-work" });
    await f.sqlite.write(guestKey, snapshot());
    await f.sqlite.write(ownedKey, { ...snapshot(), currentPageId: "missing" });
    const observed = await readStoredDocument(f.page, ownedKey);
    expect(observed.key).toBe(ownedKey);
    expect(observed.elements.map((element) => element.id)).toEqual(["other-page"]);
    expect(f.bridge.open).toHaveBeenCalledWith(ownedKey, true);
    expect(f.bridge.open).not.toHaveBeenCalledWith(guestKey, true);
  });

  it("does not resurrect a stale compatibility record after a durable clear", async () => {
    const f = fixture(JSON.stringify(snapshot()));
    await f.sqlite.write(guestKey, snapshot());
    await f.sqlite.clear(guestKey, "2026-09-08T00:00:02.000Z");
    f.database.kvSet.mockClear();
    expect(await readStoredDocument(f.page)).toEqual({ key: null, raw: null, savedAt: null, elements: [] });
    expect(f.database.kvSet).not.toHaveBeenCalled();
  });

  it("reports an empty snapshot when neither durable authority has a document", async () => {
    const f = fixture();
    expect(await readStoredDocument(f.page)).toEqual({ key: null, raw: null, savedAt: null, elements: [] });
    expect(f.bridge.open).toHaveBeenCalledWith(guestKey, true);
    expect(f.database.kvSet).not.toHaveBeenCalled();
  });
});
