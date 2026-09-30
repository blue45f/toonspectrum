import { describe, expect, it } from "vitest";
import {
  STUDIO_BOOKING_MAX_NOTE_LENGTH,
  STUDIO_BOOKING_MAX_RECURRENCE,
  addBoothBooking,
  addBoothWaitlistEntry,
  bookingsForDay,
  buildDaySchedule,
  cancelBoothBooking,
  checkBoothBookingAt,
  createBoothBooking,
  expandRecurringBooking,
  formatKstDate,
  formatKstTime,
  isBoothBookingConflict,
  kstDayStartMs,
  kstWallToEpochMs,
  kstWeekdayIndex,
  promoteBoothWaitlist,
  type StudioBoothBooking,
  type StudioBoothBookingInput,
  type StudioBoothWaitlistEntry,
  type StudioVirtualBooth,
} from "./studio-virtual-space-booking";

// 2026-09-30 10:00 KST = 2026-09-30 01:00 UTC
const NOW = Date.UTC(2026, 8, 30, 1, 0, 0);

const input = (overrides: Partial<StudioBoothBookingInput> = {}): StudioBoothBookingInput => ({
  boothId: "story-room-1",
  boothName: "콘티룸 1",
  capacity: 4,
  startsAt: Date.UTC(2026, 8, 30, 2, 0, 0), // 11:00 KST
  endsAt: Date.UTC(2026, 8, 30, 3, 0, 0), // 12:00 KST
  bookerName: "김툰",
  note: "콘티 회의",
  ...overrides,
});

const created = (overrides: Partial<StudioBoothBookingInput> = {}, id = "b1", nowMs = NOW): StudioBoothBooking => {
  const result = createBoothBooking(input(overrides), nowMs, id);
  if (!result.ok) throw new Error(`fixture creation failed: ${result.reason.code}`);
  return result.booking;
};

const booths: readonly StudioVirtualBooth[] = [
  { id: "story-room-1", name: "콘티룸 1", capacity: 4 },
  { id: "record-booth-1", name: "녹음부스 1", capacity: 2 },
];

describe("createBoothBooking 입력 살균·검증", () => {
  it("정상 입력을 확정 예약으로 만들고 문자열을 다듬는다", () => {
    const result = createBoothBooking(input({ bookerName: "  김툰  ", note: "  콘티  " }), NOW, "b1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.booking.bookerName).toBe("김툰");
    expect(result.booking.note).toBe("콘티");
    expect(result.booking.status).toBe("confirmed");
  });
  it("과거 시작 시각을 거부한다", () => {
    const result = createBoothBooking(input({ startsAt: NOW - 1000 }), NOW, "b1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("past-start");
  });
  it("종료<=시작을 거부한다", () => {
    const result = createBoothBooking(input({ endsAt: Date.UTC(2026, 8, 30, 2, 0, 0) }), NOW, "b1");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("invalid-range");
  });
  it.each([["missing-booth", { boothId: "  " }], ["missing-booth", { boothName: "" }], ["missing-booker", { bookerName: "   " }]] as const)(
    "%s 사유로 빈 값을 거부한다",
    (code, overrides) => {
      const result = createBoothBooking(input(overrides), NOW, "b1");
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.reason.code).toBe(code);
    },
  );
  it("수용 인원이 0 이하·정수가 아니면 거부한다", () => {
    for (const capacity of [0, -1, 1.5, Number.NaN]) {
      const result = createBoothBooking(input({ capacity }), NOW, "b1");
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.reason.code).toBe("invalid-capacity");
    }
  });
  it("메모가 상한을 초과하면 잘라낸다", () => {
    const result = createBoothBooking(input({ note: "x".repeat(STUDIO_BOOKING_MAX_NOTE_LENGTH + 50) }), NOW, "b1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.booking.note).toHaveLength(STUDIO_BOOKING_MAX_NOTE_LENGTH);
  });
});

describe("isBoothBookingConflict 겹침 판정", () => {
  const booking = created();
  it("겹치는 시간대는 충돌이다", () => {
    expect(isBoothBookingConflict(booking, { boothId: "story-room-1", startsAt: booking.startsAt + 30 * 60_000, endsAt: booking.endsAt + 60 * 60_000 })).toBe(true);
    expect(isBoothBookingConflict(booking, { boothId: "story-room-1", startsAt: booking.startsAt - 60 * 60_000, endsAt: booking.startsAt + 1 })).toBe(true);
    expect(isBoothBookingConflict(booking, { boothId: "story-room-1", startsAt: booking.startsAt, endsAt: booking.endsAt })).toBe(true);
  });
  it("경계 접촉과 다른 부스는 충돌이 아니다", () => {
    expect(isBoothBookingConflict(booking, { boothId: "story-room-1", startsAt: booking.endsAt, endsAt: booking.endsAt + 60 * 60_000 })).toBe(false);
    expect(isBoothBookingConflict(booking, { boothId: "story-room-1", startsAt: booking.startsAt - 60 * 60_000, endsAt: booking.startsAt })).toBe(false);
    expect(isBoothBookingConflict(booking, { boothId: "record-booth-1", startsAt: booking.startsAt, endsAt: booking.endsAt })).toBe(false);
  });
  it("취소된 예약은 겹침 판정에서 제외된다", () => {
    const cancelled: StudioBoothBooking = { ...booking, status: "cancelled" };
    expect(isBoothBookingConflict(cancelled, { boothId: "story-room-1", startsAt: booking.startsAt, endsAt: booking.endsAt })).toBe(false);
  });
});

describe("addBoothBooking / cancelBoothBooking", () => {
  it("충돌 시 거부 사유와 겹치는 id를 반환하고 목록을 유지한다", () => {
    const existing = created({}, "b1");
    const incoming = created({ bookerName: "이툰" }, "b2");
    const result = addBoothBooking([existing], incoming);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("conflict");
    expect(result.reason.conflictingIds).toEqual(["b1"]);
    expect(result.bookings).toEqual([existing]);
  });
  it("겹치지 않으면 목록에 추가한다", () => {
    const existing = created({}, "b1");
    const incoming = created({ startsAt: Date.UTC(2026, 8, 30, 4, 0, 0), endsAt: Date.UTC(2026, 8, 30, 5, 0, 0) }, "b2");
    const result = addBoothBooking([existing], incoming);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bookings.map((entry) => entry.id)).toEqual(["b1", "b2"]);
  });
  it("중복 id를 거부한다", () => {
    const existing = created({}, "b1");
    const result = addBoothBooking([existing], created({ bookerName: "이툰" }, "b1"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("duplicate-id");
  });
  it("취소 후 같은 시간대에 새 예약을 받을 수 있다", () => {
    const cancelled = cancelBoothBooking([created({}, "b1")], "b1");
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    const result = addBoothBooking(cancelled.bookings, created({ bookerName: "이툰" }, "b2"));
    expect(result.ok).toBe(true);
  });
  it("없는 예약·이미 취소된 예약의 취소를 거부한다", () => {
    const missing = cancelBoothBooking([], "nope");
    expect(missing.ok).toBe(false);
    if (missing.ok) return;
    expect(missing.reason.code).toBe("not-found");
    const first = cancelBoothBooking([created({}, "b1")], "b1");
    if (!first.ok) throw new Error("fixture cancel failed");
    const again = cancelBoothBooking(first.bookings, "b1");
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.reason.code).toBe("already-cancelled");
  });
});

describe("bookingsForDay", () => {
  it("KST 하루 범위의 확정 예약만 시작 시각 순으로 반환한다", () => {
    const dayStart = kstDayStartMs(Date.UTC(2026, 8, 30, 1, 0, 0));
    const late = created({ startsAt: Date.UTC(2026, 8, 30, 5, 0, 0), endsAt: Date.UTC(2026, 8, 30, 6, 0, 0) }, "b2");
    const early = created({ startsAt: Date.UTC(2026, 8, 30, 2, 0, 0), endsAt: Date.UTC(2026, 8, 30, 3, 0, 0) }, "b1");
    const nextDay = created({ startsAt: Date.UTC(2026, 9, 1, 2, 0, 0), endsAt: Date.UTC(2026, 9, 1, 3, 0, 0) }, "b3");
    const cancelled = cancelBoothBooking([created({ startsAt: Date.UTC(2026, 8, 30, 7, 0, 0), endsAt: Date.UTC(2026, 8, 30, 8, 0, 0) }, "b4")], "b4");
    if (!cancelled.ok) throw new Error("fixture cancel failed");
    const result = bookingsForDay([late, early, nextDay, ...cancelled.bookings], dayStart);
    expect(result.map((entry) => entry.id)).toEqual(["b1", "b2"]);
  });
});

describe("expandRecurringBooking 반복 전개", () => {
  it("일간·주간 반복을 전개한다", () => {
    const daily = expandRecurringBooking(input(), { frequency: "daily", occurrences: 3 }, { nowMs: NOW, newId: (index) => `d${index}` });
    expect(daily.truncated).toBe(false);
    expect(daily.skipped).toEqual([]);
    expect(daily.bookings.map((entry) => entry.id)).toEqual(["d0", "d1", "d2"]);
    expect(daily.bookings[1]?.startsAt).toBe(daily.bookings[0]!.startsAt + 24 * 60 * 60_000);
    const weekly = expandRecurringBooking(input(), { frequency: "weekly", occurrences: 2 }, { nowMs: NOW, newId: (index) => `w${index}` });
    expect(weekly.bookings[1]?.startsAt).toBe(weekly.bookings[0]!.startsAt + 7 * 24 * 60 * 60_000);
  });
  it("최대 전개 수를 초과하면 잘리고 truncated=true다", () => {
    const result = expandRecurringBooking(input(), { frequency: "daily", occurrences: STUDIO_BOOKING_MAX_RECURRENCE + 10 }, { nowMs: NOW, newId: (index) => `r${index}` });
    expect(result.bookings).toHaveLength(STUDIO_BOOKING_MAX_RECURRENCE);
    expect(result.truncated).toBe(true);
  });
  it("모두 과거로 떨어지는 회차는 건너뛴다", () => {
    const start = input();
    const result = expandRecurringBooking(start, { frequency: "daily", occurrences: 2 },
      { nowMs: start.startsAt + 2 * 24 * 60 * 60_000 + 1, newId: (index) => `p${index}` });
    expect(result.bookings).toHaveLength(0);
    expect(result.skipped.map((entry) => entry.index)).toEqual([0, 1]);
    expect(result.skipped[0]?.reason.code).toBe("past-start");
  });
});

describe("대기열 FIFO", () => {
  const candidate = (bookerName: string, startsAt: number): StudioBoothBookingInput =>
    input({ bookerName, startsAt, endsAt: startsAt + 60 * 60_000 });
  const base = Date.UTC(2026, 8, 30, 2, 0, 0);
  it("대기열에 추가하고 요청 시각 순으로 승격한다", () => {
    const blocker = created({}, "blocker");
    let waitlist: readonly StudioBoothWaitlistEntry[] = [];
    const first = addBoothWaitlistEntry(waitlist, candidate("첫번째", base), { nowMs: NOW + 1, id: "w1" });
    const second = addBoothWaitlistEntry(first.ok ? first.waitlist : [], candidate("두번째", base), { nowMs: NOW + 2, id: "w2" });
    if (!first.ok || !second.ok) throw new Error("fixture waitlist failed");
    waitlist = second.waitlist;
    // 슬롯이 막혀 있으면 승격 불가
    const blocked = promoteBoothWaitlist(waitlist, [blocker], "story-room-1");
    expect(blocked.promoted).toBeNull();
    expect(blocked.waitlist).toHaveLength(2);
    // 차단 예약 취소 후 첫 번째 대기자 승격
    const cancelled = cancelBoothBooking([blocker], "blocker");
    if (!cancelled.ok) throw new Error("fixture cancel failed");
    const promoted = promoteBoothWaitlist(waitlist, cancelled.bookings, "story-room-1");
    expect(promoted.promoted?.id).toBe("w1");
    expect(promoted.promoted?.bookerName).toBe("첫번째");
    expect(promoted.promoted?.status).toBe("confirmed");
    expect(promoted.waitlist.map((entry) => entry.id)).toEqual(["w2"]);
  });
  it("다른 부스 대기열은 승격 대상이 아니다", () => {
    const added = addBoothWaitlistEntry([], candidate("다른부스", base), { nowMs: NOW + 1, id: "w9" });
    if (!added.ok) throw new Error("fixture waitlist failed");
    const result = promoteBoothWaitlist(added.waitlist, [], "record-booth-1");
    expect(result.promoted).toBeNull();
  });
  it("과거 시간의 대기열 등록을 거부한다", () => {
    const result = addBoothWaitlistEntry([], candidate("과거", NOW - 60_000), { nowMs: NOW, id: "w0" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason.code).toBe("past-start");
  });
});

describe("checkBoothBookingAt 입장 예약 확인", () => {
  it("해당 시각에 유효한 확정 예약을 반환한다", () => {
    const booking = created({}, "b1");
    expect(checkBoothBookingAt([booking], "story-room-1", booking.startsAt)?.id).toBe("b1");
    expect(checkBoothBookingAt([booking], "story-room-1", booking.startsAt + 1000)?.id).toBe("b1");
    expect(checkBoothBookingAt([booking], "story-room-1", booking.endsAt)?.id).toBeUndefined();
    expect(checkBoothBookingAt([booking], "story-room-1", booking.startsAt - 1)?.id).toBeUndefined();
    expect(checkBoothBookingAt([booking], "record-booth-1", booking.startsAt)?.id).toBeUndefined();
    const cancelled: StudioBoothBooking = { ...booking, status: "cancelled" };
    expect(checkBoothBookingAt([cancelled], "story-room-1", booking.startsAt)).toBeNull();
  });
});

describe("buildDaySchedule 하루 조감", () => {
  const dayStart = kstDayStartMs(Date.UTC(2026, 8, 30, 1, 0, 0));
  const at = (utcHour: number): number => Date.UTC(2026, 8, 30, utcHour, 0, 0);
  it("부스 순서대로 블록을 만들고 진행 상태를 계산한다", () => {
    // fixture 검증(createBoothBooking)은 하루 스케줄의 nowMs(at(2))보다 이른 시각으로 수행한다.
    const fixtureNow = at(0) - 60_000;
    const bookings = [
      created({ boothId: "record-booth-1", boothName: "녹음부스 1", startsAt: at(2), endsAt: at(3) }, "r1", fixtureNow),
      created({ startsAt: at(0), endsAt: at(1), bookerName: "종료됨" }, "past", fixtureNow),
      created({ startsAt: at(1), endsAt: at(4), bookerName: "진행중" }, "live", fixtureNow),
      created({ startsAt: at(5), endsAt: at(6), bookerName: "예정" }, "future", fixtureNow),
    ];
    const schedule = buildDaySchedule(bookings, booths, dayStart, at(2));
    expect(schedule.map((block) => block.bookingId)).toEqual(["past", "live", "future", "r1"]);
    const statusOf = (id: string): string | undefined => schedule.find((block) => block.bookingId === id)?.status;
    expect(statusOf("past")).toBe("past");
    expect(statusOf("live")).toBe("live");
    expect(statusOf("future")).toBe("upcoming");
    expect(schedule.find((block) => block.bookingId === "live")?.boothName).toBe("콘티룸 1");
  });
  it("취소된 예약은 조감에 포함하지 않는다", () => {
    const cancelled = cancelBoothBooking([created({}, "b1")], "b1");
    if (!cancelled.ok) throw new Error("fixture cancel failed");
    expect(buildDaySchedule(cancelled.bookings, booths, dayStart, NOW)).toEqual([]);
  });
});

describe("KST 날짜 유틸", () => {
  it("KST 자정을 구한다", () => {
    // 2026-09-30 01:00 UTC = 10:00 KST → 자정은 2026-09-29 15:00 UTC
    expect(kstDayStartMs(Date.UTC(2026, 8, 30, 1, 0, 0))).toBe(Date.UTC(2026, 8, 29, 15, 0, 0));
  });
  it("벽시계를 epoch ms로 바꾼다", () => {
    expect(kstWallToEpochMs("2026-09-30", "11:00")).toBe(Date.UTC(2026, 8, 30, 2, 0, 0));
    expect(kstWallToEpochMs("2026-13-01", "11:00")).toBeNull();
    expect(kstWallToEpochMs("2026-09-30", "25:00")).toBeNull();
    expect(kstWallToEpochMs("2026-02-30", "11:00")).toBeNull();
  });
  it("KST 기준 시간을 표기한다", () => {
    expect(formatKstTime(Date.UTC(2026, 8, 30, 2, 0, 0))).toBe("11:00");
    expect(formatKstDate(Date.UTC(2026, 8, 30, 2, 0, 0))).toBe("2026-09-30");
    // 2026-09-30은 수요일
    expect(kstWeekdayIndex(Date.UTC(2026, 8, 30, 2, 0, 0))).toBe(3);
  });
});
