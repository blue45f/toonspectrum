// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
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

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}{location.search}</output>;
}

function renderPage(initialEntry = "/now") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <NowPage />
      <LocationProbe />
    </MemoryRouter>,
  );
}

/** 오늘의 영감은 "오늘 미션·시간과 연출·변주 실험·지난 영감" 탭으로 나뉜다. */
function openTab(name: RegExp) {
  fireEvent.click(screen.getByRole("tab", { name }));
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
    // 첫 탭(오늘 미션): 5컷 미션·진행률과 장면 재료, 자료 찾기.
    expect(screen.getByRole("tab", { name: /오늘 미션/u }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    expect(screen.getByRole("heading", { name: "오늘의 5컷 미션" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /리서치 데스크 열기/u }).getAttribute("href")).toBe("/research");
    // 연출 탭: 연출 방식을 고르면 그 방식의 5컷 비트 보드와 집중 타이머가 함께 있다.
    openTab(/시간·연출/u);
    expect(screen.getByRole("group", { name: "연출 모드" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /5컷 비트 보드/u })).toBeTruthy();

    openTab(/지난 영감/u);
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

    openTab(/지난 영감/u);
    fireEvent.click(screen.getByRole("button", { name: /저장됨\s*1/u }));
    expect(within(screen.getByLabelText("최근 14일 영감")).getAllByRole("button")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /완주\s*0/u }));
    expect(screen.getByText("이 조건에 맞는 영감이 아직 없습니다.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "전체 아카이브 보기" }));
    expect(within(screen.getByLabelText("최근 14일 영감")).getAllByRole("button")).toHaveLength(DAILY_THEMES.length);
  });

  it("persists explicit directing preferences and saved prompts", async () => {
    const { unmount } = renderPage();
    openTab(/시간·연출/u);
    const emotionMode = screen.getByRole("button", { name: /감정선/u });
    fireEvent.click(emotionMode);
    fireEvent.click(screen.getByRole("button", { name: "영감 저장" }));

    await waitFor(() => {
      const stored = parseNowState(localStorage.getItem(NOW_STORAGE_KEY));
      expect(stored.mode).toBe("emotion");
      expect(stored.savedDates).toContain(getKstDay().iso);
    });

    unmount();
    renderPage("/now?view=plan");
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
    openTab(/시간·연출/u);

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

    openTab(/시간·연출/u);
    fireEvent.click(screen.getByRole("button", { name: "5컷 포함 브리프 복사" }));
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(2));
  });

  it("syncs safe state from another tab and recovers from unavailable clipboard access", async () => {
    clipboardWrite.mockRejectedValueOnce(new Error("blocked"));
    renderPage("/now?view=plan");

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

  it("keeps every section one tab away and routes old anchors and the next-step action to their tab", async () => {
    renderPage("/now#variation-lab");
    await waitFor(() => expect(screen.getByRole("tab", { name: /변주 실험/u }).getAttribute("aria-selected")).toBe("true"));
    expect(screen.getByRole("heading", { name: "오늘의 변주 랩" })).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/now?view=variation");

    // 5컷 비트 보드 앵커(#storyboard)는 연출 탭으로 열린다.
    cleanup();
    renderPage("/now#storyboard");
    await waitFor(() => expect(screen.getByRole("tab", { name: /시간·연출/u }).getAttribute("aria-selected")).toBe("true"));
    cleanup();
    renderPage("/now#variation-lab");
    await waitFor(() => expect(screen.getByRole("tab", { name: /변주 실험/u }).getAttribute("aria-selected")).toBe("true"));

    // 머리말의 "다음 단계"는 어느 탭에서든 오늘 미션의 진행률 카드로 이어진다.
    fireEvent.click(screen.getByRole("button", { name: /다음 단계/u }));
    expect(screen.getByRole("tab", { name: /오늘 미션/u }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("heading", { name: "오늘의 진행률" })).toBeTruthy();
    expect(screen.getByTestId("location").textContent).toBe("/now");

    // 한 번 연 탭은 숨김만 바뀌어 변주 메모 입력이 탭 전환으로 사라지지 않는다.
    const variationPanel = screen.getByRole("heading", { name: "오늘의 변주 랩", hidden: true }).closest("[role=tabpanel]");
    expect(variationPanel?.hasAttribute("hidden")).toBe(true);

    // 날짜를 바꿔도 열린 탭은 주소에 그대로 남는다.
    openTab(/지난 영감/u);
    const archiveButtons = within(screen.getByLabelText("최근 14일 영감")).getAllByRole("button");
    expect(archiveButtons.length).toBeGreaterThan(2);
    fireEvent.click(archiveButtons.slice(2, 3)[0] ?? document.body);
    expect(screen.getByTestId("location").textContent).toContain("view=archive");
    expect(screen.getByTestId("location").textContent).toContain(`day=${getKstDay(new Date(), 2).iso}`);
  });
});
