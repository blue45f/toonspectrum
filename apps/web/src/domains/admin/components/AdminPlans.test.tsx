// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminPlans } from "./AdminPlans";

const api = vi.hoisted(
  () =>
    vi.fn<
      (path: string, uid: string, options?: RequestInit) => Promise<unknown>
    >(),
);
vi.mock("./admin-client", async (original) => ({
  ...(await original<typeof import("./admin-client")>()),
  adminFetch: api,
}));
vi.mock("./AdminMembershipPolicy", () => ({
  AdminMembershipPolicy: () => <div data-testid="membership-policy" />,
}));
vi.mock("./AdminMembershipOperations", () => ({
  AdminMembershipOperations: () => <div data-testid="membership-operations" />,
}));
vi.mock("@/shared/lib/i18n", () => ({
  useT: () => (key: string) => key,
}));

const plan = {
  id: "plan-1",
  code: "PLUS",
  name: "Plus",
  description: "",
  intervalDays: 30,
  currency: "KRW",
  priceCents: 9900,
  perks: [],
  isActive: true,
};

beforeEach(() => {
  api.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminPlans 상태 표면 정합", () => {
  it("플랜 로드 실패가 정책·운영 섹션까지 차단하지 않는다", async () => {
    api.mockRejectedValue(new Error("플랜을 불러오지 못했습니다."));
    render(<AdminPlans uid="admin" />);
    expect(await screen.findByText("admin.plans.loadError")).toBeTruthy();
    expect(screen.getByTestId("membership-policy")).toBeTruthy();
    expect(screen.getByTestId("membership-operations")).toBeTruthy();
  });

  it("폼 검증 오류가 role=alert로 공지된다", async () => {
    api.mockResolvedValue({ items: [plan] });
    render(<AdminPlans uid="admin" />);
    const [toolbarNew] = await screen.findAllByRole("button", {
      name: "admin.plans.new",
    });
    fireEvent.click(toolbarNew);
    fireEvent.click(screen.getByRole("button", { name: "admin.plans.save" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Code & name are required.");
  });
});
