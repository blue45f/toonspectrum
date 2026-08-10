// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resetStudioDestructiveActionLedger,
  setStudioDestructiveConfirmPresenter,
} from "./studio-destructive-action-preview";
import {
  settleStudioDestructiveCommit,
  studioDeleteCheckpointRequest,
  studioRemoveEmeresUnderlaysRequest,
} from "./studio-destructive-command-catalog";
import {
  enterStudioSafeMode,
  getStudioReliabilityStatusSnapshot,
  reportStudioReliabilitySignal,
  resetStudioReliabilityStatus,
} from "./studio-reliability-status-store";
import { disposeStudioSafeModeRuntime } from "./studio-safe-mode-runtime";
import { StudioReliabilityStatusRail } from "./StudioReliabilityStatusRail";

afterEach(() => {
  cleanup();
  disposeStudioSafeModeRuntime();
  resetStudioReliabilityStatus();
  resetStudioDestructiveActionLedger();
});

describe("StudioReliabilityStatusRail", () => {
  it("stays quiet but present when nothing has failed", () => {
    render(<StudioReliabilityStatusRail />);
    expect(screen.getByText("저장·GPU 이상 없음")).toBeTruthy();
    expect(document.querySelector("[data-studio-safe-mode-banner]")).toBeNull();
  });

  it("brings a GPU demotion that used to be console-only onto the screen", () => {
    render(<StudioReliabilityStatusRail />);

    act(() => {
      reportStudioReliabilitySignal({
        channel: "gpu",
        level: "degraded",
        title: "GPU 연결이 끊겨 CPU 렌더링으로 전환했습니다",
        detail: "그림은 그대로예요.",
        at: 1,
      });
    });

    const row = document.querySelector('[data-studio-reliability-signal="gpu"]');
    expect(row).not.toBeNull();
    expect(row?.getAttribute("data-studio-reliability-level")).toBe("degraded");
    expect(screen.getByText("GPU 연결이 끊겨 CPU 렌더링으로 전환했습니다")).toBeTruthy();
    expect(screen.getByText("그림은 그대로예요.")).toBeTruthy();
    expect(screen.queryByText("저장·GPU 이상 없음")).toBeNull();
  });

  it("shows each failing channel independently", () => {
    render(<StudioReliabilityStatusRail />);

    act(() => {
      reportStudioReliabilitySignal({
        channel: "save",
        level: "failed",
        title: "임시저장에 실패했습니다",
        at: 1,
      });
      reportStudioReliabilitySignal({
        channel: "storage",
        level: "failed",
        title: "저장 공간이 부족합니다",
        at: 2,
      });
    });

    expect(document.querySelector('[data-studio-reliability-signal="save"]')).not.toBeNull();
    expect(document.querySelector('[data-studio-reliability-signal="storage"]')).not.toBeNull();
  });

  it("announces safe mode with its reasons and lets the user leave it", () => {
    render(<StudioReliabilityStatusRail />);

    act(() => {
      enterStudioSafeMode("gpu-permanently-demoted", 5);
    });

    const banner = document.querySelector("[data-studio-safe-mode-banner]");
    expect(banner).not.toBeNull();
    expect(banner?.getAttribute("role")).toBe("status");
    expect(screen.getByText(/그림과 문서는 그대로예요/)).toBeTruthy();
    expect(
      screen.getByText(/GPU가 반복해서 끊겨 이번 세션 동안 CPU 렌더링을 유지합니다/),
    ).toBeTruthy();

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "안전 모드 해제" }));
    });

    expect(document.querySelector("[data-studio-safe-mode-banner]")).toBeNull();
    expect(getStudioReliabilityStatusSnapshot().safeMode.manuallyDismissed).toBe(true);
  });

  it("offers an undo round trip after a reversible destruction", () => {
    const undo = vi.fn();
    render(<StudioReliabilityStatusRail />);

    act(() => {
      settleStudioDestructiveCommit(studioRemoveEmeresUnderlaysRequest(4), true, undo);
    });

    expect(screen.getByText(/이메레스 밑그림 4개/)).toBeTruthy();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "실행 취소" }));
    });

    expect(undo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "실행 취소" })).toBeNull();
  });

  it("never offers undo for an irreversible destruction", () => {
    setStudioDestructiveConfirmPresenter(() => true);
    render(<StudioReliabilityStatusRail />);

    act(() => {
      settleStudioDestructiveCommit(
        studioDeleteCheckpointRequest({ checkpointName: "1화" }),
        true,
        () => undefined,
      );
    });

    expect(screen.getByText(/영구히 지웠어요/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "실행 취소" })).toBeNull();
    expect(screen.getByRole("button", { name: "닫기" })).toBeTruthy();
  });

  it("keeps a refused destruction on screen instead of letting it vanish", () => {
    render(<StudioReliabilityStatusRail />);

    act(() => {
      settleStudioDestructiveCommit(studioRemoveEmeresUnderlaysRequest(4), false);
    });

    const notice = document.querySelector("[data-studio-destructive-action-notice]");
    expect(notice?.getAttribute("data-studio-destructive-outcome")).toBe("refused");
    expect(screen.getByText(/적용하지 못했습니다/)).toBeTruthy();
  });
});
