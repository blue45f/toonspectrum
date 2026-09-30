// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { XrWebtoonArPreviewPanel } from "./XrWebtoonArPreviewPanel";
import type { StudioWebXrSupportSnapshot } from "../studio-webxr-session";

function supportWith(ar: "supported" | "unsupported" | "unknown"): StudioWebXrSupportSnapshot {
  return {
    kind: "toonstudio.studio-webxr-support",
    version: 1,
    secureContext: true,
    immersiveAr: ar,
    immersiveVr: "unknown",
  };
}

afterEach(() => {
  cleanup();
});

describe("XrWebtoonArPreviewPanel", () => {
  it("AR 지원 시 핵심 CTA가 'AR로 캐릭터 보기'이고 클릭 시 onStartAr 호출", () => {
    const onStartAr = vi.fn();
    render(
      <XrWebtoonArPreviewPanel
        support={supportWith("supported")}
        onStartAr={onStartAr}
        onEndAr={vi.fn()}
      />,
    );
    const cta = screen.getByRole("button", { name: "AR로 캐릭터 보기" });
    fireEvent.click(cta);
    expect(onStartAr).toHaveBeenCalledTimes(1);
  });

  it("AR 미지원 시 핵심 CTA가 '3D 미니어처로 보기'이고 다음 행동 안내를 보여준다", () => {
    const onOpenMiniature = vi.fn();
    render(
      <XrWebtoonArPreviewPanel
        support={supportWith("unsupported")}
        onStartAr={vi.fn()}
        onEndAr={vi.fn()}
        onOpenMiniature={onOpenMiniature}
      />,
    );
    const cta = screen.getByRole("button", { name: "3D 미니어처로 보기" });
    fireEvent.click(cta);
    expect(onOpenMiniature).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/AR을 열 수 없어요/)).toBeTruthy();
  });

  it("세션 실행 중이면 'AR 종료하기' 버튼을 보여준다", () => {
    const onEndAr = vi.fn();
    render(
      <XrWebtoonArPreviewPanel
        support={supportWith("supported")}
        sessionActive
        onStartAr={vi.fn()}
        onEndAr={onEndAr}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "AR 종료하기" }));
    expect(onEndAr).toHaveBeenCalledTimes(1);
  });

  it("오류가 있으면 role=alert로 노출한다", () => {
    render(
      <XrWebtoonArPreviewPanel
        support={supportWith("supported")}
        error="카메라 권한이 필요해요"
        onStartAr={vi.fn()}
        onEndAr={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert").textContent).toContain("카메라 권한이 필요해요");
  });

  it("사용법은 접힌 2차 정보로 제공한다", () => {
    render(
      <XrWebtoonArPreviewPanel
        support={supportWith("supported")}
        onStartAr={vi.fn()}
        onEndAr={vi.fn()}
      />,
    );
    const helpButton = screen.getByRole("button", { name: "AR 사용 방법이 궁금해요" });
    expect(helpButton.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/바닥이나 책상을 비추면/)).toBeNull();
    fireEvent.click(helpButton);
    expect(helpButton.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText(/바닥이나 책상을 비추면/)).toBeTruthy();
  });
});
