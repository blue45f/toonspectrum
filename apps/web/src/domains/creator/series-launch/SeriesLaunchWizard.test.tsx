// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SeriesLaunchWizard } from "./SeriesLaunchWizard";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function footerNextButton(): HTMLElement {
  const footer = document.querySelector(".sl-footer");
  if (!footer) throw new Error("footer not found");
  return within(footer as HTMLElement).getByRole("button", { name: "다음" });
}

describe("SeriesLaunchWizard", () => {
  it("5단계 인디케이터와 진행률을 렌더링한다", () => {
    render(<SeriesLaunchWizard onComplete={() => {}} />);
    expect(screen.getByTestId("series-launch-wizard")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");
    const nav = screen.getByLabelText("연재 준비 단계");
    expect(nav.querySelectorAll("button")).toHaveLength(5);
  });

  it("기획 단계에서 장르·로그라인·시놉시스를 입력하면 다음 단계로 이동할 수 있다", () => {
    render(<SeriesLaunchWizard onComplete={() => {}} />);
    fireEvent.change(screen.getByLabelText("장르"), { target: { value: "romance" } });
    fireEvent.change(screen.getByLabelText("한 줄 소개"), {
      target: { value: "옥상에서 만난 두 사람의 비밀 방과후" },
    });
    fireEvent.change(screen.getByLabelText("시놉시스"), {
      target: { value: "시작과 갈등과 결말" },
    });
    const nextBtn = footerNextButton();
    expect(nextBtn.hasAttribute("disabled")).toBe(false);
    fireEvent.click(nextBtn);
    expect(screen.getByLabelText("시리즈 만들기")).toBeTruthy();
  });

  it("필수 입력 없이는 다음 단계 버튼이 비활성화된다", () => {
    render(<SeriesLaunchWizard onComplete={() => {}} />);
    expect(footerNextButton().hasAttribute("disabled")).toBe(true);
  });

  it("다음 할 일 안내가 미완료 단계를 가리킨다", () => {
    render(<SeriesLaunchWizard onComplete={() => {}} />);
    const nextUp = screen.getByText("다음 할 일").closest("button");
    expect(nextUp?.textContent).toContain("기획하기");
  });

  it("시리즈 단계에서 제목 입력 시 미니 미리보기가 나타난다", () => {
    render(
      <SeriesLaunchWizard
        onComplete={() => {}}
        initial={{ genre: "romance", logline: "로그라인", synopsis: "시놉시스" }}
      />
    );
    const steps = screen.getByLabelText("연재 준비 단계").querySelectorAll("button");
    fireEvent.click(steps[1]);
    fireEvent.change(screen.getByLabelText("시리즈 제목"), {
      target: { value: "옥상 방과후" },
    });
    expect(screen.getByText("독자에게 이렇게 보여요")).toBeTruthy();
    expect(screen.getAllByText("옥상 방과후").length).toBeGreaterThan(0);
  });

  it("모든 단계 완료 시 연재 시작 단계에서 미리보기와 완료 버튼이 보인다", () => {
    const onComplete = vi.fn();
    render(
      <SeriesLaunchWizard
        onComplete={onComplete}
        initial={{
          genre: "romance",
          logline: "옥상 비밀 방과후",
          synopsis: "시놉시스",
          title: "옥상 방과후",
          episodeTitle: "1화",
          episodePagesReady: true,
          specCheckPassed: true,
          scheduleDecided: true,
        }}
      />
    );
    const steps = screen.getByLabelText("연재 준비 단계").querySelectorAll("button");
    fireEvent.click(steps[4]);
    expect(screen.getByText("모든 준비가 끝났어요!")).toBeTruthy();
    expect(screen.getByRole("button", { name: "연재 시작하기" })).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });
});
