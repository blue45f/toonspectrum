// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { PublicSiteJourney } from "./public-site-journey";

afterEach(cleanup);

describe("accessible creative journey", () => {
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
