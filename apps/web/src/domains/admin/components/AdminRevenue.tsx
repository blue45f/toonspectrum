import { useCallback, useEffect, useState } from "react";

import { getAdminRevenueCopy } from "./admin-revenue-copy";
import {
  adminFetch,
  formatNum,
  formatWon,
  type AdminApiError,
  type RevenueEvent,
  type RevenueResponse,
  type RevenueStatus,
} from "./admin-client";
import { AdminNotice, AdminSpinner, Stat, StatGroup, StatusBadge } from "./admin-ui";
import { adminButtonClass } from "./admin-ui-utils";

import { useI18n, useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";

const shortId = (id: string) => (id.length > 10 ? `${id.slice(0, 8)}…` : id);

export function AdminRevenue({ uid }: { uid: string }) {
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RevenueStatus | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
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

  const load = useCallback(() => {
    setError(null);
    adminFetch<RevenueResponse>(`/revenue?days=30&status=${filter}`, uid)
      .then(setData)
      .catch((requestError: AdminApiError) => setError(requestError.message));
  }, [filter, uid]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const act = async (
    event: RevenueEvent,
    action:
      | { kind: "status"; status: RevenueStatus }
      | { kind: "settle" },
  ) => {
    setBusyId(event.id);
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
      load();
    } catch (requestError) {
      setError((requestError as AdminApiError).message);
    } finally {
      setBusyId(null);
    }
  };

  if (error && !data) {
    return <AdminNotice title={t("admin.revenue.loadError")} body={error} />;
  }
  if (!data) return <AdminSpinner />;

  const summary = data.summary;

  return (
    <div className="flex flex-col gap-6">
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

      {error ? <p className="text-xs text-bad">{error}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-raised/50 text-left text-xs text-fg-3">
            <tr>
              <th className="px-4 py-2.5 font-medium">Event</th>
              <th className="px-4 py-2.5 font-medium">Amount</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Date</th>
              <th className="px-4 py-2.5 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {data.events.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-fg-3">
                  {t("admin.revenue.empty")}
                </td>
              </tr>
            ) : null}
            {data.events.map((event) => (
              <tr key={event.id} className="border-t border-line align-top">
                <td className="px-4 py-3">
                  <div className="text-fg-2">{event.kind}</div>
                  <div className="text-xs text-fg-3">
                    {shortId(event.payerId)} → {shortId(event.recipientId)}
                  </div>
                </td>
                <td className="px-4 py-3 numeral text-fg">
                  {formatWon(event.amountCents)}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={event.status} />
                </td>
                <td className="px-4 py-3 text-xs text-fg-3">
                  {new Date(event.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {event.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          className={adminButtonClass("accent")}
                          disabled={busyId === event.id}
                          onClick={() => void act(event, { kind: "status", status: "approved" })}
                        >
                          {t("admin.revenue.approve")}
                        </button>
                        <button
                          type="button"
                          className={adminButtonClass("danger")}
                          disabled={busyId === event.id}
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
                          disabled={busyId === event.id}
                          onClick={() => void act(event, { kind: "status", status: "paid" })}
                        >
                          {copy.markPaid}
                        </button>
                        <button
                          type="button"
                          className={adminButtonClass("danger")}
                          disabled={busyId === event.id}
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
                        disabled={busyId === event.id}
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
      </div>
    </div>
  );
}
