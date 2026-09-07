import { Suspense, useEffect } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";

import type { AdminTabKey } from "../admin-console-model";
import { loadAdminI18nLocale } from "../admin-i18n-loader";
import { AdminGateFallback } from "../components/admin-gate";
import { useAdminGate } from "../components/admin-gate-state";
import { AdminToastProvider } from "../components/AdminToast";
import { AdminShell } from "../shell/AdminShell";
import { getAdminShellCopy } from "../shell/admin-shell-copy";
import {
  adminPathFromLegacyTab,
  resolveAdminRedirectHref,
  resolveAdminRoute,
  type AdminRouteId,
} from "./admin-route-manifest";

import { useI18n, useT } from "@/shared/lib/i18n";
import { lazyRetry } from "@/shared/lib/lazy-retry";
import { useDocumentTitle } from "@/src/hooks/use-document-title";

const AdminDashboard = lazyRetry(
  () => import("../components/AdminDashboard").then((module) => ({ default: module.AdminDashboard })),
  "AdminDashboardV2",
);
const AdminTraffic = lazyRetry(
  () => import("../components/AdminTraffic").then((module) => ({ default: module.AdminTraffic })),
  "AdminTrafficV2",
);
const AdminPlans = lazyRetry(
  () => import("../components/AdminPlans").then((module) => ({ default: module.AdminPlans })),
  "AdminPlansV2",
);
const AdminRevenue = lazyRetry(
  () => import("../components/AdminRevenue").then((module) => ({ default: module.AdminRevenue })),
  "AdminRevenueV2",
);
const AdminPromos = lazyRetry(
  () => import("../components/AdminPromos").then((module) => ({ default: module.AdminPromos })),
  "AdminPromosV2",
);
const AdminAnnouncements = lazyRetry(
  () => import("../components/AdminAnnouncements").then((module) => ({ default: module.AdminAnnouncements })),
  "AdminAnnouncementsV2",
);
const AdminReports = lazyRetry(
  () => import("../components/AdminReports").then((module) => ({ default: module.AdminReports })),
  "AdminReportsV2",
);
const AdminSecurity = lazyRetry(
  () => import("../components/AdminSecurity").then((module) => ({ default: module.AdminSecurity })),
  "AdminSecurityV2",
);
const AdminAuditLogs = lazyRetry(
  () => import("../components/AdminAuditLogs").then((module) => ({ default: module.AdminAuditLogs })),
  "AdminAuditLogsV2",
);
const AdminCampaigns = lazyRetry(
  () => import("../components/AdminCampaigns").then((module) => ({ default: module.AdminCampaigns })),
  "AdminCampaignsV2",
);
const AdminOps = lazyRetry(
  () => import("../components/AdminOps").then((module) => ({ default: module.AdminOps })),
  "AdminOpsV2",
);
const AdminMembersPage = lazyRetry(
  () => import("../AdminMembersPage").then((module) => ({ default: module.AdminMembersPage })),
  "AdminMembersPageV2",
);
const AdminCommunityPage = lazyRetry(
  () => import("../AdminCommunityPage").then((module) => ({ default: module.AdminCommunityPage })),
  "AdminCommunityPageV2",
);

function AdminRouteLoading() {
  const lang = useI18n((state) => state.lang);
  const copy = getAdminShellCopy(lang);
  return (
    <div aria-busy="true" aria-label={copy.loading} className="space-y-4">
      <div className="admin-route-skeleton h-24 rounded-2xl border border-line bg-card" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div
            key={index}
            className="admin-route-skeleton h-36 rounded-2xl border border-line bg-card"
          />
        ))}
      </div>
      <div className="admin-route-skeleton h-72 rounded-2xl border border-line bg-card" />
    </div>
  );
}

function AdminRouteSurface({
  routeId,
  uid,
  onNavigate,
}: {
  routeId: AdminRouteId;
  uid: string;
  onNavigate: (tab: AdminTabKey) => void;
}) {
  switch (routeId) {
    case "overview":
      return <AdminDashboard uid={uid} onNavigate={onNavigate} />;
    case "traffic":
      return <AdminTraffic uid={uid} />;
    case "members":
      return (
        <div className="admin-embedded-legacy">
          <AdminMembersPage />
        </div>
      );
    case "reports":
      return <AdminReports userId={uid} />;
    case "community":
      return (
        <div className="admin-embedded-legacy">
          <AdminCommunityPage />
        </div>
      );
    case "plans":
      return <AdminPlans uid={uid} />;
    case "revenue":
      return <AdminRevenue uid={uid} />;
    case "campaigns":
      return <AdminCampaigns uid={uid} />;
    case "promos":
      return <AdminPromos userId={uid} />;
    case "announcements":
      return <AdminAnnouncements userId={uid} />;
    case "ops":
      return <AdminOps uid={uid} />;
    case "security":
      return <AdminSecurity userId={uid} />;
    case "audit":
      return <AdminAuditLogs userId={uid} />;
  }
}

function AdminAuthorizedRouter({ routeId }: { routeId: AdminRouteId }) {
  const { gate, uid } = useAdminGate();
  const navigate = useNavigate();

  if (gate.kind !== "admin" || !uid) {
    return (
      <div className="min-h-[100dvh] bg-canvas px-4 py-20 text-fg">
        <div className="mx-auto max-w-xl rounded-2xl border border-line bg-card p-6">
          <AdminGateFallback gate={gate} />
        </div>
      </div>
    );
  }

  const onNavigate = (tab: AdminTabKey) => {
    navigate(adminPathFromLegacyTab(tab));
  };

  return (
    <AdminToastProvider>
      <AdminShell actor={gate.me} userId={uid}>
        <Suspense fallback={<AdminRouteLoading />}>
          <AdminRouteSurface routeId={routeId} uid={uid} onNavigate={onNavigate} />
        </Suspense>
      </AdminShell>
    </AdminToastProvider>
  );
}

export function AdminRouter() {
  const location = useLocation();
  const t = useT();
  const lang = useI18n((state) => state.lang);
  const redirectHref = resolveAdminRedirectHref(
    location.pathname,
    location.search,
    location.hash,
  );
  const route = resolveAdminRoute(location.pathname);

  useEffect(() => {
    void loadAdminI18nLocale(lang);
  }, [lang]);

  useDocumentTitle(route ? t(route.labelKey) : t("admin.title"));

  if (redirectHref) return <Navigate replace to={redirectHref} />;
  if (!route) return <Navigate replace to="/admin/overview" />;

  return <AdminAuthorizedRouter routeId={route.id} />;
}
