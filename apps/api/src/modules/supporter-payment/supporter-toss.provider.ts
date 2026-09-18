import { externalFetchJson } from "../production-collaboration/production-integration-http";

import type { SupporterPaymentConfig } from "./supporter-payment.config";

export interface SupporterTossPayment {
  readonly paymentKey: string;
  readonly orderId: string;
  readonly orderName?: string;
  readonly status: string;
  readonly currency: string;
  readonly totalAmount: number;
  readonly balanceAmount?: number;
  readonly method?: string | null;
  readonly approvedAt?: string | null;
  readonly receipt?: { readonly url?: string | null } | null;
  readonly cancels?: readonly {
    readonly cancelAmount?: number;
    readonly cancelReason?: string;
    readonly canceledAt?: string;
  }[] | null;
}

function authorization(secretKey: string): string {
  return `Basic ${Buffer.from(`${secretKey}:`, "utf8").toString("base64")}`;
}

function requireServer(config: SupporterPaymentConfig): string {
  if (!config.serverReady || !config.secretKey) {
    throw new Error("supporter_toss_not_configured");
  }
  return config.secretKey;
}
export async function confirmSupporterTossPayment(input: {
  config: SupporterPaymentConfig;
  paymentKey: string;
  orderId: string;
  amount: number;
  idempotencyKey: string;
}): Promise<SupporterTossPayment> {
  const secretKey = requireServer(input.config);
  return externalFetchJson<SupporterTossPayment>(
    `${input.config.apiBaseUrl}/v1/payments/confirm`,
    {
      method: "POST",
      headers: {
        Authorization: authorization(secretKey),
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        paymentKey: input.paymentKey,
        orderId: input.orderId,
        amount: input.amount,
      }),
    },
    input.config.timeoutMs,
  );
}
export async function querySupporterTossPayment(input: {
  config: SupporterPaymentConfig;
  paymentKey: string;
}): Promise<SupporterTossPayment> {
  const secretKey = requireServer(input.config);
  return externalFetchJson<SupporterTossPayment>(
    `${input.config.apiBaseUrl}/v1/payments/${encodeURIComponent(input.paymentKey)}`,
    {
      method: "GET",
      headers: { Authorization: authorization(secretKey) },
    },
    input.config.timeoutMs,
  );
}

export async function cancelSupporterTossPayment(input: {
  config: SupporterPaymentConfig;
  paymentKey: string;
  reason: string;
  idempotencyKey: string;
}): Promise<SupporterTossPayment> {
  const secretKey = requireServer(input.config);
  return externalFetchJson<SupporterTossPayment>(
    `${input.config.apiBaseUrl}/v1/payments/${encodeURIComponent(input.paymentKey)}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: authorization(secretKey),
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({ cancelReason: input.reason }),
    },
    input.config.timeoutMs,
  );
}
