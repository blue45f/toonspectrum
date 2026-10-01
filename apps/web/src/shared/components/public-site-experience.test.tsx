// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicSiteAtelierJourney, PublicSiteNextSteps } from "./public-site-next-steps";
import { isPublicCreativeRoute } from "./site-public-routes";

vi.mock("@/shared/lib/i18n", () => ({ useI18n: (selector: (state: { lang: string }) => string) => selector({ lang: "ko" }) }));
afterEach(cleanup);

describe("public site experience boundaries", () => {
  it.each(["/", "/studio", "/studio/assets", "/settings", "/my", "/admin", "/privacy", "/market/manage"])("does not add promotional next steps on %s", (pathname) => {
    const { container } = render(<MemoryRouter><PublicSiteNextSteps pathname={pathname} /></MemoryRouter>);
    expect(container.children.length).toBe(0);
  });

  it.each(["/terms", "/privacy", "/copyright", "/privacy/"])("공개 정책 %s에는 장식 장면과 다음 작업 홍보를 추가하지 않는다", (pathname) => {
    expect(isPublicCreativeRoute(pathname)).toBe(true);
    const { container } = render(<MemoryRouter><PublicSiteAtelierJourney pathname={pathname} /><PublicSiteNextSteps pathname={pathname} /></MemoryRouter>);
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

  it("다음 작업을 먼저 보여 주고 기존 도구 체험은 선택해 펼칠 수 있다", () => {
    const { container } = render(<MemoryRouter><PublicSiteAtelierJourney pathname="/learn" /></MemoryRouter>);
    const preview = container.querySelector("details");
    const summary = preview?.querySelector("summary");
    expect(preview?.open).toBe(false);
    expect(summary?.textContent).toContain("작업실 미리 체험하기");
    expect(container.firstElementChild?.classList.contains("public-site-next")).toBe(true);
    expect(summary).not.toBeNull();
    if (!summary) throw new Error("체험 열기 조작부가 없습니다.");
    fireEvent.click(summary);
    expect(preview?.open).toBe(true);
    expect(container.querySelector('[data-testid="site-atelier-chapter"]')).toBeTruthy();
    fireEvent.click(summary);
    expect(preview?.open).toBe(false);
  });

  it.each(["/about/studio", "/ABOUT/STUDIO/", "/product-tour"])("%s에서 제공하지 않는 빈 체험을 열도록 안내하지 않는다", (pathname) => {
    const { container } = render(<MemoryRouter><PublicSiteAtelierJourney pathname={pathname} /></MemoryRouter>);
    expect(container.querySelector("[data-public-wayfinder]")).not.toBeNull();
    expect(container.querySelector("details")).toBeNull();
    expect(container.querySelector('[data-testid="site-atelier-chapter"]')).toBeNull();
  });

});
