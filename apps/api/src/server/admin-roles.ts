/**
 * Authorization roles are durable security state. Email addresses are mutable
 * profile data and must never grant administrator privileges at request time.
 */
export type PersistedAuthRole = "admin" | "operator" | "creator" | "user";

export function normalizePersistedAuthRole(
  role: string | null | undefined,
): PersistedAuthRole {
  const normalized = String(role ?? "").trim().toLowerCase();
  if (
    normalized === "admin"
    || normalized === "operator"
    || normalized === "creator"
  ) {
    return normalized;
  }
  return "user";
}

export function isPersistedAdminRole(
  role: string | null | undefined,
): boolean {
  const normalized = normalizePersistedAuthRole(role);
  return normalized === "admin" || normalized === "operator";
}
