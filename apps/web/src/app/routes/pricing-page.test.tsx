// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { PricingPage } from "./pricing-page";

// 폴리시 컴포넌트(TiltCard/CountUp/PulseCta)의 reduced-motion 분기를
// live 페이지 구조에서도 검증하기 위해 reduced-motion 환경을 강제한다.
// 기존 계약 테스트는 모션과 무관한 단언만 하므로 영향을 받지 않는다.
vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();
  return { ...actual, useReducedMotion: () => true };
});

afterEach(cleanup);

function renderPricing() {
  render(
    <MemoryRouter initialEntries={["/pricing"]}>
      <PricingPage />
    </MemoryRouter>,
  );
}

describe("pricing page", () => {
  it("presents the simple free/pro structure with a full tier comparison", () => {
    renderPricing();
    expect(screen.getByRole("heading", { level: 1, name: "핵심 기능은 무료로 시작하세요" })).toBeTruthy();
    // 히어로 카드는 무료/Pro 두 장만 노출한다.
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("article", { name: "Free" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "Pro" })).toBeTruthy();
    // 전체 등급 비교 표에서는 4개 등급을 모두 보여준다.
    expect(screen.getByRole("heading", { name: "전체 등급 비교" })).toBeTruthy();
    const table = screen.getByRole("table");
    for (const plan of ["Free", "Creator", "Pro", "Team"]) {
      expect(within(table).getByRole("columnheader", { name: plan })).toBeTruthy();
    }
    expect(screen.getByText("베타 기간이라 결제가 꺼져 있습니다", { exact: false })).toBeTruthy();
  });

  it("answers the pricing FAQ grounded in the support policy", () => {
    renderPricing();
    expect(screen.getByText("정말 무료인가요?")).toBeTruthy();
    expect(screen.getByText("후원하면 등급이 올라가나요?")).toBeTruthy();
    expect(screen.getByText("유료 과금은 언제 시작되나요?")).toBeTruthy();
  });

  it("links the membership policy, support, and studio entry", () => {
    renderPricing();
    const hrefs = [...document.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/membership");
    expect(hrefs).toContain("/support-us");
    expect(hrefs).toContain("/studio/new");
  });

  it("sets the pricing document title", () => {
    renderPricing();
    expect(document.title).toBe("요금제 · 툰스튜디오");
  });
});

describe("pricing polish integration", () => {
  it("renders both plan cards as static tilt cards under reduced motion", () => {
    renderPricing();
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      expect(card.getAttribute("data-tilt")).toBe("static");
    }
  });

  it("applies the Pro glow and accent border to the recommended card", () => {
    renderPricing();
    const pro = screen.getByRole("article", { name: "Pro" });
    expect(pro.className).toContain("shadow-[0_0_36px_oklch(0.7_0.18_315/0.28)]");
    expect(pro.className).toContain("border-accent/60");
  });

  it("counts plan feature numbers up to their final values", () => {
    renderPricing();
    const free = screen.getByRole("article", { name: "Free" });
    expect(within(free).getByText("10GB")).toBeTruthy();
    expect(within(free).getByText("500")).toBeTruthy();
    const pro = screen.getByRole("article", { name: "Pro" });
    expect(within(pro).getByText("500GB")).toBeTruthy();
    expect(within(pro).getByText("10,000")).toBeTruthy();
  });

  it("gives each plan card its own CTA", () => {
    renderPricing();
    const free = screen.getByRole("article", { name: "Free" });
    const freeCta = within(free).getByRole("link", { name: "무료로 시작하기" });
    expect(freeCta.getAttribute("href")).toBe("/studio/new");
    const pro = screen.getByRole("article", { name: "Pro" });
    const proCta = within(pro).getByRole("link", { name: "멤버십 정책 자세히 보기" });
    expect(proCta.getAttribute("href")).toBe("/membership");
  });

  it("does not render the pulse ring under reduced motion", () => {
    renderPricing();
    expect(document.querySelectorAll('[data-testid="pulse-ring"]')).toHaveLength(0);
  });
});
