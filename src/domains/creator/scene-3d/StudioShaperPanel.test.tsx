// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioShaperPanel } from "./StudioShaperPanel";
import {
  STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS,
} from "./studio-mannequin-model";

const BODY_PARAMS = {
  ...STUDIO_MANNEQUIN_DEFAULT_BODY_PARAMS,
  ...STUDIO_MANNEQUIN_DEFAULT_HEAD_PARAMS,
};

describe("StudioShaperPanel", () => {
  afterEach(() => cleanup());

  it("presents a visual-first ToonStudio workshop instead of copied branding", () => {
    render(<StudioShaperPanel bodyParams={BODY_PARAMS} />);

    expect(screen.getByText("캐릭터 워크숍")).toBeTruthy();
    expect(screen.getByText("6/14 슬롯 적용")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "캐릭터 구성" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "포즈" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "출력" })).toBeTruthy();
    expect(screen.queryByText("SHAPER")).toBeNull();
    expect(screen.queryByText(/네이버웹툰 3D 스타일/)).toBeNull();
    expect(screen.getAllByRole("img", { name: /미리보기/ }).length).toBeGreaterThan(1);
  });

  it("disables no-op asset slots with an exact capability reason", () => {
    render(<StudioShaperPanel bodyParams={BODY_PARAMS} />);

    const hair = screen.getByRole("button", { name: /헤어/ });
    expect(hair.getAttribute("aria-disabled")).toBe("true");
    fireEvent.click(hair);
    expect(screen.getByRole("status").textContent).toContain("3D 캐릭터 편집기");

    const pupil = screen.getByRole("button", { name: /눈동자/ });
    fireEvent.click(pupil);
    expect(screen.getByRole("status").textContent).toContain("홍채 메시");
  });

  it("applies only live preset categories and previews the same planned result", () => {
    const onSelectionChange = vi.fn();
    render(
      <StudioShaperPanel
        bodyParams={BODY_PARAMS}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /샤프 V라인/ }));
    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({ face: "face-sharp" }),
    );
    expect(screen.getByRole("status").textContent).toContain("실제 장면에 적용");
  });

  it("uses deterministic style recipes without claiming model inference", () => {
    const onSelectionChange = vi.fn();
    render(
      <StudioShaperPanel
        bodyParams={BODY_PARAMS}
        onSelectionChange={onSelectionChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /판타지 액션/ }));
    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({
        face: "face-sharp",
        nose: "nose-high",
        body: "body-muscular",
        bodypose: "pose-sword",
        handpose: "hand-fist",
      }),
    );
    expect(screen.getByText(/AI로 오해할 고정 추천이 아니라/)).toBeTruthy();
  });

  it("supports precise slider and exact-number body editing", () => {
    const onBodyParamsChange = vi.fn();
    render(
      <StudioShaperPanel
        bodyParams={BODY_PARAMS}
        onBodyParamsChange={onBodyParamsChange}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /정밀 수치 조절/ }));
    fireEvent.change(screen.getByRole("slider", { name: "신장" }), {
      target: { value: "181" },
    });
    expect(onBodyParamsChange).toHaveBeenCalledWith(
      expect.objectContaining({ heightCm: 181 }),
    );

    fireEvent.change(screen.getByRole("spinbutton", { name: "눈 크기 정확한 값" }), {
      target: { value: "1.24" },
    });
    expect(onBodyParamsChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ eyeScale: 1.24 }),
    );
  });

  it("applies real pose cards and opens reviewed photo-pose flow", () => {
    const onSelectionChange = vi.fn();
    const onTriggerPoseScanner = vi.fn();
    render(
      <StudioShaperPanel
        bodyParams={BODY_PARAMS}
        onSelectionChange={onSelectionChange}
        onTriggerPoseScanner={onTriggerPoseScanner}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "포즈" }));
    fireEvent.click(screen.getByRole("button", { name: /달리기/ }));
    expect(onSelectionChange).toHaveBeenCalledWith(
      expect.objectContaining({ bodypose: "pose-run" }),
    );

    fireEvent.click(screen.getByRole("button", { name: "사진 포즈 열기" }));
    expect(onTriggerPoseScanner).toHaveBeenCalledOnce();
  });

  it("exports semantic body layers and never exposes a fake drawing toggle", async () => {
    const onExportPsd = vi.fn();
    render(
      <StudioShaperPanel
        bodyParams={BODY_PARAMS}
        onExportPsd={onExportPsd}
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "출력" }));
    for (const layer of ["머리·목", "몸통", "왼팔", "오른팔", "왼다리", "오른다리", "선화"]) {
      expect(screen.getByText(layer)).toBeTruthy();
    }
    fireEvent.click(screen.getByRole("button", { name: "부위 레이어 PSD 내려받기" }));
    expect(onExportPsd).toHaveBeenCalledOnce();
    expect(screen.queryByRole("button", { name: /켜짐 \(Active\)/ })).toBeNull();
    expect(screen.getByText(/가짜 토글을 제공하지 않습니다/)).toBeTruthy();
  });
});
