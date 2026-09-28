// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioPublishVisualJourney } from "../StudioPublishVisualJourney";

afterEach(cleanup);

describe("일러스트 발행 안내의 사용자 조작", () => {
  it("안내 아트를 실제 원고로 노출하지 않고 단계 이름으로 선택한다", () => {
    const onSelect = vi.fn();
    const view = render(<StudioPublishVisualJourney activeStep="content" onSelect={onSelect} />);
    const steps = screen.getAllByRole("button");
    expect(steps).toHaveLength(3);
    expect(steps[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryAllByRole("img")).toHaveLength(0);
    expect(view.container.querySelectorAll('img[alt=""][aria-hidden="true"]')).toHaveLength(3);

    const distribution = screen.getByRole("button", { name: /공개 범위와 시점/ });
    distribution.focus();
    expect(document.activeElement).toBe(distribution);
    fireEvent.click(distribution);
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("distribution");
    // 선택 권위는 상위 발행 폼에 남고 안내 카드 자체는 상태를 바꾸지 않는다.
    expect(steps[0]?.getAttribute("aria-pressed")).toBe("true");
    expect(distribution.getAttribute("aria-pressed")).toBe("false");

    view.rerender(<StudioPublishVisualJourney activeStep="distribution" onSelect={onSelect} />);
    expect(distribution.getAttribute("aria-pressed")).toBe("true");
  });

  it("게시 중 잠긴 단계에서 마우스 조작으로 전환하지 않는다", () => {
    const onSelect = vi.fn();
    render(<StudioPublishVisualJourney activeStep="review" disabled onSelect={onSelect} />);
    for (const step of screen.getAllByRole("button")) {
      expect(step.hasAttribute("disabled")).toBe(true);
      fireEvent.click(step);
    }
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /게시 전에 독자 화면/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("일러스트 로딩 실패에도 단계 설명과 발행 폼 연결을 유지한다", () => {
    const onSelect = vi.fn();
    const view = render(<StudioPublishVisualJourney activeStep="content" onSelect={onSelect} />);
    for (const art of view.container.querySelectorAll("img")) fireEvent.error(art);
    fireEvent.click(screen.getByRole("button", { name: /게시 전에 독자 화면/ }));
    expect(onSelect).toHaveBeenCalledExactlyOnceWith("review");
    expect(screen.getByText(/세로 스크롤·페이지 보기와 사전검사 결과/)).toBeTruthy();
  });
});
