import {
  getStaticPolicyDocument,
  isPolicySlug,
} from "../../../../../packages/core/src/legal-policy";

import type {
  PolicyDocument,
  PolicySlug,
} from "../../../../../packages/core/src/legal-policy";

/**
 * Legal policy authority is first-party and bundled with the release.
 *
 * The previous resolver fetched an external TermsDesk service on demand.
 * Keeping the policy body in the reviewed repository removes that runtime,
 * latency, availability and billing dependency. A fresh object is returned to
 * every caller so application code cannot mutate the frozen canonical copy.
 */
export function createPolicyResolver() {
  return async (slug: PolicySlug): Promise<PolicyDocument> => {
    if (!isPolicySlug(slug)) throw new Error("policy_not_found");
    return { ...getStaticPolicyDocument(slug) };
  };
}
