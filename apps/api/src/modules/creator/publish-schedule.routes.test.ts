import { describe, expect, it } from "vitest";

import { createPublishScheduleRouter } from "./publish-schedule.routes";
import { PublishScheduleService } from "./publish-schedule.service";

const NOW = Date.parse("2026-09-30T00:00:00.000Z");

function makeRouter() {
  let idCounter = 0;
  const service = new PublishScheduleService({
    now: () => NOW,
    createId: () => {
      idCounter += 1;
      return `route-res-${idCounter}`;
    },
  });
  return createPublishScheduleRouter(service);
}

function payload(overrides = {}) {
  return {
    seriesId: "series-1",
    episodeId: "ep-1",
    episodeTitle: "1화",
    scheduledAtUtc: "2026-10-05T09:00:00.000Z",
    timeZone: "Asia/Seoul",
    ...overrides,
  };
}

describe("publish-schedule routes", () => {
  it("예약 생성 → 조회 → 수정 → 취소 흐름을 처리한다", () => {
    const router = makeRouter();

    const created = router.handleRequest({
      method: "POST",
      path: "/api/publish-schedules",
      body: payload(),
    });
    expect(created.status).toBe(201);
    const createdBody = created.body as { ok: boolean; data: { id: string } };
    expect(createdBody.ok).toBe(true);
    const id = createdBody.data.id;

    const listed = router.handleRequest({
      method: "GET",
      path: "/api/publish-schedules",
      query: { seriesId: "series-1" },
    });
    expect(listed.status).toBe(200);
    expect(
      (listed.body as { data: unknown[] }).data,
    ).toHaveLength(1);

    const updated = router.handleRequest({
      method: "PATCH",
      path: `/api/publish-schedules/${id}`,
      body: { scheduledAtUtc: "2026-10-06T09:00:00.000Z", timeZone: "Asia/Seoul" },
    });
    expect(updated.status).toBe(200);
    expect(
      (updated.body as { data: { scheduledAtUtc: string } }).data.scheduledAtUtc,
    ).toBe("2026-10-06T09:00:00.000Z");

    const canceled = router.handleRequest({
      method: "DELETE",
      path: `/api/publish-schedules/${id}`,
    });
    expect(canceled.status).toBe(200);
    expect(
      (canceled.body as { data: { status: string } }).data.status,
    ).toBe("canceled");
  });

  it("잘못된 입력은 상태 코드와 함께 오류 본문을 반환한다", () => {
    const router = makeRouter();

    const past = router.handleRequest({
      method: "POST",
      path: "/api/publish-schedules",
      body: payload({ scheduledAtUtc: "2026-09-29T09:00:00.000Z" }),
    });
    expect(past.status).toBe(422);
    expect(past.body).toMatchObject({ ok: false, code: "PAST_TIME" });

    const missing = router.handleRequest({
      method: "GET",
      path: "/api/publish-schedules/no-such-id",
    });
    expect(missing.status).toBe(404);
    expect(missing.body).toMatchObject({ ok: false, code: "NOT_FOUND" });

    const unknown = router.handleRequest({
      method: "GET",
      path: "/api/publish-schedules/abc/def/ghi",
    });
    expect(unknown.status).toBe(404);
  });

  it("충돌은 409로 보고한다", () => {
    const router = makeRouter();
    expect(
      router.handleRequest({
        method: "POST",
        path: "/api/publish-schedules",
        body: payload(),
      }).status,
    ).toBe(201);
    const conflict = router.handleRequest({
      method: "POST",
      path: "/api/publish-schedules",
      body: payload({
        episodeId: "ep-2",
        episodeTitle: "2화",
        scheduledAtUtc: "2026-10-05T09:10:00.000Z",
      }),
    });
    expect(conflict.status).toBe(409);
    expect(conflict.body).toMatchObject({ ok: false, code: "CONFLICT" });
  });

  it("큐 워커용 엔드포인트가 도래분 수집과 결과 기록을 처리한다", () => {
    let now = NOW;
    const service = new PublishScheduleService({ now: () => now });
    const router = createPublishScheduleRouter(service);

    const created = router.handleRequest({
      method: "POST",
      path: "/api/publish-schedules",
      body: payload(),
    });
    const id = (created.body as { data: { id: string } }).data.id;

    now = Date.parse("2026-10-05T09:00:00.000Z");
    const collected = router.handleRequest({
      method: "POST",
      path: "/api/publish-schedules/queue/collect-due",
    });
    expect(collected.status).toBe(200);
    expect((collected.body as { data: unknown[] }).data).toHaveLength(1);

    const published = router.handleRequest({
      method: "POST",
      path: `/api/publish-schedules/${id}/mark-published`,
    });
    expect(published.status).toBe(200);
    expect(
      (published.body as { data: { status: string } }).data.status,
    ).toBe("published");
  });

  it("실패 기록 후 재시도 엔드포인트가 예약을 되돌린다", () => {
    let now = NOW;
    const service = new PublishScheduleService({ now: () => now });
    const router = createPublishScheduleRouter(service);

    const created = router.handleRequest({
      method: "POST",
      path: "/api/publish-schedules",
      body: payload(),
    });
    const id = (created.body as { data: { id: string } }).data.id;

    now = Date.parse("2026-10-05T09:00:00.000Z");
    router.handleRequest({
      method: "POST",
      path: "/api/publish-schedules/queue/collect-due",
    });
    const failed = router.handleRequest({
      method: "POST",
      path: `/api/publish-schedules/${id}/mark-failed`,
      body: { error: "NETWORK_TIMEOUT" },
    });
    expect(failed.status).toBe(200);
    const failedData = (failed.body as { data: { status: string; nextRetryAtUtc: string } }).data;
    expect(failedData.status).toBe("failed");
    expect(failedData.nextRetryAtUtc).toBe("2026-10-05T09:15:00.000Z");

    const retried = router.handleRequest({
      method: "POST",
      path: `/api/publish-schedules/${id}/retry`,
    });
    expect(retried.status).toBe(200);
    expect(
      (retried.body as { data: { status: string } }).data.status,
    ).toBe("scheduled");
  });
});
