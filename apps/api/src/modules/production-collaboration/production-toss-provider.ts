import type {
  ProductionIntegrationConfig,
} from "./production-integration-config";
import type {
  ProductionTossConfirm,
} from "./production-integration.dto";
import {
  externalFetchJson,
} from "./production-integration-http";

export interface TossPaymentResponse {
  readonly paymentKey: string;
  readonly orderId: string;
  readonly status: string;
  readonly currency: string;
  readonly totalAmount: number;
  readonly approvedAt?: string;
  readonly receipt?: { readonly url?: string } | null;
}

export async function confirmTossPayment(input: {
  readonly config: ProductionIntegrationConfig;
  readonly request: ProductionTossConfirm;
}): Promise<TossPaymentResponse> {
  const secretKey = input.config.toss.secretKey;
  if (!secretKey) throw new Error("toss_payments_not_configured");
  if (!secretKey.startsWith("test_") && !input.config.toss.liveAllowed) {
    throw new Error("toss_live_payment_disabled");
  }
  const authorization = Buffer.from(`${secretKey}:`, "utf8").toString("base64");
  const payment = await externalFetchJson<TossPaymentResponse>(
    `${input.config.toss.apiBaseUrl}/v1/payments/confirm`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${authorization}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentKey: input.request.paymentKey,
        orderId: input.request.orderId,
        amount: input.request.amount,
      }),
    },
    input.config.timeoutMs,
  );
  if (
    payment.status !== "DONE"
    || payment.paymentKey !== input.request.paymentKey
    || payment.orderId !== input.request.orderId
    || payment.totalAmount !== input.request.amount
  ) {
    throw new Error("toss_payment_response_mismatch");
  }
  return payment;
}
