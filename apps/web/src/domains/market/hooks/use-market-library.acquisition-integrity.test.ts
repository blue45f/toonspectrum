// @vitest-environment jsdom

import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useMarketLibrary } from "./use-market-library";

import type { CreatorMarketplaceCloudLibraryPage } from "@/shared/lib/creator-marketplace-cloud-library-contract";
import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import {
  acquireCreatorMarketplaceCloudLibraryRelease,
  listCreatorMarketplaceCloudLibrary,
} from "@/platform/creator-marketplace-client";

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  acquire: vi.fn(),
  list: vi.fn(),
}));

vi.mock("@/compat/auth-session-store", () => ({
  useSession: mocks.useSession,
}));

vi.mock("@/platform/creator-marketplace-client", () => ({
  acquireCreatorMarketplaceCloudLibraryRelease: mocks.acquire,
  listCreatorMarketplaceCloudLibrary: mocks.list,
}));

const acquireRelease = vi.mocked(acquireCreatorMarketplaceCloudLibraryRelease);
const listLibrary = vi.mocked(listCreatorMarketplaceCloudLibrary);

const USER_ID = "123e4567-e89b-42d3-a456-426614174010";
const RESOURCE_ID = "123e4567-e89b-42d3-a456-426614174001";
const LIBRARY_ID = "123e4567-e89b-42d3-a456-426614174003";
const PUBLISHER_ID = ["123e4567", "e89b", "42d3", "a456", "426614174002"].join("-");
const EXPECTED_LOGICAL_PACK_ID = `community:${"b".repeat(64)}`;

const record: CreatorMarketplaceResourceRecord = {
  schemaVersion: 1,
  id: RESOURCE_ID,
  packageId: "test/brush/inking",
  name: "테스트 잉킹 브러시",
  description: "획득 영수증 무결성 확인용 브러시",
  kind: "brush",
  resourceVersion: "1.0.0",
  minimumStudioVersion: "0.1.0",
  tags: ["잉킹", "테스트"],
  license: "toonspectrum-standard",
  attributionText: "",
  containsAi: false,
  provenance: { origin: "original", authoredByPublisher: true },
  compatibility: { engines: ["canvas2d"] },
  entries: [],
  manifestHash: "1".repeat(64),
  manifestByteSize: 200,
  publisher: {
    id: PUBLISHER_ID,
    name: "테스트 제작자",
    avatar: null,
  },
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  isOwner: false,
  access: "free",
};

function emptyPage(): CreatorMarketplaceCloudLibraryPage {
  return {
    items: [],
    limit: 50,
    hasMore: false,
    nextCursor: null,
  };
}

function acquiredPage(): CreatorMarketplaceCloudLibraryPage {
  return {
    items: [{
      id: LIBRARY_ID,
      logicalPackId: EXPECTED_LOGICAL_PACK_ID,
      packageId: record.packageId,
      name: record.name,
      kind: record.kind,
      membership: "active",
      addedFrom: {
        releaseId: record.id,
        resourceVersion: record.resourceVersion,
        releaseOrdinal: 1,
        manifestHash: record.manifestHash,
      },
      addedAt: "2026-09-16T00:00:00.000Z",
      archivedAt: null,
      confirmation: { state: "none" },
      catalog: {
        state: "available",
        head: {
          id: record.id,
          name: record.name,
          kind: record.kind,
          resourceVersion: record.resourceVersion,
          minimumStudioVersion: record.minimumStudioVersion,
          releaseOrdinal: 1,
          manifestHash: record.manifestHash,
        },
      },
      updateState: "no-account-confirmation",
    }],
    limit: 50,
    hasMore: false,
    nextCursor: null,
  };
}

function receipt(logicalPackId: string) {
  return {
    operation: "acquire" as const,
    changed: true,
    membership: "active" as const,
    libraryScope: "account" as const,
    libraryItemId: LIBRARY_ID,
    logicalPackId,
    updatedAt: "2026-09-16T00:00:00.000Z",
  };
}

describe("useMarketLibrary acquisition integrity", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    mocks.useSession.mockReturnValue({
      data: { user: { id: USER_ID } },
      ready: true,
      status: "authenticated",
    });
    listLibrary.mockResolvedValue(emptyPage());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not cache a release when the account receipt identifies another package", async () => {
    acquireRelease.mockResolvedValue(receipt(`community:${"c".repeat(64)}`));
    const { result } = renderHook(() => useMarketLibrary());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    let acquired = true;
    await act(async () => {
      acquired = await result.current.acquireResource(
        record,
        EXPECTED_LOGICAL_PACK_ID,
      );
    });

    expect(acquired).toBe(false);
    expect(result.current.isAcquired(record.id)).toBe(false);
    expect(result.current.items).toEqual([]);
    expect(localStorage.length).toBe(0);
  });

  it("caches the exact release only after the expected active receipt", async () => {
    acquireRelease.mockResolvedValue(receipt(EXPECTED_LOGICAL_PACK_ID));
    const { result } = renderHook(() => useMarketLibrary());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    listLibrary.mockResolvedValue(acquiredPage());

    await act(async () => {
      expect(await result.current.acquireResource(
        record,
        EXPECTED_LOGICAL_PACK_ID,
      )).toBe(true);
    });

    expect(result.current.isAcquired(record.id)).toBe(true);
    expect(result.current.activeItems[0]?.resource.id).toBe(record.id);
  });
});
