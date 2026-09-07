// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  MARKET_LIBRARY_EVENT,
  MARKET_LIBRARY_STORAGE_KEY,
  useMarketLibrary,
} from "./use-market-library";

import type { CreatorMarketplaceCloudLibraryPage } from "@/shared/lib/creator-marketplace-cloud-library-contract";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";
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
    vi.resetAllMocks();
    mocks.useSession.mockReturnValue(authenticatedSession(USER_A));
    listLibrary.mockResolvedValue(emptyPage());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
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

  it("hydrates every page of a library larger than 1,000 packages", async () => {
    for (let index = 0; index < 21; index += 1) {
      const page = cloudPage(`release-${index}`);
      listLibrary.mockResolvedValueOnce({
        ...page,
        items: Array.from({ length: 50 }, (_, itemIndex) => ({
          ...page.items[0]!,
          id: `library-${index}-${itemIndex}`,
        })),
        hasMore: index < 20,
        nextCursor: index < 20 ? `cursor-${index + 1}` : null,
      });
    }
    const { result } = renderHook(() => useMarketLibrary());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.totalCount).toBe(1_050);
    expect(result.current.isAcquired("release-20")).toBe(true);
    expect(listLibrary).toHaveBeenCalledTimes(21);
    expect(listLibrary).toHaveBeenLastCalledWith(
      { view: "all", limit: 50, cursor: "cursor-20" },
      expect.any(AbortSignal),
    );
  });

  it.each(["missing", "repeated"])("does not mark a %s cursor response as fully hydrated", async (kind) => {
    listLibrary.mockResolvedValue({
      ...cloudPage(dummyRecord.id),
      hasMore: true,
      nextCursor: kind === "missing" ? null : "same-cursor",
    });
    const { result } = renderHook(() => useMarketLibrary());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hydrated).toBe(false);
    expect(result.current.totalCount).toBe(0);
    expect(result.current.isAcquired(dummyRecord.id)).toBe(false);
    expect(listLibrary).toHaveBeenCalledTimes(kind === "missing" ? 1 : 2);
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

    listLibrary.mockResolvedValue(cloudPage(dummyRecord.id));
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

  it.each([false, true])("refreshes another mounted consumer after acquisition (cache unavailable=%s)", async (cacheUnavailable) => {
    const first = renderHook(() => useMarketLibrary());
    const second = renderHook(() => useMarketLibrary());
    await waitFor(() => expect(first.result.current.hydrated && second.result.current.hydrated).toBe(true));
    listLibrary.mockResolvedValue(cloudPage(dummyRecord.id));
    acquireRelease.mockResolvedValue({
      operation: "acquire", changed: true, membership: "active", libraryScope: "account",
      libraryItemId: LIBRARY_ID, logicalPackId: `community:${"a".repeat(64)}`,
      updatedAt: "2026-09-07T00:00:00.000Z",
    });
    if (cacheUnavailable) vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });

    await act(async () => { expect(await first.result.current.acquireResource(dummyRecord)).toBe(true); });
    await waitFor(() => expect(second.result.current.isAcquired(dummyRecord.id)).toBe(true));
    expect(second.result.current.totalCount).toBe(1);
    expect(listLibrary).toHaveBeenCalledTimes(4);
  });

  it("treats account events as requery hints, never as entitlement authority", async () => {
    const { result } = renderHook(() => useMarketLibrary());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => window.dispatchEvent(new CustomEvent(MARKET_LIBRARY_EVENT, {
      detail: { userId: USER_A, releaseId: dummyRecord.id, acquired: true },
    })));
    await waitFor(() => expect(listLibrary).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAcquired(dummyRecord.id)).toBe(false);
    expect(result.current.totalCount).toBe(0);
  });

  it("rehydrates matching cross-tab storage changes and ignores other accounts", async () => {
    const { result } = renderHook(() => useMarketLibrary());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: `${MARKET_LIBRARY_STORAGE_KEY}${USER_B}` }));
      window.dispatchEvent(new CustomEvent(MARKET_LIBRARY_EVENT, { detail: { userId: USER_B } }));
    });
    expect(listLibrary).toHaveBeenCalledTimes(1);
    listLibrary.mockResolvedValue(cloudPage(dummyRecord.id));
    act(() => window.dispatchEvent(new StorageEvent("storage", { key: `${MARKET_LIBRARY_STORAGE_KEY}${USER_A}` })));
    await waitFor(() => expect(result.current.isAcquired(dummyRecord.id)).toBe(true));
    expect(listLibrary).toHaveBeenCalledTimes(2);
  });

  it("discards an older hydration after a newer account refresh has completed", async () => {
    const pending = Promise.withResolvers<CreatorMarketplaceCloudLibraryPage>();
    listLibrary.mockReturnValueOnce(pending.promise).mockResolvedValue(cloudPage(dummyRecord.id));
    const { result } = renderHook(() => useMarketLibrary());
    const oldSignal = listLibrary.mock.calls[0]?.[1];
    act(() => window.dispatchEvent(new CustomEvent(MARKET_LIBRARY_EVENT, { detail: { userId: USER_A } })));
    await waitFor(() => expect(result.current.isAcquired(dummyRecord.id)).toBe(true));
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => { pending.resolve(emptyPage()); await pending.promise; });
    expect(result.current.isAcquired(dummyRecord.id)).toBe(true);
  });

  it("does not cancel a same-account acquisition merely because another consumer refreshed", async () => {
    const pending = Promise.withResolvers<Awaited<ReturnType<typeof acquireCreatorMarketplaceCloudLibraryRelease>>>();
    acquireRelease.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useMarketLibrary());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const acquiring = result.current.acquireResource(dummyRecord);
    act(() => window.dispatchEvent(new CustomEvent(MARKET_LIBRARY_EVENT, { detail: { userId: USER_A } })));
    await waitFor(() => expect(listLibrary).toHaveBeenCalledTimes(2));
    listLibrary.mockResolvedValue(cloudPage(dummyRecord.id));
    await act(async () => {
      pending.resolve({
        operation: "acquire", changed: true, membership: "active", libraryScope: "account",
        libraryItemId: LIBRARY_ID, logicalPackId: `community:${"a".repeat(64)}`,
        updatedAt: "2026-09-07T00:00:00.000Z",
      });
      expect(await acquiring).toBe(true);
    });
    expect(result.current.isAcquired(dummyRecord.id)).toBe(true);
  });

  it("rejects old account hydration and acquisition after switching accounts", async () => {
    const hydrating = Promise.withResolvers<CreatorMarketplaceCloudLibraryPage>();
    const acquiring = Promise.withResolvers<Awaited<ReturnType<typeof acquireCreatorMarketplaceCloudLibraryRelease>>>();
    listLibrary.mockResolvedValueOnce(emptyPage()).mockReturnValueOnce(hydrating.promise).mockResolvedValue(emptyPage());
    acquireRelease.mockReturnValueOnce(acquiring.promise);
    const { result, rerender } = renderHook(() => useMarketLibrary());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const acquireResult = result.current.acquireResource(dummyRecord);
    act(() => window.dispatchEvent(new CustomEvent(MARKET_LIBRARY_EVENT, { detail: { userId: USER_A } })));
    await waitFor(() => expect(listLibrary).toHaveBeenCalledTimes(2));
    mocks.useSession.mockReturnValue(authenticatedSession(USER_B));
    rerender();
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => {
      hydrating.resolve(cloudPage(dummyRecord.id));
      acquiring.resolve({
        operation: "acquire", changed: true, membership: "active", libraryScope: "account",
        libraryItemId: LIBRARY_ID, logicalPackId: `community:${"a".repeat(64)}`,
        updatedAt: "2026-09-07T00:00:00.000Z",
      });
      expect(await acquireResult).toBe(false);
      await hydrating.promise;
    });
    expect(result.current.isAcquired(dummyRecord.id)).toBe(false);
    expect(result.current.totalCount).toBe(0);
    expect(result.current.items).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  it("fails closed on refresh failure and removes listeners on unmount", async () => {
    listLibrary.mockResolvedValueOnce(cloudPage(dummyRecord.id));
    const { result, unmount } = renderHook(() => useMarketLibrary());
    await waitFor(() => expect(result.current.isAcquired(dummyRecord.id)).toBe(true));
    listLibrary.mockRejectedValue(new Error("expired session"));
    act(() => window.dispatchEvent(new CustomEvent(MARKET_LIBRARY_EVENT, { detail: { userId: USER_A } })));
    await waitFor(() => expect(result.current.hydrated).toBe(false));
    expect(result.current.isAcquired(dummyRecord.id)).toBe(false);
    expect(result.current.totalCount).toBe(0);
    unmount();
    act(() => window.dispatchEvent(new CustomEvent(MARKET_LIBRARY_EVENT, { detail: { userId: USER_A } })));
    expect(listLibrary).toHaveBeenCalledTimes(2);
  });

  it("keeps cached records hidden until the current account is confirmed by the API", async () => {
    const record = CREATOR_MARKETPLACE_STARTER_RECORDS[0]!;
    const pending = Promise.withResolvers<CreatorMarketplaceCloudLibraryPage>();
    localStorage.setItem(`${MARKET_LIBRARY_STORAGE_KEY}${USER_A}`, JSON.stringify([{
      id: LIBRARY_ID, resourceId: record.id, acquiredAt: "2026-09-07T00:00:00.000Z",
      archived: false, resource: record,
    }]));
    listLibrary.mockReturnValueOnce(pending.promise);
    const { result } = renderHook(() => useMarketLibrary());
    expect(result.current.items).toEqual([]);
    expect(result.current.isAcquired(record.id)).toBe(false);
    await act(async () => { pending.resolve(cloudPage(record.id)); await pending.promise; });
    expect(result.current.activeItems).toHaveLength(1);
    expect(result.current.isAcquired(record.id)).toBe(true);
  });
});
