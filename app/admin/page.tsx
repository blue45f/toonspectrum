"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";

const ADMIN_ROLES = new Set(["admin", "operator"]);

type Currency = "KRW";

interface AdminMe {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
  permissions: {
    canManageMonetization: boolean;
    canManageCommunity: boolean;
  };
  generatedAt: string;
}

interface DashboardResponse {
  updatedAt: string;
  users: { total: number; activeLast7d: number; activeLast30d: number; admins: number; creators: number };
  community: { fanPosts: number; fanReplies: number; reviewReplies: number; reviews: number; userActivity: number };
  monetization: {
    planCount: number;
    activePlanCount: number;
    campaignCount: number;
    revenuePaidCents: number;
    revenuePendingCents: number;
    paidEvents: number;
    pendingEvents: number;
    periodDays: number;
  };
  currency: Currency;
}

interface Plan {
  id: string;
  code: string;
  name: string;
  description: string;
  intervalDays: number;
  currency: Currency;
  priceCents: number;
  perks: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PlansResponse {
  items: Plan[];
}

interface Campaign {
  id: string;
  creatorId: string;
  titleId: string | null;
  planId: string | null;
  title: string;
  description: string;
  targetAmountCents: number;
  raisedAmountCents: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  createdAt: string;
  updatedAt: string;
  creatorName: string | null;
  creatorEmail: string | null;
  planName: string | null;
  planCode: string | null;
}

interface CampaignsResponse {
  items: Campaign[];
  currency: Currency;
}

interface RevenueSummary {
  period: { from: string; to: string; days: number };
  summary: {
    paidAmountCents: number;
    pendingAmountCents: number;
    paidEvents: number;
    pendingEvents: number;
    totalEvents: number;
  };
  plans: Array<{ planId: string | null; planName: string | null; events: number; amountCents: number }>;
  events: Array<{
    id: string;
    status: string;
    kind: string;
    amountCents: number;
    currency: string;
    planId: string | null;
    campaignId: string | null;
    payerId: string;
    recipientId: string;
    createdAt: string;
  }>;
}

interface PlanFormState {
  id: string;
  code: string;
  name: string;
  description: string;
  intervalDays: number;
  currency: Currency;
  priceCents: number;
  perks: string;
  isActive: boolean;
}

interface CampaignFormState {
  id: string;
  creatorId: string;
  titleId: string;
  planId: string;
  title: string;
  description: string;
  targetAmountWon: string;
  raisedAmountWon: string;
  isActive: boolean;
  startsAt: string;
  endsAt: string;
}

function toMoney(value: number) {
  return new Intl.NumberFormat("ko-KR").format(value);
}

function isAdminRole(role: string | undefined) {
  return role ? ADMIN_ROLES.has(role) : false;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    const errText = await res.text().catch(() => "요청에 실패했습니다.");
    throw new Error(errText || "요청에 실패했습니다.");
  }
  return (await res.json()) as T;
}

function toLocalDateTimeValue(value: string | null) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 16);
}

function parseWonToCents(input: string) {
  const parsed = Number(input);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.floor(parsed * 100));
}

function centsToWon(cents: number) {
  return (Math.max(0, Math.floor(cents)) / 100).toLocaleString("ko-KR");
}

function clampPerks(input: string): string[] {
  return input
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 12);
}

const EMPTY_PLAN_FORM: PlanFormState = {
  id: "",
  code: "",
  name: "",
  description: "",
  intervalDays: 30,
  currency: "KRW",
  priceCents: 0,
  perks: "",
  isActive: true,
};

const EMPTY_CAMPAIGN_FORM: CampaignFormState = {
  id: "",
  creatorId: "",
  titleId: "",
  planId: "",
  title: "",
  description: "",
  targetAmountWon: "0",
  raisedAmountWon: "0",
  isActive: true,
  startsAt: "",
  endsAt: "",
};

export default function AdminPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadTick, setReloadTick] = useState(0);
  const [me, setMe] = useState<AdminMe | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [periodDays, setPeriodDays] = useState(30);
  const [planForm, setPlanForm] = useState<PlanFormState>(EMPTY_PLAN_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignForm, setCampaignForm] = useState<CampaignFormState>(EMPTY_CAMPAIGN_FORM);
  const [campaignSubmitting, setCampaignSubmitting] = useState(false);

  const loadData = useCallback(async () => {
    if (!session?.user?.id) return;
    setLoading(true);
    setError("");

    try {
      const [meData, dashboardData, plansData, revenueData, campaignsData] = await Promise.all([
        fetchJson<AdminMe>("/api/admin/me"),
        fetchJson<DashboardResponse>(`/api/admin/dashboard?days=${periodDays}`),
        fetchJson<PlansResponse>("/api/admin/plans"),
        fetchJson<RevenueSummary>(`/api/admin/revenue?days=${periodDays}`),
        fetchJson<CampaignsResponse>("/api/admin/campaigns"),
      ]);

      setMe(meData);
      setDashboard(dashboardData);
      setPlans(plansData.items ?? []);
      setRevenue(revenueData);
      setCampaigns(campaignsData.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청 실패");
    } finally {
      setLoading(false);
    }
  }, [periodDays, session?.user?.id]);

  useEffect(() => {
    if (!isAdminRole(session?.user?.role)) return;
    const timer = window.setTimeout(() => {
      void loadData();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [session?.user?.role, loadData, reloadTick]);

  const startCreate = () => {
    setPlanForm(EMPTY_PLAN_FORM);
  };

  const startEdit = (plan: Plan) => {
    setPlanForm({
      id: plan.id,
      code: plan.code,
      name: plan.name,
      description: plan.description,
      intervalDays: plan.intervalDays,
      currency: plan.currency,
      priceCents: plan.priceCents,
      perks: plan.perks.join(", "),
      isActive: plan.isActive,
    });
  };

  const onSubmitPlan = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!planForm.code.trim() || !planForm.name.trim()) {
      setError("코드와 이름은 필수 입력입니다.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/admin/plans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: planForm.id || undefined,
          code: planForm.code.trim().toLowerCase(),
          name: planForm.name.trim(),
          description: planForm.description.trim(),
          intervalDays: planForm.intervalDays,
          currency: planForm.currency,
          priceCents: planForm.priceCents,
          perks: clampPerks(planForm.perks),
          isActive: planForm.isActive,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "저장에 실패했습니다.");
      }

      setPlanForm(EMPTY_PLAN_FORM);
      setReloadTick((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSubmitting(false);
    }
  };

  const startCampaignCreate = () => {
    setCampaignForm(EMPTY_CAMPAIGN_FORM);
  };

  const startCampaignEdit = (campaign: Campaign) => {
    setCampaignForm({
      id: campaign.id,
      creatorId: campaign.creatorId,
      titleId: campaign.titleId ?? "",
      planId: campaign.planId ?? "",
      title: campaign.title,
      description: campaign.description,
      targetAmountWon: centsToWon(campaign.targetAmountCents),
      raisedAmountWon: centsToWon(campaign.raisedAmountCents),
      isActive: campaign.isActive,
      startsAt: toLocalDateTimeValue(campaign.startsAt),
      endsAt: toLocalDateTimeValue(campaign.endsAt),
    });
  };

  const onSubmitCampaign = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!campaignForm.creatorId.trim() || !campaignForm.title.trim()) {
      setError("크리에이터 ID와 캠페인 제목은 필수입니다.");
      return;
    }

    setCampaignSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: campaignForm.id || undefined,
          creatorId: campaignForm.creatorId.trim(),
          titleId: campaignForm.titleId.trim() || undefined,
          planId: campaignForm.planId.trim() || undefined,
          title: campaignForm.title.trim(),
          description: campaignForm.description.trim(),
          targetAmountCents: parseWonToCents(campaignForm.targetAmountWon),
          raisedAmountCents: parseWonToCents(campaignForm.raisedAmountWon),
          isActive: campaignForm.isActive,
          startsAt: campaignForm.startsAt || undefined,
          endsAt: campaignForm.endsAt || undefined,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "캠페인 저장에 실패했습니다.");
      }

      setCampaignForm(EMPTY_CAMPAIGN_FORM);
      setReloadTick((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setCampaignSubmitting(false);
    }
  };

  const onDeleteCampaign = async (campaignId: string) => {
    if (!campaignId) return;
    setError("");
    const confirmed = confirm("캠페인을 정말 삭제하시겠습니까?");
    if (!confirmed) return;

    setCampaignSubmitting(true);
    try {
      const res = await fetch(`/api/admin/campaigns/${campaignId}`, { method: "DELETE" });
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "캠페인 삭제에 실패했습니다.");
      }
      setReloadTick((prev) => prev + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setCampaignSubmitting(false);
    }
  };

  if (status === "loading") {
    return <div className="mx-auto max-w-5xl px-5 py-12">로그인 상태를 확인 중입니다...</div>;
  }

  if (!session?.user) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <h1 className="text-2xl font-bold">관리자 페이지</h1>
        <p className="mt-2 text-sm text-fg-3">로그인이 필요합니다. 로그인 후 접근해 주세요.</p>
        <Link href="/" className="mt-6 inline-flex rounded-xl border border-line bg-card px-4 py-2 text-sm">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  if (!isAdminRole(session.user.role)) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-16">
        <h1 className="text-2xl font-bold">관리자 페이지 접근 제한</h1>
        <p className="mt-2 text-sm text-fg-3">현재 계정은 관리자 권한이 없습니다.</p>
        <p className="mt-2 text-xs text-fg-3">관리자 권한은 DB role 또는 ADMIN_EMAILS 환경변수로 부여됩니다.</p>
        <Link href="/" className="mt-6 inline-flex rounded-xl border border-line bg-card px-4 py-2 text-sm">
          홈으로
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">운영관리 콘솔</h1>
          <p className="mt-2 text-sm text-fg-3">
            {me ? `${me.email ?? "관리자"} (${me.role})` : "관리자 패널"} · {me?.generatedAt ? new Date(me.generatedAt).toLocaleString("ko-KR") : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setReloadTick((prev) => prev + 1)}
            className="rounded-xl border border-line bg-card px-3 py-2 text-sm"
            disabled={loading}
          >
            {loading ? "갱신 중..." : "새로고침"}
          </button>
        </div>
      </div>

      {error && <p className="mb-4 rounded-xl border border-bad/50 bg-bad/10 px-3 py-2 text-sm text-bad">{error}</p>}

      <section className="mb-8 grid gap-3 md:grid-cols-4">
        <article className="rounded-xl border border-line bg-card p-4">
          <p className="text-sm text-fg-3">총 사용자</p>
          <p className="mt-2 text-2xl font-bold">{dashboard ? toMoney(dashboard.users.total) : "-"}</p>
          <p className="mt-2 text-xs text-fg-3">
            최근 30일 활성: {dashboard ? toMoney(dashboard.users.activeLast30d) : "-"} / 7일: {dashboard ? dashboard.users.activeLast7d : "-"}
          </p>
        </article>
        <article className="rounded-xl border border-line bg-card p-4">
          <p className="text-sm text-fg-3">운영 커뮤니티</p>
          <p className="mt-2 text-2xl font-bold">{dashboard ? toMoney(dashboard.community.fanPosts + dashboard.community.fanReplies + dashboard.community.reviewReplies) : "-"}</p>
          <p className="mt-2 text-xs text-fg-3">리뷰 수: {dashboard ? dashboard.community.reviews : "-"}</p>
        </article>
        <article className="rounded-xl border border-line bg-card p-4">
          <p className="text-sm text-fg-3">수익 플랜</p>
          <p className="mt-2 text-2xl font-bold">{dashboard ? dashboard.monetization.activePlanCount : "-"} / {dashboard ? dashboard.monetization.planCount : "-"}</p>
          <p className="mt-2 text-xs text-fg-3">캠페인: {dashboard ? dashboard.monetization.campaignCount : "-"}</p>
        </article>
        <article className="rounded-xl border border-line bg-card p-4">
          <p className="text-sm text-fg-3">실시간 수익</p>
          <p className="mt-2 text-2xl font-bold">
            {dashboard ? `${toMoney(Math.round((dashboard.monetization.revenuePaidCents - dashboard.monetization.revenuePendingCents) / 100))}원` : "-"}
          </p>
          <p className="mt-2 text-xs text-fg-3">이익: 지급 {toMoney(dashboard ? dashboard.monetization.paidEvents : 0)}건</p>
        </article>
      </section>

      <section className="mb-8 rounded-xl border border-line bg-card p-4">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">수익 분석</h2>
          <div className="ml-auto flex items-center gap-2">
            <label className="text-xs text-fg-3">기간</label>
            <input
              type="number"
              value={periodDays}
              min={1}
              max={365}
              onChange={(event) => setPeriodDays(Math.max(1, Number(event.target.value || 30)))}
              className="w-20 rounded-md border border-line bg-card px-2 py-1 text-xs"
            />
            <span className="text-xs text-fg-3">일</span>
          </div>
        </div>

        {revenue ? (
          <div className="grid gap-3 md:grid-cols-4">
            <p className="rounded-lg border border-line-strong bg-panel p-3">
              <span className="text-xs text-fg-3">수익(지급)</span>
              <strong className="mt-1 block text-lg">{toMoney(Math.floor(revenue.summary.paidAmountCents / 100))}원</strong>
            </p>
            <p className="rounded-lg border border-line-strong bg-panel p-3">
              <span className="text-xs text-fg-3">수익(미지급)</span>
              <strong className="mt-1 block text-lg">{toMoney(Math.floor(revenue.summary.pendingAmountCents / 100))}원</strong>
            </p>
            <p className="rounded-lg border border-line-strong bg-panel p-3">
              <span className="text-xs text-fg-3">처리 건수</span>
              <strong className="mt-1 block text-lg">{revenue.summary.totalEvents}건</strong>
            </p>
            <p className="rounded-lg border border-line-strong bg-panel p-3">
              <span className="text-xs text-fg-3">조회 기간</span>
              <strong className="mt-1 block text-lg">{revenue.period.days}일</strong>
            </p>
          </div>
        ) : (
          <p className="text-sm text-fg-3">수익 데이터를 불러오는 중입니다...</p>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <div className="rounded-xl border border-line bg-card p-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold">플랜 관리</h2>
            <button
              type="button"
              onClick={startCreate}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium"
            >
              새 플랜
            </button>
          </div>

          <form className="grid gap-2" onSubmit={onSubmitPlan}>
            <label className="grid gap-1 text-xs">
              <span className="text-fg-3">코드</span>
              <input
                className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
                value={planForm.code}
                onChange={(event) => setPlanForm((prev) => ({ ...prev, code: event.target.value }))}
              />
            </label>

            <label className="grid gap-1 text-xs">
              <span className="text-fg-3">이름</span>
              <input
                className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
                value={planForm.name}
                onChange={(event) => setPlanForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </label>

            <label className="grid gap-1 text-xs">
              <span className="text-fg-3">설명</span>
              <textarea
                className="min-h-20 rounded-md border border-line bg-panel px-3 py-2 text-sm"
                value={planForm.description}
                onChange={(event) => setPlanForm((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>

            <div className="grid grid-cols-3 gap-2">
              <label className="grid gap-1 text-xs">
                <span className="text-fg-3">기간(일)</span>
                <input
                  type="number"
                  min={1}
                  max={3650}
                  className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
                  value={planForm.intervalDays}
                  onChange={(event) =>
                    setPlanForm((prev) => ({ ...prev, intervalDays: Math.max(1, Number(event.target.value || 30)) }))
                  }
                />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-fg-3">통화</span>
                <input
                  className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
                  value={planForm.currency}
                  onChange={(event) => setPlanForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() as Currency }))}
                />
              </label>
              <label className="grid gap-1 text-xs">
                <span className="text-fg-3">가격(원단위 *100?)</span>
                <input
                  type="number"
                  min={0}
                  className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
                  value={planForm.priceCents}
                  onChange={(event) => setPlanForm((prev) => ({ ...prev, priceCents: Math.max(0, Number(event.target.value || 0)) }))}
                />
              </label>
            </div>

            <label className="grid gap-1 text-xs">
              <span className="text-fg-3">혜택 (쉼표 구분)</span>
              <input
                className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
                value={planForm.perks}
                onChange={(event) => setPlanForm((prev) => ({ ...prev, perks: event.target.value }))}
              />
            </label>

            <label className="grid gap-2 text-xs">
              <span className="text-fg-3">운영 상태</span>
              <select
                className="rounded-md border border-line bg-panel px-2 py-2"
                value={planForm.isActive ? "1" : "0"}
                onChange={(event) => setPlanForm((prev) => ({ ...prev, isActive: event.target.value === "1" }))}
              >
                <option value="1">활성</option>
                <option value="0">비활성</option>
              </select>
            </label>

            <button
              type="submit"
              className="mt-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-60"
              disabled={submitting}
            >
              {submitting ? "저장 중..." : planForm.id ? "수정" : "생성"}
            </button>
          </form>

          <p className="mt-2 text-xs text-fg-3">가격 입력은 cents(원 단위 곱하기 100) 기준으로 저장됩니다.</p>
        </div>

        <div className="rounded-xl border border-line bg-card p-4">
          <h2 className="mb-4 text-xl font-semibold">플랜 목록</h2>
          <div className="max-h-[30rem] space-y-2 overflow-y-auto pr-1">
            {plans.length === 0 ? (
              <p className="text-sm text-fg-3">등록된 플랜이 없습니다.</p>
            ) : (
              plans.map((plan) => (
                <button
                  key={plan.id}
                  type="button"
                  className="w-full rounded-lg border border-line bg-panel p-3 text-left hover:border-accent/60"
                  onClick={() => startEdit(plan)}
                >
                  <p className="font-medium">{plan.name}</p>
                  <p className="text-xs text-fg-3">{plan.code} · {plan.intervalDays}일 · {(plan.priceCents / 100).toLocaleString()}원</p>
                  <p className="text-[0.75rem] text-fg-3">
                    상태: {plan.isActive ? "활성" : "비활성"} / 혜택: {plan.perks.slice(0, 3).join(", ")}
                  </p>
                </button>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-line bg-card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">캠페인 관리</h2>
          <button
            type="button"
            onClick={startCampaignCreate}
            className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium"
          >
            새 캠페인
          </button>
        </div>

        <form className="mb-6 grid gap-2 lg:grid-cols-2" onSubmit={onSubmitCampaign}>
          <label className="grid gap-1 text-xs">
            <span className="text-fg-3">크리에이터 ID</span>
            <input
              className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
              value={campaignForm.creatorId}
              onChange={(event) => setCampaignForm((prev) => ({ ...prev, creatorId: event.target.value }))}
              placeholder="creator_user_id"
            />
          </label>

          <label className="grid gap-1 text-xs">
            <span className="text-fg-3">제목</span>
            <input
              className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
              value={campaignForm.title}
              onChange={(event) => setCampaignForm((prev) => ({ ...prev, title: event.target.value }))}
              placeholder="캠페인 제목"
            />
          </label>

          <label className="grid gap-1 text-xs lg:col-span-2">
            <span className="text-fg-3">설명</span>
            <textarea
              className="min-h-20 rounded-md border border-line bg-panel px-3 py-2 text-sm"
              value={campaignForm.description}
              onChange={(event) => setCampaignForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </label>

          <label className="grid gap-1 text-xs">
            <span className="text-fg-3">연결 대상 ID (타이틀)</span>
            <input
              className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
              value={campaignForm.titleId}
              onChange={(event) => setCampaignForm((prev) => ({ ...prev, titleId: event.target.value }))}
              placeholder="선택 시 targetId"
            />
          </label>

          <label className="grid gap-1 text-xs">
            <span className="text-fg-3">연결 플랜</span>
            <select
              className="rounded-md border border-line bg-panel px-2 py-2 text-sm"
              value={campaignForm.planId}
              onChange={(event) => setCampaignForm((prev) => ({ ...prev, planId: event.target.value }))}
            >
              <option value="">연결 안 함</option>
              {plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.name} ({plan.code})
                </option>
              ))}
            </select>
          </label>

          <label className="grid gap-1 text-xs">
            <span className="text-fg-3">목표금액(원)</span>
            <input
              type="number"
              min={0}
              className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
              value={campaignForm.targetAmountWon}
              onChange={(event) =>
                setCampaignForm((prev) => ({ ...prev, targetAmountWon: event.target.value }))
              }
            />
          </label>

          <label className="grid gap-1 text-xs">
            <span className="text-fg-3">현재 모금금액(원)</span>
            <input
              type="number"
              min={0}
              className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
              value={campaignForm.raisedAmountWon}
              onChange={(event) =>
                setCampaignForm((prev) => ({ ...prev, raisedAmountWon: event.target.value }))
              }
            />
          </label>

          <label className="grid gap-1 text-xs">
            <span className="text-fg-3">시작 시각</span>
            <input
              type="datetime-local"
              className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
              value={campaignForm.startsAt}
              onChange={(event) => setCampaignForm((prev) => ({ ...prev, startsAt: event.target.value }))}
            />
          </label>

          <label className="grid gap-1 text-xs">
            <span className="text-fg-3">종료 시각</span>
            <input
              type="datetime-local"
              className="rounded-md border border-line bg-panel px-3 py-2 text-sm"
              value={campaignForm.endsAt}
              onChange={(event) => setCampaignForm((prev) => ({ ...prev, endsAt: event.target.value }))}
            />
          </label>

          <label className="grid gap-2 text-xs">
            <span className="text-fg-3">운영 상태</span>
            <select
              className="rounded-md border border-line bg-panel px-2 py-2"
              value={campaignForm.isActive ? "1" : "0"}
              onChange={(event) => setCampaignForm((prev) => ({ ...prev, isActive: event.target.value === "1" }))}
            >
              <option value="1">활성</option>
              <option value="0">비활성</option>
            </select>
          </label>

          <div className="lg:col-span-2 flex items-center gap-2">
            <button
              type="submit"
              className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent disabled:opacity-60"
              disabled={campaignSubmitting}
            >
              {campaignSubmitting ? "저장 중..." : campaignForm.id ? "캠페인 수정" : "캠페인 생성"}
            </button>
            <button
              type="button"
              onClick={startCampaignCreate}
              className="rounded-lg border border-line px-4 py-2 text-sm"
            >
              초기화
            </button>
          </div>
        </form>

        <h3 className="mb-3 text-sm font-semibold">캠페인 목록</h3>
        <div className="max-h-[30rem] space-y-2 overflow-y-auto pr-1">
          {campaigns.length === 0 ? (
            <p className="text-sm text-fg-3">등록된 캠페인이 없습니다.</p>
          ) : (
            campaigns.map((campaign) => (
              <div
                key={campaign.id}
                className="rounded-lg border border-line bg-panel p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{campaign.title}</p>
                    <p className="text-xs text-fg-3">
                      {campaign.creatorName ?? "이름없음"} · {campaign.creatorId}
                    </p>
                    <p className="text-xs text-fg-3">
                      상태: {campaign.isActive ? "활성" : "비활성"} / 플랜: {campaign.planName ?? "미연결"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startCampaignEdit(campaign)}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs"
                    >
                      편집
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteCampaign(campaign.id)}
                      className="rounded-lg border border-bad bg-bad/10 px-3 py-1.5 text-xs text-bad"
                      disabled={campaignSubmitting}
                    >
                      삭제
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-xs text-fg-3">
                  목표 {centsToWon(campaign.targetAmountCents)}원 / 달성 {centsToWon(campaign.raisedAmountCents)}원
                </p>
                <p className="text-xs text-fg-3">
                  기간: {campaign.startsAt ? new Date(campaign.startsAt).toLocaleString("ko-KR") : "-"}
                  {campaign.startsAt || campaign.endsAt ? " ~ " : ""}
                  {campaign.endsAt ? new Date(campaign.endsAt).toLocaleString("ko-KR") : "-"}
                </p>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
