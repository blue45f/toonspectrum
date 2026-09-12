import type { ApiOptions } from "./api";

/** Only idempotent manuscript GETs opt in; publishing and save mutations never retry. */
export function creatorWorkReadOptions(signal?: AbortSignal): ApiOptions {
  // This signal also bounds response.text(), which runs after the shared client's header timeout.
  const deadline = AbortSignal.timeout(45_000);
  return {
    signal: signal ? AbortSignal.any([signal, deadline]) : deadline,
    timeout: 15_000,
    retry: {
      limit: 2,
      methods: ["get"],
      statusCodes: [408, 429, 500, 502, 503, 504],
      retryOnTimeout: true,
      maxRetryAfter: 3_000,
      backoffLimit: 1_500,
      jitter: true,
    },
  };
}
