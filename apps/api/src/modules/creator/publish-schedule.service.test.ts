import { describe, expect, it } from "vitest";

import {
  PublishScheduleError,
  PublishScheduleService,
} from "./publish-schedule.service";

const NOW = Date.parse("2026-09-30T00:00:00.000Z");

function makeService() {
  let idCounter = 0;
  return new PublishScheduleService({
    now: () => NOW,
    createId: () => {
      idCounter += 1;
      return `test-res-${idCounter}`;
    },
  });
}

function validInput(overrides = {}) {
  return {
    seriesId: "series-1",
    episodeId: "ep-1",
    episodeTitle: "1화",
    scheduledAtUtc: "2026-10-05T09:00:00.000Z",
    timeZone: "Asia/Seoul",
    ...overrides,
  };
}

describe("PublishScheduleService.create", () => {
  it("유효한 예약을 생성한다", () => {
    const service = makeService();
    const reservation = service.create(validInput());
    expect(reservation.id).toBe("test-res-1");
    expect(reservation.status).toBe("scheduled");
    expect(reservation.attemptCount).toBe(0);
    expect(reservation.scheduledAtUtc).toBe("2026-10-05T09:00:00.000Z");
  });

  it("과거·너무 임박·너무 먼 예약과 잘못된 타임존을 거부한다", () => {
    const service = makeService();
    expect(() =>
      service.create(validInput({ scheduledAtUtc: "2026-09-29T09:00:00Z" })),
    ).toThrowError(PublishScheduleError);
    try {
      service.create(validInput({ scheduledAtUtc: "2026-09-29T09:00:00Z" }));
    } catch (error) {
      expect((error as PublishScheduleError).code).toBe("PAST_TIME");
      expect((error as PublishScheduleError).status).toBe(422);
    }
    expect(() =>
      service.create(
        validInput({ scheduledAtUtc: "2026-09-30T00:10:00.000Z" }),
      ),
    ).toThrowError(/30분/);
    expect(() =>
      service.create(validInput({ scheduledAtUtc: "2027-06-01T09:00:00Z" })),
    ).toThrowError(/90일/);
    expect(() =>
      service.create(validInput({ timeZone: "Mars/Olympus" })),
    ).toThrowError(/타임존/);
    expect(() =>
      service.create(validInput({ scheduledAtUtc: "내일 6시" })),
    ).toThrowError(/ISO 8601/);
  });

  it("같은 작품의 근접 예약을 409 충돌로 거부한다", () => {
    const service = makeService();
    service.create(validInput());
    try {
      service.create(
        validInput({
          episodeId: "ep-2",
          episodeTitle: "2화",
          scheduledAtUtc: "2026-10-05T09:10:00.000Z",
        }),
      );
      expect.unreachable();
    } catch (error) {
      const typed = error as PublishScheduleError;
      expect(typed.status).toBe(409);
      expect(typed.code).toBe("CONFLICT");
    }
    // allowConflict면 통과
    const forced = service.create(
      validInput({
        episodeId: "ep-2",
        episodeTitle: "2화",
        scheduledAtUtc: "2026-10-05T09:10:00.000Z",
        allowConflict: true,
      }),
    );
    expect(forced.id).toBe("test-res-2");
    // 다른 작품은 충돌하지 않음
    const other = service.create(
      validInput({
        seriesId: "series-2",
        scheduledAtUtc: "2026-10-05T09:10:00.000Z",
      }),
    );
    expect(other.seriesId).toBe("series-2");
  });
});

describe("PublishScheduleService.update/cancel/retry", () => {
  it("예약을 수정하고 충돌을 검사한다", () => {
    const service = makeService();
    const first = service.create(validInput());
    service.create(
      validInput({
        episodeId: "ep-2",
        episodeTitle: "2화",
        scheduledAtUtc: "2026-10-06T09:00:00.000Z",
      }),
    );
    const updated = service.update(first.id, {
      scheduledAtUtc: "2026-10-07T09:00:00.000Z",
      timeZone: "Asia/Seoul",
    });
    expect(updated.scheduledAtUtc).toBe("2026-10-07T09:00:00.000Z");
    expect(() =>
      service.update(first.id, {
        scheduledAtUtc: "2026-10-06T09:10:00.000Z",
        timeZone: "Asia/Seoul",
      }),
    ).toThrowError(PublishScheduleError);
  });

  it("예약을 취소한다", () => {
    const service = makeService();
    const reservation = service.create(validInput());
    const canceled = service.cancel(reservation.id);
    expect(canceled.status).toBe("canceled");
    // 취소된 예약은 더 이상 충돌 대상이 아님
    const next = service.create(
      validInput({
        episodeId: "ep-2",
        episodeTitle: "2화",
        scheduledAtUtc: "2026-10-05T09:10:00.000Z",
      }),
    );
    expect(next.status).toBe("scheduled");
  });

  it("없는 예약은 404를 반환한다", () => {
    const service = makeService();
    try {
      service.cancel("no-such-id");
      expect.unreachable();
    } catch (error) {
      expect((error as PublishScheduleError).status).toBe(404);
      expect((error as PublishScheduleError).code).toBe("NOT_FOUND");
    }
  });

  it("발행 완료된 예약은 수정·취소할 수 없다", () => {
    let now = NOW;
    const service = new PublishScheduleService({ now: () => now });
    const reservation = service.create(validInput());
    now = Date.parse("2026-10-05T09:00:00.000Z");
    expect(service.collectDue()).toHaveLength(1);
    service.markPublished(reservation.id);
    expect(() =>
      service.update(reservation.id, {
        scheduledAtUtc: "2026-10-08T09:00:00.000Z",
        timeZone: "Asia/Seoul",
      }),
    ).toThrowError(/예약만 수정할 수 있어요/);
    expect(() => service.cancel(reservation.id)).toThrowError(/예약만 취소할 수 있어요/);
  });
});

describe("PublishScheduleService queue", () => {
  it("도래한 예약을 수집하고 발행 성공/실패를 기록한다", () => {
    let now = NOW;
    const service = new PublishScheduleService({ now: () => now });
    const reservation = service.create(validInput());

    // 아직 도래 전
    expect(service.collectDue()).toEqual([]);

    // 발행 시각 도래
    now = Date.parse("2026-10-05T09:00:00.000Z");
    const due = service.collectDue();
    expect(due).toHaveLength(1);
    expect(due[0]?.status).toBe("publishing");

    // 실패 → 15분 후 재시도 예약
    const failed = service.markFailed(reservation.id, "NETWORK_TIMEOUT");
    expect(failed.status).toBe("failed");
    expect(failed.attemptCount).toBe(1);
    expect(failed.nextRetryAtUtc).toBe("2026-10-05T09:15:00.000Z");
    expect(failed.lastError).toBe("NETWORK_TIMEOUT");

    // 수동 재시도 → 다음 재시도 시각으로 scheduled
    const retried = service.retry(reservation.id);
    expect(retried.status).toBe("scheduled");
    expect(retried.scheduledAtUtc).toBe("2026-10-05T09:15:00.000Z");
  });

  it("최대 재시도를 초과하면 재시도를 중단한다", () => {
    let now = NOW;
    const service = new PublishScheduleService({ now: () => now });
    const reservation = service.create(validInput());
    now = Date.parse("2026-10-05T09:00:00.000Z");

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const due = service.collectDue();
      expect(due).toHaveLength(1);
      const failed = service.markFailed(reservation.id, `ERROR_${attempt}`);
      if (attempt < 5) {
        const nextRetry = failed.nextRetryAtUtc;
        expect(nextRetry).not.toBeNull();
        service.retry(reservation.id);
        if (nextRetry) now = Date.parse(nextRetry) + 60_000;
      }
    }
    const failed = service.get(reservation.id);
    expect(failed.status).toBe("failed");
    expect(failed.attemptCount).toBe(5);
    expect(failed.nextRetryAtUtc).toBeNull();
    expect(() => service.retry(reservation.id)).toThrowError(/재시도 가능/);
  });

  it("list는 작품별 필터와 시간순 정렬을 제공한다", () => {
    const service = makeService();
    service.create(
      validInput({ scheduledAtUtc: "2026-10-07T09:00:00.000Z" }),
    );
    service.create(
      validInput({
        episodeId: "ep-2",
        episodeTitle: "2화",
        scheduledAtUtc: "2026-10-05T09:00:00.000Z",
      }),
    );
    service.create(
      validInput({
        seriesId: "series-2",
        scheduledAtUtc: "2026-10-06T09:00:00.000Z",
      }),
    );
    const mine = service.list("series-1");
    expect(mine.map((r) => r.episodeTitle)).toEqual(["2화", "1화"]);
    expect(service.list()).toHaveLength(3);
  });
});
