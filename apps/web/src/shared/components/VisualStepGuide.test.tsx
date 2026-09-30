// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { VisualStepGuide } from "./VisualStepGuide";

afterEach(() => {
  cleanup();
});

const STEPS = [
  {
    illustration: <img src="/brand/workflow-20260928/plan-640.webp" alt="기획 일러스트" />,
    title: "기획하기",
    body: "이야기의 기준을 세웁니다.",
  },
  {
    illustration: <img src="/brand/workflow-20260928/create-640.webp" alt="제작 일러스트" />,
    title: "그리기",
    body: "선화와 채색으로 완성합니다.",
  },
];

describe("VisualStepGuide", () => {
  it("빈 단계 목록이면 아무것도 렌더하지 않는다", () => {
    const { container } = render(<VisualStepGuide steps={[]} />);
    expect(container.innerHTML).toBe("");
  });

  it("단계를 순서 목록으로 렌더하고 번호를 표시한다", () => {
    render(<VisualStepGuide heading="시작하기" steps={STEPS} />);
    expect(screen.getByRole("heading", { name: "시작하기" })).not.toBeNull();
    expect(screen.getByRole("list")).not.toBeNull();
    expect(screen.getByText("기획하기")).not.toBeNull();
    expect(screen.getByText("그리기")).not.toBeNull();
    // 스크린리더용 단계 안내
    expect(screen.getByText("단계 1")).not.toBeNull();
    expect(screen.getByText("단계 2")).not.toBeNull();
  });

  it("일러스트 노드를 그대로 렌더한다", () => {
    render(<VisualStepGuide steps={STEPS} />);
    expect(screen.getByAltText("기획 일러스트").getAttribute("src")).toBe(
      "/brand/workflow-20260928/plan-640.webp",
    );
    expect(screen.getByAltText("제작 일러스트").getAttribute("src")).toBe(
      "/brand/workflow-20260928/create-640.webp",
    );
  });

  it("두 번째 항목부터 좌우 반전 클래스를 적용한다", () => {
    const { container } = render(<VisualStepGuide steps={STEPS} />);
    const items = container.querySelectorAll(".visual-step-guide__item");
    expect(items).toHaveLength(2);
    expect(items[0]?.classList.contains("visual-step-guide__item--flip")).toBe(false);
    expect(items[1]?.classList.contains("visual-step-guide__item--flip")).toBe(true);
  });
});
