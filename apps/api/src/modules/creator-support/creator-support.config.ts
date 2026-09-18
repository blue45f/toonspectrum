export interface CreatorSupportPayoutConfig {
  readonly ready: boolean;
  readonly requested: boolean;
  readonly disabledReason:
    | null
    | "disabled"
    | "missing-payment-secret"
    | "missing-security-key"
    | "cost-policy-disabled";
}

type EnvLike = Partial<Record<string, string | undefined>>;

export function resolveCreatorSupportPayoutConfig(
  env: EnvLike = process.env,
): CreatorSupportPayoutConfig {
  const requested = env.CREATOR_SUPPORT_PAYOUTS_ENABLED?.trim().toLowerCase() === "true";
  const paymentSecret = env.TOSS_PAYMENTS_SECRET_KEY?.trim() ?? "";
  const securityKey = env.TOSS_PAYOUTS_SECURITY_KEY?.trim() ?? "";
  const explicitCost = env.PRODUCTION_INTEGRATION_COST_POLICY === "explicit-cost-enabled";

  let disabledReason: CreatorSupportPayoutConfig["disabledReason"] = null;
  if (!requested) disabledReason = "disabled";
  else if (!paymentSecret) disabledReason = "missing-payment-secret";
  else if (!/^[0-9a-fA-F]{64}$/u.test(securityKey)) disabledReason = "missing-security-key";
  else if (!explicitCost) disabledReason = "cost-policy-disabled";

  return Object.freeze({
    requested,
    ready: disabledReason === null,
    disabledReason,
  });
}
