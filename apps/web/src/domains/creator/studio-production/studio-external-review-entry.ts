import { validateStudioExternalToken } from "@/domains/creator/studio-route-registry";

const EXTERNAL_REVIEW_CONFLICT_KEYS = [
  "scope",
  "id",
  "remix",
  "demo",
  "invite",
  "presentationToken",
] as const;

export type StudioExternalReviewEntry =
  | { readonly kind: "none" }
  | { readonly kind: "invalid" }
  | { readonly kind: "valid"; readonly token: string };

export function resolveStudioExternalReviewEntry(search: string): StudioExternalReviewEntry {
  const params = new URLSearchParams(search);
  const tokens = params.getAll("shareToken");
  if (tokens.length === 0) return { kind: "none" };
  if (
    tokens.length !== 1
    || tokens[0].length < 32
    || tokens[0].length > 128
    || !validateStudioExternalToken(tokens[0])
    || EXTERNAL_REVIEW_CONFLICT_KEYS.some((key) => params.has(key))
  ) {
    return { kind: "invalid" };
  }
  return { kind: "valid", token: tokens[0] };
}
