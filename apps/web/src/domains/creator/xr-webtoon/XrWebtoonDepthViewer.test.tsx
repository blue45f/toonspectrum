// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { XrWebtoonDepthViewer } from "./XrWebtoonDepthViewer";
import type { XrDepthCut } from "./xr-webtoon-depth-model";

function makeCut(id: string): XrDepthCut {
  return {
    id,
    title: `컷 ${id}`,
    layers: [
      { id: `${id}-bg`, depth: 0.2, imageUrl: "https://example.com/bg.png", alt: `컷 ${id} 배경` },
      { id: `${id}-fg`, depth: 0.8, imageUrl: "https://example.com/fg.png", alt: `컷 ${id} 인물` },
    ],
  };
}

function mockMatchMedia(reduced: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockImplementation((query: string) => ({
      matches: reduced && query.includes("prefers-reduced-motion"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("XrWebtoonDepthViewer", () => {
  it("컷이 없으면 빈 상태 안내와 일러스트를 보여준다", () => {
    render(<XrWebtoonDepthViewer cuts={[]} />);
    expect(screen.getByText(/보여줄 컷이 없어요/)).toBeTruthy();
    expect(screen.getByText(/컷을 추가하면/)).toBeTruthy();
    expect(screen.getByLabelText("빈 상태 일러스트")).toBeTruthy();
  });

  it("컷 레이어 이미지를 렌더하고 접근성 alt를 유지한다", () => {
    render(<XrWebtoonDepthViewer cuts={[makeCut("c1")]} />);
    expect(screen.getByAltText("컷 c1 배경")).toBeTruthy();
    expect(screen.getByAltText("컷 c1 인물")).toBeTruthy();
    expect(screen.getByLabelText("컷 c1")).toBeTruthy();
  });

  it("입체감 강도 버튼을 누르면 강도가 순환한다", () => {
    render(<XrWebtoonDepthViewer cuts={[makeCut("c1")]} />);
    const button = screen.getByLabelText("입체감 강도 변경");
    expect(button.textContent).toContain("입체감 은은하게");
    fireEvent.click(button);
    expect(button.textContent).toContain("입체감 강하게");
    fireEvent.click(button);
    expect(button.textContent).toContain("입체감 끄기");
    fireEvent.click(button);
    expect(button.textContent).toContain("입체감 은은하게");
  });

  it("reduced-motion이면 정지 화면 안내 문구를 보여준다", () => {
    mockMatchMedia(true);
    render(<XrWebtoonDepthViewer cuts={[makeCut("c1")]} />);
    expect(screen.getByText(/움직임 줄이기가 켜져 있어/)).toBeTruthy();
  });

  it("움직임 줄이기가 없으면 스크롤 안내 문구를 보여준다", () => {
    mockMatchMedia(false);
    render(<XrWebtoonDepthViewer cuts={[makeCut("c1")]} />);
    expect(screen.getByText(/스크롤하면 배경과 인물이 따로 움직여요/)).toBeTruthy();
  });
});
