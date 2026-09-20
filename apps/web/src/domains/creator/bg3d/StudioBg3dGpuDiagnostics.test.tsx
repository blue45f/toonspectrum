// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioScene3dGpuDiagnostics } from "../scene3d/studio-scene3d-gpu-diagnostics";
import { StudioBg3dGpuDiagnostics } from "./StudioBg3dGpuDiagnostics";

afterEach(cleanup);
describe("GPU diagnostics UI", () => {
  it("does not substitute frame timing when timestamps are unsupported", () => {
    const diagnostics = createStudioScene3dGpuDiagnostics();
    diagnostics.attach({ isWebGLRenderer: true }, vi.fn());
    render(<StudioBg3dGpuDiagnostics diagnostics={diagnostics} />);
    expect((screen.getByRole("button", { name: "GPU 렌더 시간 측정" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("프레임 시간으로 대신 계산하지 않습니다");
  });
  it("separates GPU and CPU values and only samples on explicit request", () => {
    const source = createStudioScene3dGpuDiagnostics();
    const request = vi.fn();
    const snapshot = Object.freeze({ reason: null, busy: false, canRequest: true,
      sample: { gpuPassTotalMs: 2.5, cpuSubmitMs: 7.5, passCount: 3, width: 640, height: 480 } });
    const diagnostics = { ...source, request, getSnapshot: () => snapshot };
    render(<StudioBg3dGpuDiagnostics diagnostics={diagnostics} />);
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByText("2.500 ms")).toBeTruthy();
    expect(screen.getByText("7.500 ms")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "GPU 렌더 시간 측정" }));
    expect(request).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/전체 프레임 시간이나 안정 상태 평균이 아니며/)).toBeTruthy();
  });
});
