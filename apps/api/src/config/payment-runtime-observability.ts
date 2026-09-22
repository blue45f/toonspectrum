import { resolveCommerceProviderRuntime } from "../modules/commerce/commerce-runtime";
import { resolveSupporterPaymentConfig } from "../modules/supporter-payment/supporter-payment.config";

type EnvLike = Partial<Record<string, string | undefined>>;

export interface PaymentRuntimeSummary {
  supporter: {
    checkoutEnabled: boolean;
    serverReady: boolean;
    mode: "test" | "live" | null;
    liveAllowed: boolean;
    disabledReason: string | null;
  };
  commerce: {
    checkoutEnabled: boolean;
    providerMode: "test" | "live" | "mock" | null;
    disabledReason: string | null;
  };
}

/** Returns only non-secret payment readiness metadata for startup observability. */
export function resolvePaymentRuntimeSummary(
  env: EnvLike = process.env,
): Readonly<PaymentRuntimeSummary> {
  const supporter = resolveSupporterPaymentConfig(env);
  const commerce = resolveCommerceProviderRuntime("toss", env);
  return Object.freeze({
    supporter: Object.freeze({
      checkoutEnabled: supporter.checkoutEnabled,
      serverReady: supporter.serverReady,
      mode: supporter.mode,
      liveAllowed: supporter.liveAllowed,
      disabledReason: supporter.disabledReason,
    }),
    commerce: Object.freeze({
      checkoutEnabled: commerce.checkoutEnabled,
      providerMode: commerce.providerMode,
      disabledReason: commerce.disabledReason,
    }),
  });
}
