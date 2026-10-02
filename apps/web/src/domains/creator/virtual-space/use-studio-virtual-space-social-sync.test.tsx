// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { StudioGalleryStats } from "./studio-virtual-space-gallery";
import type { StudioSpaceBooking } from "./studio-virtual-space-space-booking";
import type { StudioVirtualSpaceSocialTransport } from "./studio-virtual-space-booking-sync";
import { useStudioVirtualSpaceSocialSync } from "./use-studio-virtual-space-social-sync";

const SCOPE = '["proj-1","office"]';

function booking(overrides: Partial<StudioSpaceBooking> = {}): StudioSpaceBooking {
  return {
    id: "b1",
    spaceId: "booth",
    spaceName: "녹음부스",
    capacity: 2,
    equipmentTags: [],
    startsAt: 1_000,
    endsAt: 2_000,
    bookerNames: ["김작가"],
    note: "",
    status: "confirmed",
    ...overrides,
  };
}

function snapshotJson(bookings: readonly StudioSpaceBooking[]) {
  return { scopeKey: SCOPE, bookings, waitlist: [] };
}

function fakeTransport(overrides: Partial<StudioVirtualSpaceSocialTransport> = {}) {
  return {
    loadBookings: vi.fn(async () => snapshotJson([])),
    createBooking: vi.fn(async (_scope: string, created: StudioSpaceBooking) =>
      snapshotJson([created]),
    ),
    cancelBooking: vi.fn(async () => snapshotJson([])),
    joinWaitlist: vi.fn(async () => snapshotJson([])),
    leaveWaitlist: vi.fn(async () => snapshotJson([])),
    loadGalleryLikes: vi.fn(async () => ({ scopeKey: SCOPE, frames: {} })),
    toggleGalleryLike: vi.fn(async () => ({ frameId: "frame-1", likes: 1, likedBy: ["user-1"] })),
    ...overrides,
  } satisfies StudioVirtualSpaceSocialTransport;
}

function renderSync(transport: StudioVirtualSpaceSocialTransport, enabled = true) {
  return renderHook(() =>
    useStudioVirtualSpaceSocialSync({
      projectId: "proj-1",
      worldScope: "office",
      userId: "user-1",
      enabled,
      transport,
    }),
  );
}

describe("useStudioVirtualSpaceSocialSync", () => {
  it("비활성(게스트)이면 서버를 전혀 부르지 않고 로컬로만 동작한다", async () => {
    const transport = fakeTransport();
    const { result } = renderSync(transport, false);
    act(() => {
      result.current.setBookings([booking()]);
    });
    expect(result.current.bookings).toEqual([booking()]);
    expect(transport.loadBookings).not.toHaveBeenCalled();
    expect(transport.createBooking).not.toHaveBeenCalled();
  });

  it("활성이면 서버 스냅샷과 좋아요를 읽어 상태를 채운다", async () => {
    const transport = fakeTransport({
      loadBookings: vi.fn(async () => snapshotJson([booking()])),
      loadGalleryLikes: vi.fn(async () => ({
        scopeKey: SCOPE,
        frames: { "frame-1": { likes: 2, likedBy: ["user-1", "user-2"] } },
      })),
    });
    const { result } = renderSync(transport);
    await waitFor(() => expect(result.current.bookings).toHaveLength(1));
    expect(result.current.galleryStats["frame-1"]).toEqual({
      views: 0,
      likes: 2,
      likedBy: ["user-1", "user-2"],
    });
  });

  it("새 예약을 만들면 서버 생성을 호출하고 응답 스냅샷으로 맞춘다", async () => {
    const transport = fakeTransport();
    const { result } = renderSync(transport);
    await waitFor(() => expect(transport.loadBookings).toHaveBeenCalled());

    act(() => {
      result.current.setBookings([booking()]);
    });
    await waitFor(() => expect(transport.createBooking).toHaveBeenCalledTimes(1));
    expect(transport.createBooking).toHaveBeenCalledWith(SCOPE, booking());
    await waitFor(() => expect(result.current.bookings).toEqual([booking()]));
  });

  it("생성이 실패하면 스냅샷을 다시 읽고, 재읽기도 실패하면 세션 모드로 강등한다", async () => {
    const transport = fakeTransport({
      createBooking: vi.fn(async () => {
        throw new Error("409");
      }),
      loadBookings: vi
        .fn()
        .mockResolvedValueOnce(snapshotJson([]))
        .mockRejectedValue(new Error("down")),
    });
    const { result } = renderSync(transport);
    await waitFor(() => expect(transport.loadBookings).toHaveBeenCalledTimes(1));

    act(() => {
      result.current.setBookings([booking()]);
    });
    await waitFor(() => expect(transport.loadBookings).toHaveBeenCalledTimes(2));
    // 강등 후에는 로컬 변경이 더 이상 서버 호출을 만들지 않는다.
    act(() => {
      result.current.setBookings([booking(), booking({ id: "b2" })]);
    });
    expect(transport.createBooking).toHaveBeenCalledTimes(1);
    expect(result.current.bookings).toHaveLength(2);
  });

  it("좋아요 토글은 서버 토글을 호출하고 조회수는 보존한다", async () => {
    const transport = fakeTransport();
    const { result } = renderSync(transport);
    await waitFor(() => expect(transport.loadBookings).toHaveBeenCalled());

    const withView: StudioGalleryStats = {
      "frame-1": { views: 5, likes: 0, likedBy: [] },
    };
    act(() => {
      result.current.setGalleryStats(withView);
    });
    expect(transport.toggleGalleryLike).not.toHaveBeenCalled();

    act(() => {
      result.current.setGalleryStats({
        "frame-1": { views: 5, likes: 1, likedBy: ["user-1"] },
      });
    });
    await waitFor(() => expect(transport.toggleGalleryLike).toHaveBeenCalledWith(SCOPE, "frame-1"));
    await waitFor(() =>
      expect(result.current.galleryStats["frame-1"]).toEqual({
        views: 5,
        likes: 1,
        likedBy: ["user-1"],
      }),
    );
  });
});
