// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Camera, Loader2 } from "lucide-react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioBg3dAiReferenceAction,
  type StudioBg3dAiReferenceActionProps,
} from "./StudioBg3dViewPanel";
import viewPanelSource from "./StudioBg3dViewPanel.tsx?raw";

afterEach(cleanup);

function renderAiReferenceAction(
  overrides: Partial<StudioBg3dAiReferenceActionProps> = {},
) {
  const onUseCurrentFrameAsAiReference = vi.fn();
  render(
    <StudioBg3dAiReferenceAction
      CameraIcon={Camera}
      LoaderIcon={Loader2}
      onUseCurrentFrameAsAiReference={onUseCurrentFrameAsAiReference}
      {...overrides}
    />,
  );
  return onUseCurrentFrameAsAiReference;
}

describe("Studio BG3D current-shot AI reference action", () => {
  it("explains the review boundary and sends the enabled action through its callback", () => {
    const onUseCurrentFrameAsAiReference = renderAiReferenceAction();
    const button = screen.getByRole("button", { name: "현재 샷으로 AI 시안" });
    const description = screen.getByText(
      "현재 프레임을 구도 참조로 보냅니다. 실제 AI 호출은 다음 검토 화면에서 확인을 마친 뒤에만 시작됩니다.",
    );

    expect((button as HTMLButtonElement).disabled).toBe(false);
    expect(button.getAttribute("aria-busy")).toBe("false");
    expect(button.getAttribute("aria-describedby")).toBe(description.id);
    expect(button.className).toContain("min-h-11");
    expect(button.className).toContain("w-full");

    fireEvent.click(button);

    expect(onUseCurrentFrameAsAiReference).toHaveBeenCalledTimes(1);
  });

  it("announces preparation, disables repeat submission, and never invokes the callback while busy", () => {
    const onUseCurrentFrameAsAiReference = renderAiReferenceAction({ busy: true });
    const button = screen.getByRole("button", {
      name: "현재 샷으로 AI 시안 준비 중",
    });

    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(
      screen.getByText(
        "현재 프레임을 구도 참조로 보내고 있습니다. 실제 AI 호출은 다음 검토 화면에서 확인을 마친 뒤에만 시작됩니다.",
      ),
    ).toBeTruthy();

    fireEvent.click(button);

    expect(onUseCurrentFrameAsAiReference).not.toHaveBeenCalled();
  });

  it("keeps the unavailable reason visible and blocks the callback while disabled", () => {
    const onUseCurrentFrameAsAiReference = renderAiReferenceAction({ disabled: true });
    const button = screen.getByRole("button", { name: "현재 샷으로 AI 시안" });

    expect((button as HTMLButtonElement).disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("false");
    expect(
      screen.getByText(
        "현재 상태에서는 프레임을 구도 참조로 보낼 수 없습니다. 실제 AI 호출은 다음 검토 화면에서 확인을 마친 뒤에만 시작됩니다.",
      ),
    ).toBeTruthy();

    fireEvent.click(button);

    expect(onUseCurrentFrameAsAiReference).not.toHaveBeenCalled();
  });

  it("keeps the parent callback optional and combines editor locks with the explicit disabled state", () => {
    expect(viewPanelSource).toContain(
      "readonly onUseCurrentFrameAsAiReference?: () => void;",
    );
    expect(viewPanelSource).toContain(
      "const aiReferenceActionDisabled =\n    aiReferenceDisabled || cameraControlsDisabled;",
    );
    expect(viewPanelSource).toContain(
      "{onUseCurrentFrameAsAiReference ? (",
    );
    expect(viewPanelSource).toContain(
      "onUseCurrentFrameAsAiReference={onUseCurrentFrameAsAiReference}",
    );
  });
});
