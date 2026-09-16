// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccessibilityPage } from "./AccessibilityPage";

vi.mock("@/hooks/use-document-title", () => ({ useDocumentTitle: vi.fn() }));

afterEach(cleanup);

describe("accessibility page", () => {
  it("offers a local-only display preview and transparent support boundaries", () => {
    render(<MemoryRouter><AccessibilityPage /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /표시 방식을 직접 확인하세요|Test display choices/u })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /현재 알려진 지원 범위|Known support boundaries/u })).toBeTruthy();
    expect(screen.getByRole("link", { name: /접근성 문제 제보|Report an accessibility issue/u }).getAttribute("href"))
      .toBe("/feedback?type=bug&tag=accessibility");
  });

  it("changes only the preview and can reset every preference", () => {
    render(<MemoryRouter><AccessibilityPage /></MemoryRouter>);
    const slider = screen.getByRole("slider");
    const contrast = screen.getByRole("button", { name: /강한 대비|Stronger contrast/u });
    const motion = screen.getByRole("button", { name: /모션 감소|Reduce motion/u });
    const preview = document.querySelector<HTMLElement>("[data-accessibility-preview]");
    expect(preview?.style.fontSize).toBe("100%");
    fireEvent.change(slider, { target: { value: "140" } });
    fireEvent.click(contrast);
    fireEvent.click(motion);
    expect(preview?.style.fontSize).toBe("140%");
    expect(contrast.getAttribute("aria-pressed")).toBe("true");
    expect(motion.getAttribute("aria-pressed")).toBe("true");
    expect(preview?.hasAttribute("data-strong-contrast")).toBe(true);
    expect(preview?.hasAttribute("data-reduced-motion")).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /체험 초기화|Reset preview/u }));
    expect(preview?.style.fontSize).toBe("100%");
    expect(contrast.getAttribute("aria-pressed")).toBe("false");
    expect(motion.getAttribute("aria-pressed")).toBe("false");
  });
});
