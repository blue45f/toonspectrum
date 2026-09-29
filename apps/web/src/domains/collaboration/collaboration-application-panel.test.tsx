// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InviteNextStepsPanel } from "./collaboration-application-panel";

afterEach(cleanup);

describe("InviteNextStepsPanel", () => {
  it("합류 확정 안내와 3단계 초대 순서를 보여준다", () => {
    render(
      <InviteNextStepsPanel
        name="김작가"
        onContinue={vi.fn()}
        onDismiss={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole("region", { name: "김작가님의 합류를 확정했어요" }),
    ).not.toBeNull();
    const steps = screen.getByRole("list").querySelectorAll("li");
    expect(steps.length).toBe(3);
    expect(screen.queryByText(/팀 초대 보내기/)).not.toBeNull();
    expect(screen.queryByText(/작품 접근 권한 연결/)).not.toBeNull();
    expect(screen.queryByText(/첫 작업 안내/)).not.toBeNull();
  });
  it("계속하기와 나중에 하기 버튼이 각 콜백을 호출한다", () => {
    const onContinue = vi.fn();
    const onDismiss = vi.fn();
    render(
      <InviteNextStepsPanel
        name="김작가"
        onContinue={onContinue}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "팀·권한 연결하러 가기" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "나중에 하기" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
