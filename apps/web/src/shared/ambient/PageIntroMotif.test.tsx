// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PageIntroMotif } from "./PageIntroMotif";
import { writeAmbientIntensity } from "./ambient-preferences";

vi.mock("@/shared/lib/i18n", () => ({
  useI18n: (selector: (state: { lang: string }) => string) => selector({ lang: "ko-KR" }),
}));

function stubReducedMotion(reduce: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduce : false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

describe("PageIntroMotif", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("담당 경로에서 모티프 칩을 렌더링한다", () => {
    stubReducedMotion(false);
    writeAmbientIntensity("subtle");
    render(<PageIntroMotif pathname="/production/projects/demo/overview" />);
    const chip = screen.getByRole("button", { name: "인트로 건너뛰기" });
    expect(chip.getAttribute("data-page-intro-motif")).toBe("pipeline");
  });

  it("담당 영역 밖에서는 렌더링하지 않는다", () => {
    stubReducedMotion(false);
    writeAmbientIntensity("subtle");
    const { container } = render(<PageIntroMotif pathname="/market" />);
    expect(container.firstChild).toBeNull();
  });

  it("움직임 줄이기에서는 렌더링하지 않는다", () => {
    stubReducedMotion(true);
    writeAmbientIntensity("subtle");
    const { container } = render(<PageIntroMotif pathname="/collaborate" />);
    expect(container.firstChild).toBeNull();
  });

  it("앰비언트 끔에서는 렌더링하지 않는다", () => {
    stubReducedMotion(false);
    writeAmbientIntensity("off");
    const { container } = render(<PageIntroMotif pathname="/messages" />);
    expect(container.firstChild).toBeNull();
    writeAmbientIntensity("subtle");
  });

  it("클릭하면 칩이 사라진다", () => {
    stubReducedMotion(false);
    writeAmbientIntensity("subtle");
    render(<PageIntroMotif pathname="/team/people" />);
    const chip = screen.getByRole("button", { name: "인트로 건너뛰기" });
    fireEvent.click(chip);
    expect(screen.queryByRole("button", { name: "인트로 건너뛰기" })).toBeNull();
  });

  it("ESC를 누르면 칩이 사라진다", () => {
    stubReducedMotion(false);
    writeAmbientIntensity("subtle");
    render(<PageIntroMotif pathname="/studio/p/demo/overview" />);
    expect(screen.getByRole("button", { name: "인트로 건너뛰기" })).not.toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("button", { name: "인트로 건너뛰기" })).toBeNull();
  });
});
