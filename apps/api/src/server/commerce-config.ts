import { eq } from "drizzle-orm";

import {
  COMMERCE_PAYMENT_METHODS,
  DEFAULT_COMMERCE_FREE_POLICY_NOTICE,
  DEFAULT_COMMERCE_PAID_POLICY_NOTICE,
  DEFAULT_COMMERCE_TERMS_VERSION,
  DEFAULT_MARKET_PRICE_KRW,
  normalizeCommercePaymentMethods,
  type CommerceOperationMode,
  type CommercePaymentMethod,
  type CommerceProvider,
} from "../../../../packages/core/src/commerce";
import { appSettings, db } from "../db";
import { createSchemaReadinessCheck } from "./schema-readiness";

export interface CommerceConfig {
  operationMode: CommerceOperationMode;
  provider: CommerceProvider;
  defaultMarketPriceKrw: number;
  paymentMethods: CommercePaymentMethod[];
  freePolicyNotice: string;
  paidPolicyNotice: string;
  termsVersion: string;
}

const CONFIG_KEY = "commerce_config";
const ensureSettingsTable = createSchemaReadinessCheck([
  'SELECT "key", "value", "updatedAt" FROM "app_setting" WHERE FALSE',
]);

export const DEFAULT_COMMERCE_CONFIG: CommerceConfig = Object.freeze({
  operationMode: "free",
  provider: "toss",
  defaultMarketPriceKrw: DEFAULT_MARKET_PRICE_KRW,
  paymentMethods: [...COMMERCE_PAYMENT_METHODS],
  freePolicyNotice: DEFAULT_COMMERCE_FREE_POLICY_NOTICE,
  paidPolicyNotice: DEFAULT_COMMERCE_PAID_POLICY_NOTICE,
  termsVersion: DEFAULT_COMMERCE_TERMS_VERSION,
});

function boundedText(value: unknown, fallback: string, max: number): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().slice(0, max);
  return normalized || fallback;
}

export function sanitizeCommerceConfig(
  value: unknown,
  base: CommerceConfig = DEFAULT_COMMERCE_CONFIG,
): CommerceConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...base, paymentMethods: [...base.paymentMethods] };
  }
  const input = value as Record<string, unknown>;
  const amount = Number(input.defaultMarketPriceKrw);
  const operationMode = input.operationMode === "paid" ? "paid"
    : input.operationMode === "free" ? "free"
      : base.operationMode;
  const provider = input.provider === "mock" ? "mock"
    : input.provider === "toss" ? "toss"
      : base.provider;
  return {
    operationMode,
    provider,
    defaultMarketPriceKrw: Number.isInteger(amount) && amount >= 0 && amount <= 10_000_000
      ? amount
      : base.defaultMarketPriceKrw,
    paymentMethods: input.paymentMethods === undefined
      ? [...base.paymentMethods]
      : normalizeCommercePaymentMethods(input.paymentMethods),
    freePolicyNotice: boundedText(
      input.freePolicyNotice,
      base.freePolicyNotice,
      1_000,
    ),
    paidPolicyNotice: boundedText(
      input.paidPolicyNotice,
      base.paidPolicyNotice,
      1_000,
    ),
    termsVersion: boundedText(input.termsVersion, base.termsVersion, 100),
  };
}

export async function getCommerceConfig(): Promise<CommerceConfig> {
  try {
    await ensureSettingsTable();
    const [row] = await db.select().from(appSettings)
      .where(eq(appSettings.key, CONFIG_KEY)).limit(1);
    return sanitizeCommerceConfig(row?.value);
  } catch {
    return { ...DEFAULT_COMMERCE_CONFIG, paymentMethods: [...DEFAULT_COMMERCE_CONFIG.paymentMethods] };
  }
}

export async function setCommerceConfig(input: unknown): Promise<CommerceConfig> {
  await ensureSettingsTable();
  const current = await getCommerceConfig();
  const next = sanitizeCommerceConfig(input, current);
  const updatedAt = new Date();
  await db.insert(appSettings)
    .values({ key: CONFIG_KEY, value: next, updatedAt })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: next, updatedAt },
    });
  return next;
}
