export const COMMERCE_PAYMENT_METHODS = Object.freeze([
  "card",
  "apple_pay",
  "samsung_pay",
  "naver_pay",
  "kakao_pay",
  "toss_pay",
  "bank_transfer",
  "virtual_account",
  "mobile",
] as const);

export type CommercePaymentMethod = (typeof COMMERCE_PAYMENT_METHODS)[number];
export type CommerceOperationMode = "free" | "paid";
export type CommerceProvider = "toss" | "mock";
export type CommerceProviderMode = "test" | "live" | "mock";
export type CommerceProductType = "market-resource";

export const COMMERCE_ORDER_STATUSES = Object.freeze([
  "READY",
  "IN_PROGRESS",
  "WAITING_FOR_DEPOSIT",
  "DONE",
  "CANCELED",
  "PARTIAL_CANCELED",
  "ABORTED",
  "EXPIRED",
] as const);

export type CommerceOrderStatus = (typeof COMMERCE_ORDER_STATUSES)[number];

export const DEFAULT_COMMERCE_FREE_POLICY_NOTICE =
  "현재 사이트는 무료 운영 모드입니다. 서비스 이용료는 받지 않으며, 마켓 리소스의 GPL·CC·ToonSpectrum 등 개별 라이선스 조건은 각 리소스 표기를 따릅니다.";
export const DEFAULT_COMMERCE_PAID_POLICY_NOTICE =
  "현재 사이트는 유료 운영 모드입니다. 유료 마켓 리소스는 결제 후 계정 이용 권한이 부여되며, 결제 여부와 별개로 각 리소스의 라이선스·출처 조건은 계속 적용됩니다.";
export const DEFAULT_COMMERCE_TERMS_VERSION = "commerce-2026-09-18";
export const DEFAULT_MARKET_PRICE_KRW = 4_900;

export interface CommercePublicConfig {
  operationMode: CommerceOperationMode;
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

export interface MarketplaceCommerceQuote {
  resourceId: string;
  productId: string;
  productType: "market-resource";
  productName: string;
  operationMode: CommerceOperationMode;
  checkoutRequired: boolean;
  alreadyEntitled: boolean;
  amount: number;
  currency: "KRW";
  provider: CommerceProvider;
  providerMode: CommerceProviderMode | null;
  checkoutEnabled: boolean;
  disabledReason: string | null;
  paymentMethods: readonly CommercePaymentMethod[];
  policyNotice: string;
}

export interface CommerceOrderPublicEntry {
  orderId: string;
  productType: CommerceProductType;
  productId: string;
  productName: string;
  amount: number;
  balanceAmount: number;
  currency: "KRW";
  provider: CommerceProvider;
  providerMode: CommerceProviderMode;
  status: CommerceOrderStatus;
  method: string;
  receiptUrl: string;
  approvedAt: string | null;
  canceledAt: string | null;
}

export function isCommerceOrderStatus(value: unknown): value is CommerceOrderStatus {
  return typeof value === "string"
    && (COMMERCE_ORDER_STATUSES as readonly string[]).includes(value);
}

export function normalizeCommercePaymentMethods(
  value: unknown,
): CommercePaymentMethod[] {
  if (!Array.isArray(value)) return [...COMMERCE_PAYMENT_METHODS];
  const allowed = new Set<string>(COMMERCE_PAYMENT_METHODS);
  return [...new Set(
    value.filter((entry): entry is CommercePaymentMethod =>
      typeof entry === "string" && allowed.has(entry),
    ),
  )];
}
