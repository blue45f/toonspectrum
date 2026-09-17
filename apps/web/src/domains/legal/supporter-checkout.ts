export interface SupporterCheckoutEnv {
  readonly VITE_SUPPORTER_HOSTED_CHECKOUT_ENABLED?: string;
  readonly VITE_SUPPORTER_HOSTED_CHECKOUT_URL?: string;
}

export type SupporterCheckoutDisabledReason =
  | "disabled"
  | "missing-url"
  | "invalid-url";

export type SupporterCheckoutConfig =
  | {
      readonly mode: "disabled";
      readonly reason: SupporterCheckoutDisabledReason;
    }
  | {
      readonly mode: "hosted";
      readonly url: string;
    };

function isExplicitlyEnabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

/**
 * Public supporter checkout is fail-closed. ToonSpectrum only links to an explicitly configured
 * HTTPS hosted checkout and never accepts card or bank-authentication data on the site itself.
 */
export function resolveSupporterCheckout(env: SupporterCheckoutEnv): SupporterCheckoutConfig {
  if (!isExplicitlyEnabled(env.VITE_SUPPORTER_HOSTED_CHECKOUT_ENABLED)) {
    return { mode: "disabled", reason: "disabled" };
  }

  const rawUrl = env.VITE_SUPPORTER_HOSTED_CHECKOUT_URL?.trim();
  if (!rawUrl) return { mode: "disabled", reason: "missing-url" };

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname) {
      return { mode: "disabled", reason: "invalid-url" };
    }
    return { mode: "hosted", url: url.toString() };
  } catch {
    return { mode: "disabled", reason: "invalid-url" };
  }
}
