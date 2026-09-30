/**
 * 콘티룸·녹음부스 시간제 예약 상태 머신 (D-4).
 *
 * 서버 없이 동작하는 순수 함수 집합. 모든 시각은 epoch ms, 날짜 표기는 KST(Asia/Seoul) 기준.
 * 부스/룸 단위 예약만 다루며, 스페이스 전체 예약(E-5)은 후속 티켓에서 다룬다.
 */

export const STUDIO_BOOKING_TIMEZONE = "Asia/Seoul";
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** 반복 예약 전개 상한. 과도한 생성을 막는다. */
export const STUDIO_BOOKING_MAX_RECURRENCE = 52;

/** 예약 메모 최대 길이(입력 살균). */
export const STUDIO_BOOKING_MAX_NOTE_LENGTH = 200;

export interface StudioVirtualBooth {
  readonly id: string;
  readonly name: string;
  readonly capacity: number;
}

export interface StudioBoothBookingInput {
  readonly boothId: string;
  readonly boothName: string;
  readonly capacity: number;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly bookerName: string;
  readonly note?: string | null;
}

export interface StudioBoothBooking {
  readonly id: string;
  readonly boothId: string;
  readonly boothName: string;
  readonly capacity: number;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly bookerName: string;
  readonly note: string;
  readonly status: "confirmed" | "cancelled";
}

export type StudioBoothBookingRejectionCode =
  | "missing-id"
  | "missing-booth"
  | "missing-booker"
  | "invalid-capacity"
  | "past-start"
  | "invalid-range"
  | "duplicate-id"
  | "not-found"
  | "already-cancelled"
  | "conflict";

export interface StudioBoothBookingRejection {
  readonly code: StudioBoothBookingRejectionCode;
  readonly conflictingIds: readonly string[];
}

export type CreateBoothBookingResult =
  | { readonly ok: true; readonly booking: StudioBoothBooking }
  | { readonly ok: false; readonly reason: StudioBoothBookingRejection };

export type AddBoothBookingResult =
  | { readonly ok: true; readonly bookings: readonly StudioBoothBooking[] }
  | { readonly ok: false; readonly reason: StudioBoothBookingRejection; readonly bookings: readonly StudioBoothBooking[] };

export type CancelBoothBookingResult =
  | { readonly ok: true; readonly bookings: readonly StudioBoothBooking[]; readonly cancelledId: string }
  | { readonly ok: false; readonly reason: StudioBoothBookingRejection; readonly bookings: readonly StudioBoothBooking[] };

// ---------------------------------------------------------------------------
// KST 날짜 유틸
// ---------------------------------------------------------------------------

function kstParts(epochMs: number): { readonly year: number; readonly month: number; readonly day: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: STUDIO_BOOKING_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(epochMs);
  const lookup = new Map(parts.map((part) => [part.type, part.value] as const));
  return {
    year: Number(lookup.get("year")),
    month: Number(lookup.get("month")),
    day: Number(lookup.get("day")),
  };
}

/** epoch ms가 속한 KST 자정의 epoch ms. KST는 DST가 없어 산술이 안전하다. */
export function kstDayStartMs(epochMs: number): number {
  const { year, month, day } = kstParts(epochMs);
  return Date.UTC(year, month - 1, day) - KST_OFFSET_MS;
}

/** "YYYY-MM-DD" + "HH:MM" KST 벽시계를 epoch ms로. 파싱 실패 시 null. */
export function kstWallToEpochMs(dateText: string, timeText: string): number | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText.trim());
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(timeText.trim());
  if (!dateMatch || !timeMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const epochMs = Date.UTC(year, month - 1, day, hour, minute) - KST_OFFSET_MS;
  const back = kstParts(epochMs);
  if (back.year !== year || back.month !== month || back.day !== day) return null;
  return epochMs;
}

/** KST 기준 "HH:MM". */
export function formatKstTime(epochMs: number): string {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: STUDIO_BOOKING_TIMEZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(epochMs);
}

/** KST 기준 "YYYY-MM-DD". */
export function formatKstDate(epochMs: number): string {
  const { year, month, day } = kstParts(epochMs);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** KST 기준 요일 인덱스 (0=일요일). */
export function kstWeekdayIndex(epochMs: number): number {
  // KST 자정 순간에 UTC+9를 더하면 해당 KST 날짜의 00:00 UTC가 되어 요일이 정확해진다.
  return new Date(kstDayStartMs(epochMs) + KST_OFFSET_MS).getUTCDay();
}

// ---------------------------------------------------------------------------
// 예약 생성·검증
// ---------------------------------------------------------------------------

function reject(code: StudioBoothBookingRejectionCode, conflictingIds: readonly string[] = []): StudioBoothBookingRejection {
  return { code, conflictingIds };
}

const sanitizeText = (value: string | null | undefined): string => (value ?? "").trim();

/**
 * 예약 입력 살균 + 검증. 과거 시작, 종료<=시작, 빈 부스/예약자, 비정상 수용 인원을 거부한다.
 * id는 호출자가 제공한다(순수 함수이므로 난수 생성은 하지 않음).
 */
export function createBoothBooking(input: StudioBoothBookingInput, nowMs: number, id: string): CreateBoothBookingResult {
  const bookingId = sanitizeText(id);
  if (!bookingId) return { ok: false, reason: reject("missing-id") };
  const boothId = sanitizeText(input.boothId);
  const boothName = sanitizeText(input.boothName);
  if (!boothId || !boothName) return { ok: false, reason: reject("missing-booth") };
  const bookerName = sanitizeText(input.bookerName);
  if (!bookerName) return { ok: false, reason: reject("missing-booker") };
  if (!Number.isInteger(input.capacity) || input.capacity <= 0) return { ok: false, reason: reject("invalid-capacity") };
  const { startsAt, endsAt } = input;
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return { ok: false, reason: reject("invalid-range") };
  if (startsAt < nowMs) return { ok: false, reason: reject("past-start") };
  if (endsAt <= startsAt) return { ok: false, reason: reject("invalid-range") };
  const note = sanitizeText(input.note).slice(0, STUDIO_BOOKING_MAX_NOTE_LENGTH);
  return {
    ok: true,
    booking: { id: bookingId, boothId, boothName, capacity: input.capacity, startsAt, endsAt, bookerName, note, status: "confirmed" },
  };
}

/** 같은 부스의 확정 예약과 시간대가 겹치는지 판정. 경계 접촉(종료==시작)은 겹침이 아니다. */
export function isBoothBookingConflict(
  existing: StudioBoothBooking,
  candidate: { readonly boothId: string; readonly startsAt: number; readonly endsAt: number },
): boolean {
  if (existing.status !== "confirmed") return false;
  if (existing.boothId !== candidate.boothId) return false;
  return candidate.startsAt < existing.endsAt && existing.startsAt < candidate.endsAt;
}

/** 충돌 시 거부 사유(겹치는 예약 id 목록 포함)를 반환하고 목록을 바꾸지 않는다. */
export function addBoothBooking(
  bookings: readonly StudioBoothBooking[],
  booking: StudioBoothBooking,
): AddBoothBookingResult {
  if (bookings.some((entry) => entry.id === booking.id)) {
    return { ok: false, reason: reject("duplicate-id"), bookings };
  }
  const conflictingIds = bookings.filter((entry) => isBoothBookingConflict(entry, booking)).map((entry) => entry.id);
  if (conflictingIds.length > 0) {
    return { ok: false, reason: reject("conflict", conflictingIds), bookings };
  }
  return { ok: true, bookings: [...bookings, booking] };
}

/** 예약 취소. 취소된 예약은 겹침 판정에서 제외된다(대기열 승격 대상 슬롯이 된다). */
export function cancelBoothBooking(
  bookings: readonly StudioBoothBooking[],
  bookingId: string,
): CancelBoothBookingResult {
  const index = bookings.findIndex((entry) => entry.id === bookingId);
  if (index < 0) return { ok: false, reason: reject("not-found"), bookings };
  const target = bookings[index];
  if (!target || target.status === "cancelled") return { ok: false, reason: reject("already-cancelled"), bookings };
  const next = bookings.map((entry, entryIndex) =>
    entryIndex === index ? { ...entry, status: "cancelled" as const } : entry,
  );
  return { ok: true, bookings: next, cancelledId: bookingId };
}

/** KST 하루(자정~다음 자정)와 겹치는 확정 예약을 시작 시각 순으로 반환. */
export function bookingsForDay(
  bookings: readonly StudioBoothBooking[],
  dayStartMs: number,
): readonly StudioBoothBooking[] {
  const dayEndMs = dayStartMs + DAY_MS;
  return bookings
    .filter((entry) => entry.status === "confirmed" && entry.startsAt < dayEndMs && entry.endsAt > dayStartMs)
    .sort((a, b) => (a.startsAt === b.startsAt ? (a.boothId < b.boothId ? -1 : 1) : a.startsAt - b.startsAt));
}

// ---------------------------------------------------------------------------
// 반복 예약
// ---------------------------------------------------------------------------

export type StudioBookingRecurrence = "daily" | "weekly";

export interface StudioRecurringBookingRule {
  readonly frequency: StudioBookingRecurrence;
  readonly occurrences: number;
  /** 매 N일/주. 기본값 1. */
  readonly interval?: number;
}

export interface StudioRecurringExpansionSkipped {
  readonly index: number;
  readonly reason: StudioBoothBookingRejection;
}

export interface StudioRecurringExpansion {
  readonly bookings: readonly StudioBoothBooking[];
  /** 요청 횟수가 상한을 초과해 잘렸는지. */
  readonly truncated: boolean;
  readonly skipped: readonly StudioRecurringExpansionSkipped[];
}

/**
 * 반복 예약을 개별 예약으로 전개한다. 최대 전개 수(STUDIO_BOOKING_MAX_RECURRENCE)를
 * 초과하는 요청은 잘리고 truncated=true로 알린다. 과거로 떨어지는 회차는 건너뛴다.
 */
export function expandRecurringBooking(
  input: StudioBoothBookingInput,
  rule: StudioRecurringBookingRule,
  options: { readonly nowMs: number; readonly newId: (index: number) => string },
): StudioRecurringExpansion {
  const requested = Number.isInteger(rule.occurrences) ? rule.occurrences : 0;
  const clamped = Math.max(0, Math.min(requested, STUDIO_BOOKING_MAX_RECURRENCE));
  const truncated = requested > STUDIO_BOOKING_MAX_RECURRENCE;
  const interval = Number.isInteger(rule.interval) && (rule.interval as number) > 0
    ? Math.min(rule.interval as number, 30)
    : 1;
  const stepMs = interval * (rule.frequency === "weekly" ? 7 * DAY_MS : DAY_MS);
  const bookings: StudioBoothBooking[] = [];
  const skipped: StudioRecurringExpansionSkipped[] = [];
  for (let index = 0; index < clamped; index += 1) {
    const shifted: StudioBoothBookingInput = {
      ...input,
      startsAt: input.startsAt + index * stepMs,
      endsAt: input.endsAt + index * stepMs,
    };
    const created = createBoothBooking(shifted, options.nowMs, options.newId(index));
    if (created.ok) bookings.push(created.booking);
    else skipped.push({ index, reason: created.reason });
  }
  return { bookings, truncated, skipped };
}

// ---------------------------------------------------------------------------
// 대기열 (FIFO)
// ---------------------------------------------------------------------------

export interface StudioBoothWaitlistEntry {
  readonly id: string;
  readonly boothId: string;
  readonly boothName: string;
  readonly capacity: number;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly bookerName: string;
  readonly note: string;
  readonly requestedAt: number;
}

export type AddBoothWaitlistResult =
  | { readonly ok: true; readonly waitlist: readonly StudioBoothWaitlistEntry[] }
  | { readonly ok: false; readonly reason: StudioBoothBookingRejection; readonly waitlist: readonly StudioBoothWaitlistEntry[] };

/** 충돌로 확정되지 못한 예약을 대기열에 올린다. 입력 검증은 createBoothBooking과 동일하다. */
export function addBoothWaitlistEntry(
  waitlist: readonly StudioBoothWaitlistEntry[],
  candidate: StudioBoothBookingInput,
  options: { readonly nowMs: number; readonly id: string },
): AddBoothWaitlistResult {
  if (waitlist.some((entry) => entry.id === options.id)) {
    return { ok: false, reason: reject("duplicate-id"), waitlist };
  }
  const created = createBoothBooking(candidate, options.nowMs, options.id);
  if (!created.ok) return { ok: false, reason: created.reason, waitlist };
  const booking = created.booking;
  const entry: StudioBoothWaitlistEntry = {
    id: booking.id,
    boothId: booking.boothId,
    boothName: booking.boothName,
    capacity: booking.capacity,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    bookerName: booking.bookerName,
    note: booking.note,
    requestedAt: options.nowMs,
  };
  return { ok: true, waitlist: [...waitlist, entry] };
}

export interface PromoteBoothWaitlistResult {
  /** 확정으로 승격된 대기열 항목. 들어갈 슬롯이 없으면 null. */
  readonly promoted: StudioBoothBooking | null;
  readonly waitlist: readonly StudioBoothWaitlistEntry[];
}

/**
 * 대기열 FIFO 승격. 해당 부스의 대기열을 요청 시각 순으로 훑어 확정 예약과
 * 겹치지 않는 첫 항목을 확정 예약으로 승격한다(보통 취소 직후 호출).
 */
export function promoteBoothWaitlist(
  waitlist: readonly StudioBoothWaitlistEntry[],
  bookings: readonly StudioBoothBooking[],
  boothId: string,
): PromoteBoothWaitlistResult {
  const ordered = [...waitlist]
    .filter((entry) => entry.boothId === boothId)
    .sort((a, b) => (a.requestedAt === b.requestedAt ? (a.id < b.id ? -1 : 1) : a.requestedAt - b.requestedAt));
  for (const entry of ordered) {
    const fits = !bookings.some((booking) => isBoothBookingConflict(booking, entry));
    if (!fits) continue;
    return {
      promoted: {
        id: entry.id,
        boothId: entry.boothId,
        boothName: entry.boothName,
        capacity: entry.capacity,
        startsAt: entry.startsAt,
        endsAt: entry.endsAt,
        bookerName: entry.bookerName,
        note: entry.note,
        status: "confirmed",
      },
      waitlist: waitlist.filter((item) => item.id !== entry.id),
    };
  }
  return { promoted: null, waitlist };
}

// ---------------------------------------------------------------------------
// 입장 시 예약 확인 의도 + 하루 스케줄 조감
// ---------------------------------------------------------------------------

/**
 * 입장 게이트 연결 전 단계의 예약 확인 의도.
 * 해당 시각에 유효한(시작<=시각<종료) 확정 예약을 반환한다. 실제 게이트 연동은 후속 티켓.
 */
export function checkBoothBookingAt(
  bookings: readonly StudioBoothBooking[],
  boothId: string,
  atMs: number,
): StudioBoothBooking | null {
  const active = bookings.filter(
    (entry) => entry.status === "confirmed" && entry.boothId === boothId && entry.startsAt <= atMs && atMs < entry.endsAt,
  );
  if (active.length === 0) return null;
  return [...active].sort((a, b) => a.startsAt - b.startsAt)[0] ?? null;
}

export type StudioDayScheduleBlockStatus = "upcoming" | "live" | "past";

export interface StudioDayScheduleBlock {
  readonly bookingId: string;
  readonly boothId: string;
  readonly boothName: string;
  readonly bookerName: string;
  readonly startsAt: number;
  readonly endsAt: number;
  readonly status: StudioDayScheduleBlockStatus;
}

/**
 * 하루 스케줄 조감용 순수 파생 데이터. 부스 전달 순서대로, 각 부스 안에서는 시작 시각 순.
 * nowMs 기준 진행 중(live)/예정/종료를 함께 계산한다.
 */
export function buildDaySchedule(
  bookings: readonly StudioBoothBooking[],
  booths: readonly StudioVirtualBooth[],
  dayStartMs: number,
  nowMs: number,
): readonly StudioDayScheduleBlock[] {
  const dayBookings = bookingsForDay(bookings, dayStartMs);
  const boothOrder = new Map(booths.map((booth, index) => [booth.id, index] as const));
  const boothNameOf = (boothId: string): string => booths.find((booth) => booth.id === boothId)?.name ?? boothId;
  return dayBookings
    .map((booking): StudioDayScheduleBlock => ({
      bookingId: booking.id,
      boothId: booking.boothId,
      boothName: boothNameOf(booking.boothId),
      bookerName: booking.bookerName,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      status: nowMs < booking.startsAt ? "upcoming" : nowMs < booking.endsAt ? "live" : "past",
    }))
    .sort((a, b) => {
      const orderA = boothOrder.get(a.boothId) ?? Number.MAX_SAFE_INTEGER;
      const orderB = boothOrder.get(b.boothId) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.startsAt - b.startsAt;
    });
}
