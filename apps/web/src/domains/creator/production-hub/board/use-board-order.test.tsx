// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { writeStoredBoardOrder, type ProductionBoardOrder } from "./board-order";
import {
  BOARD_ORDER_SYNC_DELAY_MS,
  useProductionBoardOrder,
  type ProductionBoardOrderSyncOptions,
} from "./use-board-order";

const PROJECT_ID = "project-hook-test";
const storageKey = `toonstudio.production.board-order.v1:${PROJECT_ID}`;

function syncOptions(overrides: Partial<ProductionBoardOrderSyncOptions> = {}): ProductionBoardOrderSyncOptions {
  return {
    serverOrder: null,
    canSync: true,
    sync: vi.fn(),
    ...overrides,
  };
}

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe("useProductionBoardOrder 서버 정본 동기화", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it("서버 순서가 있으면 첫 렌더부터 서버 순서를 쓰고 로컬 캐시도 맞춘다", () => {
    writeStoredBoardOrder(PROJECT_ID, { queue: ["local-only"] });
    const serverOrder: ProductionBoardOrder = { queue: ["srv-a", "srv-b"] };
    const { result } = renderHook(() =>
      useProductionBoardOrder(PROJECT_ID, true, syncOptions({ serverOrder })));
    expect(result.current[0]).toEqual(serverOrder);
    advance(0);
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "{}")).toEqual(serverOrder);
  });

  it("서버가 비고 로컬에만 순서가 있으면 마운트 후 1회 이전(업로드)한다", () => {
    const localOrder: ProductionBoardOrder = { queue: ["a", "b"] };
    writeStoredBoardOrder(PROJECT_ID, localOrder);
    const sync = vi.fn();
    const { result } = renderHook(() =>
      useProductionBoardOrder(PROJECT_ID, true, syncOptions({ sync })));
    expect(result.current[0]).toEqual(localOrder);
    expect(sync).not.toHaveBeenCalled();
    advance(BOARD_ORDER_SYNC_DELAY_MS);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith(localOrder);
    // 로컬 저장값은 이전 후에도 폴백으로 남는다 (삭제하지 않는다).
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "{}")).toEqual(localOrder);
  });

  it("순서를 바꾸면 캐시에 즉시 쓰고 서버로는 디바운스해 마지막 값만 보낸다", () => {
    const sync = vi.fn();
    const { result } = renderHook(() =>
      useProductionBoardOrder(PROJECT_ID, true, syncOptions({ serverOrder: {}, sync })));
    act(() => result.current[1]({ queue: ["x"] }));
    act(() => result.current[1]({ queue: ["x", "y"] }));
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "{}")).toEqual({ queue: ["x", "y"] });
    advance(BOARD_ORDER_SYNC_DELAY_MS - 1);
    expect(sync).not.toHaveBeenCalled();
    advance(1);
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith({ queue: ["x", "y"] });
  });

  it("내 업로드가 서버에 반영되면 미동기 상태가 풀리고, 이후 팀원 변경을 채택한다", () => {
    const sync = vi.fn();
    const mine: ProductionBoardOrder = { queue: ["mine"] };
    const { result, rerender } = renderHook(
      ({ serverOrder }: { serverOrder: ProductionBoardOrder | null }) =>
        useProductionBoardOrder(PROJECT_ID, true, syncOptions({ serverOrder, sync })),
      { initialProps: { serverOrder: {} as ProductionBoardOrder | null } },
    );
    act(() => result.current[1](mine));
    advance(BOARD_ORDER_SYNC_DELAY_MS);
    expect(sync).toHaveBeenCalledWith(mine);
    // 서버 에코: 내 순서가 aggregate에 실려 돌아온다.
    rerender({ serverOrder: mine });
    advance(BOARD_ORDER_SYNC_DELAY_MS * 2);
    expect(sync).toHaveBeenCalledTimes(1);
    // 팀원이 바꾼 순서는 그대로 채택된다.
    const teammate: ProductionBoardOrder = { queue: ["teammate"] };
    rerender({ serverOrder: teammate });
    expect(result.current[0]).toEqual(teammate);
  });

  it("동기화할 수 없으면(canSync=false) 로컬 전용으로 동작한다", () => {
    const sync = vi.fn();
    const { result } = renderHook(() =>
      useProductionBoardOrder(PROJECT_ID, true, syncOptions({ canSync: false, sync })));
    act(() => result.current[1]({ queue: ["solo"] }));
    advance(BOARD_ORDER_SYNC_DELAY_MS * 3);
    expect(sync).not.toHaveBeenCalled();
    expect(result.current[0]).toEqual({ queue: ["solo"] });
    expect(JSON.parse(localStorage.getItem(storageKey) ?? "{}")).toEqual({ queue: ["solo"] });
  });

  it("샘플(persist=false)은 서버와 통신하지 않고 탭 안에서만 유지한다", () => {
    const sync = vi.fn();
    const { result } = renderHook(() =>
      useProductionBoardOrder("sample-project-hook", false, syncOptions({ sync })));
    act(() => result.current[1]({ queue: ["demo"] }));
    advance(BOARD_ORDER_SYNC_DELAY_MS * 3);
    expect(sync).not.toHaveBeenCalled();
    expect(localStorage.getItem("toonstudio.production.board-order.v1:sample-project-hook")).toBeNull();
    expect(result.current[0]).toEqual({ queue: ["demo"] });
  });

  it("언마운트 직전 대기 중인 동기화를 마저 보낸다", () => {
    const sync = vi.fn();
    const { result, unmount } = renderHook(() =>
      useProductionBoardOrder(PROJECT_ID, true, syncOptions({ serverOrder: {}, sync })));
    act(() => result.current[1]({ queue: ["last"] }));
    unmount();
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith({ queue: ["last"] });
  });
});
