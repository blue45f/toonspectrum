import type {
  CommerceOrderPublicEntry,
  CommercePaymentMethod,
  CommerceProvider,
  CommerceProviderMode,
  MarketplaceCommerceQuote,
} from "@toonspectrum/core/commerce";

import { api } from "@/infrastructure/api";

export interface MarketCommerceOrder extends CommerceOrderPublicEntry {
  clientKey: string | null;
  mockPaymentKey: string | null;
  paymentMethods: readonly CommercePaymentMethod[];
  policyNotice: string;
}

export interface CommerceConfigResponse {
  operationMode: "free" | "paid";
  provider: CommerceProvider;
  providerMode: CommerceProviderMode | null;
  checkoutEnabled: boolean;
  disabledReason: string | null;
  clientKey: string | null;
  currency: "KRW";
  paymentMethods: readonly CommercePaymentMethod[];
  defaultMarketPriceKrw: number;
  policyNotice: string;
  termsVersion: string;
}

export function getCommerceConfig(): Promise<CommerceConfigResponse> {
  return api.get<CommerceConfigResponse>("/commerce/config", { cache: "no-store" });
}

export function getMarketplaceCommerceQuote(
  resourceId: string,
  signal?: AbortSignal,
): Promise<MarketplaceCommerceQuote> {
  return api.get<MarketplaceCommerceQuote>(
    "/commerce/market/" + encodeURIComponent(resourceId) + "/quote",
    { cache: "no-store", signal },
  );
}

export function createMarketplaceCommerceOrder(
  resourceId: string,
  requestId: string,
): Promise<MarketCommerceOrder> {
  return api.post<MarketCommerceOrder>(
    "/commerce/market/" + encodeURIComponent(resourceId) + "/orders",
    { requestId, acceptedTerms: true },
  );
}

export function confirmMarketplaceCommercePayment(input: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<CommerceOrderPublicEntry> {
  return api.post<CommerceOrderPublicEntry>("/commerce/confirm", input);
}

export function listMyCommerceOrders(): Promise<{
  items: CommerceOrderPublicEntry[];
}> {
  return api.get("/commerce/orders", { cache: "no-store" });
}
