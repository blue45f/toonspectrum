// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { XrWebtoonVrTheaterPanel } from "./XrWebtoonVrTheaterPanel";
import type { StudioWebXrSupportSnapshot } from "../studio-webxr-session";

function supportWith(vr: "supported" | "unsupported" | "unknown"): StudioWebXrSupportSnapshot {
  return {
    kind: "toonstudio.studio-webxr-support",
    version: 1,
    secureContext: true,
    immersiveAr: "unknown",
    immersiveVr: vr,
  };
}

afterEach(() => {
  cleanup();
});

describe("XrWebtoonVrTheaterPanel", () => {
  it("핵심 CTA 'VR에서 보기'가 onStartVr을 호출한다", () => {
    const onStartVr = vi.fn();
    render(
      <XrWebtoonVrTheaterPanel
        cutCount={4}
        support={supportWith("supported")}
        onStartVr={onStartVr}
        onEndVr={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "VR에서 보기" }));
    expect(onStartVr).toHaveBeenCalledTimes(1);
  });

  it("세션 중이면 'VR 종료하기'를 보여준다", () => {
    const onEndVr = vi.fn();
    render(
      <XrWebtoonVrTheaterPanel
        cutCount={4}
        support={supportWith("supported")}
        sessionActive
        onStartVr={vi.fn()}
        onEndVr={onEndVr}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "VR 종료하기" }));
    expect(onEndVr).toHaveBeenCalledTimes(1);
  });

  it("컷이 없으면 다음 행동 안내를 보여준다", () => {
    render(
      <XrWebtoonVrTheaterPanel
        cutCount={0}
        support={supportWith("supported")}
        onStartVr={vi.fn()}
        onEndVr={vi.fn()}
      />,
    );
    expect(screen.getByText(/감상할 컷이 없어요/)).toBeTruthy();
  });

  it("VR 미지원 시 안내 문구를 보여준다", () => {
    render(
      <XrWebtoonVrTheaterPanel
        cutCount={3}
        support={supportWith("unsupported")}
        onStartVr={vi.fn()}
        onEndVr={vi.fn()}
      />,
    );
    expect(screen.getByText(/이 기기에서는 VR을 열 수 없어요/)).toBeTruthy();
  });

  it("스크린 거리 버튼으로 갤러리 지도 라벨이 바뀐다", () => {
    render(
      <XrWebtoonVrTheaterPanel
        cutCount={3}
        support={supportWith("supported")}
        onStartVr={vi.fn()}
        onEndVr={vi.fn()}
      />,
    );
    expect(screen.getByText(/갤러리 배치도 · 보통/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "가깝게" }));
    expect(screen.getByText(/갤러리 배치도 · 가깝게/)).toBeTruthy();
  });

  it("읽기 미리보기에서 다음 컷으로 이동하면 진행률이 오른다", () => {
    render(
      <XrWebtoonVrTheaterPanel
        cutCount={4}
        support={supportWith("supported")}
        onStartVr={vi.fn()}
        onEndVr={vi.fn()}
      />,
    );
    expect(screen.getByText(/컷 1 \/ 4 · 0%/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "다음 컷 미리보기" }));
    // 진행률 = currentIndex / (total - 1) → 1/3 ≈ 33%
    expect(screen.getByText(/컷 2 \/ 4 · 33%/)).toBeTruthy();
  });
});
