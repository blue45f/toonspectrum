import { ShieldCheck } from "lucide-react";
import { useState } from "react";

import { AdminGateFallback } from "./components/admin-gate";
import { useAdminGate } from "./components/admin-gate-state";
import { AdminCampaigns } from "./components/AdminCampaigns";
import { AdminDashboard } from "./components/AdminDashboard";
import { AdminOps } from "./components/AdminOps";
import { AdminPlans } from "./components/AdminPlans";
import { AdminRevenue } from "./components/AdminRevenue";

import { Container } from "@/components/section";
import { cn } from "@/lib/utils";
import Link from "@/src/compat/router-link";

const TABS = [
  { key: "dashboard", label: "대시보드" },
  { key: "plans", label: "플랜" },
  { key: "revenue", label: "정산" },
  { key: "campaigns", label: "캠페인" },
  { key: "ops", label: "운영" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// 무거운 모더레이션 화면은 분할 라우트로 분리 — 콘솔 번들을 가볍게 유지한다.
const SPLIT_ROUTES = [
  { href: "/admin/community", label: "커뮤니티 글" },
  { href: "/admin/members", label: "회원" },
] as const;

export function AdminPage() {
  const { gate, uid } = useAdminGate();
  const [tab, setTab] = useState<TabKey>("dashboard");

  return (
    <Container size="wide" className="py-10">
      <header className="mb-8">
        <p className="eyebrow flex items-center gap-1.5 text-accent">
          <ShieldCheck size={13} /> ADMIN
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">관리자 콘솔</h1>
        <p className="mt-2 max-w-xl text-pretty text-sm leading-relaxed text-fg-3">
          사용자·커뮤니티 지표와 구독 플랜·정산·크리에이터 캠페인을 관리합니다.
        </p>
      </header>

      <AdminGateFallback gate={gate} />

      {gate.kind === "admin" && uid && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-fg-3">
              {gate.me.name ?? gate.me.email} · 역할 <span className="text-accent">{gate.me.role}</span>
            </div>
            <nav className="inline-flex flex-wrap rounded-lg border border-line bg-card p-0.5" aria-label="관리 영역">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  aria-pressed={tab === t.key}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    tab === t.key ? "bg-accent text-on-accent" : "text-fg-2 hover:text-fg"
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
                  className="rounded-md px-3 py-1.5 text-sm font-medium text-fg-2 transition-colors hover:text-fg"
                >
                  {route.label}
                </Link>
              ))}
            </nav>
          </div>

          {tab === "dashboard" && <AdminDashboard uid={uid} />}
          {tab === "plans" && <AdminPlans uid={uid} />}
          {tab === "revenue" && <AdminRevenue uid={uid} />}
          {tab === "campaigns" && <AdminCampaigns uid={uid} />}
          {tab === "ops" && <AdminOps uid={uid} />}
        </div>
      )}
    </Container>
  );
}
