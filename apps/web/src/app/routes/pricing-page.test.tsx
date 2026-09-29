// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { PricingPage } from "./pricing-page";

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
