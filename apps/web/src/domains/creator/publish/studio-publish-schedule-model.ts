/**
 * 연재 예약 발행 스케줄러 — 순수 도메인 모델.
 *
 * 회차 예약 발행에 필요한 시간 검증, 타임존 변환, 충돌 감지, 주간 발행
 * 패턴(케이던스) 계산, 예약 큐 상태 전이, 재시도 백오프, 발행 전 체크리스트를
 * 담당한다. 렌더링·저장소·네트워크에 의존하지 않으므로 vitest에서 직접
 * 검증할 수 있으며, API 서비스(`apps/api`)와 웹 UI가 같은 규칙을 공유한다.
 */

export const STUDIO_PUBLISH_SCHEDULE_SCHEMA_VERSION = 1 as const;

/** 예약 최소 리드타임(분): 현재 시각 기준 이보다 빠르면 예약 불가. */
export const PUBLISH_SCHEDULE_MIN_LEAD_MINUTES = 30;
/** 예약 최대 허용 범위(일): 이보다 먼 미래는 예약 불가. */
export const PUBLISH_SCHEDULE_MAX_HORIZON_DAYS = 90;
/** 같은 작품 내 예약 간 최소 간격(분): 이보다 가까우면 충돌. */
export const PUBLISH_SCHEDULE_MIN_GAP_MINUTES = 30;
/** 실패 시 최대 재시도 횟수. */
export const PUBLISH_SCHEDULE_MAX_RETRY_ATTEMPTS = 5;
/** 재시도 간격(분). attemptCount 인덱스별로 적용, 초과분은 마지막 값 유지. */
export const PUBLISH_SCHEDULE_RETRY_DELAYS_MINUTES: readonly number[] = [
  5, 15, 60, 360, 1440,
];

export type StudioPublishReservationStatus =
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "canceled";

export interface StudioPublishReservation {
  readonly schemaVersion: typeof STUDIO_PUBLISH_SCHEDULE_SCHEMA_VERSION;
  readonly id: string;
  readonly seriesId: string;
  readonly episodeId: string;
  readonly episodeTitle: string;
  /** 예약 발행 시각 (UTC ISO 8601). */
  readonly scheduledAtUtc: string;
  /** 예약 입력에 사용된 IANA 타임존 (예: Asia/Seoul). */
  readonly timeZone: string;
  readonly status: StudioPublishReservationStatus;
  readonly attemptCount: number;
  /** 다음 재시도 예정 시각 (UTC ISO). 재시도 대상이 아니면 null. */
  readonly nextRetryAtUtc: string | null;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type PublishScheduleTimeErrorCode =
  | "INVALID_TIMEZONE"
  | "INVALID_DATETIME"
  | "PAST_TIME"
  | "TOO_SOON"
  | "TOO_FAR";

export interface ValidateReservationTimeOptions {
  readonly now?: Date | number;
  readonly minLeadMinutes?: number;
  readonly maxHorizonDays?: number;
}

export type ValidateReservationTimeResult =
  | { readonly ok: true; readonly scheduledAtUtc: string }
  | { readonly ok: false; readonly code: PublishScheduleTimeErrorCode };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/u;
const TIME_RE = /^(\d{2}):(\d{2})$/u;

/**
 * IANA 타임존 식별자가 유효한지 검사한다. Intl이 RangeError를 던지면
 * 무효한 타임존이다.
 */
export function isValidIanaTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || !timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function getTimeZoneOffsetMs(timeZone: string, instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  // 자정은 hour "24"로 표기되는 구현이 있어 24로 나눈다.
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - instant.getTime();
}

interface ParsedLocalDateTime {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
}

function parseLocalDateTime(date: string, time: string): ParsedLocalDateTime | null {
  const dateMatch = DATE_RE.exec(date.trim());
  const timeMatch = TIME_RE.exec(time.trim());
  if (!dateMatch || !timeMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;
  // 존재하지 않는 날짜(2월 30일 등)를 걸러낸다.
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day, hour, minute };
}

/**
 * 타임존 기준 로컬 날짜·시각을 UTC ISO 문자열로 변환한다.
 * DST 전환 구간을 포함한 오프셋을 Intl로 계산하므로 서머타임 경계에서도
 * 정확한 UTC를 구한다. 입력이 유효하지 않으면 null.
 */
export function convertLocalToUtc(
  date: string,
  time: string,
  timeZone: string,
): string | null {
  if (!isValidIanaTimeZone(timeZone)) return null;
  const parsed = parseLocalDateTime(date, time);
  if (!parsed) return null;
  const asUtcGuess = Date.UTC(
    parsed.year,
    parsed.month - 1,
    parsed.day,
    parsed.hour,
    parsed.minute,
  );
  // 오프셋은 실제 시각 근처에서 구해야 DST 경계에서 정확하다. 한 번의
  // 보정으로 대부분의 경계를 해소하고, 두 번 반복하면 잔여 오차를 없앤다.
  let instant = new Date(asUtcGuess);
  for (let i = 0; i < 2; i += 1) {
    const offset = getTimeZoneOffsetMs(timeZone, instant);
    instant = new Date(asUtcGuess - offset);
  }
  return instant.toISOString();
}

/**
 * UTC ISO 시각을 지정 타임존·로케일의 "YYYY-MM-DD HH:mm" 표시 문자열로 변환한다.
 */
export function formatUtcInTimeZone(
  scheduledAtUtc: string,
  timeZone: string,
  locale = "ko-KR",
): string | null {
  if (!isValidIanaTimeZone(timeZone)) return null;
  const instant = new Date(scheduledAtUtc);
  if (Number.isNaN(instant.getTime())) return null;
  const dtf = new Intl.DateTimeFormat(locale, {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const part of dtf.formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = part.value;
  }
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

/**
 * 예약 일시의 유효성을 검증한다. 과거·너무 임박·너무 먼 미래·잘못된
 * 타임존/날짜 형식을 코드로 구분해 UI가 적절한 안내를 보여줄 수 있다.
 */
export function validateReservationTime(
  date: string,
  time: string,
  timeZone: string,
  options: ValidateReservationTimeOptions = {},
): ValidateReservationTimeResult {
  if (!isValidIanaTimeZone(timeZone)) {
    return { ok: false, code: "INVALID_TIMEZONE" };
  }
  const scheduledAtUtc = convertLocalToUtc(date, time, timeZone);
  if (!scheduledAtUtc) {
    return { ok: false, code: "INVALID_DATETIME" };
  }
  const nowMs = options.now instanceof Date ? options.now.getTime() : Number(options.now ?? Date.now());
  const scheduledMs = Date.parse(scheduledAtUtc);
  const minLeadMs = (options.minLeadMinutes ?? PUBLISH_SCHEDULE_MIN_LEAD_MINUTES) * 60_000;
  const maxHorizonMs =
    (options.maxHorizonDays ?? PUBLISH_SCHEDULE_MAX_HORIZON_DAYS) * 86_400_000;
  if (scheduledMs <= nowMs) return { ok: false, code: "PAST_TIME" };
  if (scheduledMs - nowMs < minLeadMs) return { ok: false, code: "TOO_SOON" };
  if (scheduledMs - nowMs > maxHorizonMs) return { ok: false, code: "TOO_FAR" };
  return { ok: true, scheduledAtUtc };
}

export interface ScheduleConflictCandidate {
  readonly seriesId: string;
  readonly scheduledAtUtc: string;
  /** 수정 시 자기 자신은 충돌 검사에서 제외한다. */
  readonly excludeId?: string;
}

export interface ScheduleConflict {
  readonly reservationId: string;
  readonly episodeTitle: string;
  readonly scheduledAtUtc: string;
  /** 분 단위 간격(절댓값). */
  readonly gapMinutes: number;
}

/**
 * 같은 작품의 기존 예약과 후보 예약 사이의 충돌을 감지한다.
 * 취소된 예약은 무시하고, 최소 간격(minGapMinutes) 안에 들어오는 예약을
 * 간격이 좁은 순서대로 보고한다.
 */
export function detectScheduleConflicts(
  existing: readonly StudioPublishReservation[],
  candidate: ScheduleConflictCandidate,
  minGapMinutes: number = PUBLISH_SCHEDULE_MIN_GAP_MINUTES,
): ScheduleConflict[] {
  const candidateMs = Date.parse(candidate.scheduledAtUtc);
  if (Number.isNaN(candidateMs)) return [];
  const minGapMs = Math.max(0, minGapMinutes) * 60_000;
  const conflicts: ScheduleConflict[] = [];
  for (const reservation of existing) {
    if (reservation.id === candidate.excludeId) continue;
    if (reservation.seriesId !== candidate.seriesId) continue;
    if (reservation.status === "canceled") continue;
    const existingMs = Date.parse(reservation.scheduledAtUtc);
    if (Number.isNaN(existingMs)) continue;
    const gapMs = Math.abs(existingMs - candidateMs);
    if (gapMs < minGapMs) {
      conflicts.push({
        reservationId: reservation.id,
        episodeTitle: reservation.episodeTitle,
        scheduledAtUtc: reservation.scheduledAtUtc,
        gapMinutes: gapMs / 60_000,
      });
    }
  }
  conflicts.sort((a, b) => a.gapMinutes - b.gapMinutes);
  return conflicts;
}

export interface PublishScheduleCadence {
  /** 주당 발행 횟수 (1-7). */
  readonly timesPerWeek: number;
  /** 0(일) - 6(토). timesPerWeek와 개수가 일치해야 한다. */
  readonly weekdays: readonly number[];
  /** "HH:mm" 형식의 발행 시각. */
  readonly timeOfDay: string;
  /** IANA 타임존. */
  readonly timeZone: string;
}

export interface NormalizedPublishScheduleCadence {
  readonly timesPerWeek: number;
  readonly weekdays: readonly number[];
  readonly timeOfDay: string;
  readonly timeZone: string;
}

/**
 * 주간 발행 패턴(케이던스)을 정규화한다. 요일은 0-6 범위로 다듬고
 * 중복을 제거한 뒤 오름차순 정렬하며, timesPerWeek는 실제 요일 수와 맞춘다.
 */
export function normalizePublishScheduleCadence(
  cadence: PublishScheduleCadence,
): NormalizedPublishScheduleCadence | null {
  if (!isValidIanaTimeZone(cadence.timeZone)) return null;
  if (!TIME_RE.test(cadence.timeOfDay.trim())) return null;
  const [hourText, minuteText] = cadence.timeOfDay.trim().split(":");
  if (Number(hourText) > 23 || Number(minuteText) > 59) return null;
  const weekdays = [...new Set(cadence.weekdays)]
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    .sort((a, b) => a - b);
  if (weekdays.length === 0) return null;
  return {
    timesPerWeek: weekdays.length,
    weekdays,
    timeOfDay: cadence.timeOfDay.trim(),
    timeZone: cadence.timeZone,
  };
}

/**
 * 케이던스로부터 앞으로 다가올 발행 예정 시각(UTC ISO) 목록을 계산한다.
 * from 이후의 시각만 포함하며, count 개수만큼 반환한다.
 */
export function computeCadenceOccurrences(
  cadence: NormalizedPublishScheduleCadence,
  from: Date | number,
  count: number,
  maxSearchDays = 400,
): string[] {
  if (count <= 0) return [];
  const fromMs = from instanceof Date ? from.getTime() : Number(from);
  const occurrences: string[] = [];
  // 기준일의 타임존 로컬 날짜를 구해 하루씩 전진한다.
  const dayFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: cadence.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const startParts = dayFormatter.formatToParts(new Date(fromMs));
  const partMap: Record<string, string> = {};
  for (const part of startParts) partMap[part.type] = part.value;
  let cursor = Date.UTC(
    Number(partMap.year),
    Number(partMap.month) - 1,
    Number(partMap.day),
  );
  const weekdaySet = new Set(cadence.weekdays);
  for (let day = 0; day < maxSearchDays && occurrences.length < count; day += 1) {
    const cursorDate = new Date(cursor);
    const localDate = dayFormatter.format(cursorDate);
    if (weekdaySet.has(cursorDate.getUTCDay())) {
      const utc = convertLocalToUtc(localDate, cadence.timeOfDay, cadence.timeZone);
      if (utc && Date.parse(utc) > fromMs) {
        occurrences.push(utc);
      }
    }
    cursor += 86_400_000;
  }
  return occurrences;
}

/**
 * 실패 횟수에 따른 다음 재시도 시각을 계산한다. 최대 재시도 횟수를
 * 초과하면 null을 반환해 더 이상 재시도하지 않음을 알린다.
 */
export function computeNextRetryAtUtc(
  failedAtUtc: string,
  attemptCount: number,
): string | null {
  if (attemptCount >= PUBLISH_SCHEDULE_MAX_RETRY_ATTEMPTS) return null;
  const failedMs = Date.parse(failedAtUtc);
  if (Number.isNaN(failedMs)) return null;
  const delayIndex = Math.min(
    attemptCount,
    PUBLISH_SCHEDULE_RETRY_DELAYS_MINUTES.length - 1,
  );
  const delayMinutes = PUBLISH_SCHEDULE_RETRY_DELAYS_MINUTES[delayIndex];
  return new Date(failedMs + delayMinutes * 60_000).toISOString();
}

export type ReservationTransitionEvent =
  | "due"
  | "succeeded"
  | "failed"
  | "retry"
  | "cancel";

/**
 * 예약 상태 머신의 순수 전이 함수. 허용되지 않은 전이는 원래 값을
 * 그대로 반환한다(조용히 무시).
 *
 * - due: scheduled → publishing (발행 시각 도래)
 * - succeeded: publishing → published
 * - failed: publishing → failed, 재시도 예약 또는 종료
 * - retry: failed → scheduled (수동 재시도)
 * - cancel: scheduled/failed → canceled
 */
export function transitionReservation(
  reservation: StudioPublishReservation,
  event: ReservationTransitionEvent,
  now: Date | number = Date.now(),
  lastError: string | null = null,
): StudioPublishReservation {
  const nowIso =
    now instanceof Date ? now.toISOString() : new Date(Number(now)).toISOString();
  switch (event) {
    case "due":
      if (reservation.status !== "scheduled") return reservation;
      return { ...reservation, status: "publishing", updatedAt: nowIso };
    case "succeeded":
      if (reservation.status !== "publishing") return reservation;
      return {
        ...reservation,
        status: "published",
        nextRetryAtUtc: null,
        lastError: null,
        updatedAt: nowIso,
      };
    case "failed": {
      if (reservation.status !== "publishing") return reservation;
      const attemptCount = reservation.attemptCount + 1;
      const nextRetryAtUtc = computeNextRetryAtUtc(nowIso, attemptCount);
      return {
        ...reservation,
        status: "failed",
        attemptCount,
        nextRetryAtUtc,
        lastError,
        updatedAt: nowIso,
      };
    }
    case "retry":
      if (reservation.status !== "failed") return reservation;
      if (reservation.nextRetryAtUtc == null) return reservation;
      return {
        ...reservation,
        status: "scheduled",
        scheduledAtUtc: reservation.nextRetryAtUtc,
        nextRetryAtUtc: null,
        lastError: null,
        updatedAt: nowIso,
      };
    case "cancel":
      if (reservation.status !== "scheduled" && reservation.status !== "failed") {
        return reservation;
      }
      return {
        ...reservation,
        status: "canceled",
        nextRetryAtUtc: null,
        updatedAt: nowIso,
      };
    default:
      return reservation;
  }
}

/**
 * 예약 발행 시각이 도래했는지(아직 scheduled 상태이며 scheduledAtUtc <= now).
 */
export function isReservationDue(
  reservation: Pick<StudioPublishReservation, "status" | "scheduledAtUtc">,
  now: Date | number = Date.now(),
): boolean {
  if (reservation.status !== "scheduled") return false;
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const scheduledMs = Date.parse(reservation.scheduledAtUtc);
  return !Number.isNaN(scheduledMs) && scheduledMs <= nowMs;
}

export type PublishScheduleChecklistItemId =
  | "thumbnail"
  | "metadata"
  | "pages"
  | "episode-status";

export type PublishScheduleChecklistItemStatus = "pass" | "fail" | "warning";

export interface PublishScheduleChecklistItem {
  readonly id: PublishScheduleChecklistItemId;
  readonly status: PublishScheduleChecklistItemStatus;
  readonly detail: string | null;
}

export interface PublishScheduleChecklistInput {
  readonly episodeTitle: string;
  readonly episodeSynopsis: string | null;
  /** 회차 썸네일이 업로드되어 있는지. */
  readonly hasThumbnail: boolean;
  readonly pageCount: number;
  readonly episodeReady: boolean;
}

export interface PublishScheduleChecklistResult {
  readonly items: readonly PublishScheduleChecklistItem[];
  /** 발행 진행 가능 여부 (fail 항목 없음). */
  readonly canSchedule: boolean;
  readonly blockerIds: readonly PublishScheduleChecklistItemId[];
}

/**
 * 발행 전 체크리스트(썸네일·메타데이터)를 평가한다.
 * 썸네일·제목·페이지·회차 준비 상태가 fail이면 예약을 막고,
 * 시놉시스가 없으면 warning으로만 표시한다.
 */
export function evaluatePublishScheduleChecklist(
  input: PublishScheduleChecklistInput,
): PublishScheduleChecklistResult {
  const items: PublishScheduleChecklistItem[] = [
    {
      id: "thumbnail",
      status: input.hasThumbnail ? "pass" : "fail",
      detail: input.hasThumbnail ? null : "회차 썸네일을 등록해 주세요.",
    },
    {
      id: "metadata",
      status: !input.episodeTitle.trim()
        ? "fail"
        : !input.episodeSynopsis || !input.episodeSynopsis.trim()
          ? "warning"
          : "pass",
      detail: !input.episodeTitle.trim()
        ? "회차 제목을 입력해 주세요."
        : !input.episodeSynopsis || !input.episodeSynopsis.trim()
          ? "시놉시스가 비어 있어요. 발행은 가능하지만 권장하지 않아요."
          : null,
    },
    {
      id: "pages",
      status: input.pageCount > 0 ? "pass" : "fail",
      detail: input.pageCount > 0 ? null : "회차에 페이지가 한 장도 없어요.",
    },
    {
      id: "episode-status",
      status: input.episodeReady ? "pass" : "fail",
      detail: input.episodeReady ? null : "회차 상태가 '발행 준비' 가 아니에요.",
    },
  ];
  const blockerIds = items
    .filter((item) => item.status === "fail")
    .map((item) => item.id);
  return { items, canSchedule: blockerIds.length === 0, blockerIds };
}

/**
 * 타임존 기준 로컬 날짜 키("YYYY-MM-DD")를 구한다. 캘린더 셀에 예약을
 * 배치할 때 사용한다.
 */
export function getLocalDateKey(utcIso: string, timeZone: string): string | null {
  if (!isValidIanaTimeZone(timeZone)) return null;
  const instant = new Date(utcIso);
  if (Number.isNaN(instant.getTime())) return null;
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
  return DATE_RE.test(formatted) ? formatted : null;
}

/**
 * 월 달력에 필요한 셀 목록을 만든다. 주의 시작 요일을 월요일(1)로 고정해
 * 한국어 UI 기준 달력을 그린다.
 */
export interface CalendarCell {
  readonly dateKey: string;
  readonly inMonth: boolean;
}

export function buildCalendarCells(year: number, month: number): CalendarCell[] {
  // month: 1-12
  const first = new Date(Date.UTC(year, month - 1, 1));
  // 월요일 시작: 일요일(0) → 6, 그 외 → day-1
  const leading = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: CalendarCell[] = [];
  const cursor = new Date(Date.UTC(year, month - 1, 1 - leading));
  const total = leading + daysInMonth;
  const trailing = (7 - (total % 7)) % 7;
  for (let i = 0; i < total + trailing; i += 1) {
    const key = cursor.toISOString().slice(0, 10);
    cells.push({
      dateKey: key,
      inMonth: cursor.getUTCMonth() === month - 1,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return cells;
}
