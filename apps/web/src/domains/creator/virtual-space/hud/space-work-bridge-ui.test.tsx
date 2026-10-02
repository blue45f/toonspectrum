// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { STUDIO_CONTEXT_SUGGESTIONS } from "../studio-virtual-space-context-suggestions";
import {
  createStudioFocusSession,
  startStudioFocusSession,
} from "../studio-virtual-space-focus-session";
import { SpaceContextSuggestion } from "./SpaceContextSuggestion";
import { SpaceFocusChip } from "./SpaceFocusChip";

afterEach(() => cleanup());

describe("SpaceContextSuggestion", () => {
  it("제안 문구와 수락·닫기 버튼을 그리고 콜백을 호출한다", () => {
    const onAccept = vi.fn();
    const onDismiss = vi.fn();
    render(<SpaceContextSuggestion suggestion={STUDIO_CONTEXT_SUGGESTIONS["meeting-start"]} onAccept={onAccept} onDismiss={onDismiss} />);
    expect(screen.getByText("회의를 시작할까요?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "회의 시작" }));
    expect(onAccept).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "제안 닫기" }));
    expect(onDismiss).toHaveBeenCalledOnce();
  });

  it("집중 제안은 집중 시작 문구를 쓴다", () => {
    render(<SpaceContextSuggestion suggestion={STUDIO_CONTEXT_SUGGESTIONS["focus-mode"]} onAccept={vi.fn()} onDismiss={vi.fn()} />);
    expect(screen.getByText("집중 모드로 전환할까요?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "집중 시작" })).toBeTruthy();
  });
});

describe("SpaceFocusChip", () => {
  const T0 = 1_000_000;

  it("idle이면 그리지 않는다", () => {
    const view = render(<SpaceFocusChip session={createStudioFocusSession()} now={T0} onPause={vi.fn()} onResume={vi.fn()} onStop={vi.fn()} />);
    expect(view.container.firstChild).toBeNull();
  });

  it("집중 중 남은 시간과 일시정지·종료 버튼을 보인다", () => {
    const onPause = vi.fn();
    const onStop = vi.fn();
    const session = startStudioFocusSession(createStudioFocusSession(25 * 60_000), T0);
    render(<SpaceFocusChip session={session} now={T0 + 60_000} onPause={onPause} onResume={vi.fn()} onStop={onStop} />);
    expect(screen.getByRole("timer").textContent).toContain("24:00");
    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    expect(onPause).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "집중 세션 종료" }));
    expect(onStop).toHaveBeenCalledOnce();
  });

  it("일시정지 상태에서는 계속 버튼을 보인다", () => {
    const onResume = vi.fn();
    const session = { ...startStudioFocusSession(createStudioFocusSession(60_000), T0), phase: "paused" as const, endsAt: null, pausedRemainingMs: 30_000 };
    render(<SpaceFocusChip session={session} now={T0} onPause={vi.fn()} onResume={onResume} onStop={vi.fn()} />);
    expect(screen.getByRole("timer").textContent).toContain("0:30");
    fireEvent.click(screen.getByRole("button", { name: "계속" }));
    expect(onResume).toHaveBeenCalledOnce();
  });
});
