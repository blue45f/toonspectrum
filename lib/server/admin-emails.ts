// 관리자 이메일 화이트리스트 — ADMIN_EMAILS env + 기본 소유자 계정.
// 세션 노출(role), requireAdminUser, isAdminUser 가 동일 집합을 쓰도록 한 곳에서만 정의한다.

export const DEFAULT_ADMIN_EMAILS = ["blue45f@gmail.com"] as const;

export function normalizeAdminEmail(email: string | null | undefined): string {
  return String(email ?? "")
    .trim()
    .toLowerCase();
}

export function getAdminEmailWhitelist(): Set<string> {
  const envEmails = String(process.env.ADMIN_EMAILS ?? "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return new Set<string>([...DEFAULT_ADMIN_EMAILS, ...envEmails]);
}

export function isWhitelistedAdminEmail(email: string | null | undefined): boolean {
  const normalized = normalizeAdminEmail(email);
  if (!normalized) return false;
  return getAdminEmailWhitelist().has(normalized);
}

/** DB role 이 일반 유저여도 화이트리스트면 세션/응답에 admin 으로 노출한다. */
export function resolveEffectiveAdminRole(
  role: string | null | undefined,
  email: string | null | undefined,
): "admin" | "operator" | "creator" | "user" {
  const normalized = String(role ?? "").toLowerCase();
  if (normalized === "admin" || normalized === "operator") return normalized;
  if (normalized === "creator") {
    // 크리에이터 역할은 유지하되, 화이트리스트면 관리자 권한을 우선한다.
    return isWhitelistedAdminEmail(email) ? "admin" : "creator";
  }
  return isWhitelistedAdminEmail(email) ? "admin" : "user";
}
