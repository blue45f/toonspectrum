import {
  getStaticPolicyDocument,
  isPolicySlug,
  normalizePolicyDocument,
  type PolicyDocument,
  type PolicySlug,
} from "../../../../../packages/core/src/legal-policies.js";

const TERMSDESK_BASE = "https://termsdesk.vercel.app";
const TERMSDESK_ORG_SLUG = "toonspectrum";
const RETRY_DELAY_MS = 60_000;
const REQUEST_TIMEOUT_MS = 3_000;

export type PolicyFailureReason =
  | "upstream_http_error"
  | "upstream_network_error"
  | "upstream_invalid_payload";

export interface PolicyFailure {
  reason: PolicyFailureReason;
  status?: number;
}

export interface PolicyResponse extends PolicyDocument {
  availability: "published" | "bundled-fallback";
  upstreamFailure?: PolicyFailure;
}

interface ResolverOptions {
  fetcher?: typeof fetch;
  now?: () => number;
  onFallback?: (slug: PolicySlug, failure: PolicyFailure) => void;
}

/**
 * Request-driven failover only: no timers, background jobs, database or paid service.
 * The retry window and in-flight map are bounded to the two supported policy slugs.
 * A bundled fallback remains visibly distinct from a recovered upstream service.
 */
export function createLegalPolicyResolver(options: ResolverOptions = {}) {
  const fetcher = options.fetcher ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const now = options.now ?? Date.now;
  const failures = new Map<PolicySlug, { retryAt: number; failure: PolicyFailure }>();
  const inFlight = new Map<PolicySlug, Promise<PolicyResponse>>();

  const fallback = (slug: PolicySlug, failure: PolicyFailure): PolicyResponse => ({
    ...getStaticPolicyDocument(slug),
    availability: "bundled-fallback",
    upstreamFailure: { ...failure },
  });

  async function load(slug: PolicySlug): Promise<PolicyResponse> {
    let failure: PolicyFailure;
    try {
      const url = `${TERMSDESK_BASE}/api/public/${TERMSDESK_ORG_SLUG}/policies/${encodeURIComponent(slug)}`;
      const response = await fetcher(url, {
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        failure = { reason: "upstream_http_error", status: response.status };
        // Release an unread error response instead of keeping its connection occupied.
        try {
          await response.body?.cancel();
        } catch {
          // The HTTP status is already known; cancellation failure is not a new outage.
        }
      } else {
        try {
          // Await JSON parsing inside the catch boundary (the previous controller did not).
          const document = normalizePolicyDocument(await response.json(), slug);
          if (document.source !== "termsdesk") throw new Error("not_a_published_policy");
          failures.delete(slug);
          return { ...document, availability: "published" };
        } catch {
          failure = { reason: "upstream_invalid_payload" };
        }
      }
    } catch {
      failure = { reason: "upstream_network_error" };
    }

    failures.set(slug, { retryAt: now() + RETRY_DELAY_MS, failure });
    // Log only a bounded reason and HTTP status, never remote bodies or credentials.
    try {
      options.onFallback?.(slug, { ...failure });
    } catch {
      // A logging failure must not prevent the already-available bundled document.
    }
    return fallback(slug, failure);
  }

  return async function resolve(slug: string): Promise<PolicyResponse> {
    if (!isPolicySlug(slug)) throw new Error("policy_not_found");
    const previous = failures.get(slug);
    if (previous && now() < previous.retryAt) return fallback(slug, previous.failure);
    const pending = inFlight.get(slug);
    if (pending) return pending;
    const request = load(slug);
    inFlight.set(slug, request);
    try {
      return await request;
    } finally {
      if (inFlight.get(slug) === request) inFlight.delete(slug);
    }
  };
}
