// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioBg3dWebglRecoveryNotice } from "./StudioBg3dWebglRecoveryNotice";
import { installStudioBg3dWebglContextRecovery, STUDIO_BG3D_WEBGL_RECOVERY_EVENT } from "./studio-bg3d-webgl-context-recovery";

describe("StudioBg3dWebglRecoveryNotice", () => {
  afterEach(cleanup);

  it("실패한 실제 복구 controller를 키보드 가능한 UI 버튼으로 다시 실행한다", async () => {
    render(<StudioBg3dWebglRecoveryNotice />);
    const canvas = document.createElement("canvas");
    const resetRenderer = vi.fn().mockImplementationOnce(() => { throw new Error("실패"); });
    const controller = installStudioBg3dWebglContextRecovery(canvas, {
      invalidate: vi.fn(), resetRenderer, scheduleFrame: () => 1, cancelFrame: vi.fn(),
      onStateChange: (snapshot) => window.dispatchEvent(new CustomEvent(STUDIO_BG3D_WEBGL_RECOVERY_EVENT, {
        detail: { owner: canvas, snapshot, retry: () => controller.retry() },
      })),
    });
    act(() => { canvas.dispatchEvent(new Event("webglcontextrestored")); });
    expect(screen.getByRole("alert").textContent).toContain("초기화에 실패");
    const retry = screen.getByRole("button", { name: "화면 복구 다시 시도" });
    retry.focus();
    expect(document.activeElement).toBe(retry);
    await act(async () => { fireEvent.click(retry); });
    expect(resetRenderer).toHaveBeenCalledTimes(2);
    expect(controller.snapshot().phase).toBe("restored");
    expect(screen.queryByRole("alert")).toBeNull();
    controller.dispose();
  });
});
