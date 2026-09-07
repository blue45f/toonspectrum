// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MARKET_LIBRARY_STORAGE_KEY,
  useMarketLibrary,
} from "./use-market-library";

import type { CreatorMarketplaceCloudLibraryPage } from "@/shared/lib/creator-marketplace-cloud-library-contract";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import {
  acquireCreatorMarketplaceCloudLibraryRelease,
  listCreatorMarketplaceCloudLibrary,
} from "@/src/infrastructure/creator-marketplace-client";

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  acquire: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/src/compat/auth-session-store", () => ({
  useSession: mocks.useSession,
}));

vi.mock("@/src/infrastructure/creator-marketplace-client", () => ({
  acquireCreatorMarketplaceCloudLibraryRelease: mocks.acquire,
  listCreatorMarketplaceCloudLibrary: mocks.list,
}));

const acquireRelease = vi.mocked(acquireCreatorMarketplaceCloudLibraryRelease);
const listLibrary = vi.mocked(listCreatorMarketplaceCloudLibrary);

const USER_A = "123e4567-e89b-42d3-a456-426614174010";
const USER_B = "123e4567-e89b-42d3-a456-426614174011";
const RESOURCE_ID = "123e4567-e89b-42d3-a456-426614174001";
const LIBRARY_ID = "123e4567-e89b-42d3-a456-426614174003";
const PUBLISHER_ID = "123e4567-e89b-42d3-a456-426614174002";

function authenticatedSession(userId: string) {
  return {
    data: { user: { id: userId } },
    ready: true,
    status: "authenticated" as const,
  };
}

function emptyPage(): CreatorMarketplaceCloudLibraryPage {
  return {
    items: [],
    limit: 50,
    hasMore: false,
    nextCursor: null,
  };
}

function cloudPage(releaseId: string): CreatorMarketplaceCloudLibraryPage {
  return {
    items: [{
      id: LIBRARY_ID,
      logicalPackId: `community:${"a".repeat(64)}`,
      packageId: "test/3d/sword",
      name: "성검 3D 소품",
      kind: "3d-asset",
      membership: "active",
      addedFrom: {
        releaseId,
        resourceVersion: "1.0.0",
        releaseOrdinal: 1,
        manifestHash: "1".repeat(64),
      },
      addedAt: "2026-09-07T00:00:00.000Z",
      archivedAt: null,
      confirmation: { state: "none" },
      catalog: {
        state: "available",
        head: {
          id: releaseId,
          name: "성검 3D 소품",
          kind: "3d-asset",
          resourceVersion: "1.0.0",
          minimumStudioVersion: "0.1.0",
          releaseOrdinal: 1,
          manifestHash: "1".repeat(64),
        },
      },
      updateState: "no-account-confirmation",
    }],
    limit: 50,
    hasMore: false,
    nextCursor: null,
  };
}

const dummyRecord: CreatorMarketplaceResourceRecord = {
  schemaVersion: 1,
  id: RESOURCE_ID,
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
    id: PUBLISHER_ID,
    name: "3D모델러",
    avatar: null,
  },
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  isOwner: false,
  access: "free",
};

describe("useMarketLibrary", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    mocks.useSession.mockReturnValue(authenticatedSession(USER_A));
    listLibrary.mockResolvedValue(emptyPage());
  });

  afterEach(() => {
    cleanup();
  });

  it("hydrates acquisition state from the active account cloud library", async () => {
    listLibrary.mockResolvedValueOnce(cloudPage(dummyRecord.id));

    const { result } = renderHook(() => useMarketLibrary());

    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.isAcquired(dummyRecord.id)).toBe(true);
    expect(result.current.totalCount).toBe(1);
    expect(listLibrary).toHaveBeenCalledWith(
      expect.objectContaining({ view: "all", limit: 50 }),
      expect.any(AbortSignal),
    );
  });

  it("caches a record only after the server confirms the active account acquisition", async () => {
    acquireRelease.mockResolvedValue({
      operation: "acquire",
      changed: true,
      membership: "active",
      libraryScope: "account",
      libraryItemId: LIBRARY_ID,
      logicalPackId: `community:${"a".repeat(64)}`,
      updatedAt: "2026-09-07T00:00:00.000Z",
    });
    const { result } = renderHook(() => useMarketLibrary());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    let acquired = false;
    await act(async () => {
      acquired = await result.current.acquireResource(dummyRecord);
    });

    expect(acquired).toBe(true);
    expect(result.current.isAcquired(dummyRecord.id)).toBe(true);
    expect(result.current.activeItems).toHaveLength(1);
    expect(result.current.activeItems[0]?.resource.name).toBe("성검 3D 소품");
    expect(
      localStorage.getItem(`${MARKET_LIBRARY_STORAGE_KEY}${encodeURIComponent(USER_A)}`),
    ).not.toBeNull();
  });

  it("fails closed and creates no browser entitlement when server acquisition fails", async () => {
    acquireRelease.mockRejectedValue(new Error("503 Service Unavailable"));
    const { result } = renderHook(() => useMarketLibrary());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    let acquired = true;
    await act(async () => {
      acquired = await result.current.acquireResource(dummyRecord);
    });

    expect(acquired).toBe(false);
    expect(result.current.isAcquired(dummyRecord.id)).toBe(false);
    expect(result.current.items).toEqual([]);
    expect(
      localStorage.getItem(`${MARKET_LIBRARY_STORAGE_KEY}${encodeURIComponent(USER_A)}`),
    ).toBeNull();
  });

  it("clears account A ownership before hydrating account B", async () => {
    listLibrary
      .mockResolvedValueOnce(cloudPage(dummyRecord.id))
      .mockResolvedValueOnce(emptyPage());

    const { result, rerender } = renderHook(() => useMarketLibrary());
    await waitFor(() => expect(result.current.isAcquired(dummyRecord.id)).toBe(true));

    mocks.useSession.mockReturnValue(authenticatedSession(USER_B));
    rerender();

    expect(result.current.isAcquired(dummyRecord.id)).toBe(false);
    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
      expect(result.current.totalCount).toBe(0);
    });
    expect(result.current.isAcquired(dummyRecord.id)).toBe(false);
    expect(listLibrary).toHaveBeenCalledTimes(2);
  });

  it("ignores records from the legacy fail-open entitlement namespace", async () => {
    localStorage.setItem(
      "toonspectrum:market:acquired-library",
      JSON.stringify([{ resourceId: dummyRecord.id, resource: dummyRecord }]),
    );

    const { result } = renderHook(() => useMarketLibrary());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    expect(result.current.items).toEqual([]);
    expect(result.current.isAcquired(dummyRecord.id)).toBe(false);
  });
});
