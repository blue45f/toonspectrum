export const ADMIN_ROUTE_IDS = [
  "overview",
  "traffic",
  "members",
  "reports",
  "community",
  "plans",
  "revenue",
  "campaigns",
  "promos",
  "announcements",
  "ops",
  "security",
  "audit",
] as const;

export type AdminRouteId = (typeof ADMIN_ROUTE_IDS)[number];

export type AdminRouteIconId =
  | "activity"
  | "announcement"
  | "audit"
  | "community"
  | "funding"
  | "members"
  | "operations"
  | "overview"
  | "plans"
  | "promotions"
  | "reports"
  | "revenue"
  | "security";

export interface AdminRouteDescriptor {
  readonly id: AdminRouteId;
  readonly path: string;
  readonly labelKey: string;
  readonly icon: AdminRouteIconId;
  readonly keywords: readonly string[];
}

export const ADMIN_ROUTES: readonly AdminRouteDescriptor[] = [
  { id: "overview", path: "/admin/overview", labelKey: "admin.tabs.dashboard", icon: "overview", keywords: ["dashboard", "운영 홈", "overview"] },
  { id: "traffic", path: "/admin/analytics/traffic", labelKey: "admin.tabs.traffic", icon: "activity", keywords: ["analytics", "traffic", "트래픽"] },
  { id: "members", path: "/admin/users/members", labelKey: "admin.splitRoutes.members", icon: "members", keywords: ["member", "user", "회원"] },
  { id: "reports", path: "/admin/trust/cases", labelKey: "admin.tabs.reports", icon: "reports", keywords: ["report", "case", "신고", "심의"] },
  { id: "community", path: "/admin/trust/community", labelKey: "admin.splitRoutes.community", icon: "community", keywords: ["community", "moderation", "커뮤니티"] },
  { id: "plans", path: "/admin/monetization/plans", labelKey: "admin.tabs.plans", icon: "plans", keywords: ["plan", "pricing", "플랜", "요금제"] },
  { id: "revenue", path: "/admin/monetization/revenue", labelKey: "admin.tabs.revenue", icon: "revenue", keywords: ["revenue", "settlement", "정산"] },
  { id: "campaigns", path: "/admin/monetization/funding", labelKey: "admin.tabs.campaigns", icon: "funding", keywords: ["campaign", "funding", "후원"] },
  { id: "promos", path: "/admin/growth/promotions", labelKey: "admin.tabs.promos", icon: "promotions", keywords: ["promotion", "coupon", "프로모션"] },
  { id: "announcements", path: "/admin/engagement/announcements", labelKey: "admin.tabs.announcements", icon: "announcement", keywords: ["announcement", "notice", "공지"] },
  { id: "ops", path: "/admin/platform/operations", labelKey: "admin.tabs.ops", icon: "operations", keywords: ["operations", "health", "운영", "시스템"] },
  { id: "security", path: "/admin/security/access", labelKey: "admin.tabs.security", icon: "security", keywords: ["security", "access", "보안"] },
  { id: "audit", path: "/admin/security/audit", labelKey: "admin.tabs.audit", icon: "audit", keywords: ["audit", "history", "감사"] },
] as const;

export type AdminNavigationGroupId =
  | "overview"
  | "users-trust"
  | "monetization"
  | "growth"
  | "platform-security";

export interface AdminNavigationGroup {
  readonly id: AdminNavigationGroupId;
  readonly routeIds: readonly AdminRouteId[];
}

export const ADMIN_NAVIGATION_GROUPS: readonly AdminNavigationGroup[] = [
  { id: "overview", routeIds: ["overview", "traffic"] },
  { id: "users-trust", routeIds: ["members", "reports", "community"] },
  { id: "monetization", routeIds: ["plans", "revenue", "campaigns"] },
  { id: "growth", routeIds: ["promos", "announcements"] },
  { id: "platform-security", routeIds: ["ops", "security", "audit"] },
] as const;

export const ADMIN_ROUTE_BY_ID = Object.fromEntries(
  ADMIN_ROUTES.map((route) => [route.id, route]),
) as Record<AdminRouteId, AdminRouteDescriptor>;

const LEGACY_TAB_ROUTE: Readonly<Record<string, AdminRouteId>> = {
  dashboard: "overview",
  traffic: "traffic",
  plans: "plans",
  revenue: "revenue",
  campaigns: "campaigns",
  promos: "promos",
  announcements: "announcements",
  reports: "reports",
  security: "security",
  audit: "audit",
  ops: "ops",
};

function normalizePathname(pathname: string): string {
  if (pathname === "/") return pathname;
  return pathname.replace(/\/+$/u, "") || "/";
}

function appendLocation(pathname: string, search: string, hash: string): string {
  return `${pathname}${search}${hash}`;
}

export function resolveAdminRoute(pathname: string): AdminRouteDescriptor | null {
  const normalized = normalizePathname(pathname);
  return ADMIN_ROUTES.find((route) => route.path === normalized) ?? null;
}

export function adminPathFromLegacyTab(tab: string | null | undefined): string {
  const routeId = tab ? LEGACY_TAB_ROUTE[tab] : undefined;
  return ADMIN_ROUTE_BY_ID[routeId ?? "overview"].path;
}

export function resolveAdminRedirectHref(
  pathname: string,
  search = "",
  hash = "",
): string | null {
  const normalized = normalizePathname(pathname);
  const params = new URLSearchParams(search);

  if (normalized === "/admin") {
    const destination = adminPathFromLegacyTab(params.get("tab"));
    params.delete("tab");
    const nextSearch = params.toString();
    return appendLocation(destination, nextSearch ? `?${nextSearch}` : "", hash);
  }

  if (normalized === "/admin/members") {
    return appendLocation(ADMIN_ROUTE_BY_ID.members.path, search, hash);
  }
  if (normalized === "/admin/community") {
    return appendLocation(ADMIN_ROUTE_BY_ID.community.path, search, hash);
  }

  const modernRoute = resolveAdminRoute(normalized);
  if (modernRoute && normalized !== pathname) {
    return appendLocation(modernRoute.path, search, hash);
  }
  return null;
}
