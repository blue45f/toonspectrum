import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { useCallback, useEffect, useRef, useState } from "react";

import { getAdminRevenueCopy } from "./admin-revenue-copy";
import { AdminCommercePayments } from "./AdminCommercePayments";
import {
  adminFetch,
  formatNum,
  formatWon,
  type AdminApiError,
  type RevenueEvent,
  type RevenueResponse,
  type RevenueStatus,
} from "./admin-client";
import { AdminEmptyState, AdminNotice, AdminSpinner, AdminTableWrap, Stat, StatGroup, StatusBadge } from "./admin-ui";
import { adminButtonClass } from "./admin-ui-utils";

import { useI18n, useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

const shortId = (id: string) => (id.length > 10 ? `${id.slice(0, 8)}…` : id);

export function AdminRevenue({ uid }: { uid: string }) {
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RevenueStatus | "all">("pending");
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set());
  const lang = useI18n((state) => state.lang);
  const copy = getAdminRevenueCopy(lang);
  const t = useT();

  const filters: { value: RevenueStatus | "all"; label: string }[] = [
    { value: "all", label: t("admin.revenue.filterAll") },
    { value: "pending", label: t("admin.revenue.filterPending") },
    { value: "approved", label: t("admin.revenue.filterApproved") },
    { value: "paid", label: t("admin.revenue.filterPaid") },
    { value: "rejected", label: t("admin.revenue.filterRejected") },
    { value: "revoked", label: t("admin.revenue.filterRevoked") },
  ];

  // 상태 배지에도 필터와 같은 지역화 라벨을 쓴다 (G-0: 원시 상태 문자열 노출 금지).
  const statusLabel = (status: RevenueStatus): string =>
    filters.find((option) => option.value === status)?.label ?? status;

  // kind는 서버에서도 닫힌 어휘가 아니다 (웨이브11 감사 실측): admin.schema의
  // kind 컬럼은 CHECK 없는 자유 텍스트이고 normalizeRevenueEvent도 무검증으로 통과시킨다.
  // 저장소 안에서 실제 값을 만드는 곳은 seed의 plan·campaign뿐이고 subscription은
  // 서버 테스트 픽스처에만 있어, 완전한 지역화 맵은 확정할 수 없다. 그래서 확인된
  // 어휘 3개만 사전으로 지역화하고, 나머지는 snake_case 원시 코드를 그대로 노출하지
  // 않도록 사람이 읽는 형태로 보여 준다. 맵을 늘리려면 서버가 kind를 enum으로 닫아야 한다.
  const kindLabel = (kind: string): string => {
    const known: Record<string, string> = {
      plan: t("admin.revenue.kindPlan"),
      campaign: t("admin.revenue.kindCampaign"),
      subscription: t("admin.revenue.kindSubscription"),
    };
    if (known[kind]) return known[kind];
    const humanized = kind
      .split(/[_-]+/)
      .filter(Boolean)
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
    return humanized || kind;
  };

  // 필터 연타 시 이전 조건의 응답이 늦게 도착해 새 화면을 덮지 않게 순서 가드를 둔다
  // (AdminTraffic의 sequence 가드와 같은 패턴).
  const loadSequence = useRef(0);
  const load = useCallback(() => {
    const sequence = ++loadSequence.current;
    setError(null);
    adminFetch<RevenueResponse>(`/revenue?days=30&status=${filter}`, uid)
      .then((response) => {
        if (loadSequence.current === sequence) setData(response);
      })
      .catch((requestError: AdminApiError) => {
        if (loadSequence.current === sequence) setError(requestError.message);
      });
  }, [filter, uid]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  // 액션 도중 필터가 바뀌면, 끝난 액션의 옛 load()가 새 필터 화면을 덮지 않게 한다.
  const filterRef = useRef(filter);
  filterRef.current = filter;

  const act = async (
    event: RevenueEvent,
    action:
      | { kind: "status"; status: RevenueStatus }
      | { kind: "settle" },
  ) => {
    const startFilter = filter;
    // busy는 행별 집합으로 든다 — 단일 문자열이면 다른 행 액션이 먼저 끝날 때
    // 실행 중인 행의 busy가 풀려 중복 제출이 가능해진다.
    setBusyIds((previous) => new Set(previous).add(event.id));
    setError(null);
    try {
      if (action.kind === "settle") {
        await adminFetch(`/revenue/${encodeURIComponent(event.id)}/settle`, uid, {
          method: "POST",
          body: JSON.stringify({ settledAt: new Date().toISOString() }),
        });
      } else {
        await adminFetch(`/revenue/${encodeURIComponent(event.id)}/status`, uid, {
          method: "POST",
          body: JSON.stringify({ status: action.status }),
        });
      }
      if (filterRef.current === startFilter) load();
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    } finally {
      setBusyIds((previous) => {
        const next = new Set(previous);
        next.delete(event.id);
        return next;
      });
    }
  };

  if (error && !data) {
    return (
      <div className="flex flex-col gap-6">
        <AdminCommercePayments uid={uid} />
        <AdminNotice
          title={t("admin.revenue.loadError")}
          body={error}
          onRetry={load}
          retryLabel={t("common.retry.short")}
        />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex flex-col gap-6">
        <AdminCommercePayments uid={uid} />
        <AdminSpinner />
      </div>
    );
  }

  const summary = data.summary;

  return (
    <div className="flex flex-col gap-6">
      <AdminCommercePayments uid={uid} />

      <StatGroup label={t("admin.revenue.summaryTitle")}>
        <Stat
          label={t("admin.revenue.filterPending")}
          value={`${formatWon(summary.pendingAmountCents)} · ${formatNum(summary.pendingEvents)}`}
        />
        <Stat
          label={t("admin.revenue.filterApproved")}
          value={`${formatWon(summary.approvedAmountCents)} · ${formatNum(summary.approvedEvents)}`}
        />
        <Stat
          label={t("admin.revenue.filterPaid")}
          value={`${formatWon(summary.paidAmountCents)} · ${formatNum(summary.paidEvents)}`}
        />
        <Stat
          label={t("admin.revenue.filterRejected")}
          value={`${formatWon(summary.rejectedAmountCents)} · ${formatNum(summary.rejectedEvents)}`}
        />
        <Stat
          label={t("admin.revenue.filterRevoked")}
          value={`${formatWon(summary.revokedAmountCents)} · ${formatNum(summary.revokedEvents)}`}
        />
        <Stat
          label={t("admin.dashboard.userTotal")}
          value={formatNum(summary.totalEvents)}
        />
      </StatGroup>

      <div className="flex flex-wrap items-center gap-2">
        {filters.map((entry) => (
          <button
            key={entry.value}
            type="button"
            onClick={() => setFilter(entry.value)}
            aria-pressed={filter === entry.value}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              filter === entry.value
                ? "border-accent/60 bg-accent-soft text-accent"
                : "border-line bg-card text-fg-3 hover:text-fg",
            )}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {error ? <p role="alert" className="text-xs text-bad">{error}</p> : null}

      {data.events.length === 0 ? (
        <AdminEmptyState title={t("admin.revenue.empty")} />
      ) : (
      <AdminTableWrap>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-raised/50 text-left text-xs text-fg-3">
            <tr>
              <th scope="col" className="px-4 py-2.5 font-medium">{translateCurrentStaticSourceText("domains.admin.components.AdminRevenue", "en", "Event")}</th>
              <th scope="col" className="px-4 py-2.5 font-medium">{translateCurrentStaticSourceText("domains.admin.components.AdminRevenue", "en", "Amount")}</th>
              <th scope="col" className="px-4 py-2.5 font-medium">{translateCurrentStaticSourceText("domains.admin.components.AdminRevenue", "en", "Status")}</th>
              <th scope="col" className="px-4 py-2.5 font-medium">{translateCurrentStaticSourceText("domains.admin.components.AdminRevenue", "en", "Date")}</th>
              <th scope="col" className="px-4 py-2.5 font-medium">{translateCurrentStaticSourceText("domains.admin.components.AdminRevenue", "en", "Action")}</th>
            </tr>
          </thead>
          <tbody>
            {data.events.map((event) => (
              <tr key={event.id} className="border-t border-line align-top">
                <td className="px-4 py-3">
                  <div className="text-fg-2">{kindLabel(event.kind)}</div>
                  <div className="text-xs text-fg-3">
                    {shortId(event.payerId)} → {shortId(event.recipientId)}
                  </div>
                </td>
                <td className="px-4 py-3 numeral text-fg">
                  {formatWon(event.amountCents)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={event.status} label={statusLabel(event.status)} />
                </td>
                <td className="px-4 py-3 text-xs text-fg-3">
                  {new Date(event.createdAt).toLocaleDateString(lang === "ko" ? "ko-KR" : "en-US")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {event.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          className={adminButtonClass("accent")}
                          disabled={busyIds.has(event.id)}
                          onClick={() => void act(event, { kind: "status", status: "approved" })}
                        >
                          {t("admin.revenue.approve")}
                        </button>
                        <button
                          type="button"
                          className={adminButtonClass("danger")}
                          disabled={busyIds.has(event.id)}
                          onClick={() => void act(event, { kind: "status", status: "rejected" })}
                        >
                          {t("admin.revenue.reject")}
                        </button>
                      </>
                    ) : null}
                    {event.status === "approved" ? (
                      <>
                        <button
                          type="button"
                          className={adminButtonClass("accent")}
                          disabled={busyIds.has(event.id)}
                          onClick={() => void act(event, { kind: "status", status: "paid" })}
                        >
                          {copy.markPaid}
                        </button>
                        <button
                          type="button"
                          className={adminButtonClass("danger")}
                          disabled={busyIds.has(event.id)}
                          onClick={() => void act(event, { kind: "status", status: "revoked" })}
                        >
                          {t("admin.revenue.revoke")}
                        </button>
                      </>
                    ) : null}
                    {event.status === "paid" && !event.settledAt ? (
                      <button
                        type="button"
                        className={adminButtonClass("accent")}
                        disabled={busyIds.has(event.id)}
                        onClick={() => void act(event, { kind: "settle" })}
                      >
                        {t("admin.revenue.settle")}
                      </button>
                    ) : null}
                    {(event.status === "rejected" ||
                      event.status === "revoked" ||
                      (event.status === "paid" && event.settledAt)) ? (
                      <span className="text-xs text-fg-3">—</span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </AdminTableWrap>
      )}
    </div>
  );
}
