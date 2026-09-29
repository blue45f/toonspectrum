import { beforeEach, describe, expect, it } from "vitest";

import {
  publishScheduleStore,
  usePublishScheduleStore,
  type CreateReservationInput,
} from "./publish-schedule-store";

/** 테스트 실행 시점 기준 미래 시각을 date/time 문자열로 만든다. */
function futureSlot(offsetMinutes: number, timeZone = "UTC") {
  const at = new Date(Date.now() + offsetMinutes * 60_000);
  const date = at.toISOString().slice(0, 10);
  const time = at.toISOString().slice(11, 16);
  return { date, time, timeZone };
}

const baseInput = (
  overrides: Partial<CreateReservationInput> = {},
): CreateReservationInput => ({
  seriesId: "series-1",
  episodeId: "ep-1",
  episodeTitle: "1화",
  date: "2099-01-01",
  time: "10:00",
  timeZone: "UTC",
  ...overrides,
});

describe("publish-schedule-store", () => {
  beforeEach(() => {
    publishScheduleStore.resetForTests();
  });

  it("미래 예약 생성이 성공하고 스냅샷에 반영된다", () => {
    const slot = futureSlot(120);
    const result = publishScheduleStore.createReservation(baseInput(slot));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.reservation.status).toBe("scheduled");
    expect(result.reservation.seriesId).toBe("series-1");
    expect(publishScheduleStore.getSnapshot().reservations).toHaveLength(1);
  });

  it("잘못된 타임존이면 INVALID_TIMEZONE으로 실패한다", () => {
    const slot = futureSlot(120, "Mars/Olympus");
    const result = publishScheduleStore.createReservation(baseInput(slot));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("INVALID_TIMEZONE");
  });

  it("과거 시각이면 실패한다", () => {
    const slot = futureSlot(-60);
    const result = publishScheduleStore.createReservation(baseInput(slot));
    expect(result.ok).toBe(false);
  });

  it("같은 작품의 30분 이내 예약은 CONFLICT로 막힌다", () => {
    const first = publishScheduleStore.createReservation(
      baseInput({ ...futureSlot(180), episodeId: "ep-1", episodeTitle: "1화" }),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = publishScheduleStore.createReservation(
      baseInput({
        ...futureSlot(195),
        episodeId: "ep-2",
        episodeTitle: "2화",
      }),
    );
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.code).toBe("CONFLICT");
    expect(second.conflictWith).toBe("1화");
  });

  it("다른 작품이면 같은 시각대도 예약 가능하다", () => {
    const first = publishScheduleStore.createReservation(
      baseInput({ ...futureSlot(180), seriesId: "series-1" }),
    );
    expect(first.ok).toBe(true);
    const second = publishScheduleStore.createReservation(
      baseInput({ ...futureSlot(195), seriesId: "series-2" }),
    );
    expect(second.ok).toBe(true);
  });

  it("allowConflict이면 충돌 경고를 건너뛰고 생성한다", () => {
    const first = publishScheduleStore.createReservation(
      baseInput({ ...futureSlot(180) }),
    );
    expect(first.ok).toBe(true);
    const second = publishScheduleStore.createReservation(
      baseInput({ ...futureSlot(190), episodeId: "ep-2", allowConflict: true }),
    );
    expect(second.ok).toBe(true);
  });

  it("예약 시각을 수정하면 상태가 scheduled로 리셋된다", () => {
    const created = publishScheduleStore.createReservation(
      baseInput(futureSlot(180)),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const updated = publishScheduleStore.updateReservation(created.reservation.id, {
      ...futureSlot(300),
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.reservation.status).toBe("scheduled");
    expect(updated.reservation.scheduledAtUtc).not.toBe(
      created.reservation.scheduledAtUtc,
    );
  });

  it("없는 예약 수정은 실패한다", () => {
    const result = publishScheduleStore.updateReservation("nope", {
      ...futureSlot(180),
    });
    expect(result.ok).toBe(false);
  });

  it("예약을 취소하면 canceled가 되고, 다시 취소하면 false", () => {
    const created = publishScheduleStore.createReservation(
      baseInput(futureSlot(180)),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(publishScheduleStore.cancelReservation(created.reservation.id)).toBe(
      true,
    );
    const snapshot = publishScheduleStore.getSnapshot();
    expect(
      snapshot.reservations.find((r) => r.id === created.reservation.id)
        ?.status,
    ).toBe("canceled");
    expect(publishScheduleStore.cancelReservation(created.reservation.id)).toBe(
      false,
    );
  });

  it("없는 예약 취소는 false", () => {
    expect(publishScheduleStore.cancelReservation("nope")).toBe(false);
  });

  it("주간 발행 패턴을 저장·삭제한다", () => {
    expect(
      publishScheduleStore.setCadence("series-1", {
        timesPerWeek: 2,
        weekdays: [1, 4],
        timeOfDay: "10:00",
        timeZone: "UTC",
      }),
    ).toBe(true);
    expect(
      publishScheduleStore.getSnapshot().cadences["series-1"]?.timesPerWeek,
    ).toBe(2);
    publishScheduleStore.removeCadence("series-1");
    expect(publishScheduleStore.getSnapshot().cadences["series-1"]).toBeUndefined();
  });

  it("잘못된 패턴은 저장하지 않는다", () => {
    expect(
      publishScheduleStore.setCadence("series-1", {
        timesPerWeek: 1,
        weekdays: [],
        timeOfDay: "10:00",
        timeZone: "UTC",
      }),
    ).toBe(false);
  });

  it("구독자에게 상태 변경을 알린다", () => {
    let notified = 0;
    const unsubscribe = publishScheduleStore.subscribe(() => {
      notified += 1;
    });
    publishScheduleStore.createReservation(baseInput(futureSlot(180)));
    expect(notified).toBeGreaterThan(0);
    unsubscribe();
    const before = notified;
    publishScheduleStore.createReservation(
      baseInput({ ...futureSlot(400), episodeId: "ep-9" }),
    );
    expect(notified).toBe(before);
  });

  it("도래한 예약을 publishing으로 전이하고 onDue를 호출한다", () => {
    const created = publishScheduleStore.createReservation(
      baseInput(futureSlot(40)),
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const dueAt = new Date(
      Date.parse(created.reservation.scheduledAtUtc) + 60_000,
    );
    const seen: string[] = [];
    const due = publishScheduleStore.collectDueReservations(dueAt, (r) =>
      seen.push(r.id),
    );
    expect(due).toHaveLength(1);
    expect(due[0]?.status).toBe("publishing");
    expect(seen).toEqual([created.reservation.id]);
  });

  it("도래한 예약이 없으면 빈 배열을 반환한다", () => {
    publishScheduleStore.createReservation(baseInput(futureSlot(400)));
    expect(publishScheduleStore.collectDueReservations(new Date())).toEqual(
      [],
    );
  });

  it("usePublishScheduleStore 훅이 현재 스냅샷을 반환한다", () => {
    // 훅 자체는 useSyncExternalStore 래퍼 — getSnapshot과 동일해야 한다
    expect(publishScheduleStore.getSnapshot().reservations).toEqual([]);
    expect(typeof usePublishScheduleStore).toBe("function");
  });
});
