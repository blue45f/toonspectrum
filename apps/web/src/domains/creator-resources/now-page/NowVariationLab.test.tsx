// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getKstDay, getMode, getThemeForDay } from "../now";
import { SESSION_PRESETS } from "./config";
import { NowVariationLab } from "./NowVariationLab";
import { NOW_VARIATION_STORAGE_KEY, parseVariationState } from "./variation";

const clipboardWrite = vi.fn(async (_text: string): Promise<void> => undefined);

function renderLab() {
  const day = getKstDay(new Date("2026-09-09T00:00:00.000Z"));
  return {
    day,
    ...render(
      <NowVariationLab
        day={day}
        theme={getThemeForDay(day)}
        mode={getMode("balanced")}
        sessionPreset={SESSION_PRESETS[1]}
      />,
    ),
  };
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
});

describe("daily variation lab", () => {
  it("persists explicit axes, a selected route, and a date-scoped note", async () => {
    const { day } = renderLab();

    expect(screen.getByRole("heading", { name: "오늘의 변주 랩" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /변주안 \d 선택/u })).toHaveLength(3);

    fireEvent.click(screen.getByRole("button", { name: /극근접.*손·표면·흔적/u }));
    fireEvent.click(screen.getByRole("button", { name: /숨은 목격자.*화면 밖 시선/u }));
    fireEvent.click(screen.getByRole("button", { name: /변주안 2 선택/u }));
    fireEvent.change(screen.getByRole("textbox", { name: "개인 제작 메모" }), {
      target: { value: "마지막 컷에서만 주인공의 왼손을 보여준다." },
    });

    await waitFor(() => {
      const stored = parseVariationState(localStorage.getItem(NOW_VARIATION_STORAGE_KEY));
      expect(stored.byDate[day.iso]?.selection.framing).toBe("detail");
      expect(stored.byDate[day.iso]?.selection.pressure).toBe("witness");
      expect(stored.byDate[day.iso]?.selectedCandidateId).toBe("route-2");
      expect(stored.byDate[day.iso]?.note).toContain("왼손");
    });
  });

  it("rerolls a deterministic set and copies the selected brief with notes", async () => {
    renderLab();
    expect(screen.getByText(/세트 1 · 선택 규칙을 기준으로 펼친 3개 경로/u)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "같은 기준으로 다시 섞기" }));
    expect(screen.getByText(/세트 2 · 선택 규칙을 기준으로 펼친 3개 경로/u)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "개인 제작 메모" }), {
      target: { value: "빛은 출입문 위 한 점에서만 나온다." },
    });
    fireEvent.click(screen.getByRole("button", { name: "선택안 브리프 복사" }));

    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));
    expect(clipboardWrite.mock.calls[0]![0]).toContain("오늘의 변주 랩");
    expect(clipboardWrite.mock.calls[0]![0]).toContain("개인 메모: 빛은 출입문 위 한 점에서만 나온다.");
    expect(screen.getByRole("button", { name: "선택안 복사됨" })).toBeTruthy();
  });

  it("surfaces clipboard failure without losing the generated routes", async () => {
    clipboardWrite.mockRejectedValueOnce(new Error("blocked"));
    renderLab();

    fireEvent.click(screen.getByRole("button", { name: "선택안 브리프 복사" }));

    expect((await screen.findByRole("alert")).textContent).toContain("클립보드에 복사하지 못했습니다");
    expect(screen.getAllByRole("button", { name: /변주안 \d 선택/u })).toHaveLength(3);
  });
});
