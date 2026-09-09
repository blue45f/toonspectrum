// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STUDIO_WORKSPACE_STATE,
  normalizeStudioWorkspaceLayout,
  type StudioWorkspaceLayout,
  type StudioWorkspaceState,
} from "./studio-workspaces";
import { StudioWorkspaceMenu } from "./StudioWorkspaceMenu";

const persisted = { status: "persisted", failure: null } as const;

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderWorkspaceMenu(
  liveLayout: StudioWorkspaceLayout = DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout
) {
  const onStateChange = vi.fn((_state: StudioWorkspaceState) => persisted);
  const onApplyLayout = vi.fn();
  render(
    <StudioWorkspaceMenu
      state={DEFAULT_STUDIO_WORKSPACE_STATE}
      liveLayout={liveLayout}
      persistence={persisted}
      onStateChange={onStateChange}
      onApplyLayout={onApplyLayout}
    />
  );
  fireEvent.click(screen.getByRole("button", { name: /^작업공간:/ }));
  return { onStateChange, onApplyLayout };
}

describe("StudioWorkspaceMenu friendly recommendation", () => {
  it("starts with the lowest-complexity workspace in one click", () => {
    const { onStateChange, onApplyLayout } = renderWorkspaceMenu();

    const action = screen.getByRole("button", {
      name: "빠른 스케치 작업공간으로 전환",
    });
    expect(screen.getByText("처음이라면 추천")).toBeTruthy();
    expect(action.getAttribute("data-workspace-id")).toBe("quick-sketch");
    fireEvent.click(action);

    expect(onStateChange).toHaveBeenCalledTimes(1);
    expect(onStateChange.mock.calls[0]?.[0].activeWorkspaceId).toBe("quick-sketch");
    expect(onApplyLayout).toHaveBeenCalledWith(
      expect.any(Object),
      "quick-sketch"
    );
  });

  it("still finds the Clip Studio migration preset with a familiar shorthand alias", () => {
    renderWorkspaceMenu();

    fireEvent.change(screen.getByRole("searchbox", { name: "작업공간 검색" }), {
      target: { value: "클튜" },
    });

    expect(screen.queryByTestId("studio-workspace-recommendation")).toBeNull();
    const result = screen.getByRole("button", {
      name: "클립 스튜디오형, 작업공간으로 전환",
    });
    expect(result.getAttribute("data-workspace-kind")).toBe("builtin");
    expect(result.getAttribute("data-workspace-id")).toBe("csp-migration");
  });

  it("keeps unsaved layout changes behind the existing switch guard", () => {
    const dirtyLayout = normalizeStudioWorkspaceLayout({
      ...DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout,
      desktop: {
        ...DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout.desktop,
        leftPanelOpen: !DEFAULT_STUDIO_WORKSPACE_STATE.liveLayout.desktop.leftPanelOpen,
      },
    });
    const { onStateChange, onApplyLayout } = renderWorkspaceMenu(dirtyLayout);

    fireEvent.click(screen.getByRole("button", {
      name: "빠른 스케치 작업공간으로 전환",
    }));

    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByText(/변경을 저장하고 전환할까요/)).toBeTruthy();
    expect(onStateChange).not.toHaveBeenCalled();
    expect(onApplyLayout).not.toHaveBeenCalled();
  });
});
