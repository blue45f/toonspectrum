import type {
  CommerceProvider,
  CommerceProviderMode,
} from "../../../../../packages/core/src/commerce";
import { resolveSupporterPaymentConfig } from "../supporter-payment/supporter-payment.config";

import type { SupporterPaymentConfig } from "../supporter-payment/supporter-payment.config";

type EnvLike = Partial<Record<string, string | undefined>>;

export interface CommerceProviderRuntime {
  provider: CommerceProvider;
  providerMode: CommerceProviderMode | null;
  checkoutEnabled: boolean;
  disabledReason: string | null;
  clientKey: string | null;
  tossConfig: SupporterPaymentConfig | null;
}

export function resolveCommerceProviderRuntime(
  provider: CommerceProvider,
  env: EnvLike = process.env,
): CommerceProviderRuntime {
  if (provider === "mock") {
    const allowed = env.COMMERCE_MOCK_PAYMENTS_ENABLED?.trim().toLowerCase() === "true"
      && env.NODE_ENV !== "production";
    return {
      provider,
      providerMode: allowed ? "mock" : null,
      checkoutEnabled: allowed,
      disabledReason: allowed ? null : "mock-disabled",
      clientKey: null,
      tossConfig: null,
    };
  }

  const tossConfig = resolveSupporterPaymentConfig({
    ...env,
    SUPPORTER_PAYMENTS_ENABLED: "true",
  });
  const requested = env.COMMERCE_PAYMENTS_ENABLED?.trim().toLowerCase() === "true";
  return {
    provider,
    providerMode: tossConfig.mode,
    checkoutEnabled: requested && tossConfig.serverReady,
    disabledReason: !requested
      ? "commerce-payments-disabled"
      : tossConfig.serverReady
        ? null
        : tossConfig.disabledReason ?? "provider-not-ready",
    clientKey: requested && tossConfig.serverReady ? tossConfig.clientKey : null,
    tossConfig,
  };
}
