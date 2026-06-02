import { useEffect, useState } from "react";
import { Container } from "@/components/section";
import { useSession } from "@/src/compat/auth-session";
import { ShieldCheck, Users, MessagesSquare, Coins } from "lucide-react";

interface AdminMe {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
}

interface Dashboard {
  updatedAt: string;
  users: { total: number; activeLast7d: number; activeLast30d: number; admins: number; creators: number };
  community: { fanPosts: number; fanReplies: number; reviewReplies: number; reviews: number; userActivity: number };
  monetization: {
    planCount: number;
    activePlanCount: number;
    campaignCount: number;
    revenuePendingCents: number;
    revenuePaidCents: number;
    pendingEvents: number;
    periodDays: number;
  };
}

type State =
  | { kind: "loading" }
  | { kind: "guest" }
  | { kind: "forbidden" }
  | { kind: "error"; message: string }
  | { kind: "ready"; me: AdminMe; dashboard: Dashboard };

const won = (cents: number) => `₩${Math.round((Number(cents) || 0) / 100).toLocaleString("ko-KR")}`;
const num = (n: number) => (Number(n) || 0).toLocaleString("ko-KR");

export function AdminPage() {
  const { data: session, status } = useSession();
  const uid = session?.user?.id;
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (status === "unauthenticated") {
      setState({ kind: "guest" });
      return;
    }
    if (status !== "authenticated" || !uid) {
      setState({ kind: "loading" });
      return;
    }
    let alive = true;
    const headers = { "x-user-id": uid };
    setState({ kind: "loading" });
    (async () => {
      try {
        const meRes = await fetch("/api/admin/me", { headers, cache: "no-store" });
        if (meRes.status === 401 || meRes.status === 403) {
          if (alive) setState({ kind: "forbidden" });
          return;
        }
        if (!meRes.ok) throw new Error(`admin/me ${meRes.status}`);
        const me = (await meRes.json()) as AdminMe;
        const dashRes = await fetch("/api/admin/dashboard?days=30", { headers, cache: "no-store" });
        if (!dashRes.ok) throw new Error(`admin/dashboard ${dashRes.status}`);
        const dashboard = (await dashRes.json()) as Dashboard;
        if (alive) setState({ kind: "ready", me, dashboard });
      } catch (error) {
        if (alive) setState({ kind: "error", message: error instanceof Error ? error.message : "unknown" });
      }
    })();
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
          사용자·커뮤니티·수익 지표를 한눈에 봅니다. 플랜·정산·캠페인 상세 관리는 Nest{" "}
          <code className="rounded bg-raised px-1 py-0.5 text-[0.78em]">/api/admin/*</code> API로 제공됩니다.
        </p>
      </header>

      {state.kind === "loading" && (
        <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="불러오는 중">
          <span className="size-6 animate-spin rounded-full border-2 border-line border-t-accent" />
        </div>
      )}

      {state.kind === "guest" && (
        <Notice
          title="로그인이 필요해요"
          body="관리자 콘솔은 로그인 후 이용할 수 있습니다. 우측 상단에서 로그인해 주세요."
        />
      )}

      {state.kind === "forbidden" && (
        <Notice
          title="관리자 권한이 없어요"
          body="이 계정에는 관리자 권한이 없습니다. 권한이 필요하면 운영자에게 문의하세요. (ADMIN_EMAILS 또는 users.role)"
        />
      )}

      {state.kind === "error" && (
        <Notice title="지표를 불러오지 못했어요" body={`잠시 후 다시 시도해 주세요. (${state.message})`} />
      )}

      {state.kind === "ready" && (
        <div className="flex flex-col gap-8">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-card p-5">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
              <ShieldCheck size={18} />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-fg">
                {state.me.name ?? state.me.email ?? state.me.id}
              </p>
              <p className="text-xs text-fg-3">
                {state.me.email} · 역할 <span className="text-accent">{state.me.role}</span>
              </p>
            </div>
            <span className="ml-auto text-xs text-fg-3">
              최근 {state.dashboard.monetization.periodDays}일 · {new Date(state.dashboard.updatedAt).toLocaleString("ko-KR")}
            </span>
          </div>

          <StatGroup icon={<Users size={15} />} label="사용자">
            <Stat label="전체" value={num(state.dashboard.users.total)} />
            <Stat label="7일 활성" value={num(state.dashboard.users.activeLast7d)} />
            <Stat label="30일 활성" value={num(state.dashboard.users.activeLast30d)} />
            <Stat label="관리자" value={num(state.dashboard.users.admins)} />
            <Stat label="크리에이터" value={num(state.dashboard.users.creators)} />
          </StatGroup>

          <StatGroup icon={<MessagesSquare size={15} />} label="커뮤니티">
            <Stat label="펜카페 글" value={num(state.dashboard.community.fanPosts)} />
            <Stat label="펜카페 댓글" value={num(state.dashboard.community.fanReplies)} />
            <Stat label="리뷰" value={num(state.dashboard.community.reviews)} />
            <Stat label="리뷰 댓글" value={num(state.dashboard.community.reviewReplies)} />
            <Stat label="활동 사용자" value={num(state.dashboard.community.userActivity)} />
          </StatGroup>

          <StatGroup icon={<Coins size={15} />} label="수익">
            <Stat
              label="활성/전체 플랜"
              value={`${num(state.dashboard.monetization.activePlanCount)}/${num(state.dashboard.monetization.planCount)}`}
            />
            <Stat label="캠페인" value={num(state.dashboard.monetization.campaignCount)} />
            <Stat label="대기 정산건" value={num(state.dashboard.monetization.pendingEvents)} />
            <Stat label="정산 완료액" value={won(state.dashboard.monetization.revenuePaidCents)} />
            <Stat label="대기 금액" value={won(state.dashboard.monetization.revenuePendingCents)} />
          </StatGroup>
        </div>
      )}
    </Container>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-6">
      <h2 className="text-lg font-semibold text-fg">{title}</h2>
      <p className="mt-2 max-w-xl text-sm leading-relaxed text-fg-3">{body}</p>
    </section>
  );
}

function StatGroup({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-1.5 text-fg-2">
        <span className="text-accent">{icon}</span>
        <h2 className="text-sm font-semibold">{label}</h2>
      </div>
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-3 lg:grid-cols-5">
        {children}
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-card p-4">
      <dt className="text-xs text-fg-3">{label}</dt>
      <dd className="numeral text-xl text-fg">{value}</dd>
    </div>
  );
}
