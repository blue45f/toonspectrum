// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FortunePeriodPanel } from "./FortunePeriodPanel";

// 음성 합성은 FortunePeriodPanel 테스트 범위 밖 — 조용히 비활성화
vi.mock("./FortuneVoiceNarration", () => ({
  FortuneVoiceNarration: () => null,
}));
vi.mock("./FortuneReveal", () => ({
  FortuneReveal: ({ score, label, children }: { score: number; label: string; children: React.ReactNode }) => (
    <div data-testid="reveal" data-score={score} aria-label={label}>
      {children}
    </div>
  ),
}));

describe("FortunePeriodPanel", () => {
  afterEach(() => {
    cleanup();
  });

  it("월간 운세를 렌더한다", () => {
    render(<FortunePeriodPanel kind="monthly" birthDate="1990-05-15" birthTime="10:30" />);
    const reveal = screen.getByTestId("reveal");
    expect(reveal.getAttribute("aria-label")).toContain("이달의 운세 지수");
    expect(screen.getByText(/애정운/)).toBeTruthy();
    expect(screen.getByText(/금전운/)).toBeTruthy();
    expect(screen.getByText(/직장운/)).toBeTruthy();
    expect(screen.getByText(/건강운/)).toBeTruthy();
  });

  it("연간 운세를 렌더하고 월별 흐름 차트를 보여준다", () => {
    render(<FortunePeriodPanel kind="yearly" birthDate="1990-05-15" />);
    const reveal = screen.getByTestId("reveal");
    expect(reveal.getAttribute("aria-label")).toContain("올해의 운세 지수");
    expect(screen.getByText(/최고의 달/)).toBeTruthy();
    expect(screen.getAllByText(/주의할 달/).length).toBeGreaterThan(0);
    expect(screen.getByText(/월별 흐름/)).toBeTruthy();
  });

  it("잘못된 생년월일이면 오류를 보여준다", () => {
    render(<FortunePeriodPanel kind="monthly" birthDate="not-a-date" />);
    expect(screen.getByRole("alert")).toBeTruthy();
  });

  it("월간 결과는 결정적이다", () => {
    const { unmount } = render(<FortunePeriodPanel kind="monthly" birthDate="1990-05-15" birthTime="10:30" />);
    const first = screen.getByTestId("reveal").getAttribute("data-score");
    unmount();
    render(<FortunePeriodPanel kind="monthly" birthDate="1990-05-15" birthTime="10:30" />);
    const second = screen.getByTestId("reveal").getAttribute("data-score");
    expect(first).toBe(second);
  });
});
