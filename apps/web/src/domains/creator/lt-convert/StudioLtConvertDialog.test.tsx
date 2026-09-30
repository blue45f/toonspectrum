// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  StudioLtConvertDialog,
  type StudioLtConvertDialogSource,
} from "./StudioLtConvertDialog";

import type { StudioLtConvertResult } from "./studio-lt-convert";

// node/jsdom 환경에 ImageData가 없으면 최소 스텁을 제공한다.
if (typeof globalThis.ImageData === "undefined") {
  class TestImageData {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
    constructor(data: Uint8ClampedArray, width: number, height: number) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  }
  globalThis.ImageData = TestImageData as unknown as typeof ImageData;
}

function makeSource(status: StudioLtConvertDialogSource["status"]): StudioLtConvertDialogSource {
  if (status !== "ready") {
    return {
      status,
      imageData: null,
      error: status === "error" ? "소스 오류" : null,
      label: "테스트 소스",
    };
  }
  const data = new Uint8ClampedArray(4 * 4 * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 200;
    data[index + 1] = 200;
    data[index + 2] = 200;
    data[index + 3] = 255;
  }
  return {
    status: "ready",
    imageData: new ImageData(data, 4, 4),
    error: null,
    label: "테스트 소스",
  };
}

function renderDialog(overrides?: Partial<Parameters<typeof StudioLtConvertDialog>[0]>) {
  const onImportImage = vi.fn();
  const onApply = vi.fn();
  const onCancel = vi.fn();
  render(
    <StudioLtConvertDialog
      open
      source={makeSource("ready")}
      applyError={null}
      onImportImage={onImportImage}
      onApply={onApply}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onImportImage, onApply, onCancel };
}

afterEach(cleanup);

describe("StudioLtConvertDialog", () => {
  it("제목·슬라이더 3종·미리보기 토글·적용/취소 버튼을 렌더링한다", () => {
    renderDialog();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("LT 변환")).toBeTruthy();
    expect(screen.getByLabelText("톤 농도")).toBeTruthy();
    expect(screen.getByLabelText("선 굵기")).toBeTruthy();
    expect(screen.getByLabelText("선 임계값")).toBeTruthy();
    expect(screen.getByLabelText("도트 스크린톤")).toBeTruthy();
    expect(screen.getByRole("button", { name: "원본" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "선화" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "톤" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "적용" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "취소" })).toBeTruthy();
  });

  it("슬라이더를 움직이면 표시 값이 바뀐다", () => {
    renderDialog();
    const toneSlider = screen.getByLabelText("톤 농도");
    expect(screen.getByText("4단계")).toBeTruthy();
    fireEvent.change(toneSlider, { target: { value: "8" } });
    expect(screen.getByText("8단계")).toBeTruthy();

    const thicknessSlider = screen.getByLabelText("선 굵기");
    fireEvent.change(thicknessSlider, { target: { value: "5" } });
    expect(screen.getByText("5px")).toBeTruthy();
  });

  it("미리보기 토글 버튼의 aria-pressed가 바뀐다", () => {
    renderDialog();
    const lineTab = screen.getByRole("button", { name: "선화" });
    const toneTab = screen.getByRole("button", { name: "톤" });
    expect(lineTab.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toneTab);
    expect(toneTab.getAttribute("aria-pressed")).toBe("true");
    expect(lineTab.getAttribute("aria-pressed")).toBe("false");
  });

  it("적용을 누르면 선화·톤 ImageData 쌍이 onApply로 전달된다", () => {
    const { onApply } = renderDialog();
    fireEvent.click(screen.getByRole("button", { name: "적용" }));
    expect(onApply).toHaveBeenCalledTimes(1);
    const result = onApply.mock.calls[0]?.[0] as StudioLtConvertResult;
    expect(result.lineLayer).toBeInstanceOf(ImageData);
    expect(result.toneLayer).toBeInstanceOf(ImageData);
    expect(result.lineLayer.width).toBe(4);
    expect(result.toneLayer.height).toBe(4);
  });

  it("소스가 준비되지 않으면 적용 버튼이 비활성화된다", () => {
    renderDialog({ source: makeSource("capturing") });
    const applyButton = screen.getByRole("button", { name: "적용" });
    expect((applyButton as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("소스를 불러오는 중…")).toBeTruthy();
  });

  it("소스 오류 상태에서는 오류 메시지와 이미지 불러오기를 보여준다", () => {
    const { onImportImage } = renderDialog({ source: makeSource("error") });
    expect(screen.getByRole("alert").textContent).toContain("소스 오류");
    const fileInput = screen.getByLabelText("이미지 파일 불러오기");
    const file = new File(["x"], "test.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(onImportImage).toHaveBeenCalledTimes(1);
    expect(onImportImage.mock.calls[0]?.[0]).toBe(file);
  });

  it("applyError가 있으면 경고로 표시한다", () => {
    renderDialog({ applyError: "레이어 저장 실패" });
    expect(screen.getByRole("alert").textContent).toContain("레이어 저장 실패");
  });

  it("open이 false면 아무것도 렌더링하지 않는다", () => {
    const { container } = render(
      <StudioLtConvertDialog
        open={false}
        source={makeSource("ready")}
        applyError={null}
        onImportImage={vi.fn()}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
