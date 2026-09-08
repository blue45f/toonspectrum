// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NowPage } from "./NowPage";
import {
  createEmptyNowState,
  DAILY_THEMES,
  getKstDay,
  getThemeForDay,
  NOW_PROGRESS_STEPS,
  NOW_STORAGE_KEY,
  parseNowState,
} from "./now";

const clipboardWrite = vi.fn(async (_text: string): Promise<void> => undefined);

function renderPage(initialEntry = "/now") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <NowPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  clipboardWrite.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal(
    "navigator",
    Object.assign(Object.create(navigator), {
      clipboard: { writeText: clipboardWrite },
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("daily inspiration dashboard", () => {
  it("renders today's full creation loop and opens a recent archived prompt", () => {
    const today = getKstDay();
    const yesterday = getKstDay(new Date(), 1);
    renderPage();

    expect(screen.getByRole("heading", { name: getThemeForDay(today).title })).toBeTruthy();
    expect(screen.getByRole("group", { name: "연출 모드" })).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByRole("heading", { name: /5컷 비트 보드/u })).toBeTruthy();

    const archive = within(screen.getByLabelText("최근 14일 영감"));
    expect(archive.getAllByRole("button")).toHaveLength(DAILY_THEMES.length);
    fireEvent.click(archive.getAllByRole("button")[1]!);

    expect(screen.getByRole("heading", { name: getThemeForDay(yesterday).title })).toBeTruthy();
    expect(screen.getByRole("button", { name: "오늘로 돌아가기" })).toBeTruthy();
    expect(screen.getByText(`기준일: ${yesterday.iso}`, { exact: false })).toBeTruthy();
  });

  it("opens a dated inspiration from the URL and copies a stable share link", async () => {
    const archivedDay = getKstDay(new Date(), 4);
    renderPage(`/now?day=${archivedDay.iso}`);

    expect(screen.getByRole("heading", { name: getThemeForDay(archivedDay).title })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "이 영감 링크 복사" }));

    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));
    expect(clipboardWrite.mock.calls[0]![0]).toContain(`day=${archivedDay.iso}`);
    expect(screen.getByRole("button", { name: "링크 복사됨" })).toBeTruthy();
  });

  it("filters the editorial archive by saved and completed status", async () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "영감 저장" }));

    await waitFor(() => {
      expect(parseNowState(localStorage.getItem(NOW_STORAGE_KEY)).savedDates).toContain(getKstDay().iso);
    });

    fireEvent.click(screen.getByRole("button", { name: /저장됨\s*1/u }));
    expect(within(screen.getByLabelText("최근 14일 영감")).getAllByRole("button")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /완주\s*0/u }));
    expect(screen.getByText("이 조건에 맞는 영감이 아직 없습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "전체 아카이브 보기" }));
    expect(within(screen.getByLabelText("최근 14일 영감")).getAllByRole("button")).toHaveLength(DAILY_THEMES.length);
  });

  it("persists explicit directing preferences and saved prompts", async () => {
    const { unmount } = renderPage();
    const emotionMode = screen.getByRole("button", { name: /감정선/u });
    fireEvent.click(emotionMode);
    fireEvent.click(screen.getByRole("button", { name: "영감 저장" }));

    await waitFor(() => {
      const stored = parseNowState(localStorage.getItem(NOW_STORAGE_KEY));
      expect(stored.mode).toBe("emotion");
      expect(stored.savedDates).toContain(getKstDay().iso);
    });

    unmount();
    renderPage();
    expect(screen.getByRole("button", { name: /감정선/u }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "영감 저장 해제" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("records all five workflow checks, completion, and streak", async () => {
    renderPage();
    const progressArticle = screen.getByRole("heading", { name: "오늘의 진행률" }).closest("article")!;
    const checks = within(progressArticle).getAllByRole("checkbox");
    expect(checks).toHaveLength(NOW_PROGRESS_STEPS.length);

    for (const checkbox of checks) fireEvent.click(checkbox);

    await waitFor(() => {
      expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
      const stored = parseNowState(localStorage.getItem(NOW_STORAGE_KEY));
      expect(stored.completedDates).toContain(getKstDay().iso);
      expect(stored.progressByDate[getKstDay().iso]).toHaveLength(5);
    });

    expect(within(screen.getByLabelText("이번 주 창작 페이스")).getByText("1일")).toBeTruthy();
    expect(screen.getByText("오늘의 루프를 완주했습니다.", { exact: false })).toBeTruthy();
    fireEvent.click(checks[0]!);
    await waitFor(() => expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("80"));
    expect(parseNowState(localStorage.getItem(NOW_STORAGE_KEY)).completedDates).not.toContain(getKstDay().iso);
  });

  it("switches between bounded creation sessions and operates the focus timer", () => {
    vi.useFakeTimers();
    renderPage();

    expect(screen.getByText("20:00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /10\s*MIN.*퀵스케치/u }));
    expect(screen.getByRole("heading", { name: "10분 퀵스케치" })).toBeTruthy();
    expect(screen.getByText("10:00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "집중 시작" }));
    act(() => vi.advanceTimersByTime(1000));
    expect(screen.getByText("09:59")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByText("09:59")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "타이머 초기화" }));
    expect(screen.getByText("10:00")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /40\s*MIN.*딥다이브/u }));
    expect(screen.getByRole("heading", { name: "40분 딥다이브" })).toBeTruthy();
    expect(screen.getByText("40:00")).toBeTruthy();
  });

  it("copies a structured brief from either creation entry point", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "브리프 복사" }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));
    expect(clipboardWrite.mock.calls[0]![0]).toContain("5컷 미션:");
    expect(screen.getByRole("button", { name: "브리프 복사됨" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "5컷 포함 브리프 복사" }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(2));
  });

  it("syncs safe state from another tab and recovers from unavailable clipboard access", async () => {
    clipboardWrite.mockRejectedValueOnce(new Error("blocked"));
    renderPage();

    const incoming = { ...createEmptyNowState(), mode: "mystery" as const, savedDates: [getKstDay().iso] };
    act(() => {
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: NOW_STORAGE_KEY,
          newValue: JSON.stringify(incoming),
        }),
      );
    });
    expect(screen.getByRole("button", { name: /미스터리/u }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "영감 저장 해제" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "브리프 복사" }));
    expect((await screen.findByRole("alert")).textContent).toContain("클립보드에 복사하지 못했습니다");
  });
});
