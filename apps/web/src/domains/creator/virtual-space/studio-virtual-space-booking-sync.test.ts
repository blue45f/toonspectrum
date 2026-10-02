import { describe, expect, it } from "vitest";

import {
  acceptBookingsSnapshot,
  acceptGalleryLikes,
  diffBookings,
  diffGalleryLikeToggles,
  diffWaitlist,
} from "./studio-virtual-space-booking-sync";
import type { StudioGalleryStats } from "./studio-virtual-space-gallery";
import type {
  StudioSpaceBooking,
  StudioSpaceWaitlistEntry,
} from "./studio-virtual-space-space-booking";

const SCOPE = '["proj-1","office"]';

function booking(overrides: Partial<StudioSpaceBooking> = {}): StudioSpaceBooking {
  return {
    id: "b1",
    spaceId: "booth",
    spaceName: "녹음부스",
    capacity: 2,
    equipmentTags: ["마이크"],
    startsAt: 1_000,
    endsAt: 2_000,
    bookerNames: ["김작가"],
    note: "",
    status: "confirmed",
    ...overrides,
  };
}

function waitlistEntry(overrides: Partial<StudioSpaceWaitlistEntry> = {}): StudioSpaceWaitlistEntry {
  const { status: _unused, ...base } = booking();
  return { ...base, requestedAt: 500, ...overrides };
}

describe("acceptBookingsSnapshot", () => {
  it("서버 스냅샷을 클라이언트 형태로 거르고 createdByUserId는 버린다", () => {
    const snapshot = acceptBookingsSnapshot(
      {
        scopeKey: SCOPE,
        bookings: [{ ...booking(), createdByUserId: "user-1" }],
        waitlist: [{ ...waitlistEntry(), createdByUserId: "user-2" }],
      },
      SCOPE,
    );
    expect(snapshot?.bookings).toEqual([booking()]);
    expect(snapshot?.waitlist).toEqual([waitlistEntry()]);
  });

  it("범위 키가 다르거나 항목이 깨졌으면 null이다", () => {
    expect(acceptBookingsSnapshot({ scopeKey: "other", bookings: [], waitlist: [] }, SCOPE)).toBeNull();
    expect(
      acceptBookingsSnapshot(
        { scopeKey: SCOPE, bookings: [{ id: "x" }], waitlist: [] },
        SCOPE,
      ),
    ).toBeNull();
    expect(acceptBookingsSnapshot(null, SCOPE)).toBeNull();
  });
});

describe("acceptGalleryLikes", () => {
  it("프레임별 좋아요를 통계 형태로 바꾸고 조회수는 0에서 시작한다", () => {
    const stats = acceptGalleryLikes(
      { scopeKey: SCOPE, frames: { "frame-1": { likes: 2, likedBy: ["u1", "u2"] } } },
      SCOPE,
    );
    expect(stats).toEqual({ "frame-1": { views: 0, likes: 2, likedBy: ["u1", "u2"] } });
  });

  it("형식이 깨졌으면 null이다", () => {
    expect(acceptGalleryLikes({ scopeKey: SCOPE, frames: { f: { likes: "x" } } }, SCOPE)).toBeNull();
  });
});

describe("diffBookings", () => {
  it("새 확정 예약과 취소 전이를 잡는다", () => {
    const prev = [booking()];
    const created = booking({ id: "b2" });
    const next = [booking({ status: "cancelled" }), created];
    expect(diffBookings(prev, next)).toEqual({ created: [created], cancelledIds: ["b1"] });
  });

  it("처음부터 취소 상태로 나타난 예약은 생성으로 치지 않는다", () => {
    expect(diffBookings([], [booking({ status: "cancelled" })])).toEqual({
      created: [],
      cancelledIds: [],
    });
  });
});

describe("diffWaitlist", () => {
  it("추가와 이탈을 잡는다", () => {
    const prev = [waitlistEntry()];
    const joined = waitlistEntry({ id: "w2" });
    expect(diffWaitlist(prev, [joined])).toEqual({ joined: [joined], leftIds: ["b1"] });
  });
});

describe("diffGalleryLikeToggles", () => {
  const base: StudioGalleryStats = { "frame-1": { views: 3, likes: 1, likedBy: ["user-1"] } };

  it("내 멤버십이 바뀐 프레임만 잡는다", () => {
    const unliked: StudioGalleryStats = { "frame-1": { views: 4, likes: 0, likedBy: [] } };
    expect(diffGalleryLikeToggles(base, unliked, "user-1")).toEqual(["frame-1"]);
    const liked: StudioGalleryStats = {
      "frame-1": { views: 3, likes: 1, likedBy: ["user-1"] },
      "frame-2": { views: 0, likes: 1, likedBy: ["user-1"] },
    };
    expect(diffGalleryLikeToggles(base, liked, "user-1")).toEqual(["frame-2"]);
  });

  it("조회수만 바뀌면 토글이 없다", () => {
    const viewed: StudioGalleryStats = { "frame-1": { views: 9, likes: 1, likedBy: ["user-1"] } };
    expect(diffGalleryLikeToggles(base, viewed, "user-1")).toEqual([]);
  });
});
