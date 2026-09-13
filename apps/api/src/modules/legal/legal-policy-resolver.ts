import { createHash } from "node:crypto";

import {
  getStaticPolicyDocument,
  isPolicySlug,
  parsePolicyDocument,
  TERMSDESK_BASE,
  TERMSDESK_ORG_SLUG,
} from "../../../../../packages/core/src/legal-policy";

import type { PolicyDocument, PolicySlug } from "../../../../../packages/core/src/legal-policy";

const MAX_BODY_BYTES = 512 * 1024;
const REFRESH_AFTER_MS = 60_000;
const REQUEST_TIMEOUT_MS = 3_000;

type PolicyFetcher = (url: string, options: RequestInit) => Promise<Response>;

// Request input only selects a fixed destination; it is never interpolated into a URL.
// Keep the guard here as well as in the controller for non-HTTP callers.
function policyEndpoint(slug: PolicySlug): string {
  switch (slug) {
    case "privacy-policy":
      return `${TERMSDESK_BASE}/api/public/${TERMSDESK_ORG_SLUG}/policies/privacy-policy`;
    case "terms-of-service":
      return `${TERMSDESK_BASE}/api/public/${TERMSDESK_ORG_SLUG}/policies/terms-of-service`;
    default:
      throw new Error("policy_not_found");
  }
}

async function readBoundedJson(response: Response): Promise<unknown> {
  const mediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json" || Number(response.headers.get("content-length")) > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw new Error("policy_response_invalid");
  }
  if (!response.body) throw new Error("policy_response_empty");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      bytes += result.value.byteLength;
      if (bytes > MAX_BODY_BYTES) throw new Error("policy_response_too_large");
      text += decoder.decode(result.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** At most two cache entries and one in-flight request per permitted policy. */
export function createPolicyResolver(
  fetcher: PolicyFetcher = (url, options) => fetch(url, options),
  now: () => number = Date.now,
) {
  const cache = new Map<PolicySlug, { checkedAt: number; document: PolicyDocument }>();
  const pending = new Map<PolicySlug, Promise<PolicyDocument>>();

  async function refresh(slug: PolicySlug): Promise<PolicyDocument> {
    let document: PolicyDocument;
    try {
      const response = await fetcher(policyEndpoint(slug), {
        headers: { Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error("policy_upstream_unavailable");
      }
      document = parsePolicyDocument(await readBoundedJson(response), slug);
      // Match TermsDesk shared/hash.ts: canonicalize line endings only, then hash UTF-8.
      // Preserve the original response body; a digest match is integrity, not proof of recency.
      const digest = createHash("sha256")
        .update(document.body.replace(/\r\n/g, "\n").replace(/\r/g, "\n"), "utf8")
        .digest("hex");
      if (digest !== document.contentHash.toLowerCase()) throw new Error("policy_content_hash_mismatch");
    } catch {
      // Return real, pre-existing content, never an empty success or a fabricated publication.
      // Source=static is preserved end-to-end and renders the existing fallback notice.
      document = getStaticPolicyDocument(slug);
    }
    const saved = Object.freeze({ ...document });
    cache.set(slug, { checkedAt: now(), document: saved });
    return saved;
  }

  return async (slug: PolicySlug): Promise<PolicyDocument> => {
    if (!isPolicySlug(slug)) throw new Error("policy_not_found");
    const entry = cache.get(slug);
    const age = entry ? now() - entry.checkedAt : -1;
    if (entry && age >= 0 && age < REFRESH_AFTER_MS) return { ...entry.document };
    let request = pending.get(slug);
    if (!request) {
      request = refresh(slug).finally(() => pending.delete(slug));
      pending.set(slug, request);
    }
    return { ...await request };
  };
}
