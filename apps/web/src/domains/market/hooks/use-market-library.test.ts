// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MARKET_LIBRARY_STORAGE_KEY,
  useMarketLibrary,
} from "./use-market-library";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { acquireCreatorMarketplaceCloudLibraryRelease } from "@/src/infrastructure/creator-marketplace-client";

vi.mock("@/src/infrastructure/creator-marketplace-client", () => ({
  acquireCreatorMarketplaceCloudLibraryRelease: vi.fn(),
}));

const acquireRelease = vi.mocked(acquireCreatorMarketplaceCloudLibraryRelease);

describe("useMarketLibrary", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  const dummyRecord: CreatorMarketplaceResourceRecord = {
    schemaVersion: 1,
    id: "123e4567-e89b-42d3-a456-426614174001",
    packageId: "test/3d/sword",
    name: "성검 3D 소품",
    description: "로판 판타지용 성검",
    kind: "3d-asset",
    resourceVersion: "1.0.0",
    minimumStudioVersion: "0.1.0",
    tags: ["3D", "무기"],
    license: "toonspectrum-standard",
    attributionText: "",
    containsAi: false,
    provenance: { origin: "original", authoredByPublisher: true },
    compatibility: { engines: ["three"] },
    entries: [],
    manifestHash: "1".repeat(64),
    manifestByteSize: 200,
    publisher: {
      id: "123e4567-e89b-42d3-a456-426614174002",
      name: "3D모델러",
      avatar: null,
    },
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    isOwner: false,
    access: "free",
  };

  it("caches an acquisition only after the server confirms account ownership", async () => {
    acquireRelease.mockResolvedValue({
      operation: "acquire",
      changed: true,
      membership: "active",
      libraryScope: "account",
      libraryItemId: "123e4567-e89b-42d3-a456-426614174003",
      logicalPackId: `community:${"a".repeat(64)}`,
      updatedAt: "2026-09-07T00:00:00.000Z",
    });
    const { result } = renderHook(() => useMarketLibrary());

    let acquired = false;
    await act(async () => {
      acquired = await result.current.acquireResource(dummyRecord);
    });

    expect(acquired).toBe(true);
    expect(result.current.isAcquired(dummyRecord.id)).toBe(true);
    expect(result.current.activeItems).toHaveLength(1);
    expect(result.current.activeItems[0]?.resource.name).toBe("성검 3D 소품");
    expect(localStorage.getItem(MARKET_LIBRARY_STORAGE_KEY)).not.toBeNull();
  });

  it("fails closed and creates no browser entitlement when server acquisition fails", async () => {
    acquireRelease.mockRejectedValue(new Error("503 Service Unavailable"));
    const { result } = renderHook(() => useMarketLibrary());

    let acquired = true;
    await act(async () => {
      acquired = await result.current.acquireResource(dummyRecord);
    });

    expect(acquired).toBe(false);
    expect(result.current.isAcquired(dummyRecord.id)).toBe(false);
    expect(result.current.items).toEqual([]);
    expect(localStorage.getItem(MARKET_LIBRARY_STORAGE_KEY)).toBeNull();
  });

  it("ignores records from the legacy fail-open local entitlement namespace", () => {
    localStorage.setItem(
      "toonspectrum:market:acquired-library",
      JSON.stringify([{ resourceId: dummyRecord.id, resource: dummyRecord }]),
    );

    const { result } = renderHook(() => useMarketLibrary());

    expect(result.current.items).toEqual([]);
    expect(result.current.isAcquired(dummyRecord.id)).toBe(false);
  });
});
