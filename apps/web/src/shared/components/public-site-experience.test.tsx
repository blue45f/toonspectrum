// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicSiteJourney } from "./public-site-journey";
import { PublicSiteNextSteps } from "./public-site-next-steps";
import { isPublicCreativeRoute } from "./site-public-routes";

vi.mock("@/shared/lib/i18n", () => ({ useI18n: (selector: (state: { lang: string }) => string) => selector({ lang: "ko" }) }));
afterEach(cleanup);

describe("public site experience boundaries", () => {
  it.each(["/", "/studio", "/studio/assets", "/settings", "/my", "/admin", "/privacy", "/market/manage"])("does not add promotional next steps on %s", (pathname) => {
    const { container } = render(<MemoryRouter><PublicSiteNextSteps pathname={pathname} /></MemoryRouter>);
    expect(container.children.length).toBe(0);
  });

  it.each(["/references", "/story-lab", "/about/crawler", "/research/assets"])("connects the public page %s", (pathname) => {
    expect(isPublicCreativeRoute(pathname)).toBe(true);
  });

  it("offers contextual, named onward links rather than another home hero", () => {
    render(<MemoryRouter><PublicSiteNextSteps pathname="/learn" /></MemoryRouter>);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toContain("다음 행동");
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
    for (const link of screen.getAllByRole("link")) {
      expect(link.textContent?.trim().length).toBeGreaterThan(0);
      expect(link.getAttribute("href")?.startsWith("/studio")).toBe(false);
    }
  });

  it("announces exactly one active journey step for a nested public page", () => {
    const { container } = render(<MemoryRouter><PublicSiteJourney pathname="/community/post/123" locale="ko" /></MemoryRouter>);
    const active = container.querySelectorAll('[aria-current="step"]');
    expect(active).toHaveLength(1);
    expect(active[0].getAttribute("href")).toBe("/showcase");
    expect(screen.getByRole("navigation", { name: "창작 단계별 바로가기" })).toBeTruthy();
  });

  it("renders English navigation without Korean action labels", () => {
    render(<MemoryRouter><PublicSiteJourney pathname="/market" locale="en" /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Resources/u }).getAttribute("aria-current")).toBe("step");
    expect(screen.queryByRole("link", { name: "재료 고르기" })).toBeNull();
  });
});
