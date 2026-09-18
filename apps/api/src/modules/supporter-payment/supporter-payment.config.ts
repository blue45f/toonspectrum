import { resolveProductionIntegrationConfig } from "../production-collaboration/production-integration-config";

export type SupporterPaymentProviderMode = "test" | "live";

export interface SupporterPaymentConfig {
  readonly checkoutEnabled: boolean;
  readonly serverReady: boolean;
  readonly mode: SupporterPaymentProviderMode | null;
  readonly clientKey: string | null;
  readonly secretKey: string | null;
  readonly apiBaseUrl: string;
  readonly timeoutMs: number;
  readonly liveAllowed: boolean;
  readonly disabledReason:
    | null
    | "disabled"
    | "missing-keys"
    | "invalid-keys"
    | "key-mode-mismatch"
    | "live-disabled";
}

type EnvLike = Partial<Record<string, string | undefined>>;

function trimmed(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}
function keyMode(key: string | null): SupporterPaymentProviderMode | null {
  if (!key) return null;
  if (key.startsWith("test_")) return "test";
  if (key.startsWith("live_")) return "live";
  return null;
}

export function resolveSupporterPaymentConfig(
  env: EnvLike = process.env,
): SupporterPaymentConfig {
  const integration = resolveProductionIntegrationConfig(env);
  const clientKey = trimmed(env.TOSS_PAYMENTS_CLIENT_KEY);
  const secretKey = integration.toss.secretKey;
  const clientMode = keyMode(clientKey);
  const secretMode = keyMode(secretKey);
  const configured = Boolean(clientKey && secretKey);
  const validKeys = Boolean(clientMode && secretMode);
  const sameMode = Boolean(clientMode && secretMode && clientMode === secretMode);
  const mode = sameMode ? clientMode : null;
  const serverReady = configured && validKeys && sameMode
    && (mode === "test" || integration.toss.liveAllowed);
  const requested = env.SUPPORTER_PAYMENTS_ENABLED?.trim().toLowerCase() === "true";
  const checkoutEnabled = requested && serverReady;
  let disabledReason: SupporterPaymentConfig["disabledReason"] = null;
  if (!requested) disabledReason = "disabled";
  else if (!configured) disabledReason = "missing-keys";
  else if (!validKeys) disabledReason = "invalid-keys";
  else if (!sameMode) disabledReason = "key-mode-mismatch";
  else if (mode === "live" && !integration.toss.liveAllowed) disabledReason = "live-disabled";

  return Object.freeze({
    checkoutEnabled,
    serverReady,
    mode,
    clientKey: checkoutEnabled ? clientKey : null,
    secretKey,
    apiBaseUrl: integration.toss.apiBaseUrl,
    timeoutMs: integration.timeoutMs,
    liveAllowed: integration.toss.liveAllowed,
    disabledReason,
  });
}
