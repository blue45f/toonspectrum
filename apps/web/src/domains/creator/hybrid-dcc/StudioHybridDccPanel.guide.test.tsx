// @vitest-environment jsdom

/**
 * 정밀 3D 모델링 작업대의 첫 화면 안내: 빈 장면에서는 무엇·언제·왜와 세 단계를 먼저 보여 주고,
 * 시작하면 작업대로 넘어가며, 언제든 "사용법"으로 다시 열 수 있다. 미지원 브라우저에는 이유를 알린다.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioHybridDccEnvironmentNotice } from "./StudioHybridDccEnvironmentNotice";
import { StudioHybridDccPanel } from "./StudioHybridDccPanel";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function guideToggle(): HTMLButtonElement {
  const toggle = document.querySelector<HTMLButtonElement>("[data-studio-hybrid-dcc-guide-toggle]");
  if (!toggle) throw new Error("guide toggle is missing");
  return toggle;
}

describe("StudioHybridDccPanel first-screen guide", () => {
  it("opens on an empty scene with the purpose, three steps and start buttons", () => {
    render(<StudioHybridDccPanel />);

    const intro = document.querySelector<HTMLElement>("[data-studio-hybrid-dcc-intro]");
    expect(intro).not.toBeNull();
    expect(within(intro!).getByText(/컷에 자주 나오는 소품과 배경을 3D로 만드는 작업대/u)).toBeTruthy();
    expect(within(intro!).getAllByRole("listitem").length).toBeGreaterThanOrEqual(3);
    for (const name of ["큐브로 시작", "교실 세트로 시작", "3D 파일 가져오기"]) {
      expect(within(intro!).getByRole("button", { name })).toBeTruthy();
    }
    // 안내가 열려 있다는 사실을 "사용법" 버튼이 알린다.
    expect(guideToggle().getAttribute("aria-expanded")).toBe("true");
    expect(guideToggle().getAttribute("aria-controls")).toBe(intro!.id);
  });

  it("hands over to the workbench once an object exists, and reopens from the How to use button", async () => {
    render(<StudioHybridDccPanel />);

    fireEvent.click(screen.getByRole("button", { name: "큐브로 시작" }));
    await waitFor(() => {
      expect(document.querySelector("[data-studio-hybrid-dcc-stats]")?.getAttribute("data-assets")).toBe("1");
    });
    // 사용자가 직접 열거나 닫지 않았다면 오브젝트가 생긴 뒤에는 안내가 물러난다.
    expect(document.querySelector("[data-studio-hybrid-dcc-intro]")).toBeNull();
    expect(guideToggle().getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(guideToggle());
    expect(document.querySelector("[data-studio-hybrid-dcc-intro]")).not.toBeNull();
    expect(guideToggle().getAttribute("aria-expanded")).toBe("true");
  });

  it("keeps the guide closed after the person dismisses it, even while the scene is empty", () => {
    render(<StudioHybridDccPanel />);

    fireEvent.click(screen.getByRole("button", { name: "안내 닫기" }));
    expect(document.querySelector("[data-studio-hybrid-dcc-intro]")).toBeNull();
    expect(guideToggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("starts from a classroom set with one click", async () => {
    render(<StudioHybridDccPanel />);

    fireEvent.click(screen.getByRole("button", { name: "교실 세트로 시작" }));
    await waitFor(() => {
      expect(Number(document.querySelector("[data-studio-hybrid-dcc-stats]")?.getAttribute("data-assets"))).toBeGreaterThan(1);
    }, { timeout: 10_000 });
    expect(document.querySelector("[data-studio-hybrid-dcc-log]")?.textContent).toMatch(/편집 가능한 교실 세트 완료/u);
  });

  it("names the six work modes with plain-language hints and no jargon-only labels", () => {
    render(<StudioHybridDccPanel />);

    const nav = screen.getByRole("navigation", { name: "작업 모드" });
    expect(within(nav).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "모델링도형 만들고 다듬기",
      "공간 제작방·배경 세트",
      "정밀 CAD치수가 정확한 부품",
      "조형손으로 빚기 · 실험",
      "재질·UV텍스처 붙일 준비",
      "컷·선화카메라 컷을 원고로",
    ]);
  });

  it("explains in the top banner that this browser cannot draw the 3D view (no WebGL in jsdom)", () => {
    render(<StudioHybridDccPanel />);

    const notice = document.querySelector<HTMLElement>("[data-studio-hybrid-dcc-webgl-notice]");
    expect(notice).not.toBeNull();
    expect(notice!.getAttribute("role")).toBe("alert");
    expect(notice!.textContent).toContain("이 브라우저에서는 3D 화면을 열 수 없습니다");
    expect(notice!.textContent).toContain("하드웨어 가속");
    expect(notice!.textContent).toContain("저장된 작업은 그대로 안전합니다");
    // 안내는 안내 카드보다 위에 있어야 먼저 읽힌다.
    const intro = document.querySelector("[data-studio-hybrid-dcc-intro]")!;
    expect(notice!.compareDocumentPosition(intro) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("StudioHybridDccEnvironmentNotice", () => {
  it("lists the fix order and lets the person re-check without reloading", () => {
    const onRecheck = vi.fn();
    render(<StudioHybridDccEnvironmentNotice onRecheck={onRecheck} />);

    const steps = within(screen.getByRole("alert")).getAllByRole("listitem");
    expect(steps).toHaveLength(3);
    expect(steps[0]?.textContent).toContain("하드웨어 가속 사용");
    expect(steps[2]?.textContent).toContain("Chrome·Edge·Safari");
    fireEvent.click(screen.getByRole("button", { name: "다시 확인" }));
    expect(onRecheck).toHaveBeenCalledOnce();
  });
});
