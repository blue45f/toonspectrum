// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PublicSiteJourney } from "./public-site-journey";

afterEach(cleanup);

describe("accessible creative journey", () => {
  it("shows production-first shortcuts on the ToonStudio home", () => {
    render(<MemoryRouter><PublicSiteJourney pathname="/" locale="ko" /></MemoryRouter>);
    expect(screen.getByRole("navigation", { name: "제작 기능 바로가기" })).toBeTruthy();
    for (const label of ["제작 관리", "내 프로젝트", "새 작품", "작품 재료", "검수·내보내기"]) {
      expect(screen.getByRole("link", { name: new RegExp(label, "u") })).toBeTruthy();
    }
    expect(document.querySelectorAll('[aria-current="step"]').length).toBe(0);
  });
  it("marks the current step without calling the hub the current page", () => {
    render(<MemoryRouter><PublicSiteJourney pathname="/market/resource/brush" locale="ko" /></MemoryRouter>);
    const link = screen.getByRole("link", { name: /재료 고르기/u });
    expect(link.getAttribute("aria-current")).toBe("step");
    expect(document.querySelectorAll('[aria-current="step"]').length).toBe(1);
    expect(screen.getByRole("navigation", { name: "창작 단계별 바로가기" })).toBeTruthy();
  });
  it("updates route state and localized navigation without changing focus", () => {
    const view = render(<MemoryRouter><PublicSiteJourney pathname="/learn" locale="ko" /></MemoryRouter>);
    const link = screen.getByRole("link", { name: /기법 익히기/u });
    link.focus();
    view.rerender(<MemoryRouter><PublicSiteJourney pathname="/showcase/" locale="en" /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Share/u }).getAttribute("aria-current")).toBe("step");
    expect(document.activeElement).toBe(link);
    expect(document.querySelectorAll('[aria-current="step"]').length).toBe(1);
  });
});
