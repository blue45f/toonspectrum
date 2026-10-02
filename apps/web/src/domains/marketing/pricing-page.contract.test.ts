import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * /pricing은 app/routes/pricing-page.tsx 한 곳에서만 그린다.
 * (예전에 marketing/PricingPage.tsx가 같은 화면의 두 번째 구현으로 남아 있었고 어떤 라우트도 쓰지 않아 삭제했다 —
 *  그 파일의 계약 테스트도 사용 중인 구현을 가리키도록 이 파일로 옮긴다.)
 */
const PAGE_SOURCE = "apps/web/src/app/routes/pricing-page.tsx";
const ROUTE_SOURCE = "apps/web/src/app/routes/groups/marketing.routes.tsx";

function readSource(path: string): string {
  return readFileSync(path, "utf8");
}

describe("pricing page contracts", () => {
  it("registers /pricing as a public marketing route next to /membership and keeps a single implementation", () => {
    const routeSource = readSource(ROUTE_SOURCE);
    expect(routeSource).toContain('path: "/pricing"');
    expect(routeSource).toContain('id: "marketing-pricing"');
    expect(routeSource).toContain('import("@/app/routes/pricing-page")');
    expect(existsSync("apps/web/src/domains/marketing/PricingPage.tsx")).toBe(false);
  });

  it("derives plan numbers from the membership policy source, not hardcoded copies", () => {
    const pageSource = readSource(PAGE_SOURCE);
    expect(pageSource).toContain("MEMBERSHIP_PLAN_POLICIES");
    expect(pageSource).toContain("packages/core/src/membership-wallet");
    expect(pageSource).toContain("MEMBERSHIP_ECONOMY_POLICY.paymentsEnabled");
  });

  it("states clearly that billing is off during the beta and nothing here can be purchased", () => {
    const pageSource = readSource(PAGE_SOURCE);
    expect(pageSource).toContain("지금은 베타 기간이라 결제가 꺼져 있습니다");
    expect(pageSource).toContain("정식 요금은 추후 안내");
    expect(pageSource).not.toContain("결제하기");
    expect(pageSource).not.toContain("checkout");
  });

  it("compares all four tiers and answers the four common questions", () => {
    const pageSource = readSource(PAGE_SOURCE);
    expect(pageSource).toContain('const PLAN_ORDER = ["free", "creator", "pro", "team"]');
    expect(pageSource).toContain("고해상도 내보내기");
    for (const question of [
      "정말 무료인가요?",
      "후원하면 등급이 올라가나요?",
      "등급별 정확한 한도가 궁금해요.",
      "유료 과금은 언제 시작되나요?",
    ]) {
      expect(pageSource).toContain(question);
    }
  });

  it("links to the membership policy, free start and support instead of any checkout", () => {
    const pageSource = readSource(PAGE_SOURCE);
    expect(pageSource).toContain('href="/membership"');
    expect(pageSource).toContain('href="/studio/new"');
    expect(pageSource).toContain('href="/support-us"');
  });
});
