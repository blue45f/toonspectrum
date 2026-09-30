// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  StudioTextureToneLab,
  type StudioTextureToneLabProps,
} from "./StudioTextureToneLab";

afterEach(cleanup);

function props(
  overrides: Partial<StudioTextureToneLabProps> = {},
): StudioTextureToneLabProps {
  return { ...overrides };
}

describe("StudioTextureToneLab", () => {
  it("헤드라인과 4개 탭을 렌더링한다", () => {
    render(<StudioTextureToneLab {...props()} />);
    expect(
      screen.getByText(
        "브러시에 종이결을 입히고, 만화 톤을 붙이고, 색감을 한 번에 바꾸는 실험실",
      ),
    ).toBeTruthy();
    for (const label of ["이중 브러시", "스크린톤", "그라데이션 맵", "타임랩스"]) {
      expect(screen.getByRole("tab", { name: new RegExp(label) })).toBeTruthy();
    }
  });

  it("initialTab으로 시작 탭을 지정할 수 있다", () => {
    render(<StudioTextureToneLab {...props({ initialTab: "screentone" })} />);
    expect(screen.getByLabelText("농도", { exact: false })).toBeTruthy();
  });

  it("탭을 전환하면 해당 패널이 표시된다", () => {
    render(<StudioTextureToneLab {...props()} />);
    fireEvent.click(screen.getByRole("tab", { name: /스크린톤/ }));
    expect(screen.getByRole("tab", { name: /스크린톤/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(screen.getByLabelText("잉크 색")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: /그라데이션 맵/ }));
    expect(screen.getByLabelText("그라데이션 맵 프리셋")).toBeTruthy();
  });

  it("이중 브러시 탭에서 조합 프리셋을 바꾸면 컨트롤 값이 바뀐다", () => {
    render(<StudioTextureToneLab {...props()} />);
    const combo = screen.getByLabelText("조합 프리셋") as HTMLSelectElement;
    fireEvent.change(combo, { target: { value: "marker-canvas" } });
    const blend = screen.getByLabelText("결합 모드") as HTMLSelectElement;
    expect(blend.value).toBe("multiply");
    const strength = screen.getByLabelText(/질감 강도/) as HTMLInputElement;
    expect(Number(strength.value)).toBeCloseTo(0.45, 5);
  });

  it("스크린톤 탭에서 농도 슬라이더를 움직이면 실측이 표시된다", () => {
    render(<StudioTextureToneLab {...props({ initialTab: "screentone" })} />);
    const density = screen.getByLabelText(/농도/) as HTMLInputElement;
    fireEvent.change(density, { target: { value: "60" } });
    const label = document.querySelector('label[for="tone-density"]');
    expect(label?.textContent).toContain("60%");
    expect(label?.textContent).toContain("실측");
  });

  it("그라데이션 맵 탭에서 프리셋을 바꾸고 정지점을 추가할 수 있다", () => {
    render(<StudioTextureToneLab {...props({ initialTab: "gradient-map" })} />);
    const preset = screen.getByLabelText("그라데이션 맵 프리셋") as HTMLSelectElement;
    fireEvent.change(preset, { target: { value: "cyberpunk" } });
    expect(screen.getAllByLabelText(/정지점 색상/).length).toBe(4);
    fireEvent.click(screen.getByText("정지점 추가"));
    expect(screen.getAllByLabelText(/정지점 색상/).length).toBe(5);
  });

  it("타임랩스 탭에서 샘플 녹화를 만들면 재생 컨트롤이 나타난다", () => {
    render(<StudioTextureToneLab {...props({ initialTab: "timelapse" })} />);
    const recordButton = screen.getByRole("button", { name: "샘플 녹화 만들기" });
    expect(recordButton).toBeTruthy();
    fireEvent.click(recordButton);
    expect(screen.getByText("재생")).toBeTruthy();
    expect(screen.getByLabelText("재생 속도")).toBeTruthy();
    expect(screen.getByLabelText("재생 위치")).toBeTruthy();
    // 통계 표시
    expect(screen.getByText("스트로크")).toBeTruthy();
    expect(screen.getByText("WebM 추정 크기")).toBeTruthy();
  });

  it("타임랩스 내보내기 가이드를 펼칠 수 있다", () => {
    render(<StudioTextureToneLab {...props({ initialTab: "timelapse" })} />);
    fireEvent.click(screen.getByRole("button", { name: "샘플 녹화 만들기" }));
    const toggle = screen.getByText("MediaRecorder WebM 내보내기 가이드");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByText(/captureStream/).length).toBeGreaterThanOrEqual(1);
  });

  it("테마 토글 버튼이 있다", () => {
    render(<StudioTextureToneLab {...props()} />);
    const toggle = screen.getByRole("button", { name: "라이트 테마로 전환" });
    fireEvent.click(toggle);
    expect(
      screen.getByRole("button", { name: "다크 테마로 전환" }),
    ).toBeTruthy();
  });
});
