import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";


import {
  readCachedMarketPage,
  readCachedMarketResource,
  writeCachedMarketPage,
  writeCachedMarketResource,
} from "./market-resource-cache";

import type { CreatorMarketplaceResourceRecord } from "@/lib/creator-marketplace-resource-contract";

import {
  canonicalizeCreatorMarketplaceJson,
  creatorMarketplaceJsonByteSize,
} from "@/lib/creator-marketplace-resource-contract";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null,
    key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => void map.delete(key),
    setItem: (key, value) => void map.set(key, value),
  };
}

const payload = {
  schemaVersion: 1 as const,
  resourceKind: "palette" as const,
  runtime: "studio-palette-v1" as const,
  definition: { colors: ["#101010", "#fafafa"] },
};
const payloadCanonical = canonicalizeCreatorMarketplaceJson(payload);
const sha256 = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");

const record = {
  schemaVersion: 1,
  packageId: "seed/test",
  name: "테스트 리소스",
  description: "설명",
  kind: "palette",
  resourceVersion: "1.0.0",
  minimumStudioVersion: "1.0.0",
  tags: ["팔레트"],
  license: "cc0-1.0",
  attributionText: "",
  containsAi: false,
  provenance: { origin: "original", authoredByPublisher: true },
  compatibility: { engines: ["canvas2d"] },
  entries: [
    {
      id: "palette/seed-test",
      kind: "palette",
      name: "테스트",
      delivery: {
        mode: "portable-json",
        mediaType: "application/vnd.toonspectrum.palette+json",
        payload,
        byteSize: creatorMarketplaceJsonByteSize(payload),
        sha256: sha256(payloadCanonical),
      },
    },
  ],
  id: "11111111-2222-4333-8444-555555555555",
  manifestHash: sha256(canonicalizeCreatorMarketplaceJson({
    schemaVersion: 1,
    packageId: "seed/test",
    name: "테스트 리소스",
    description: "설명",
    kind: "palette",
    resourceVersion: "1.0.0",
    minimumStudioVersion: "1.0.0",
    tags: ["팔레트"],
    license: "cc0-1.0",
    attributionText: "",
    containsAi: false,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["canvas2d"] },
    entries: [
      {
        id: "palette/seed-test",
        kind: "palette",
        name: "테스트",
        delivery: {
          mode: "portable-json",
          mediaType: "application/vnd.toonspectrum.palette+json",
          payload,
          byteSize: creatorMarketplaceJsonByteSize(payload),
          sha256: sha256(payloadCanonical),
        },
      },
    ],
  })),
  manifestByteSize: 10,
  publisher: { id: "u1", name: "시드", avatar: null },
  createdAt: "2026-08-25T00:00:00.000Z",
  updatedAt: "2026-08-25T00:00:00.000Z",
  isOwner: false,
  access: "free" as const,
} satisfies CreatorMarketplaceResourceRecord;

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: memoryStorage(),
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  localStorage.clear();
});

describe("market-resource-cache", () => {
  it("writes and reads back a page roundtrip", () => {
    writeCachedMarketPage('{"limit":8}', { items: [record], hasMore: true });
    const cached = readCachedMarketPage('{"limit":8}');
    expect(cached).not.toBeNull();
    expect(cached?.items).toHaveLength(1);
    expect(cached?.items[0]?.id).toBe(record.id);
    expect(cached?.hasMore).toBe(true);
    expect(Number.isFinite(new Date(cached!.savedAt).getTime())).toBe(true);
  });

  it("returns null for corrupted JSON", () => {
    localStorage.setItem('toonspectrum.market.page.v1:{"limit":8}', "{broken");
    expect(readCachedMarketPage('{"limit":8}')).toBeNull();
  });

  it("returns null when every record is invalid", () => {
    localStorage.setItem(
      'toonspectrum.market.page.v1:{"limit":8}',
      JSON.stringify({ savedAt: new Date().toISOString(), items: [{ garbage: true }], hasMore: false })
    );
    expect(readCachedMarketPage('{"limit":8}')).toBeNull();
  });

  it("skips writing payloads beyond the size cap", () => {
    const huge = { ...record, name: "x".repeat(400_000) };
    writeCachedMarketPage("huge", { items: [huge], hasMore: false });
    expect(readCachedMarketPage("huge")).toBeNull();
  });

  it("roundtrips a single resource record", () => {
    writeCachedMarketResource(record);
    const cached = readCachedMarketResource(record.id);
    expect(cached?.record.id).toBe(record.id);
    expect(cached?.record.name).toBe(record.name);
  });

  it("returns null for a missing resource entry", () => {
    expect(readCachedMarketResource("nope")).toBeNull();
  });
});
