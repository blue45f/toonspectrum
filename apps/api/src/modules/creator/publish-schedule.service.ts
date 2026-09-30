/**
 * 연재 예약 발행 스케줄러 — API 서비스.
 *
 * 예약 생성/수정/취소/재시도와 발행 시각 도래분의 큐 처리를 담당하는
 * 프레임워크 중립 서비스다. NestJS 컨트롤러(`publish-schedule.controller`)가
 * 이 서비스를 감싸 HTTP 엔드포인트로 노출한다. 시간 규칙은 웹 클라이언트의
 * `studio-publish-schedule-model`과 동일한 정의를 사용한다.
 */

export type PublishScheduleReservationStatus =
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "canceled";

export interface PublishScheduleReservation {
  readonly id: string;
  readonly seriesId: string;
  readonly episodeId: string;
  readonly episodeTitle: string;
  /** 예약 발행 시각 (UTC ISO 8601). */
  readonly scheduledAtUtc: string;
  /** 예약 입력에 사용된 IANA 타임존. */
  readonly timeZone: string;
  readonly status: PublishScheduleReservationStatus;
  readonly attemptCount: number;
  readonly nextRetryAtUtc: string | null;
  readonly lastError: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreatePublishScheduleInput {
  readonly seriesId: string;
  readonly episodeId: string;
  readonly episodeTitle: string;
  /** 예약 발행 시각 (UTC ISO 8601). */
  readonly scheduledAtUtc: string;
  readonly timeZone: string;
  readonly allowConflict?: boolean;
}

export interface UpdatePublishScheduleInput {
  readonly scheduledAtUtc: string;
  readonly timeZone: string;
  readonly allowConflict?: boolean;
}

export type PublishScheduleErrorCode =
  | "INVALID_INPUT"
  | "INVALID_TIMEZONE"
  | "INVALID_DATETIME"
  | "PAST_TIME"
  | "TOO_SOON"
  | "TOO_FAR"
  | "CONFLICT"
  | "NOT_FOUND"
  | "INVALID_STATE";

/** 서비스 오류: status로 HTTP 상태 코드를 전달한다. */
export class PublishScheduleError extends Error {
  readonly status: 400 | 404 | 409 | 422;
  readonly code: PublishScheduleErrorCode;

  constructor(
    status: 400 | 404 | 409 | 422,
    code: PublishScheduleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PublishScheduleError";
    this.status = status;
    this.code = code;
  }
}

export const PUBLISH_SCHEDULE_MIN_LEAD_MINUTES = 30;
export const PUBLISH_SCHEDULE_MAX_HORIZON_DAYS = 90;
export const PUBLISH_SCHEDULE_MIN_GAP_MINUTES = 30;
export const PUBLISH_SCHEDULE_MAX_RETRY_ATTEMPTS = 5;
const RETRY_DELAYS_MINUTES = [5, 15, 60, 360, 1440];

const DATE_TIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:?\d{2})?$/u;

export function isValidIanaTimeZoneApi(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== "string" || !timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function parseScheduledAtUtc(value: unknown): string {
  const text = cleanText(value, 64);
  if (!text || !DATE_TIME_RE.test(text)) {
    throw new PublishScheduleError(
      400,
      "INVALID_DATETIME",
      "예약 시각은 ISO 8601 형식이어야 해요.",
    );
  }
  const ms = Date.parse(text);
  if (Number.isNaN(ms)) {
    throw new PublishScheduleError(
      400,
      "INVALID_DATETIME",
      "예약 시각을 해석할 수 없어요.",
    );
  }
  return new Date(ms).toISOString();
}

function assertScheduleWindow(scheduledMs: number, nowMs: number): void {
  if (scheduledMs <= nowMs) {
    throw new PublishScheduleError(422, "PAST_TIME", "이미 지난 시각에는 예약할 수 없어요.");
  }
  if (scheduledMs - nowMs < PUBLISH_SCHEDULE_MIN_LEAD_MINUTES * 60_000) {
    throw new PublishScheduleError(
      422,
      "TOO_SOON",
      `발행 ${PUBLISH_SCHEDULE_MIN_LEAD_MINUTES}분 전까지만 예약할 수 있어요.`,
    );
  }
  if (scheduledMs - nowMs > PUBLISH_SCHEDULE_MAX_HORIZON_DAYS * 86_400_000) {
    throw new PublishScheduleError(
      422,
      "TOO_FAR",
      `발행 ${PUBLISH_SCHEDULE_MAX_HORIZON_DAYS}일 이내의 날짜만 예약할 수 있어요.`,
    );
  }
}

function assertNoConflict(
  reservations: Map<string, PublishScheduleReservation>,
  seriesId: string,
  scheduledAtUtc: string,
  excludeId?: string,
): void {
  const candidateMs = Date.parse(scheduledAtUtc);
  const minGapMs = PUBLISH_SCHEDULE_MIN_GAP_MINUTES * 60_000;
  for (const reservation of reservations.values()) {
    if (reservation.id === excludeId) continue;
    if (reservation.seriesId !== seriesId) continue;
    if (reservation.status === "canceled") continue;
    if (Math.abs(Date.parse(reservation.scheduledAtUtc) - candidateMs) < minGapMs) {
      throw new PublishScheduleError(
        409,
        "CONFLICT",
        `같은 작품의 다른 예약(${reservation.episodeTitle})과 시간이 겹쳐요.`,
      );
    }
  }
}

function computeNextRetryAtUtc(failedAtIso: string, attemptCount: number): string | null {
  if (attemptCount >= PUBLISH_SCHEDULE_MAX_RETRY_ATTEMPTS) return null;
  const delayMinutes =
    RETRY_DELAYS_MINUTES[Math.min(attemptCount, RETRY_DELAYS_MINUTES.length - 1)] ??
    1440;
  return new Date(Date.parse(failedAtIso) + delayMinutes * 60_000).toISOString();
}

export interface PublishScheduleServiceOptions {
  readonly now?: () => number;
  readonly createId?: () => string;
}

let serviceIdCounter = 0;
function defaultCreateId(): string {
  serviceIdCounter += 1;
  return `psched-${Date.now().toString(36)}-${serviceIdCounter}`;
}

/**
 * 예약 발행 스케줄 서비스. 인메모리 저장소를 사용하며, now/createId를
 * 주입받아 테스트에서 시간을 고정할 수 있다.
 */
export class PublishScheduleService {
  private readonly reservations = new Map<string, PublishScheduleReservation>();
  private readonly now: () => number;
  private readonly createId: () => string;

  constructor(options: PublishScheduleServiceOptions = {}) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? defaultCreateId;
  }

  private nowIso(): string {
    return new Date(this.now()).toISOString();
  }

  create(input: CreatePublishScheduleInput): PublishScheduleReservation {
    const seriesId = cleanText(input.seriesId, 200);
    const episodeId = cleanText(input.episodeId, 200);
    const episodeTitle = cleanText(input.episodeTitle, 300);
    if (!seriesId || !episodeId || !episodeTitle) {
      throw new PublishScheduleError(
        400,
        "INVALID_INPUT",
        "작품·회차·제목은 필수예요.",
      );
    }
    if (!isValidIanaTimeZoneApi(input.timeZone)) {
      throw new PublishScheduleError(400, "INVALID_TIMEZONE", "타임존을 확인해 주세요.");
    }
    const scheduledAtUtc = parseScheduledAtUtc(input.scheduledAtUtc);
    assertScheduleWindow(Date.parse(scheduledAtUtc), this.now());
    if (!input.allowConflict) {
      assertNoConflict(this.reservations, seriesId, scheduledAtUtc);
    }
    const nowIso = this.nowIso();
    const reservation: PublishScheduleReservation = {
      id: this.createId(),
      seriesId,
      episodeId,
      episodeTitle,
      scheduledAtUtc,
      timeZone: input.timeZone,
      status: "scheduled",
      attemptCount: 0,
      nextRetryAtUtc: null,
      lastError: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    this.reservations.set(reservation.id, reservation);
    return reservation;
  }

  get(id: string): PublishScheduleReservation {
    const reservation = this.reservations.get(id);
    if (!reservation) {
      throw new PublishScheduleError(404, "NOT_FOUND", "예약을 찾을 수 없어요.");
    }
    return reservation;
  }

  list(seriesId?: string): PublishScheduleReservation[] {
    const all = [...this.reservations.values()];
    const filtered =
      seriesId != null && seriesId !== ""
        ? all.filter((r) => r.seriesId === seriesId)
        : all;
    return filtered.sort((a, b) =>
      a.scheduledAtUtc < b.scheduledAtUtc
        ? -1
        : a.scheduledAtUtc > b.scheduledAtUtc
          ? 1
          : 0,
    );
  }

  update(id: string, input: UpdatePublishScheduleInput): PublishScheduleReservation {
    const target = this.get(id);
    if (target.status !== "scheduled" && target.status !== "failed") {
      throw new PublishScheduleError(
        422,
        "INVALID_STATE",
        "예약됨 또는 실패 상태의 예약만 수정할 수 있어요.",
      );
    }
    if (!isValidIanaTimeZoneApi(input.timeZone)) {
      throw new PublishScheduleError(400, "INVALID_TIMEZONE", "타임존을 확인해 주세요.");
    }
    const scheduledAtUtc = parseScheduledAtUtc(input.scheduledAtUtc);
    assertScheduleWindow(Date.parse(scheduledAtUtc), this.now());
    if (!input.allowConflict) {
      assertNoConflict(this.reservations, target.seriesId, scheduledAtUtc, id);
    }
    const updated: PublishScheduleReservation = {
      ...target,
      scheduledAtUtc,
      timeZone: input.timeZone,
      status: "scheduled",
      nextRetryAtUtc: null,
      lastError: null,
      updatedAt: this.nowIso(),
    };
    this.reservations.set(id, updated);
    return updated;
  }

  cancel(id: string): PublishScheduleReservation {
    const target = this.get(id);
    if (target.status !== "scheduled" && target.status !== "failed") {
      throw new PublishScheduleError(
        422,
        "INVALID_STATE",
        "예약됨 또는 실패 상태의 예약만 취소할 수 있어요.",
      );
    }
    const canceled: PublishScheduleReservation = {
      ...target,
      status: "canceled",
      nextRetryAtUtc: null,
      updatedAt: this.nowIso(),
    };
    this.reservations.set(id, canceled);
    return canceled;
  }

  /** 실패한 예약을 다음 재시도 시각으로 되돌린다. */
  retry(id: string): PublishScheduleReservation {
    const target = this.get(id);
    if (target.status !== "failed" || target.nextRetryAtUtc == null) {
      throw new PublishScheduleError(
        422,
        "INVALID_STATE",
        "재시도 가능한 실패 예약이 아니에요.",
      );
    }
    const retried: PublishScheduleReservation = {
      ...target,
      status: "scheduled",
      scheduledAtUtc: target.nextRetryAtUtc,
      nextRetryAtUtc: null,
      lastError: null,
      updatedAt: this.nowIso(),
    };
    this.reservations.set(id, retried);
    return retried;
  }

  /**
   * 발행 시각이 도래한 예약을 publishing으로 전이한다.
   * 실제 발행 실행은 호출자(스케줄러 워커)가 onDue에서 처리한다.
   */
  collectDue(onDue?: (reservation: PublishScheduleReservation) => void): PublishScheduleReservation[] {
    const nowMs = this.now();
    const nowIso = this.nowIso();
    const due: PublishScheduleReservation[] = [];
    for (const reservation of this.reservations.values()) {
      if (
        reservation.status === "scheduled" &&
        Date.parse(reservation.scheduledAtUtc) <= nowMs
      ) {
        const publishing: PublishScheduleReservation = {
          ...reservation,
          status: "publishing",
          updatedAt: nowIso,
        };
        this.reservations.set(reservation.id, publishing);
        due.push(publishing);
      }
    }
    for (const reservation of due) onDue?.(reservation);
    return due;
  }

  /** 발행 성공을 기록한다. */
  markPublished(id: string): PublishScheduleReservation {
    const target = this.get(id);
    if (target.status !== "publishing") {
      throw new PublishScheduleError(
        422,
        "INVALID_STATE",
        "발행 중인 예약만 완료 처리할 수 있어요.",
      );
    }
    const published: PublishScheduleReservation = {
      ...target,
      status: "published",
      nextRetryAtUtc: null,
      lastError: null,
      updatedAt: this.nowIso(),
    };
    this.reservations.set(id, published);
    return published;
  }

  /** 발행 실패를 기록하고 재시도를 예약한다(최대 횟수 초과 시 종료). */
  markFailed(id: string, errorMessage: string): PublishScheduleReservation {
    const target = this.get(id);
    if (target.status !== "publishing") {
      throw new PublishScheduleError(
        422,
        "INVALID_STATE",
        "발행 중인 예약만 실패 처리할 수 있어요.",
      );
    }
    const nowIso = this.nowIso();
    const attemptCount = target.attemptCount + 1;
    const failed: PublishScheduleReservation = {
      ...target,
      status: "failed",
      attemptCount,
      nextRetryAtUtc: computeNextRetryAtUtc(nowIso, attemptCount),
      lastError: cleanText(errorMessage, 500) || "알 수 없는 오류",
      updatedAt: nowIso,
    };
    this.reservations.set(id, failed);
    return failed;
  }
}
