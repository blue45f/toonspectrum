// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BackToTop } from "./back-to-top";

afterEach(() => {
  cleanup();
});

/**
 * 우하단 플로팅 스태킹 계약 (floating-menu.css · app/styles/sitewide-visual-ux.css 참조):
 *  데스크톱: BackToTop(bottom 4.5rem) → FloatingControls 행(bottom 1rem) — 겹치지 않는다.
 *  모바일: 하단 탭 위 한 열 — ⚙(--site-float-base) → 음성 안내 → BackToTop(--site-float-top-bottom).
 */
describe("BackToTop floating stack contract", () => {
  it("데스크톱에서 FloatingControls 행과 겹치지 않는 위치에 렌더된다", () => {
    render(<BackToTop />);
    const btn = screen.getByRole("button", { hidden: true });
    expect(btn.getAttribute("data-back-to-top")).toBe("true");
    // 이전 bottom-4 (FloatingControls 행과 정확히 겹침) 회귀 방지
    expect(btn.className).not.toContain("bottom-4 ");
    expect(btn.className).toContain("bottom-[4.5rem]");
    expect(btn.className).toContain("ts-float");
    expect(btn.className).toContain("z-[70]");
  });

  it("모바일에서 하단 탭 위 플로팅 열의 맨 위 칸에 위치한다", () => {
    render(<BackToTop />);
    const btn = screen.getByRole("button", { hidden: true });
    // 이전 8.75rem (토글과 0.25rem 차이로 40px 겹침)·고정 4.5rem(탭 높이와 무관) 회귀 방지
    expect(btn.className).not.toContain("8.75rem");
    expect(btn.className).not.toContain("max-md:bottom-[calc(4.5rem");
    expect(btn.className).toContain("max-md:bottom-[var(--site-float-top-bottom)]");
  });

  it("640px 이상 스크롤하면 나타나고 포커스를 최상단으로 옮긴다", async () => {
    render(
      <main>
        <div id="main-content" tabIndex={-1} />
        <BackToTop />
      </main>
    );
    const btn = screen.getByRole("button", { hidden: true });
    expect(btn.className).toContain("opacity-0");

    Object.defineProperty(window, "scrollY", { value: 700, configurable: true });
    fireEvent.scroll(window);

    await waitFor(() => expect(btn.className).toContain("opacity-100"));
    expect(btn.getAttribute("tabIndex")).toBe("0");
  });
});
