// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublishScheduleCalendar } from "./PublishScheduleCalendar";
import type { StudioPublishReservation } from "./studio-publish-schedule-model";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function makeReservation(
  overrides: Partial<StudioPublishReservation> = {},
): StudioPublishReservation {
  return {
    schemaVersion: 1,
    id: "res-1",
    seriesId: "series-1",
    episodeId: "ep-1",
    episodeTitle: "1화 프롤로그",
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

describe("PublishScheduleCalendar", () => {
  it("월간 그리드를 그리고 예약이 있는 날짜를 표시한다", () => {
    const reservations = [
      makeReservation(),
      makeReservation({
        id: "res-2",
        episodeTitle: "2화",
        scheduledAtUtc: "2026-10-05T12:00:00.000Z",
        status: "failed",
      }),
    ];
    render(
      <PublishScheduleCalendar
        reservations={reservations}
        timeZone="Asia/Seoul"
        selectedDate={null}
        onSelectDate={vi.fn()}
        initialYear={2026}
        initialMonth={10}
      />,
    );

    // 2026-10-05 셀에 예약 2건 표시
    expect(
      screen.getByRole("gridcell", { name: /2026-10-05, 예약 2건/ }),
    ).toBeTruthy();
    // 예약 없는 날짜
    expect(
      screen.getByRole("gridcell", { name: /2026-10-06, 예약 0건/ }),
    ).toBeTruthy();
  });

  it("날짜를 클릭하면 onSelectDate가 호출되고 해당 일 예약 목록이 보인다", () => {
    const onSelectDate = vi.fn();
    const onSelectReservation = vi.fn();
    const { rerender } = render(
      <PublishScheduleCalendar
        reservations={[makeReservation()]}
        timeZone="Asia/Seoul"
        selectedDate={null}
        onSelectDate={onSelectDate}
        onSelectReservation={onSelectReservation}
        initialYear={2026}
        initialMonth={10}
      />,
    );

    fireEvent.click(screen.getByRole("gridcell", { name: /2026-10-05/ }));
    expect(onSelectDate).toHaveBeenCalledWith("2026-10-05");

    rerender(
      <PublishScheduleCalendar
        reservations={[makeReservation()]}
        timeZone="Asia/Seoul"
        selectedDate="2026-10-05"
        onSelectDate={onSelectDate}
        onSelectReservation={onSelectReservation}
        initialYear={2026}
        initialMonth={10}
      />,
    );
    expect(screen.getByText("1화 프롤로그")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /1화 프롤로그 예약 상세/ }));
    expect(onSelectReservation).toHaveBeenCalledTimes(1);
  });

  it("예약 타임존 기준으로 날짜 셀에 배치한다", () => {
    // 2026-10-01T02:00Z → KST 기준 2026-10-01 11:00
    const reservations = [
      makeReservation({ scheduledAtUtc: "2026-10-01T02:00:00.000Z" }),
    ];
    render(
      <PublishScheduleCalendar
        reservations={reservations}
        timeZone="Asia/Seoul"
        selectedDate={null}
        onSelectDate={vi.fn()}
        initialYear={2026}
        initialMonth={10}
      />,
    );
    expect(
      screen.getByRole("gridcell", { name: /2026-10-01, 예약 1건/ }),
    ).toBeTruthy();
  });

  it("이전/다음 달로 이동할 수 있다", () => {
    render(
      <PublishScheduleCalendar
        reservations={[]}
        selectedDate={null}
        onSelectDate={vi.fn()}
        initialYear={2026}
        initialMonth={10}
      />,
    );
    expect(screen.getByText("2026년 10월")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다음 달" }));
    expect(screen.getByText("2026년 11월")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "이전 달" }));
    fireEvent.click(screen.getByRole("button", { name: "이전 달" }));
    expect(screen.getByText("2026년 9월")).toBeTruthy();
  });
});
