import { ShieldCheck } from "lucide-react";
import { useState } from "react";

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
import { cn } from "@/lib/utils";
import Link from "@/src/compat/router-link";

const TABS = [
  { key: "dashboard", label: "대시보드" },
  { key: "plans", label: "플랜" },
  { key: "revenue", label: "정산" },
  { key: "promos", label: "프로모션" },
  { key: "announcements", label: "공지·배너" },
  { key: "reports", label: "신고 심의" },
  { key: "security", label: "보안·IP" },
  { key: "audit", label: "감사 로그" },
  { key: "campaigns", label: "캠페인" },
  { key: "ops", label: "운영" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const SPLIT_ROUTES = [
  { href: "/admin/community", label: "커뮤니티·에셋 검수" },
  { href: "/admin/members", label: "회원" },
] as const;

export function AdminPage() {
  const { gate, uid } = useAdminGate();
  const [tab, setTab] = useState<TabKey>("dashboard");

  return (
    <AdminToastProvider>
      <Container size="wide" className="py-10 space-y-6">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="eyebrow flex items-center gap-1.5 text-accent">
              <ShieldCheck size={13} /> ADMIN CONSOLE
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">관리자 콘솔</h1>
            <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-3">
              지표·보안·정산·프로모션·공지사항 및 분쟁 심의를 통합 관리하는 엔터프라이즈 콘솔입니다.
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
                {gate.me.name ?? gate.me.email} · 역할 <span className="text-accent font-semibold">{gate.me.role}</span>
              </div>
              <nav className="inline-flex flex-wrap rounded-xl border border-line bg-card p-1 shadow-sm" aria-label="관리 영역">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    aria-pressed={tab === t.key}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-sm font-medium transition-all",
                      tab === t.key ? "bg-accent text-on-accent shadow-md shadow-accent/20 font-semibold" : "text-fg-2 hover:text-fg hover:bg-slate-800/40"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
                <span className="mx-1 my-1 w-px bg-line" aria-hidden />
                {SPLIT_ROUTES.map((route) => (
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
