import { describe, expect, it } from "vitest";

import {
  addSpaceBooking,
  addSpaceWaitlistEntry,
  cancelSpaceBooking,
  checkSpaceBookingAt,
  createSpaceBooking,
  expandSpaceRecurringBooking,
  isSpaceBookingConflict,
  parseSpaceBookerRoster,
  promoteSpaceWaitlist,
  spaceBookingsForDay,
  type StudioSpaceBooking,
  type StudioSpaceBookingInput,
} from "./studio-virtual-space-space-booking";

const NOW = Date.UTC(2026, 8, 30, 0, 0, 0); // 2026-09-30 09:00 KST
const HOUR = 3_600_000;

function input(overrides: Partial<StudioSpaceBookingInput> = {}): StudioSpaceBookingInput {
  return {
    spaceId: "conti-room",
    spaceName: "콘티룸",
    capacity: 4,
    equipmentTags: ["4K 모니터", "타블렛"],
    startsAt: NOW + HOUR,
    endsAt: NOW + 2 * HOUR,
    bookerNames: ["김작가", "이작가"],
    note: "신작 콘티 리뷰",
    ...overrides,
  };
}

function booked(id: string, overrides: Partial<StudioSpaceBookingInput> = {}): StudioSpaceBooking {
  const created = createSpaceBooking(input(overrides), NOW, id);
  if (!created.ok) throw new Error(`fixture failed: ${created.reason.code}`);
  return created.booking;
}

describe("createSpaceBooking", () => {
  it("유효한 입력으로 예약을 만든다", () => {
    const result = createSpaceBooking(input(), NOW, "bk-1");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.booking.id).toBe("bk-1");
      expect(result.booking.status).toBe("confirmed");
      expect(result.booking.bookerNames).toEqual(["김작가", "이작가"]);
    }
  });

  it("빈 id·스페이스·예약자를 거부한다", () => {
    expect(createSpaceBooking(input(), NOW, "  ")).toMatchObject({ ok: false });
    expect(createSpaceBooking(input({ spaceId: " " }), NOW, "bk-1")).toMatchObject({
      ok: false,
      reason: { code: "missing-space", conflictingIds: [] },
    });
    expect(createSpaceBooking(input({ bookerNames: ["  "] }), NOW, "bk-1")).toMatchObject({
      ok: false,
      reason: { code: "missing-booker", conflictingIds: [] },
    });
  });

  it("수용 인원 검증: 비정상 값과 초과를 거부한다", () => {
    expect(createSpaceBooking(input({ capacity: 0 }), NOW, "bk-1")).toMatchObject({
      ok: false,
      reason: { code: "invalid-capacity", conflictingIds: [] },
    });
    expect(createSpaceBooking(input({ capacity: 1 }), NOW, "bk-1")).toMatchObject({
      ok: false,
      reason: { code: "over-capacity", conflictingIds: [] },
    });
  });

  it("과거 시작과 종료<=시작을 거부한다", () => {
    expect(createSpaceBooking(input({ startsAt: NOW - HOUR }), NOW, "bk-1")).toMatchObject({
      ok: false,
      reason: { code: "past-start", conflictingIds: [] },
    });
    expect(
      createSpaceBooking(input({ startsAt: NOW + 2 * HOUR, endsAt: NOW + HOUR }), NOW, "bk-1"),
    ).toMatchObject({ ok: false, reason: { code: "invalid-range", conflictingIds: [] } });
  });

  it("예약자 명단과 장비 태그를 살균한다", () => {
    const result = createSpaceBooking(
      input({ bookerNames: [" 김작가 ", "김작가", ""], equipmentTags: [" 4K ", "4K", "x".repeat(99)] }),
      NOW,
      "bk-1",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.booking.bookerNames).toEqual(["김작가"]);
      expect(result.booking.equipmentTags).toEqual(["4K", "x".repeat(30)]);
    }
  });
});

describe("parseSpaceBookerRoster", () => {
  it("쉼표·세미콜론·줄바꿈을 구분자로 살균한다", () => {
    expect(parseSpaceBookerRoster("김작가, 이작가;박작가\n김작가")).toEqual(["김작가", "이작가", "박작가"]);
    expect(parseSpaceBookerRoster("   ")).toEqual([]);
  });
});

describe("isSpaceBookingConflict", () => {
  const existing = booked("bk-1");

  it("겹치는 시간대를 감지한다", () => {
    expect(isSpaceBookingConflict(existing, { spaceId: "conti-room", startsAt: NOW + 90 * 60_000, endsAt: NOW + 3 * HOUR })).toBe(true);
  });

  it("경계 접촉(종료==시작)은 겹침이 아니다", () => {
    expect(isSpaceBookingConflict(existing, { spaceId: "conti-room", startsAt: NOW + 2 * HOUR, endsAt: NOW + 3 * HOUR })).toBe(false);
  });

  it("다른 스페이스·취소된 예약은 겹치지 않는다", () => {
    expect(isSpaceBookingConflict(existing, { spaceId: "rec-booth", startsAt: NOW + 90 * 60_000, endsAt: NOW + 3 * HOUR })).toBe(false);
    expect(isSpaceBookingConflict({ ...existing, status: "cancelled" }, { spaceId: "conti-room", startsAt: NOW + 90 * 60_000, endsAt: NOW + 3 * HOUR })).toBe(false);
  });
});

describe("addSpaceBooking / cancelSpaceBooking", () => {
  it("중복 id와 충돌을 거부한다", () => {
    const first = booked("bk-1");
    const duplicate = addSpaceBooking([first], first);
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) expect(duplicate.reason.code).toBe("duplicate-id");
    const conflict = addSpaceBooking([first], booked("bk-2", { startsAt: NOW + 90 * 60_000, endsAt: NOW + 3 * HOUR }));
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(conflict.reason.code).toBe("conflict");
      expect(conflict.reason.conflictingIds).toEqual(["bk-1"]);
    }
  });

  it("취소 후 같은 시간대에 다시 예약할 수 있다", () => {
    const first = booked("bk-1");
    const cancelled = cancelSpaceBooking([first], "bk-1");
    expect(cancelled.ok).toBe(true);
    if (cancelled.ok) {
      const retry = addSpaceBooking(cancelled.bookings, booked("bk-2", { startsAt: NOW + 90 * 60_000, endsAt: NOW + 3 * HOUR }));
      expect(retry.ok).toBe(true);
    }
  });

  it("없는 예약 취소와 중복 취소를 거부한다", () => {
    expect(cancelSpaceBooking([], "nope")).toMatchObject({ ok: false, reason: { code: "not-found", conflictingIds: [] } });
    const first = booked("bk-1");
    const once = cancelSpaceBooking([first], "bk-1");
    if (once.ok) {
      expect(cancelSpaceBooking(once.bookings, "bk-1")).toMatchObject({
        ok: false,
        reason: { code: "already-cancelled", conflictingIds: [] },
      });
    }
  });
});

describe("spaceBookingsForDay", () => {
  it("KST 하루와 겹치는 확정 예약을 시작 순으로 반환한다", () => {
    const dayStart = NOW - (NOW % (24 * 3_600_000));
    const a = booked("bk-a", { startsAt: dayStart + 3 * HOUR, endsAt: dayStart + 4 * HOUR });
    const b = booked("bk-b", { startsAt: dayStart + HOUR, endsAt: dayStart + 2 * HOUR });
    const other = booked("bk-c", { startsAt: dayStart + 30 * HOUR, endsAt: dayStart + 31 * HOUR });
    const result = spaceBookingsForDay([a, b, other], dayStart);
    expect(result.map((entry) => entry.id)).toEqual(["bk-b", "bk-a"]);
  });
});

describe("expandSpaceRecurringBooking", () => {
  it("일간·주간 반복을 전개한다", () => {
    const daily = expandSpaceRecurringBooking(input(), { frequency: "daily", occurrences: 3 }, { nowMs: NOW, newId: (i) => `d-${i}` });
    expect(daily.bookings).toHaveLength(3);
    expect(daily.bookings[1]?.startsAt).toBe(NOW + HOUR + 24 * HOUR);
    const weekly = expandSpaceRecurringBooking(input(), { frequency: "weekly", occurrences: 2, interval: 2 }, { nowMs: NOW, newId: (i) => `w-${i}` });
    expect(weekly.bookings[1]?.startsAt).toBe(NOW + HOUR + 14 * 24 * HOUR);
  });

  it("상한을 초과하면 자르고 과거 회차는 건너뛴다", () => {
    const big = expandSpaceRecurringBooking(input(), { frequency: "daily", occurrences: 9999 }, { nowMs: NOW, newId: (i) => `x-${i}` });
    expect(big.truncated).toBe(true);
    const past = expandSpaceRecurringBooking(
      input({ startsAt: NOW - 2 * 24 * HOUR, endsAt: NOW - 2 * 24 * HOUR + HOUR }),
      { frequency: "daily", occurrences: 3 },
      { nowMs: NOW, newId: (i) => `p-${i}` },
    );
    expect(past.bookings).toHaveLength(1);
    expect(past.skipped).toHaveLength(2);
  });
});

describe("space waitlist", () => {
  it("대기열에 올리고 취소 후 FIFO로 승격한다", () => {
    const first = booked("bk-1");
    const queued = addSpaceWaitlistEntry([], input({ startsAt: NOW + 90 * 60_000, endsAt: NOW + 3 * HOUR }), { nowMs: NOW, id: "wl-1" });
    expect(queued.ok).toBe(true);
    if (!queued.ok) return;
    const promoted = promoteSpaceWaitlist(queued.waitlist, [first], "conti-room");
    expect(promoted.promoted).toBeNull(); // 아직 겹치므로 승격 불가
    const cancelled = cancelSpaceBooking([first], "bk-1");
    if (!cancelled.ok) return;
    const promotedAfter = promoteSpaceWaitlist(queued.waitlist, cancelled.bookings, "conti-room");
    expect(promotedAfter.promoted?.id).toBe("wl-1");
    expect(promotedAfter.waitlist).toHaveLength(0);
  });
});

describe("checkSpaceBookingAt", () => {
  it("해당 시각에 유효한 예약을 반환한다", () => {
    const booking = booked("bk-1");
    expect(checkSpaceBookingAt([booking], "conti-room", NOW + 90 * 60_000)?.id).toBe("bk-1");
    expect(checkSpaceBookingAt([booking], "conti-room", NOW + 3 * HOUR)).toBeNull();
    expect(checkSpaceBookingAt([booking], "rec-booth", NOW + 90 * 60_000)).toBeNull();
  });
});
