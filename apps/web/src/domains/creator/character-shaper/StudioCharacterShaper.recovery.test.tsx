// @vitest-environment jsdom

/**
 * 스튜디오 안에서 캐릭터 셰이퍼를 열었을 때 3D 화면 그리기가 실패하는 경우(그래픽 가속 꺼짐·메모리 부족):
 * 편집기 전체가 아니라 작업실만 닫고, 이유와 다시 시도·원고로 돌아가기를 알린다.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioCharacterShaper } from "./StudioCharacterShaper";

import type { StudioVrmPoserProps } from "../vrm/StudioVrmPoserTypes";

import { useI18n } from "@/shared/lib/i18n";

const renderFailure = { active: true };

vi.mock("../vrm/useStudioVrmPoserController", () => ({
  useStudioVrmPoserController: () => ({ status: "empty", dialogRef: { current: null } }),
}));

vi.mock("./StudioCharacterShaperDialog", () => ({
  StudioCharacterShaperDialog: () => {
    if (renderFailure.active) throw new Error("Error creating WebGL context.");
    return <div data-testid="shaper-dialog" />;
  },
}));

vi.mock("../vrm/StudioVrmPoserDialog", () => ({
  StudioVrmPoserDialog: () => <div data-testid="legacy-dialog" />,
}));

beforeEach(() => {
  useI18n.setState({ lang: "ko" });
  renderFailure.active = true;
  // React가 처리된 렌더 오류를 콘솔에 남기는 것은 이 시험의 대상이 아니다.
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function props(overrides: Partial<StudioVrmPoserProps> = {}): StudioVrmPoserProps {
  return {
    open: true,
    onClose: () => undefined,
    onInsert: () => undefined,
    ...overrides,
  };
}

describe("StudioCharacterShaper render-failure recovery", () => {
  it("replaces a crashed 3D view with a recoverable notice instead of taking the editor down", () => {
    const onClose = vi.fn();
    render(<StudioCharacterShaper {...props({ onClose })} />);

    const recovery = screen.getByRole("alertdialog", { name: "캐릭터 셰이퍼를 계속 열 수 없습니다." });
    expect(recovery.textContent).toContain("그래픽 가속(WebGL)");
    // 원고와 편집 기록은 그대로라는 점을 알린다.
    expect(recovery.textContent).toContain("현재 원고와 편집 기록은 그대로 보존되어 있습니다");

    // 복구 화면은 머리줄과 본문에 같은 '돌아가기' 동작을 둔다. 어느 쪽이든 편집기를 닫는다.
    const exits = screen.getAllByRole("button", { name: "원고로 돌아가기" });
    expect(exits).toHaveLength(2);
    fireEvent.click(exits[1] as HTMLElement);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("opens the workshop again after the cause is fixed and the person retries", () => {
    render(<StudioCharacterShaper {...props()} />);
    expect(screen.queryByTestId("shaper-dialog")).toBeNull();

    renderFailure.active = false;
    fireEvent.click(screen.getByRole("button", { name: "다시 시도" }));
    expect(screen.getByTestId("shaper-dialog")).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("speaks English with the same recovery actions when the UI language is English", () => {
    useI18n.setState({ lang: "en" });
    render(<StudioCharacterShaper {...props()} />);
    expect(screen.getAllByRole("button", { name: "Back to the page" })).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("alertdialog").textContent).toContain("graphics acceleration (WebGL)");
  });

  it("leaves recovery to the host when it brings its own (the landing's standalone editor)", () => {
    expect(() => render(<StudioCharacterShaper {...props()} recoverFromRenderFailure={false} />))
      .toThrow("Error creating WebGL context.");
  });

  it("keeps one tree shape while closed so a reopen restores the runtime", () => {
    const view = render(<StudioCharacterShaper {...props({ open: false })} />);
    expect(view.container.innerHTML).toBe("");
    renderFailure.active = false;
    view.rerender(<StudioCharacterShaper {...props({ open: true })} />);
    expect(screen.getByTestId("shaper-dialog")).toBeTruthy();
  });
});
