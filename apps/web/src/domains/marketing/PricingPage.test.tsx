import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const PAGE_SOURCE = "apps/web/src/domains/marketing/PricingPage.tsx";
const ROUTE_SOURCE = "apps/web/src/app/routes/groups/marketing.routes.tsx";

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("pricing page contracts", () => {
  it("registers /pricing as a public marketing route next to /membership", () => {
    const routeSource = readSource(ROUTE_SOURCE);
    expect(routeSource).toContain('path: "/pricing"');
    expect(routeSource).toContain('id: "marketing-pricing"');
    expect(routeSource).toContain("PricingPage");
  });

  it("derives plan numbers from the membership policy source, not hardcoded copies", () => {
    const pageSource = readSource(PAGE_SOURCE);
    expect(pageSource).toContain("MEMBERSHIP_PLAN_POLICIES");
    expect(pageSource).toContain("@toonstudio/core/membership-wallet");
  });

  it("states clearly that payments are inactive and Pro is not purchasable yet", () => {
    const pageSource = readSource(PAGE_SOURCE);
    expect(pageSource).toContain("현재는 실제 결제를 받지 않습니다");
    expect(pageSource).toContain("요금제 준비 중");
    expect(pageSource).toContain("가격·환불·자동갱신");
  });

  it("shows a Free vs Pro comparison and a five-item FAQ", () => {
    const pageSource = readSource(PAGE_SOURCE);
    expect(pageSource).toContain("Free · Pro 비교");
    expect(pageSource).toContain("고해상도 내보내기");
    const questions = [
      "지금 Pro를 결제할 수 있나요?",
      "Free는 정말 무료인가요?",
      "Pro 요금은 언제 정해지나요?",
      "결제 없이 Pro급 기능을 이용할 수 있나요?",
      "포인트와 Studio Credit은 요금제와 어떤 관계인가요?",
    ];
    for (const question of questions) {
      expect(pageSource).toContain(question);
    }
  });

  it("links back to the membership policy and contact instead of any checkout", () => {
    const pageSource = readSource(PAGE_SOURCE);
    expect(pageSource).toContain('href="/membership"');
    expect(pageSource).toContain('href="/contact"');
    expect(pageSource).not.toContain("결제하기");
    expect(pageSource).not.toContain("checkout");
  });
});
