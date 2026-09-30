// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MarketCheckoutPage } from "./MarketCheckoutPage";

const api = vi.hoisted(() => ({
  session: vi.fn(),
  getQuote: vi.fn(),
  createOrder: vi.fn(),
  confirmPayment: vi.fn(),
  acquire: vi.fn(),
  detail: vi.fn(),
  resolveTarget: vi.fn(),
  getResource: vi.fn(),
  getApiErrorMessage: vi.fn(),
  loadToss: vi.fn(),
}));

vi.mock("@/domains/auth/public/session/auth-session-store", () => ({
  useSession: api.session,
}));
vi.mock("../commerce-api", () => ({
  getMarketplaceCommerceQuote: api.getQuote,
  createMarketplaceCommerceOrder: api.createOrder,
  confirmMarketplaceCommercePayment: api.confirmPayment,
}));
vi.mock("../hooks/use-market-library", () => ({
  useMarketLibrary: () => ({ acquireResource: api.acquire }),
}));
vi.mock("../hooks/use-market-resource-detail", () => ({
  useMarketResourceDetail: api.detail,
}));
vi.mock("@/platform/creator-marketplace-client", () => ({
  getCreatorMarketplaceResource: api.getResource,
  resolveCreatorMarketplaceCloudLibraryAcquisitionTarget: api.resolveTarget,
}));
vi.mock("@/platform/api", () => ({ getApiErrorMessage: api.getApiErrorMessage }));
vi.mock("@/platform/toss-payments-sdk", () => ({
  loadTossPaymentsSdk: api.loadToss,
}));
vi.mock("@/shared/seo/use-document-title", () => ({
  useDocumentTitle: vi.fn(),
  useMetaDescription: vi.fn(),
}));
vi.mock("../components/MarketNavHeader", () => ({
  MarketNavHeader: () => <nav aria-label="마켓 내비게이션" />,
}));

const RESOURCE_ID = "resource-123";

function record() {
  return {
    id: RESOURCE_ID,
    name: "테스트 브러시",
    kind: "brush",
    license: "toonstudio-standard",
    resourceVersion: "1.0.0",
    publisher: { name: "테스트 작가" },
  };
}

function quote(amount = 4900, overrides: Record<string, unknown> = {}) {
  return {
    resourceId: RESOURCE_ID,
    productId: "product-1",
    productType: "market-resource",
    productName: "테스트 브러시",
    operationMode: "paid",
    checkoutRequired: true,
    alreadyEntitled: false,
    amount,
    currency: "KRW",
    provider: "toss",
    providerMode: "test",
    checkoutEnabled: true,
    disabledReason: null,
    paymentMethods: ["card"],
    policyNotice: "정책 안내",
    ...overrides,
  };
}

function order(amount = 4900, provider: "toss" | "mock" = "toss") {
  return {
    orderId: "order-1",
    productType: "market-resource",
    productId: "product-1",
    productName: "테스트 브러시",
    amount,
    balanceAmount: amount,
    currency: "KRW",
    provider,
    providerMode: "test",
    status: "READY",
    method: "card",
    receiptUrl: "",
    approvedAt: null,
    canceledAt: null,
    clientKey: provider === "toss" ? "test_ck_123" : null,
    mockPaymentKey: provider === "mock" ? "mock-key-1" : null,
    paymentMethods: ["card"],
    policyNotice: "정책 안내",
  };
}

function tossFactory() {
  const widgets = {
    setAmount: vi.fn().mockResolvedValue(undefined),
    renderPaymentMethods: vi.fn().mockResolvedValue(undefined),
    renderAgreement: vi.fn().mockResolvedValue(undefined),
    requestPayment: vi.fn().mockResolvedValue(undefined),
  };
  const widgetsFactory = vi.fn().mockReturnValue(widgets);
  const factory = Object.assign(
    vi.fn().mockReturnValue({ widgets: widgetsFactory }),
    { ANONYMOUS: "anonymous-customer" },
  );
  return { factory, widgets, widgetsFactory };
}

function view() {
  return (
    <MemoryRouter initialEntries={[`/market/checkout/${RESOURCE_ID}`]}>
      <Routes>
        <Route path="/market/checkout/:id" element={<MarketCheckoutPage />} />
      </Routes>
    </MemoryRouter>
  );
}

async function acceptTermsAndPrepare() {
  const checkbox = await screen.findByRole("checkbox");
  fireEvent.click(checkbox);
  const prepareButton = await screen.findByRole("button", { name: /결제 준비/ });
  fireEvent.click(prepareButton);
}

beforeEach(() => {
  vi.resetAllMocks();
  api.session.mockReturnValue({
    data: { user: { id: "user-1" } },
    ready: true,
    status: "authenticated",
  });
  api.detail.mockReturnValue({ record: record(), loading: false, notFound: false });
  api.getQuote.mockResolvedValue(quote());
  api.getApiErrorMessage.mockImplementation(
    async (caught: unknown, fallback: string) =>
      caught instanceof Error ? caught.message : fallback,
  );
  api.resolveTarget.mockResolvedValue({
    state: "available",
    currentHead: { id: RESOURCE_ID },
    logicalPackId: "community:abc",
  });
  api.acquire.mockResolvedValue(true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 0;
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MarketCheckoutPage payment guards", () => {
  it("blocks payment when the server order amount differs from the quoted amount", async () => {
    api.getQuote.mockResolvedValue(quote(4900));
    api.createOrder.mockResolvedValue(order(9900, "toss"));

    render(view());
    await acceptTermsAndPrepare();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("다릅니다");
    expect(alert.textContent).toContain("9,900");
    expect(alert.textContent).toContain("4,900");
    // The mismatched order is discarded: no Toss SDK load, no payment window.
    expect(api.loadToss).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /결제하기/ })).toBeNull();
    // The page falls back to the prepare step so the user can retry.
    expect(screen.getByRole("button", { name: /결제 준비/ })).toBeTruthy();
  });

  it("prepares Toss widgets with the server-confirmed order amount", async () => {
    api.getQuote.mockResolvedValue(quote(4900));
    api.createOrder.mockResolvedValue(order(4900, "toss"));
    const { factory, widgets, widgetsFactory } = tossFactory();
    api.loadToss.mockResolvedValue(factory);

    render(view());
    await acceptTermsAndPrepare();

    const payButton = await screen.findByRole("button", { name: /결제하기/ });
    expect(payButton.textContent).toContain("4,900");
    expect(api.loadToss).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith("test_ck_123");
    expect(widgetsFactory).toHaveBeenCalledWith({
      customerKey: "anonymous-customer",
    });
    expect(widgets.setAmount).toHaveBeenCalledWith({
      currency: "KRW",
      value: 4900,
    });
    expect(widgets.renderPaymentMethods).toHaveBeenCalled();
    expect(widgets.renderAgreement).toHaveBeenCalled();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("does not start Toss when the order has no client key", async () => {
    api.getQuote.mockResolvedValue(quote(4900));
    api.createOrder.mockResolvedValue({ ...order(4900, "toss"), clientKey: null });

    render(view());
    await acceptTermsAndPrepare();

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("클라이언트 키");
    expect(api.loadToss).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /결제하기/ })).toBeNull();
  });

  it("approves a mock payment with the server order amount", async () => {
    api.getQuote.mockResolvedValue(quote(4900));
    api.createOrder.mockResolvedValue(order(4900, "mock"));
    api.confirmPayment.mockResolvedValue({ receiptUrl: "https://receipt.example/r/1" });

    render(view());
    await acceptTermsAndPrepare();

    const approveButton = await screen.findByRole("button", {
      name: "개발용 모의 결제 승인",
    });
    fireEvent.click(approveButton);

    await waitFor(() =>
      expect(api.confirmPayment).toHaveBeenCalledWith({
        paymentKey: "mock-key-1",
        orderId: "order-1",
        amount: 4900,
      }),
    );
    expect(
      await screen.findByRole("heading", {
        name: "구매 및 내 에셋 추가가 완료됐습니다",
      }),
    ).toBeTruthy();
    expect(api.acquire).toHaveBeenCalledTimes(1);
  });

  it("adds a free resource to the library without any payment step", async () => {
    api.getQuote.mockResolvedValue(
      quote(0, { checkoutRequired: false, operationMode: "free" }),
    );

    render(view());
    const freeButton = await screen.findByRole("button", {
      name: "무료로 내 에셋에 추가",
    });
    fireEvent.click(freeButton);

    expect(
      await screen.findByRole("heading", {
        name: "구매 및 내 에셋 추가가 완료됐습니다",
      }),
    ).toBeTruthy();
    expect(api.acquire).toHaveBeenCalledTimes(1);
    expect(api.createOrder).not.toHaveBeenCalled();
    expect(api.loadToss).not.toHaveBeenCalled();
  });
});
