// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { XrWebtoonStudioPanel } from "./XrWebtoonStudioPanel";
import type { StudioWebXrSupportSnapshot } from "../studio-webxr-session";
import type { XrDepthCut } from "./xr-webtoon-depth-model";

const support: StudioWebXrSupportSnapshot = {
  kind: "toonstudio.studio-webxr-support",
  version: 1,
  secureContext: true,
  immersiveAr: "unsupported",
  immersiveVr: "unsupported",
};

const baseProps = {
  cuts: [] as readonly XrDepthCut[],
  support,
  onStartAr: vi.fn(),
  onStartVr: vi.fn(),
  onEndSession: vi.fn(),
};

afterEach(() => {
  cleanup();
});

describe("XrWebtoonStudioPanel", () => {
  it("제목과 5개 탭을 보여준다", () => {
    render(<XrWebtoonStudioPanel {...baseProps} />);
    expect(screen.getByText("XR 웹툰 스튜디오")).toBeTruthy();
    const tablist = screen.getByRole("tablist");
    expect(tablist).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(5);
  });

  it("탭을 누르면 해당 패널로 전환된다", () => {
    render(<XrWebtoonStudioPanel {...baseProps} />);
    // 기본 탭: 깊이 웹툰
    expect(screen.getByText("스크롤할수록 깊어지는 웹툰")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /AR 프리뷰/ }));
    expect(screen.getByRole("button", { name: "3D 미니어처로 보기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /VR 시어터/ }));
    expect(screen.getByText("컷들이 나를 감싸는 영화관")).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /3D→컷/ }));
    expect(screen.getByRole("button", { name: "웹툰 컷으로 만들기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: /VRM 배치/ }));
    expect(screen.getByRole("button", { name: "컷에 캐릭터 배치" })).toBeTruthy();
  });

  it("선택된 탭은 aria-selected=true다", () => {
    render(<XrWebtoonStudioPanel {...baseProps} />);
    const arTab = screen.getByRole("tab", { name: /AR 프리뷰/ });
    expect(arTab.getAttribute("aria-selected")).toBe("false");
    fireEvent.click(arTab);
    expect(arTab.getAttribute("aria-selected")).toBe("true");
  });
});
