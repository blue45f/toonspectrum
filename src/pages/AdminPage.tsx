import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Container } from "@/components/section";
import { useSession } from "@/src/compat/auth-session";
import { adminFetch, type AdminApiError, type AdminMe } from "@/src/components/admin/admin-client";
import { AdminNotice, AdminSpinner } from "@/src/components/admin/admin-ui";
import { AdminDashboard } from "@/src/components/admin/AdminDashboard";
import { AdminPlans } from "@/src/components/admin/AdminPlans";
import { AdminRevenue } from "@/src/components/admin/AdminRevenue";
import { AdminCampaigns } from "@/src/components/admin/AdminCampaigns";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "dashboard", label: "대시보드" },
  { key: "plans", label: "플랜" },
  { key: "revenue", label: "정산" },
  { key: "campaigns", label: "캠페인" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

type Gate =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }
  | { kind: "admin"; me: AdminMe };

export function AdminPage() {
  const { data: session, status } = useSession();
  const uid = session?.user?.id;
  const [gate, setGate] = useState<Gate>({ kind: "loading" });
  const [tab, setTab] = useState<TabKey>("dashboard");

  useEffect(() => {
    if (status === "unauthenticated") {
      setGate({ kind: "guest" });
      return;
    }
    if (status !== "authenticated" || !uid) {
      setGate({ kind: "loading" });
      return;
    }
    let alive = true;
    setGate({ kind: "loading" });
    adminFetch<AdminMe>("/me", uid)
      .then((me) => alive && setGate({ kind: "admin", me }))
      .catch((e: AdminApiError) => {
        if (!alive) return;
        if (e.status === 401 || e.status === 403) setGate({ kind: "forbidden" });
        else setGate({ kind: "error", message: e.message });
      });
    return () => {
      alive = false;
    };
  }, [status, uid]);

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

      {gate.kind === "loading" && <AdminSpinner />}
      {gate.kind === "guest" && (
        <AdminNotice
          title="로그인이 필요해요"
          body="관리자 콘솔은 로그인 후 이용할 수 있습니다. 우측 상단에서 로그인해 주세요."
        />
      )}
      {gate.kind === "forbidden" && (
        <AdminNotice
          title="관리자 권한이 없어요"
          body="이 계정에는 관리자 권한이 없습니다. 권한이 필요하면 운영자에게 문의하세요. (ADMIN_EMAILS 또는 users.role=admin)"
        />
      )}
      {gate.kind === "error" && <AdminNotice title="콘솔을 불러오지 못했어요" body={gate.message} />}

      {gate.kind === "admin" && uid && (
        <div className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-fg-3">
              {gate.me.name ?? gate.me.email} · 역할 <span className="text-accent">{gate.me.role}</span>
            </div>
            <nav className="inline-flex rounded-lg border border-line bg-card p-0.5" aria-label="관리 영역">
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
            </nav>
          </div>

          {tab === "dashboard" && <AdminDashboard uid={uid} />}
          {tab === "plans" && <AdminPlans uid={uid} />}
          {tab === "revenue" && <AdminRevenue uid={uid} />}
          {tab === "campaigns" && <AdminCampaigns uid={uid} />}
        </div>
      )}
    </Container>
  );
}
