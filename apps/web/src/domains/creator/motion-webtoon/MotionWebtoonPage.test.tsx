// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MotionWebtoonPage } from "./MotionWebtoonPage";
import type { MotionEpisode } from "./motion-webtoon-model";
import { saveMotionEpisode } from "./motion-webtoon-storage";

function makeEpisode(id: string, titleKo = "공유 회차"): MotionEpisode {
  return {
    id,
    titleKo,
    titleEn: "Shared episode",
    characters: [{ id: "char-1", nameKo: "주인공", nameEn: "Hero", presetId: "narrator" }],
    cuts: [],
  };
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState(null, "", window.location.pathname);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState(null, "", window.location.pathname);
  vi.restoreAllMocks();
});

describe("MotionWebtoonPage", () => {
  it("공유 해시의 회차를 복원하고 안내를 보여준다", () => {
    saveMotionEpisode(makeEpisode("ep-shared"));
    window.location.hash = "#motion-episode=ep-shared";
    render(<MotionWebtoonPage />);
    expect(
      screen.queryByText("공유 링크의 회차를 불러왔습니다. 이어서 편집하거나 바로 재생해 보세요."),
    ).toBeTruthy();
    // 복원된 회차 제목이 에디터에 보인다
    const titleInput = screen.getByPlaceholderText("회차 제목") as HTMLInputElement;
    expect(titleInput.value).toBe("공유 회차");
  });

  it("페이지 제목이 h1 하나로 시작하는 제목 위계를 가진다", () => {
    render(<MotionWebtoonPage />);
    const headings = screen.getAllByRole("heading");
    expect(headings[0].tagName).toBe("H1");
    expect(headings.filter((heading) => heading.tagName === "H1")).toHaveLength(1);
    // 위계 건너뜀 없음: 각 제목은 직전보다 최대 한 단계만 깊어진다
    const levels = headings.map((heading) => Number(heading.tagName.slice(1)));
    for (let i = 1; i < levels.length; i += 1) {
      expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    }
  });

  it("공유 해시를 소비한 뒤 URL에서 지운다", () => {
    saveMotionEpisode(makeEpisode("ep-shared"));
    window.location.hash = "#motion-episode=ep-shared";
    render(<MotionWebtoonPage />);
    expect(window.location.hash).toBe("");
  });

  it("없는 공유 ID면 마지막 회차를 열고 안내를 보여준다", () => {
    saveMotionEpisode(makeEpisode("ep-last", "마지막 회차"));
    window.localStorage.setItem("toonstudio:motion-webtoon:last-episode-id", "ep-last");
    window.location.hash = "#motion-episode=ep-missing";
    render(<MotionWebtoonPage />);
    expect(
      screen.queryByText("링크의 회차를 이 브라우저에서 찾을 수 없어요. 저장된 마지막 회차를 엽니다."),
    ).toBeTruthy();
    const titleInput = screen.getByPlaceholderText("회차 제목") as HTMLInputElement;
    expect(titleInput.value).toBe("마지막 회차");
  });

  it("해시가 없으면 마지막 회차를 이어서 연다", () => {
    saveMotionEpisode(makeEpisode("ep-last", "마지막 회차"));
    window.localStorage.setItem("toonstudio:motion-webtoon:last-episode-id", "ep-last");
    render(<MotionWebtoonPage />);
    expect(screen.queryByText("마지막으로 작업하던 회차를 이어서 엽니다.")).toBeTruthy();
  });

  it("저장된 회차가 없으면 새 회차로 시작한다", () => {
    render(<MotionWebtoonPage />);
    expect(screen.queryByText("컷이, 영상이 되는 순간")).toBeTruthy();
    const titleInput = screen.getByPlaceholderText("회차 제목") as HTMLInputElement;
    expect(titleInput.value).toBe("새 회차");
  });

  it("자동 저장에 실패하면 이 탭에서만 유지된다는 경고를 보여 주고, 다시 저장되면 거둔다", () => {
    render(<MotionWebtoonPage />);
    const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const titleInput = screen.getByPlaceholderText("회차 제목");
    fireEvent.change(titleInput, { target: { value: "저장 안 되는 회차" } });
    expect(screen.getByRole("alert").textContent).toContain("자동 저장하지 못했어요");

    setItem.mockRestore();
    fireEvent.change(titleInput, { target: { value: "다시 저장되는 회차" } });
    expect(screen.queryByText(/자동 저장하지 못했어요/u)).toBeNull();
  });

  it("문서 제목을 모션 웹툰으로 설정한다", () => {
    render(<MotionWebtoonPage />);
    expect(document.title).toContain("모션 웹툰");
  });
});
