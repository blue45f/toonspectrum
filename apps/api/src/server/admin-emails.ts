import { normalizePersistedAuthRole } from "./admin-roles";

/**
 * @deprecated Email-based privilege grants were removed. Kept temporarily so
 * older imports fail closed while downstream branches migrate.
 */
export const DEFAULT_ADMIN_EMAILS: readonly string[] = [];

/** @deprecated Profile normalization only; it grants no privileges. */
export function normalizeAdminEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

/** @deprecated Runtime email whitelists are intentionally disabled. */
export function getAdminEmailWhitelist(): Set<string> {
  return new Set<string>();
}

/** @deprecated Email addresses never authorize administrator access. */
export function isWhitelistedAdminEmail(_email: string | null | undefined): boolean {
  return false;
}

/** @deprecated Authorization is based only on the persisted database role. */
export function resolveEffectiveAdminRole(
  role: string | null | undefined,
  _email: string | null | undefined,
): "admin" | "operator" | "creator" | "user" {
  return normalizePersistedAuthRole(role);
}
