// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { useMarketWishlist } from "./use-market-wishlist";
import { CREATOR_MARKETPLACE_STARTER_RECORDS } from "@/shared/lib/creator-marketplace-starter-catalog";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

it("저장에 실패하면 찜 성공 상태를 만들지 않고 재시도로 복구한다", () => {
  const record = CREATOR_MARKETPLACE_STARTER_RECORDS[0];
  if (!record) throw new Error("소재 fixture가 필요합니다");
  const { result } = renderHook(() => useMarketWishlist());
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  act(() => { expect(result.current.toggleWishlist(record)).toBe(false); });
  expect(result.current.isWishlisted(record.id)).toBe(false);
  expect(result.current.wishlistCount).toBe(0);
  expect(result.current.storageError).toContain("저장하지 못했어요");
  write.mockRestore();
  act(() => { expect(result.current.toggleWishlist(record)).toBe(true); });
  expect(result.current.wishlistCount).toBe(1);
  expect(result.current.storageError).toBeNull();
});
