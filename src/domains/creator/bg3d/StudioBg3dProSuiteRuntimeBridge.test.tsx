// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioBg3dProSuiteRuntimeContext,
  type StudioBg3dProSuiteRuntimeValue,
} from "./studio-bg3d-pro-suite-runtime-context";
import { StudioBg3dCinematicDirectorPanel } from "./StudioBg3dCinematicDirectorPanel";
import { StudioBg3dMultiPassExporterPanel } from "./StudioBg3dMultiPassExporterPanel";

function createRuntime(
  overrides: Partial<StudioBg3dProSuiteRuntimeValue> = {},
): StudioBg3dProSuiteRuntimeValue {
  return {
    disabled: false,
    baseCamera: {
      position: [0, 1.6, 6],
      target: [0, 1.4, 0],
      fovDegrees: 45,
      projection: "perspective",
      nearClip: 0.01,
    },
    productionShots: [
      {
        id: "shot-a",
        name: "장면 연동 와이드",
        camera: { position: [0, 1.6, 6], target: [0, 1.4, 0], fovDegrees: 50 },
      },
      {
        id: "shot-b",
        name: "장면 연동 클로즈업",
        camera: { position: [0, 1.6, 2], target: [0, 1.5, 0], fovDegrees: 24 },
      },
    ],
    onApplyCameraView: vi.fn(),
    onCaptureCurrentShot: vi.fn(),
    onApplyProductionShot: vi.fn(),
    onMoveProductionShot: vi.fn(),
    onRemoveProductionShot: vi.fn(),
    onUseCurrentFrameAsAiReference: vi.fn(),
    aiReferenceBusy: false,
    aiReferenceDisabled: false,
    ...overrides,
  };
}

describe("Studio 3D Pro Suite runtime bridge", () => {
  afterEach(() => cleanup());

  it("routes nested director commands to the canonical scene callbacks", () => {
    const runtime = createRuntime();
    render(
      <StudioBg3dProSuiteRuntimeContext.Provider value={runtime}>
        <StudioBg3dCinematicDirectorPanel />
      </StudioBg3dProSuiteRuntimeContext.Provider>,
    );

    expect(screen.getByText("장면 연동")).toBeDefined();
    expect(screen.getByText("장면 연동 와이드")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "현재 장면을 컷으로 저장" }));
    expect(runtime.onCaptureCurrentShot).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByLabelText("장면 연동 클로즈업 위로 이동"));
    expect(runtime.onMoveProductionShot).toHaveBeenCalledWith("shot-b", 0);

    fireEvent.click(screen.getAllByRole("button", { name: "이동" })[0]!);
    expect(runtime.onApplyProductionShot).toHaveBeenCalledWith("shot-a");

    fireEvent.click(screen.getByRole("button", { name: "현재 컷을 AI 구도·포즈 참조로 보내기" }));
    expect(runtime.onUseCurrentFrameAsAiReference).toHaveBeenCalledTimes(1);
  });

  it("commits a production angle preset around the current focus target", () => {
    const runtime = createRuntime();
    render(
      <StudioBg3dProSuiteRuntimeContext.Provider value={runtime}>
        <StudioBg3dCinematicDirectorPanel />
      </StudioBg3dProSuiteRuntimeContext.Provider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /로우 앵글 앙각/ }));

    expect(runtime.onApplyCameraView).toHaveBeenCalledTimes(1);
    const camera = vi.mocked(runtime.onApplyCameraView).mock.calls[0]?.[0];
    expect(camera?.position).toEqual([0, 1.7, 2.5]);
    expect(camera?.target).toEqual([0, 1.4, 0]);
    expect(camera?.fovDegrees).toBe(28);
    expect(camera?.projection).toBe("perspective");
    expect(camera?.zoom).toBe(1);
    expect(camera?.lensShift).toEqual([0, 0]);

    const up = camera?.up;
    expect(up).toBeDefined();
    if (!up || !camera) return;
    const forward = [
      camera.target[0] - camera.position[0],
      camera.target[1] - camera.position[1],
      camera.target[2] - camera.position[2],
    ] as const;
    const forwardLength = Math.hypot(...forward);
    const upLength = Math.hypot(...up);
    const alignment = (
      forward[0] * up[0] + forward[1] * up[1] + forward[2] * up[2]
    ) / (forwardLength * upLength);
    expect(upLength).toBeCloseTo(1, 8);
    expect(alignment).toBeCloseTo(0, 8);
  });

  it("inherits capture locks in the nested multipass exporter", () => {
    const runtime = createRuntime({ disabled: true, aiReferenceDisabled: true });
    render(
      <StudioBg3dProSuiteRuntimeContext.Provider value={runtime}>
        <StudioBg3dMultiPassExporterPanel />
      </StudioBg3dProSuiteRuntimeContext.Provider>,
    );

    expect(
      screen.getByText("레이어별 패스 렌더링 & 다운로드 시작").closest("button")?.disabled,
    ).toBe(true);
    expect(screen.getByRole("button", { name: "AI 제어맵" }).hasAttribute("disabled")).toBe(true);
  });
});
