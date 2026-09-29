// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  PublishScheduleDialog,
  type PublishScheduleEpisodeOption,
} from "./PublishScheduleDialog";
import { publishScheduleStore } from "./publish-schedule-store";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

beforeEach(() => {
  publishScheduleStore.resetForTests();
  window.localStorage.clear();
});

const EPISODES: PublishScheduleEpisodeOption[] = [
  {
    id: "ep-1",
    episodeNumber: 1,
    title: "프롤로그",
    synopsis: "이야기의 시작",
    pageCount: 12,
    ready: true,
    hasThumbnail: true,
  },
  {
    id: "ep-2",
    episodeNumber: 2,
    title: "제목 없음 회차",
    synopsis: null,
    pageCount: 0,
    ready: false,
    hasThumbnail: false,
  },
];

function futureDateKey(daysAhead: number): string {
  const date = new Date(Date.now() + daysAhead * 86_400_000);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText("회차"), {
    target: { value: "ep-1" },
  });
  fireEvent.change(screen.getByLabelText("발행 날짜"), {
    target: { value: futureDateKey(10) },
  });
  fireEvent.change(screen.getByLabelText("발행 시각"), {
    target: { value: "18:00" },
  });
}

describe("PublishScheduleDialog", () => {
  it("유효한 입력으로 예약을 저장한다", () => {
    const onSaved = vi.fn();
    const onClose = vi.fn();
    render(
      <PublishScheduleDialog
        open
        seriesId="series-1"
        episodes={EPISODES}
        timeZone="Asia/Seoul"
        existingReservations={[]}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fillValidForm();
    fireEvent.click(screen.getByRole("button", { name: "예약 저장" }));

    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    const stored = publishScheduleStore.getSnapshot().reservations;
    expect(stored).toHaveLength(1);
    expect(stored[0]?.episodeTitle).toBe("1화 프롤로그");
  });

  it("과거 시각 예약은 오류를 안내한다", () => {
    render(
      <PublishScheduleDialog
        open
        seriesId="series-1"
        episodes={EPISODES}
        timeZone="Asia/Seoul"
        existingReservations={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("회차"), {
      target: { value: "ep-1" },
    });
    fireEvent.change(screen.getByLabelText("발행 날짜"), {
      target: { value: "2020-01-01" },
    });
    fireEvent.change(screen.getByLabelText("발행 시각"), {
      target: { value: "18:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "예약 저장" }));

    expect(
      screen.getByText("이미 지난 시각에는 예약할 수 없어요."),
    ).toBeTruthy();
    expect(publishScheduleStore.getSnapshot().reservations).toHaveLength(0);
  });

  it("체크리스트 미달 회차는 체크리스트를 보여주고 저장을 막는다", () => {
    render(
      <PublishScheduleDialog
        open
        seriesId="series-1"
        episodes={EPISODES}
        timeZone="Asia/Seoul"
        existingReservations={[]}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("회차"), {
      target: { value: "ep-2" },
    });
    expect(screen.getByText("발행 전 체크리스트")).toBeTruthy();
    expect(screen.getByText("회차 썸네일")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("발행 날짜"), {
      target: { value: futureDateKey(10) },
    });
    fireEvent.change(screen.getByLabelText("발행 시각"), {
      target: { value: "18:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "예약 저장" }));

    expect(publishScheduleStore.getSnapshot().reservations).toHaveLength(0);
  });

  it("충돌 시 경고를 보여주고 '그래도 예약'으로 우회할 수 있다", () => {
    const onSaved = vi.fn();
    const existing = [
      {
        schemaVersion: 1 as const,
        id: "res-existing",
        seriesId: "series-1",
        episodeId: "ep-9",
        episodeTitle: "9화 기존 예약",
        scheduledAtUtc: new Date(Date.now() + 10 * 86_400_000).toISOString(),
        timeZone: "Asia/Seoul",
        status: "scheduled" as const,
        attemptCount: 0,
        nextRetryAtUtc: null,
        lastError: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const existingScheduledAt = existing[0]?.scheduledAtUtc ?? "";
    // 기존 예약과 같은 날짜에 10분 차이로 예약 시도
    const conflictDate = new Date(Date.parse(existingScheduledAt) + 10 * 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const conflictDateKey = `${conflictDate.getFullYear()}-${pad(conflictDate.getMonth() + 1)}-${pad(conflictDate.getDate())}`;
    const conflictTime = `${pad(conflictDate.getHours())}:${pad(conflictDate.getMinutes())}`;

    render(
      <PublishScheduleDialog
        open
        seriesId="series-1"
        episodes={EPISODES}
        timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        existingReservations={existing}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.change(screen.getByLabelText("회차"), {
      target: { value: "ep-1" },
    });
    fireEvent.change(screen.getByLabelText("발행 날짜"), {
      target: { value: conflictDateKey },
    });
    fireEvent.change(screen.getByLabelText("발행 시각"), {
      target: { value: conflictTime },
    });
    fireEvent.click(screen.getByRole("button", { name: "예약 저장" }));

    // 충돌 경고 표시, 저장은 아직 안 됨
    expect(screen.getByRole("button", { name: "그래도 예약" })).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "그래도 예약" }));
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(publishScheduleStore.getSnapshot().reservations).toHaveLength(1);
  });

  it("닫기 버튼과 Escape 키로 닫힌다", () => {
    const onClose = vi.fn();
    render(
      <PublishScheduleDialog
        open
        seriesId="series-1"
        episodes={EPISODES}
        timeZone="Asia/Seoul"
        existingReservations={[]}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "닫기" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
