import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import { loadAdminI18nLocale } from "./admin-i18n-loader";
import { AdminGateFallback } from "./components/admin-gate";
import { useAdminGate } from "./components/admin-gate-state";
import { AdminAnnouncements } from "./components/AdminAnnouncements";
import { AdminAuditLogs } from "./components/AdminAuditLogs";
import { AdminCampaigns } from "./components/AdminCampaigns";
import { AdminDashboard } from "./components/AdminDashboard";
import { AdminHeaderStats } from "./components/AdminHeaderStats";
import { AdminOps } from "./components/AdminOps";
import { AdminPlans } from "./components/AdminPlans";
import { AdminPromos } from "./components/AdminPromos";
import { AdminQuickPalette } from "./components/AdminQuickPalette";
import { AdminReports } from "./components/AdminReports";
import { AdminRevenue } from "./components/AdminRevenue";
import { AdminSecurity } from "./components/AdminSecurity";
import { AdminToastProvider } from "./components/AdminToast";

import { Container } from "@/components/section";
import { useI18n, useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import Link from "@/src/compat/router-link";

type TabKey =
  | "dashboard"
  | "plans"
  | "revenue"
  | "promos"
  | "announcements"
  | "reports"
  | "security"
  | "audit"
  | "campaigns"
  | "ops";

export function AdminPage() {
  const { gate, uid } = useAdminGate();
  const [tab, setTab] = useState<TabKey>("dashboard");
  const t = useT();
  const lang = useI18n((s) => s.lang);

  useEffect(() => {
    void loadAdminI18nLocale(lang);
  }, [lang]);

  const tabs: { key: TabKey; label: string }[] = [
    { key: "dashboard", label: t("admin.tabs.dashboard") },
    { key: "plans", label: t("admin.tabs.plans") },
    { key: "revenue", label: t("admin.tabs.revenue") },
    { key: "promos", label: t("admin.tabs.promos") },
    { key: "announcements", label: t("admin.tabs.announcements") },
    { key: "reports", label: t("admin.tabs.reports") },
    { key: "security", label: t("admin.tabs.security") },
    { key: "audit", label: t("admin.tabs.audit") },
    { key: "campaigns", label: t("admin.tabs.campaigns") },
    { key: "ops", label: t("admin.tabs.ops") },
  ];

  const splitRoutes = [
    { href: "/admin/community", label: t("admin.splitRoutes.community") },
    { href: "/admin/members", label: t("admin.splitRoutes.members") },
  ];

  return (
    <AdminToastProvider>
      <Container size="wide" className="py-10 space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="eyebrow flex items-center gap-1.5 text-accent">
              <ShieldCheck size={13} /> {t("admin.console")}
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">{t("admin.title")}</h1>
            <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-3">
              {t("admin.desc")}
            </p>
          </div>

          {gate.kind === "admin" && uid && (
            <AdminQuickPalette userId={uid} onSelectTab={(k) => setTab(k as TabKey)} />
          )}
        </header>

        <AdminGateFallback gate={gate} />

        {gate.kind === "admin" && uid && (
          <div className="flex flex-col gap-6">
            {/* Live Analytics Pulse Bar */}
            <AdminHeaderStats userId={uid} />

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-fg-3">
                {gate.me.name ?? gate.me.email} · {t("admin.role")} <span className="text-accent font-semibold">{gate.me.role}</span>
              </div>
              <nav className="inline-flex flex-wrap rounded-xl border border-line bg-card p-1 shadow-sm" aria-label="관리 영역">
                {tabs.map((tItem) => (
                  <button
                    key={tItem.key}
                    onClick={() => setTab(tItem.key)}
                    aria-pressed={tab === tItem.key}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                      tab === tItem.key ? "bg-accent text-on-accent shadow-md shadow-accent/20 font-semibold" : "text-fg-2 hover:text-fg hover:bg-slate-800/40"
                    )}
                  >
                    {tItem.label}
                  </button>
                ))}
                <span className="mx-1 my-1 w-px bg-line" aria-hidden />
                {splitRoutes.map((route) => (
                  <Link
                    key={route.href}
                    href={route.href}
                    className="rounded-lg px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:text-fg hover:bg-slate-800/40"
                  >
                    {route.label}
                  </Link>
                ))}
              </nav>
            </div>

            <main className="min-h-[500px]">
              {tab === "dashboard" && <AdminDashboard uid={uid} />}
              {tab === "plans" && <AdminPlans uid={uid} />}
              {tab === "revenue" && <AdminRevenue uid={uid} />}
              {tab === "promos" && <AdminPromos userId={uid} />}
              {tab === "announcements" && <AdminAnnouncements userId={uid} />}
              {tab === "reports" && <AdminReports userId={uid} />}
              {tab === "security" && <AdminSecurity userId={uid} />}
              {tab === "audit" && <AdminAuditLogs userId={uid} />}
              {tab === "campaigns" && <AdminCampaigns uid={uid} />}
              {tab === "ops" && <AdminOps uid={uid} />}
            </main>
          </div>
        )}
      </Container>
    </AdminToastProvider>
  );
}
