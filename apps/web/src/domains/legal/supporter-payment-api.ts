import type {
  PublicSupporterWallEntry,
  SupporterFundingSummary,
  SupporterPaymentMode,
  SupporterPaymentPublicEntry,
  SupporterVisibility,
} from "@toonspectrum/core/supporter-payment";

import { api } from "@/infrastructure/api";

export interface SupporterPaymentConfigResponse {
  enabled: boolean;
  mode: SupporterPaymentMode | null;
  clientKey: string | null;
  disabledReason: string | null;
  currency: "KRW";
  minAmount: number;
  maxAmount: number;
  presets: readonly number[];
  orderName: string;
}

export interface SupporterPaymentOrderResponse {
  orderId: string;
  orderName: string;
  amount: number;
  currency: "KRW";
  mode: SupporterPaymentMode;
  clientKey: string;
}

export interface SupporterPaymentOrderInput {
  amount: number;
  supporterName: string;
  message: string;
  visibility: SupporterVisibility;
  showAmount: boolean;
  showMessage: boolean;
  acceptedTerms: true;
  website: string;
}

export function getSupporterPaymentConfig(): Promise<SupporterPaymentConfigResponse> {
  return api.get<SupporterPaymentConfigResponse>("/supporter-payments/config", {
    cache: "no-store",
  });
}

export function getSupporterFundingSummary(): Promise<SupporterFundingSummary> {
  return api.get<SupporterFundingSummary>("/supporter-payments/funding", {
    cache: "no-store",
  });
}

export function getPublicSupporters(
  limit = 24,
): Promise<PublicSupporterWallEntry[]> {
  return api.get<PublicSupporterWallEntry[]>(
    `/supporter-payments/supporters?limit=${limit}`,
    { cache: "no-store" },
  );
}

export function createSupporterPaymentOrder(
  input: SupporterPaymentOrderInput,
): Promise<SupporterPaymentOrderResponse> {
  return api.post<SupporterPaymentOrderResponse>("/supporter-payments/orders", input);
}
export function confirmSupporterPayment(input: {
  paymentKey: string;
  orderId: string;
  amount: number;
}): Promise<SupporterPaymentPublicEntry> {
  return api.post<SupporterPaymentPublicEntry>("/supporter-payments/confirm", input);
}

export function getSupporterOrderStatus(
  orderId: string,
): Promise<SupporterPaymentPublicEntry> {
  return api.get<SupporterPaymentPublicEntry>(
    `/supporter-payments/orders/${encodeURIComponent(orderId)}`,
    { cache: "no-store" },
  );
}
