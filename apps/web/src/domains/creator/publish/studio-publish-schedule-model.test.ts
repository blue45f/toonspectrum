import { describe, expect, it } from "vitest";

import {
  buildCalendarCells,
  computeCadenceOccurrences,
  computeNextRetryAtUtc,
  convertLocalToUtc,
  detectScheduleConflicts,
  evaluatePublishScheduleChecklist,
  formatUtcInTimeZone,
  getLocalDateKey,
  isReservationDue,
  isValidIanaTimeZone,
  normalizePublishScheduleCadence,
  transitionReservation,
  validateReservationTime,
  PUBLISH_SCHEDULE_MAX_RETRY_ATTEMPTS,
  PUBLISH_SCHEDULE_MIN_GAP_MINUTES,
  type StudioPublishReservation,
} from "./studio-publish-schedule-model";

function makeReservation(
  overrides: Partial<StudioPublishReservation> = {},
): StudioPublishReservation {
  return {
    schemaVersion: 1,
    id: "res-1",
    seriesId: "series-1",
    episodeId: "ep-1",
    episodeTitle: "1화",
    scheduledAtUtc: "2026-10-05T09:00:00.000Z",
    timeZone: "Asia/Seoul",
    status: "scheduled",
    attemptCount: 0,
    nextRetryAtUtc: null,
    lastError: null,
    createdAt: "2026-09-30T00:00:00.000Z",
    updatedAt: "2026-09-30T00:00:00.000Z",
    ...overrides,
  };
}

describe("isValidIanaTimeZone", () => {
  it("IANA 타임존을 판별한다", () => {
    expect(isValidIanaTimeZone("Asia/Seoul")).toBe(true);
    expect(isValidIanaTimeZone("America/New_York")).toBe(true);
    expect(isValidIanaTimeZone("UTC")).toBe(true);
    expect(isValidIanaTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidIanaTimeZone("")).toBe(false);
    expect(isValidIanaTimeZone(null)).toBe(false);
  });
});

describe("convertLocalToUtc", () => {
  it("Asia/Seoul 기준 로컬 시각을 UTC로 변환한다", () => {
    // 2026-10-01 18:00 KST(UTC+9) → 09:00Z
    expect(convertLocalToUtc("2026-10-01", "18:00", "Asia/Seoul")).toBe(
      "2026-10-01T09:00:00.000Z",
    );
  });

  it("서머타임 적용 지역의 DST 경계에서도 정확히 변환한다", () => {
    // 2026-07-01 12:00 New York(EDT, UTC-4) → 16:00Z
    expect(convertLocalToUtc("2026-07-01", "12:00", "America/New_York")).toBe(
      "2026-07-01T16:00:00.000Z",
    );
    // 2026-01-01 12:00 New York(EST, UTC-5) → 17:00Z
    expect(convertLocalToUtc("2026-01-01", "12:00", "America/New_York")).toBe(
      "2026-01-01T17:00:00.000Z",
    );
  });

  it("잘못된 입력에는 null을 반환한다", () => {
    expect(convertLocalToUtc("2026-02-30", "18:00", "Asia/Seoul")).toBeNull();
    expect(convertLocalToUtc("2026-10-01", "25:00", "Asia/Seoul")).toBeNull();
    expect(convertLocalToUtc("2026-10-01", "18:00", "Invalid/Zone")).toBeNull();
    expect(convertLocalToUtc("not-a-date", "18:00", "Asia/Seoul")).toBeNull();
  });
});

describe("formatUtcInTimeZone", () => {
  it("UTC를 타임존 기준 표기 문자열로 변환한다", () => {
    expect(
      formatUtcInTimeZone("2026-10-01T09:00:00.000Z", "Asia/Seoul", "ko-KR"),
    ).toBe("2026-10-01 18:00");
  });

  it("잘못된 입력에는 null을 반환한다", () => {
    expect(formatUtcInTimeZone("2026-10-01T09:00:00.000Z", "X/Y")).toBeNull();
    expect(formatUtcInTimeZone("not-iso", "Asia/Seoul")).toBeNull();
  });
});

describe("validateReservationTime", () => {
  const now = new Date("2026-09-30T00:00:00.000Z");

  it("유효한 미래 예약을 통과시킨다", () => {
    const result = validateReservationTime("2026-10-05", "18:00", "Asia/Seoul", {
      now,
    });
    expect(result).toEqual({
      ok: true,
      scheduledAtUtc: "2026-10-05T09:00:00.000Z",
    });
  });

  it("과거 시각을 PAST_TIME으로 거부한다", () => {
    const result = validateReservationTime("2026-09-29", "18:00", "Asia/Seoul", {
      now,
    });
    expect(result).toEqual({ ok: false, code: "PAST_TIME" });
  });

  it("리드타임(30분) 이내 예약을 TOO_SOON으로 거부한다", () => {
    const nearNow = new Date("2026-10-05T08:45:00.000Z");
    const result = validateReservationTime("2026-10-05", "18:00", "Asia/Seoul", {
      now: nearNow,
    });
    expect(result).toEqual({ ok: false, code: "TOO_SOON" });
  });

  it("90일을 초과하는 예약을 TOO_FAR로 거부한다", () => {
    const result = validateReservationTime("2027-02-01", "18:00", "Asia/Seoul", {
      now,
    });
    expect(result).toEqual({ ok: false, code: "TOO_FAR" });
  });

  it("잘못된 타임존과 날짜 형식을 구분해 보고한다", () => {
    expect(
      validateReservationTime("2026-10-05", "18:00", "Mars/Olympus", { now }),
    ).toEqual({ ok: false, code: "INVALID_TIMEZONE" });
    expect(
      validateReservationTime("2026-13-40", "18:00", "Asia/Seoul", { now }),
    ).toEqual({ ok: false, code: "INVALID_DATETIME" });
  });
});

describe("detectScheduleConflicts", () => {
  const existing = [
    makeReservation({
      id: "res-a",
      episodeTitle: "2화",
      scheduledAtUtc: "2026-10-05T09:00:00.000Z",
    }),
    makeReservation({
      id: "res-b",
      episodeTitle: "3화",
      scheduledAtUtc: "2026-10-05T10:00:00.000Z",
    }),
    makeReservation({
      id: "res-canceled",
      episodeTitle: "취소된 회차",
      scheduledAtUtc: "2026-10-05T09:10:00.000Z",
      status: "canceled",
    }),
    makeReservation({
      id: "res-other-series",
      seriesId: "series-2",
      episodeTitle: "다른 작품",
      scheduledAtUtc: "2026-10-05T09:10:00.000Z",
    }),
  ];

  it("최소 간격 안의 예약을 충돌로 감지한다", () => {
    const conflicts = detectScheduleConflicts(
      existing,
      { seriesId: "series-1", scheduledAtUtc: "2026-10-05T09:10:00.000Z" },
      PUBLISH_SCHEDULE_MIN_GAP_MINUTES,
    );
    expect(conflicts.map((c) => c.reservationId)).toEqual(["res-a"]);
    expect(conflicts[0]?.gapMinutes).toBeCloseTo(10, 5);
  });

  it("취소된 예약과 다른 작품 예약은 무시한다", () => {
    const conflicts = detectScheduleConflicts(existing, {
      seriesId: "series-1",
      scheduledAtUtc: "2026-10-05T09:10:00.000Z",
    });
    expect(conflicts.some((c) => c.reservationId === "res-canceled")).toBe(false);
    expect(
      conflicts.some((c) => c.reservationId === "res-other-series"),
    ).toBe(false);
  });

  it("간격이 충분하면 충돌이 없다", () => {
    const conflicts = detectScheduleConflicts(existing, {
      seriesId: "series-1",
      scheduledAtUtc: "2026-10-05T12:00:00.000Z",
    });
    expect(conflicts).toEqual([]);
  });

  it("수정 시 자기 자신은 제외한다", () => {
    const conflicts = detectScheduleConflicts(existing, {
      seriesId: "series-1",
      scheduledAtUtc: "2026-10-05T09:00:00.000Z",
      excludeId: "res-a",
    });
    expect(conflicts).toEqual([]);
  });
});

describe("normalizePublishScheduleCadence", () => {
  it("요일을 정규화하고 주 N회를 맞춘다", () => {
    const normalized = normalizePublishScheduleCadence({
      timesPerWeek: 5,
      weekdays: [3, 1, 1, 9, -1],
      timeOfDay: "18:00",
      timeZone: "Asia/Seoul",
    });
    expect(normalized).toEqual({
      timesPerWeek: 2,
      weekdays: [1, 3],
      timeOfDay: "18:00",
      timeZone: "Asia/Seoul",
    });
  });

  it("잘못된 케이던스는 null을 반환한다", () => {
    expect(
      normalizePublishScheduleCadence({
        timesPerWeek: 2,
        weekdays: [],
        timeOfDay: "18:00",
        timeZone: "Asia/Seoul",
      }),
    ).toBeNull();
    expect(
      normalizePublishScheduleCadence({
        timesPerWeek: 2,
        weekdays: [1, 3],
        timeOfDay: "25:00",
        timeZone: "Asia/Seoul",
      }),
    ).toBeNull();
    expect(
      normalizePublishScheduleCadence({
        timesPerWeek: 2,
        weekdays: [1, 3],
        timeOfDay: "18:00",
        timeZone: "Nope/Zone",
      }),
    ).toBeNull();
  });
});

describe("computeCadenceOccurrences", () => {
  it("주간 패턴의 다음 발행 예정 시각을 UTC로 계산한다", () => {
    const cadence = normalizePublishScheduleCadence({
      timesPerWeek: 2,
      weekdays: [1, 4], // 월·목
      timeOfDay: "18:00",
      timeZone: "Asia/Seoul",
    });
    expect(cadence).not.toBeNull();
    if (!cadence) throw new Error("케이던스 정규화 실패");
    // 2026-09-30(수) 00:00Z 기준 → 다음 목요일(10-01), 다음 월요일(10-05)
    const occurrences = computeCadenceOccurrences(
      cadence,
      new Date("2026-09-30T00:00:00.000Z"),
      3,
    );
    expect(occurrences).toEqual([
      "2026-10-01T09:00:00.000Z",
      "2026-10-05T09:00:00.000Z",
      "2026-10-08T09:00:00.000Z",
    ]);
  });

  it("이미 지난 당일 시각은 건너뛴다", () => {
    const cadence = normalizePublishScheduleCadence({
      timesPerWeek: 1,
      weekdays: [3], // 수
      timeOfDay: "09:00",
      timeZone: "Asia/Seoul",
    });
    // 2026-09-30(수) 18:00 KST 이후 → 다음 주 수요일
    if (!cadence) throw new Error("케이던스 정규화 실패");
    const occurrences = computeCadenceOccurrences(
      cadence,
      new Date("2026-09-30T09:00:01.000Z"),
      1,
    );
    expect(occurrences).toEqual(["2026-10-07T00:00:00.000Z"]);
  });
});

describe("computeNextRetryAtUtc", () => {
  it("지수 백오프로 재시도 시각을 계산한다", () => {
    expect(computeNextRetryAtUtc("2026-10-01T09:00:00.000Z", 0)).toBe(
      "2026-10-01T09:05:00.000Z",
    );
    expect(computeNextRetryAtUtc("2026-10-01T09:00:00.000Z", 1)).toBe(
      "2026-10-01T09:15:00.000Z",
    );
    expect(computeNextRetryAtUtc("2026-10-01T09:00:00.000Z", 2)).toBe(
      "2026-10-01T10:00:00.000Z",
    );
  });

  it("최대 재시도 횟수를 초과하면 null을 반환한다", () => {
    expect(
      computeNextRetryAtUtc(
        "2026-10-01T09:00:00.000Z",
        PUBLISH_SCHEDULE_MAX_RETRY_ATTEMPTS,
      ),
    ).toBeNull();
    expect(
      computeNextRetryAtUtc("2026-10-01T09:00:00.000Z", 99),
    ).toBeNull();
  });
});

describe("transitionReservation", () => {
  const now = new Date("2026-10-05T09:00:00.000Z");

  it("scheduled → publishing → published 흐름을 따른다", () => {
    const publishing = transitionReservation(makeReservation(), "due", now);
    expect(publishing.status).toBe("publishing");
    const published = transitionReservation(publishing, "succeeded", now);
    expect(published.status).toBe("published");
    expect(published.nextRetryAtUtc).toBeNull();
  });

  it("실패 시 재시도를 예약하고 횟수를 누적한다", () => {
    const publishing = transitionReservation(makeReservation(), "due", now);
    const failed = transitionReservation(publishing, "failed", now, "NETWORK_ERROR");
    expect(failed.status).toBe("failed");
    expect(failed.attemptCount).toBe(1);
    expect(failed.lastError).toBe("NETWORK_ERROR");
    expect(failed.nextRetryAtUtc).toBe("2026-10-05T09:15:00.000Z");
  });

  it("최대 재시도 초과 시 재시도 예약을 중단한다", () => {
    const exhausted = makeReservation({
      status: "publishing",
      attemptCount: PUBLISH_SCHEDULE_MAX_RETRY_ATTEMPTS - 1,
    });
    const failed = transitionReservation(exhausted, "failed", now, "TIMEOUT");
    expect(failed.status).toBe("failed");
    expect(failed.nextRetryAtUtc).toBeNull();
    // 재시도 시각이 없으면 수동 retry도 무시된다
    expect(transitionReservation(failed, "retry", now).status).toBe("failed");
  });

  it("수동 retry는 다음 재시도 시각으로 예약을 되돌린다", () => {
    const failed = makeReservation({
      status: "failed",
      attemptCount: 1,
      nextRetryAtUtc: "2026-10-05T09:15:00.000Z",
      lastError: "NETWORK_ERROR",
    });
    const retried = transitionReservation(failed, "retry", now);
    expect(retried.status).toBe("scheduled");
    expect(retried.scheduledAtUtc).toBe("2026-10-05T09:15:00.000Z");
    expect(retried.nextRetryAtUtc).toBeNull();
  });

  it("scheduled/failed 예약은 취소할 수 있다", () => {
    expect(
      transitionReservation(makeReservation(), "cancel", now).status,
    ).toBe("canceled");
    expect(
      transitionReservation(
        makeReservation({ status: "failed", nextRetryAtUtc: null }),
        "cancel",
        now,
      ).status,
    ).toBe("canceled");
    // 발행 완료된 예약은 취소 불가
    expect(
      transitionReservation(makeReservation({ status: "published" }), "cancel", now)
        .status,
    ).toBe("published");
  });

  it("허용되지 않은 전이는 원래 상태를 유지한다", () => {
    const reservation = makeReservation();
    expect(transitionReservation(reservation, "succeeded", now)).toBe(reservation);
  });
});

describe("isReservationDue", () => {
  it("발행 시각이 도래한 scheduled 예약만 true를 반환한다", () => {
    const now = new Date("2026-10-05T09:00:00.000Z").getTime();
    expect(isReservationDue(makeReservation(), now)).toBe(true);
    expect(
      isReservationDue(
        makeReservation({ scheduledAtUtc: "2026-10-05T09:00:01.000Z" }),
        now,
      ),
    ).toBe(false);
    expect(isReservationDue(makeReservation({ status: "canceled" }), now)).toBe(
      false,
    );
  });
});

describe("evaluatePublishScheduleChecklist", () => {
  it("모든 항목이 준비되면 예약을 허용한다", () => {
    const result = evaluatePublishScheduleChecklist({
      episodeTitle: "1화",
      episodeSynopsis: "프롤로그",
      hasThumbnail: true,
      pageCount: 12,
      episodeReady: true,
    });
    expect(result.canSchedule).toBe(true);
    expect(result.blockerIds).toEqual([]);
    expect(result.items.every((item) => item.status === "pass")).toBe(true);
  });

  it("썸네일·제목·페이지·준비 상태 미비는 예약을 막는다", () => {
    const result = evaluatePublishScheduleChecklist({
      episodeTitle: "  ",
      episodeSynopsis: null,
      hasThumbnail: false,
      pageCount: 0,
      episodeReady: false,
    });
    expect(result.canSchedule).toBe(false);
    expect(result.blockerIds).toEqual([
      "thumbnail",
      "metadata",
      "pages",
      "episode-status",
    ]);
  });

  it("시놉시스 누락은 경고로만 표시한다", () => {
    const result = evaluatePublishScheduleChecklist({
      episodeTitle: "1화",
      episodeSynopsis: null,
      hasThumbnail: true,
      pageCount: 5,
      episodeReady: true,
    });
    expect(result.canSchedule).toBe(true);
    expect(
      result.items.find((item) => item.id === "metadata")?.status,
    ).toBe("warning");
  });
});

describe("getLocalDateKey", () => {
  it("UTC를 타임존 기준 날짜 키로 변환한다", () => {
    // 2026-10-01T09:00Z → KST 기준 2026-10-01
    expect(getLocalDateKey("2026-10-01T09:00:00.000Z", "Asia/Seoul")).toBe(
      "2026-10-01",
    );
    // 같은 시각도 New York 기준으로는 전날
    expect(
      getLocalDateKey("2026-10-01T02:00:00.000Z", "America/New_York"),
    ).toBe("2026-09-30");
  });

  it("잘못된 입력에는 null을 반환한다", () => {
    expect(getLocalDateKey("2026-10-01T09:00:00.000Z", "X/Y")).toBeNull();
    expect(getLocalDateKey("nope", "Asia/Seoul")).toBeNull();
  });
});

describe("buildCalendarCells", () => {
  it("월요일 시작으로 7의 배수 셀을 만든다", () => {
    const cells = buildCalendarCells(2026, 10);
    expect(cells.length % 7).toBe(0);
    // 2026-10-01은 목요일 → 월요일 시작이므로 3개의 앞 셀
    expect(cells.slice(0, 3).map((c) => c.dateKey)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
    ]);
    expect(cells[3]).toEqual({ dateKey: "2026-10-01", inMonth: true });
    expect(cells.filter((c) => c.inMonth).length).toBe(31);
    expect(cells[cells.length - 1]?.dateKey).toBe("2026-11-01");
  });
});
