export const SUPPORTER_PAYMENT_MIN_WON = 1_000;
export const SUPPORTER_PAYMENT_MAX_WON = 1_000_000;
export const SUPPORTER_PAYMENT_PRESETS_WON = Object.freeze([3_000, 5_000, 10_000, 30_000] as const);
export const SUPPORTER_TERMS_VERSION = "supporter-operations-support-2026-09-18";
export const SUPPORTER_DEFAULT_MONTHLY_GOAL_WON = 300_000;

export const SUPPORTER_PAYMENT_STATUSES = Object.freeze([
  "READY",
  "IN_PROGRESS",
  "WAITING_FOR_DEPOSIT",
  "DONE",
  "CANCELED",
  "PARTIAL_CANCELED",
  "ABORTED",
  "EXPIRED",
] as const);

export type SupporterPaymentStatus = (typeof SUPPORTER_PAYMENT_STATUSES)[number];
export type SupporterPaymentMode = "test" | "live";
export type SupporterVisibility = "anonymous" | "name";

export interface SupporterPaymentCreateInput {
  amount: number;
  supporterName: string;
  message: string;
  visibility: SupporterVisibility;
  showAmount: boolean;
  showMessage: boolean;
  acceptedTerms: boolean;
  website: string;
}
export interface SupporterPaymentPublicEntry {
  orderId: string;
  amount: number;
  currency: "KRW";
  status: SupporterPaymentStatus;
  mode: SupporterPaymentMode;
  method: string;
  receiptUrl: string;
  canResync: boolean;
  approvedAt: string | null;
  canceledAt: string | null;
}

export interface PublicSupporterWallEntry {
  displayName: string;
  amount: number | null;
  message: string;
  supportedAt: string;
}

export interface SupporterFundingSummary {
  month: string;
  goalAmount: number;
  supportedAmount: number;
  progressPercent: number;
  supporterCount: number;
  publicWallEnabled: boolean;
  mode: SupporterPaymentMode | null;
}

export function isSupporterPaymentStatus(value: unknown): value is SupporterPaymentStatus {
  return typeof value === "string"
    && (SUPPORTER_PAYMENT_STATUSES as readonly string[]).includes(value);
}
export function supporterPaymentListLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}

function cleanText(value: unknown, maximum: number): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/gu, " ").slice(0, maximum);
}

export function validateSupporterPaymentCreateInput(input: unknown):
  | { ok: true; spam: false; value: SupporterPaymentCreateInput }
  | { ok: true; spam: true; value: null }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "후원 정보를 확인해 주세요." };
  }
  const body = input as Record<string, unknown>;
  const website = cleanText(body.website, 300);
  if (website) return { ok: true, spam: true, value: null };
  const amount = Number(body.amount);
  if (!Number.isInteger(amount)
    || amount < SUPPORTER_PAYMENT_MIN_WON
    || amount > SUPPORTER_PAYMENT_MAX_WON) {
    return { ok: false, error: "후원 금액 범위를 확인해 주세요." };
  }
  if (body.visibility !== "anonymous" && body.visibility !== "name") {
    return { ok: false, error: "후원자 공개 설정을 확인해 주세요." };
  }
  if (body.acceptedTerms !== true) {
    return { ok: false, error: "운영비 후원 및 환불 안내에 동의해 주세요." };
  }
  const supporterName = cleanText(body.supporterName, 80);
  if (body.visibility === "name" && supporterName.length < 2) {
    return { ok: false, error: "공개할 후원자 이름을 2자 이상 입력해 주세요." };
  }
  const showAmount = body.visibility === "name" && body.showAmount === true;
  const showMessage = body.visibility === "name" && body.showMessage === true;
  return {
    ok: true,
    spam: false,
    value: {
      amount,
      supporterName: body.visibility === "name" ? supporterName : "",
      message: cleanText(body.message, 500),
      visibility: body.visibility,
      showAmount,
      showMessage,
      acceptedTerms: true,
      website: "",
    },
  };
}
export function validateSupporterPaymentConfirmInput(input: unknown):
  | { ok: true; value: { paymentKey: string; orderId: string; amount: number } }
  | { ok: false; error: string } {
  if (!input || typeof input !== "object") {
    return { ok: false, error: "결제 승인 정보를 확인해 주세요." };
  }
  const body = input as Record<string, unknown>;
  const paymentKey = cleanText(body.paymentKey, 200);
  const orderId = cleanText(body.orderId, 64);
  const amount = Number(body.amount);
  if (!paymentKey) return { ok: false, error: "결제 키를 확인해 주세요." };
  if (!/^[A-Za-z0-9_-]{6,64}$/u.test(orderId)) {
    return { ok: false, error: "주문번호를 확인해 주세요." };
  }
  if (!Number.isInteger(amount) || amount < 1) {
    return { ok: false, error: "결제 금액을 확인해 주세요." };
  }
  return { ok: true, value: { paymentKey, orderId, amount } };
}

export function validateSupporterCancelReason(value: unknown): string | null {
  const reason = cleanText(value, 200);
  return reason.length >= 2 ? reason : null;
}
export function validateSupporterGoalAmount(value: unknown): number | null {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount < 0 || amount > 100_000_000) return null;
  return amount;
}

export function validateSupporterPublicWallEnabled(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}
