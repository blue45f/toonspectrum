// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AdminCommercePayments } from "./AdminCommercePayments";

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

const commerceSettings = {
  operationMode: "free",
  provider: "mock",
  defaultMarketPriceKrw: 0,
  paymentMethods: [],
  freePolicyNotice: "",
  paidPolicyNotice: "",
  termsVersion: "v1",
  providerMode: null,
  checkoutEnabled: false,
  disabledReason: null,
};

beforeEach(() => {
  api.mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AdminCommercePayments 상태 표면 정합", () => {
  it("로드 실패를 빈 결제 내역으로 위장하지 않고 재시도를 제공한다", async () => {
    api.mockRejectedValue(new Error("결제 정보를 불러오지 못했습니다."));
    render(<AdminCommercePayments uid="admin" />);
    expect(
      await screen.findByText("결제 내역을 불러오지 못했습니다."),
    ).toBeTruthy();
    expect(screen.queryByText("마켓 결제 내역이 없습니다.")).toBeNull();
    // 실패 화면에서 로딩 스피너가 계속 돌면 안 된다.
    expect(screen.queryByRole("status", { name: "불러오는 중" })).toBeNull();
    expect(screen.getAllByRole("alert").length).toBeGreaterThanOrEqual(1);
  });

  it("로드 성공 후 빈 주문일 때만 빈 내역을 표시하고 제목은 h2다", async () => {
    api.mockImplementation((path) =>
      path.endsWith("/orders")
        ? Promise.resolve({ items: [] })
        : Promise.resolve(commerceSettings),
    );
    render(<AdminCommercePayments uid="admin" />);
    expect(await screen.findByText("마켓 결제 내역이 없습니다.")).toBeTruthy();
    // 페이지 h1은 셸이 소유한다 — 임베드된 자손은 h1을 만들지 않는다.
    expect(
      screen.getByRole("heading", { level: 2, name: "사이트 무료/유료 운영" }),
    ).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
  });
});
