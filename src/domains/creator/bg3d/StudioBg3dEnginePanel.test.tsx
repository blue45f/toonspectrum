// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { selectStudioBg3dEngine } from "./studio-bg3d-engine-selection";
import { classifyStudioBg3dInAppBrowser } from "./studio-bg3d-inapp-browser";
import { StudioBg3dEnginePanel } from "./StudioBg3dEnginePanel";

import type { StudioBg3dWebGpuProbeResult } from "./studio-bg3d-webgpu-capability";

const SUPPORTED_PROBE: StudioBg3dWebGpuProbeResult = Object.freeze({
  supported: true,
  reason: "available",
  computeSupported: true,
  timestampQuerySupported: false,
  limits: Object.freeze({}),
});
const UNSUPPORTED_PROBE: StudioBg3dWebGpuProbeResult = Object.freeze({
  supported: false,
  reason: "api-unavailable",
  computeSupported: false,
  timestampQuerySupported: false,
  limits: Object.freeze({}),
});

const DESKTOP = classifyStudioBg3dInAppBrowser({
  userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/133.0.0.0 Safari/537.36",
});
const KAKAOTALK = classifyStudioBg3dInAppBrowser({
  userAgent: "Mozilla/5.0 (Linux; Android 15; wv) Mobile Safari/537.36 KAKAOTALK 10.6.5",
});

function planFor(overrides: Partial<Parameters<typeof selectStudioBg3dEngine>[0]> = {}) {
  return selectStudioBg3dEngine({
    preference: "auto",
    probe: SUPPORTED_PROBE,
    inApp: DESKTOP,
    deviceProfile: "desktop",
    webgpuRuntimeAvailable: true,
    ...overrides,
  });
}

afterEach(cleanup);

describe("StudioBg3dEnginePanel", () => {
  it("names the running engine and explains why it was chosen", () => {
    render(
      <StudioBg3dEnginePanel
        plan={planFor()}
        preference="auto"
        inApp={DESKTOP}
        probing={false}
        deviceLostMessage={null}
        onPreferenceChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("studio-bg3d-engine-active-backend").textContent)
      .toContain("WebGPU 사용 중");
    expect(screen.getByTestId("studio-bg3d-engine-status").textContent)
      .toContain("차세대 WebGPU 엔진");
  });

  it("keeps WebGPU visible but disabled when the host cannot run it", () => {
    render(
      <StudioBg3dEnginePanel
        plan={planFor({ probe: UNSUPPORTED_PROBE })}
        preference="auto"
        inApp={DESKTOP}
        probing={false}
        deviceLostMessage={null}
        onPreferenceChange={() => undefined}
      />,
    );

    const webgpuButton = screen.getByTestId("studio-bg3d-engine-preference-webgpu");
    expect(webgpuButton).toBeTruthy();
    expect((webgpuButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("studio-bg3d-engine-status").textContent)
      .toContain("WebGPU를 지원하지 않아");
  });

  it("tells the artist which in-app browser they are in and offers the opt-in", () => {
    const onPreferenceChange = vi.fn();
    render(
      <StudioBg3dEnginePanel
        plan={planFor({ inApp: KAKAOTALK })}
        preference="auto"
        inApp={KAKAOTALK}
        probing={false}
        deviceLostMessage={null}
        onPreferenceChange={onPreferenceChange}
      />,
    );

    expect(screen.getByText(/카카오톡 인앱 브라우저/u)).toBeTruthy();
    const webgpuButton = screen.getByTestId("studio-bg3d-engine-preference-webgpu");
    expect((webgpuButton as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(webgpuButton);
    expect(onPreferenceChange).toHaveBeenCalledWith("webgpu");
  });

  it("raises a device loss as an assertive alert instead of a quiet status", () => {
    render(
      <StudioBg3dEnginePanel
        plan={planFor()}
        preference="auto"
        inApp={DESKTOP}
        probing={false}
        deviceLostMessage="WebGPU 디바이스 연결이 끊어졌습니다."
        onPreferenceChange={() => undefined}
      />,
    );

    const status = screen.getByTestId("studio-bg3d-engine-status");
    expect(status.getAttribute("role")).toBe("alert");
    expect(status.textContent).toContain("끊어졌습니다");
  });

  it("locks every choice while the capability probe is still running", () => {
    render(
      <StudioBg3dEnginePanel
        plan={planFor()}
        preference="auto"
        inApp={DESKTOP}
        probing
        deviceLostMessage={null}
        onPreferenceChange={() => undefined}
      />,
    );

    for (const option of ["auto", "webgpu", "webgl2"] as const) {
      const button = screen.getByTestId(`studio-bg3d-engine-preference-${option}`);
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
    expect(screen.getByTestId("studio-bg3d-engine-active-backend").textContent).toContain("확인 중");
  });

  it("marks the selected preference for assistive technology", () => {
    render(
      <StudioBg3dEnginePanel
        plan={planFor({ preference: "webgl2" })}
        preference="webgl2"
        inApp={DESKTOP}
        probing={false}
        deviceLostMessage={null}
        onPreferenceChange={() => undefined}
      />,
    );

    expect(screen.getByTestId("studio-bg3d-engine-preference-webgl2").getAttribute("aria-pressed"))
      .toBe("true");
    expect(screen.getByTestId("studio-bg3d-engine-preference-auto").getAttribute("aria-pressed"))
      .toBe("false");
  });
});
