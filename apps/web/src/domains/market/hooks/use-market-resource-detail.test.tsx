// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useMarketResourceDetail } from "./use-market-resource-detail";

import type { CreatorMarketplaceResourceRecord } from "@/shared/lib/creator-marketplace-resource-contract";

import {
  readAuthoritativeCachedMarketResource,
  removeAuthoritativeCachedMarketResource,
  removeCachedMarketResource,
  writeAuthoritativeCachedMarketResource,
} from "@/src/domains/market/models/market-resource-cache";
import { getCreatorMarketplaceResource } from "@/src/domains/market/remotes/market-resource-remote";
import { NotFoundError } from "@/src/infrastructure/use-api-resource";

vi.mock("@/src/domains/market/remotes/market-resource-remote", () => ({
  getCreatorMarketplaceResource: vi.fn(),
}));
vi.mock("@/src/domains/market/models/market-resource-cache", () => ({
  readAuthoritativeCachedMarketResource: vi.fn(() => null),
  removeAuthoritativeCachedMarketResource: vi.fn(),
  removeCachedMarketResource: vi.fn(),
  writeAuthoritativeCachedMarketResource: vi.fn(),
}));

const getResource = vi.mocked(getCreatorMarketplaceResource);
const readCache = vi.mocked(readAuthoritativeCachedMarketResource);
const removeAuthorityCache = vi.mocked(removeAuthoritativeCachedMarketResource);
const removeLegacyCache = vi.mocked(removeCachedMarketResource);
const writeCache = vi.mocked(writeAuthoritativeCachedMarketResource);

function record(id: string): CreatorMarketplaceResourceRecord {
  return { id, name: id } as CreatorMarketplaceResourceRecord;
}

afterEach(() => {
  vi.clearAllMocks();
  readCache.mockReturnValue(null);
});

describe("useMarketResourceDetail", () => {
  it("writes the isolated detail cache only after a successful server response", async () => {
    const serverRecord = record("123e4567-e89b-42d3-a456-426614174010");
    getResource.mockResolvedValue(serverRecord);

    const { result } = renderHook(() => useMarketResourceDetail(serverRecord.id));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.record).toBe(serverRecord);
    expect(writeCache).toHaveBeenCalledWith(serverRecord);
  });

  it("evicts authoritative and legacy detail caches after a confirmed 404", async () => {
    const id = "123e4567-e89b-42d3-a456-426614174011";
    getResource.mockRejectedValue(new NotFoundError());

    const { result } = renderHook(() => useMarketResourceDetail(id));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.notFound).toBe(true);
    expect(result.current.record).toBeNull();
    expect(removeAuthorityCache).toHaveBeenCalledWith(id);
    expect(removeLegacyCache).toHaveBeenCalledWith(id);
  });

  it("uses only a previous successful server detail cache on network failure", async () => {
    const cachedRecord = record("123e4567-e89b-42d3-a456-426614174012");
    readCache.mockReturnValue({
      savedAt: "2026-09-07T00:00:00.000Z",
      record: cachedRecord,
    });
    getResource.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useMarketResourceDetail(cachedRecord.id));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.record).toBe(cachedRecord);
    expect(result.current.staleSavedAt).toBe("2026-09-07T00:00:00.000Z");
    expect(result.current.notFound).toBe(false);
  });

  it("fails closed when neither server nor authoritative cache is available", async () => {
    const id = "123e4567-e89b-42d3-a456-426614174013";
    getResource.mockRejectedValue(new Error("offline"));

    const { result } = renderHook(() => useMarketResourceDetail(id));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.record).toBeNull();
    expect(result.current.error).toBe("offline");
    expect(result.current.staleSavedAt).toBeNull();
  });

  it("ignores a slow response after the requested release changes", async () => {
    let resolveOld!: (value: CreatorMarketplaceResourceRecord) => void;
    const oldPromise = new Promise<CreatorMarketplaceResourceRecord>((resolve) => {
      resolveOld = resolve;
    });
    const newRecord = record("123e4567-e89b-42d3-a456-426614174015");
    getResource
      .mockReturnValueOnce(oldPromise)
      .mockResolvedValueOnce(newRecord);

    const { result, rerender } = renderHook(
      ({ id }) => useMarketResourceDetail(id),
      { initialProps: { id: "123e4567-e89b-42d3-a456-426614174014" } },
    );
    rerender({ id: newRecord.id });
    await waitFor(() => expect(result.current.record).toBe(newRecord));

    act(() => resolveOld(record("123e4567-e89b-42d3-a456-426614174014")));
    await act(async () => oldPromise);

    expect(result.current.record).toBe(newRecord);
  });
});
