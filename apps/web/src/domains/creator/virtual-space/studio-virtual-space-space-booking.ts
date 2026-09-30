/**
 * 스페이스(룸) 단위 시간제 예약 상태 머신 (E-5).
 *
 * D-4(부스 단위 예약) 패턴을 스페이스 단위로 재설계한 순수 함수 집합.
 * - 예약 대상: 스페이스 id·이름·수용 인원·장비 태그
 * - 예약자 명단(여러 명), 반복 예약(일간/주간), 충돌 시 대기열(FIFO)
 * - 서버 없이 동작. 모든 시각은 epoch ms, 날짜 표기는 KST(Asia/Seoul) 기준.
 * KST 헬퍼는 D-4 모듈(studio-virtual-space-booking.ts)을 읽기 전용으로 재사용한다.
 */

import {
  formatKstDate,
  formatKstTime,
  kstDayStartMs,
  kstWallToEpochMs,
  kstWeekdayIndex,
  STUDIO_BOOKING_MAX_NOTE_LENGTH,
  STUDIO_BOOKING_MAX_RECURRENCE,
} from "./studio-virtual-space-booking";

export {
  formatKstDate,
  formatKstTime,
  kstDayStartMs,
  kstWallToEpochMs,
  kstWeekdayIndex,
  STUDIO_BOOKING_MAX_NOTE_LENGTH as STUDIO_SPACE_BOOKING_MAX_NOTE_LENGTH,
  STUDIO_BOOKING_MAX_RECURRENCE as STUDIO_SPACE_BOOKING_MAX_RECURRENCE,
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** 예약자 명단 최대 인원(입력 살균 상한). */
export const STUDIO_SPACE_BOOKING_MAX_BOOKERS = 30;

/** 장비 태그 최대 개수(입력 살균 상한). */
export const STUDIO_SPACE_BOOKING_MAX_EQUIPMENT_TAGS = 10;

/** 장비 태그 1개 최대 길이(입력 살균 상한). */
export const STUDIO_SPACE_BOOKING_MAX_EQUIPMENT_TAG_LENGTH = 30;

export interface StudioVirtualSpace {
  readonly id: string;
  readonly name: string;
  readonly capacity: number;
  readonly equipmentTags: readonly string[];
}

export interface StudioSpaceBookingInput {
  readonly spaceId: string;
  readonly spaceName: string;
  readonly capacity: number;
  readonly equipmentTags: readonly string[];
  readonly startsAt: number;
  readonly endsAt: number;
  /** 예약자 명단(여러 명). */
  readonly bookerNames: readonly string[];
  readonly note?: string | null;
}

export interface StudioSpaceBooking {
  readonly id: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly capacity: number;
  readonly equipmentTags: readonly string[];
  readonly startsAt: number;
  readonly endsAt: number;
  readonly bookerNames: readonly string[];
  readonly note: string;
  readonly status: "confirmed" | "cancelled";
}

export type StudioSpaceBookingRejectionCode =
  | "missing-id"
  | "missing-space"
  | "missing-booker"
  | "invalid-capacity"
  | "over-capacity"
  | "past-start"
  | "invalid-range"
  | "duplicate-id"
  | "not-found"
  | "already-cancelled"
  | "conflict";

export interface StudioSpaceBookingRejection {
  readonly code: StudioSpaceBookingRejectionCode;
  readonly conflictingIds: readonly string[];
}

export type CreateSpaceBookingResult =
  | { readonly ok: true; readonly booking: StudioSpaceBooking }
  | { readonly ok: false; readonly reason: StudioSpaceBookingRejection };

export type AddSpaceBookingResult =
  | { readonly ok: true; readonly bookings: readonly StudioSpaceBooking[] }
  | { readonly ok: false; readonly reason: StudioSpaceBookingRejection; readonly bookings: readonly StudioSpaceBooking[] };

export type CancelSpaceBookingResult =
  | { readonly ok: true; readonly bookings: readonly StudioSpaceBooking[]; readonly cancelledId: string }
  | { readonly ok: false; readonly reason: StudioSpaceBookingRejection; readonly bookings: readonly StudioSpaceBooking[] };

// ---------------------------------------------------------------------------
// 입력 살균
// ---------------------------------------------------------------------------

function reject(code: StudioSpaceBookingRejectionCode, conflictingIds: readonly string[] = []): StudioSpaceBookingRejection {
  return { code, conflictingIds };
}

const sanitizeText = (value: string | null | undefined): string => (value ?? "").trim();

function sanitizeStringList(
  values: readonly (string | null | undefined)[],
  maxCount: number,
  maxItemLength: number,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const text = sanitizeText(raw);
    if (!text || seen.has(text) || result.length >= maxCount) continue;
    seen.add(text);
    result.push(text.slice(0, maxItemLength));
  }
  return result;
}

/**
 * 예약자 명단 텍스트(쉼표·세미콜론·줄바꿈 구분)를 이름 배열로 살균한다.
 * 공백 제거·빈 항목 제거·중복 제거(순서 유지)·최대 인원 상한 적용.
 */
export function parseSpaceBookerRoster(text: string): string[] {
  return sanitizeStringList(text.split(/[\n,;]/), STUDIO_SPACE_BOOKING_MAX_BOOKERS, 40);
}

const sanitizeEquipmentTags = (values: readonly (string | null | undefined)[]): string[] =>
  sanitizeStringList(values, STUDIO_SPACE_BOOKING_MAX_EQUIPMENT_TAGS, STUDIO_SPACE_BOOKING_MAX_EQUIPMENT_TAG_LENGTH);

// ---------------------------------------------------------------------------
// 예약 생성·검증
// ---------------------------------------------------------------------------

/**
 * 예약 입력 살균 + 검증. 과거 시작, 종료<=시작, 빈 스페이스/예약자, 비정상 수용 인원,
 * 예약자 수가 수용 인원을 초과하는 경우를 거부한다.
 * id는 호출자가 제공한다(순수 함수이므로 난수 생성은 하지 않음).
 */
export function createSpaceBooking(input: StudioSpaceBookingInput, nowMs: number, id: string): CreateSpaceBookingResult {
  const bookingId = sanitizeText(id);
  if (!bookingId) return { ok: false, reason: reject("missing-id") };
  const spaceId = sanitizeText(input.spaceId);
  const spaceName = sanitizeText(input.spaceName);
  if (!spaceId || !spaceName) return { ok: false, reason: reject("missing-space") };
  const bookerNames = sanitizeStringList(input.bookerNames, STUDIO_SPACE_BOOKING_MAX_BOOKERS, 40);
  if (bookerNames.length === 0) return { ok: false, reason: reject("missing-booker") };
  if (!Number.isInteger(input.capacity) || input.capacity <= 0) return { ok: false, reason: reject("invalid-capacity") };
  if (bookerNames.length > input.capacity) return { ok: false, reason: reject("over-capacity") };
  const { startsAt, endsAt } = input;
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return { ok: false, reason: reject("invalid-range") };
  if (startsAt < nowMs) return { ok: false, reason: reject("past-start") };
  if (endsAt <= startsAt) return { ok: false, reason: reject("invalid-range") };
  const note = sanitizeText(input.note).slice(0, STUDIO_BOOKING_MAX_NOTE_LENGTH);
  const equipmentTags = sanitizeEquipmentTags(input.equipmentTags);
  return {
    ok: true,
    booking: {
      id: bookingId,
      spaceId,
      spaceName,
      capacity: input.capacity,
      equipmentTags,
      startsAt,
      endsAt,
      bookerNames,
      note,
      status: "confirmed",
    },
  };
}

/** 같은 스페이스의 확정 예약과 시간대가 겹치는지 판정. 경계 접촉(종료==시작)은 겹침이 아니다. */
export function isSpaceBookingConflict(
  existing: StudioSpaceBooking,
  candidate: { readonly spaceId: string; readonly startsAt: number; readonly endsAt: number },
): boolean {
  if (existing.status !== "confirmed") return false;
  if (existing.spaceId !== candidate.spaceId) return false;
  return candidate.startsAt < existing.endsAt && existing.startsAt < candidate.endsAt;
}

/** 충돌 시 거부 사유(겹치는 예약 id 목록 포함)를 반환하고 목록을 바꾸지 않는다. */
export function addSpaceBooking(
  bookings: readonly StudioSpaceBooking[],
  booking: StudioSpaceBooking,
): AddSpaceBookingResult {
  if (bookings.some((entry) => entry.id === booking.id)) {
    return { ok: false, reason: reject("duplicate-id"), bookings };
  }
  const conflictingIds = bookings.filter((entry) => isSpaceBookingConflict(entry, booking)).map((entry) => entry.id);
  if (conflictingIds.length > 0) {
    return { ok: false, reason: reject("conflict", conflictingIds), bookings };
  }
  return { ok: true, bookings: [...bookings, booking] };
}

/** 예약 취소. 취소된 예약은 겹침 판정에서 제외된다(대기열 승격 대상 슬롯이 된다). */
export function cancelSpaceBooking(
  bookings: readonly StudioSpaceBooking[],
  bookingId: string,
): CancelSpaceBookingResult {
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
export function spaceBookingsForDay(
  bookings: readonly StudioSpaceBooking[],
  dayStartMs: number,
): readonly StudioSpaceBooking[] {
  const dayEndMs = dayStartMs + DAY_MS;
  return bookings
    .filter((entry) => entry.status === "confirmed" && entry.startsAt < dayEndMs && entry.endsAt > dayStartMs)
    .sort((a, b) => (a.startsAt === b.startsAt ? (a.spaceId < b.spaceId ? -1 : 1) : a.startsAt - b.startsAt));
}

// ---------------------------------------------------------------------------
// 반복 예약
// ---------------------------------------------------------------------------

export type StudioSpaceRecurrence = "daily" | "weekly";

export interface StudioSpaceRecurringRule {
  readonly frequency: StudioSpaceRecurrence;
  readonly occurrences: number;
  /** 매 N일/주. 기본값 1. */
  readonly interval?: number;
}

export interface StudioSpaceRecurringExpansionSkipped {
  readonly index: number;
  readonly reason: StudioSpaceBookingRejection;
}

export interface StudioSpaceRecurringExpansion {
  readonly bookings: readonly StudioSpaceBooking[];
  /** 요청 횟수가 상한을 초과해 잘렸는지. */
  readonly truncated: boolean;
  readonly skipped: readonly StudioSpaceRecurringExpansionSkipped[];
}

/**
 * 반복 예약을 개별 예약으로 전개한다. 최대 전개 수(STUDIO_SPACE_BOOKING_MAX_RECURRENCE)를
 * 초과하는 요청은 잘리고 truncated=true로 알린다. 과거로 떨어지는 회차는 건너뛴다.
 */
export function expandSpaceRecurringBooking(
  input: StudioSpaceBookingInput,
  rule: StudioSpaceRecurringRule,
  options: { readonly nowMs: number; readonly newId: (index: number) => string },
): StudioSpaceRecurringExpansion {
  const requested = Number.isInteger(rule.occurrences) ? rule.occurrences : 0;
  const clamped = Math.max(0, Math.min(requested, STUDIO_BOOKING_MAX_RECURRENCE));
  const truncated = requested > STUDIO_BOOKING_MAX_RECURRENCE;
  const interval = Number.isInteger(rule.interval) && (rule.interval as number) > 0
    ? Math.min(rule.interval as number, 30)
    : 1;
  const stepMs = interval * (rule.frequency === "weekly" ? 7 * DAY_MS : DAY_MS);
  const bookings: StudioSpaceBooking[] = [];
  const skipped: StudioSpaceRecurringExpansionSkipped[] = [];
  for (let index = 0; index < clamped; index += 1) {
    const shifted: StudioSpaceBookingInput = {
      ...input,
      startsAt: input.startsAt + index * stepMs,
      endsAt: input.endsAt + index * stepMs,
    };
    const created = createSpaceBooking(shifted, options.nowMs, options.newId(index));
    if (created.ok) bookings.push(created.booking);
    else skipped.push({ index, reason: created.reason });
  }
  return { bookings, truncated, skipped };
}

// ---------------------------------------------------------------------------
// 대기열 (FIFO)
// ---------------------------------------------------------------------------

export interface StudioSpaceWaitlistEntry {
  readonly id: string;
  readonly spaceId: string;
  readonly spaceName: string;
  readonly capacity: number;
  readonly equipmentTags: readonly string[];
  readonly startsAt: number;
  readonly endsAt: number;
  readonly bookerNames: readonly string[];
  readonly note: string;
  readonly requestedAt: number;
}

export type AddSpaceWaitlistResult =
  | { readonly ok: true; readonly waitlist: readonly StudioSpaceWaitlistEntry[] }
  | { readonly ok: false; readonly reason: StudioSpaceBookingRejection; readonly waitlist: readonly StudioSpaceWaitlistEntry[] };

/** 충돌로 확정되지 못한 예약을 대기열에 올린다. 입력 검증은 createSpaceBooking과 동일하다. */
export function addSpaceWaitlistEntry(
  waitlist: readonly StudioSpaceWaitlistEntry[],
  candidate: StudioSpaceBookingInput,
  options: { readonly nowMs: number; readonly id: string },
): AddSpaceWaitlistResult {
  if (waitlist.some((entry) => entry.id === options.id)) {
    return { ok: false, reason: reject("duplicate-id"), waitlist };
  }
  const created = createSpaceBooking(candidate, options.nowMs, options.id);
  if (!created.ok) return { ok: false, reason: created.reason, waitlist };
  const booking = created.booking;
  const entry: StudioSpaceWaitlistEntry = {
    id: booking.id,
    spaceId: booking.spaceId,
    spaceName: booking.spaceName,
    capacity: booking.capacity,
    equipmentTags: booking.equipmentTags,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    bookerNames: booking.bookerNames,
    note: booking.note,
    requestedAt: options.nowMs,
  };
  return { ok: true, waitlist: [...waitlist, entry] };
}

export interface PromoteSpaceWaitlistResult {
  /** 확정으로 승격된 대기열 항목. 들어갈 슬롯이 없으면 null. */
  readonly promoted: StudioSpaceBooking | null;
  readonly waitlist: readonly StudioSpaceWaitlistEntry[];
}

/**
 * 대기열 FIFO 승격. 해당 스페이스의 대기열을 요청 시각 순으로 훑어 확정 예약과
 * 겹치지 않는 첫 항목을 확정 예약으로 승격한다(보통 취소 직후 호출).
 */
export function promoteSpaceWaitlist(
  waitlist: readonly StudioSpaceWaitlistEntry[],
  bookings: readonly StudioSpaceBooking[],
  spaceId: string,
): PromoteSpaceWaitlistResult {
  const ordered = [...waitlist]
    .filter((entry) => entry.spaceId === spaceId)
    .sort((a, b) => (a.requestedAt === b.requestedAt ? (a.id < b.id ? -1 : 1) : a.requestedAt - b.requestedAt));
  for (const entry of ordered) {
    const fits = !bookings.some((booking) => isSpaceBookingConflict(booking, entry));
    if (!fits) continue;
    return {
      promoted: {
        id: entry.id,
        spaceId: entry.spaceId,
        spaceName: entry.spaceName,
        capacity: entry.capacity,
        equipmentTags: entry.equipmentTags,
        startsAt: entry.startsAt,
        endsAt: entry.endsAt,
        bookerNames: entry.bookerNames,
        note: entry.note,
        status: "confirmed",
      },
      waitlist: waitlist.filter((item) => item.id !== entry.id),
    };
  }
  return { promoted: null, waitlist };
}

// ---------------------------------------------------------------------------
// 입장 시 예약 확인 의도
// ---------------------------------------------------------------------------

/**
 * 입장 게이트 연결 전 단계의 예약 확인 의도.
 * 해당 시각에 유효한(시작<=시각<종료) 확정 예약을 반환한다. 실제 게이트 연동은 후속 티켓.
 */
export function checkSpaceBookingAt(
  bookings: readonly StudioSpaceBooking[],
  spaceId: string,
  atMs: number,
): StudioSpaceBooking | null {
  const active = bookings.filter(
    (entry) => entry.status === "confirmed" && entry.spaceId === spaceId && entry.startsAt <= atMs && atMs < entry.endsAt,
  );
  if (active.length === 0) return null;
  return [...active].sort((a, b) => a.startsAt - b.startsAt)[0] ?? null;
}
