import { useCallback, useEffect, useState } from "react";
import {
  adminFetch,
  formatNum,
  formatWon,
  type AdminApiError,
  type RevenueEvent,
  type RevenueResponse,
  type RevenueStatus,
} from "./admin-client";
import { AdminNotice, AdminSpinner, Stat, StatGroup, StatusBadge, adminButtonClass } from "./admin-ui";
import { cn } from "@/lib/utils";

const FILTERS: { value: RevenueStatus | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "pending", label: "대기" },
  { value: "approved", label: "승인" },
  { value: "paid", label: "정산완료" },
  { value: "rejected", label: "반려" },
  { value: "revoked", label: "취소" },
];

const shortId = (id: string) => (id.length > 10 ? `${id.slice(0, 8)}…` : id);

export function AdminRevenue({ uid }: { uid: string }) {
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<RevenueStatus | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    adminFetch<RevenueResponse>(`/revenue?days=30&status=${filter}`, uid)
      .then(setData)
      .catch((e: AdminApiError) => setError(e.message));
  }, [uid, filter]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const act = async (event: RevenueEvent, action: { kind: "status"; status: RevenueStatus } | { kind: "settle" }) => {
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
    } catch (e) {
      setError((e as AdminApiError).message);
    } finally {
      setBusyId(null);
    }
  };

  if (error && !data) return <AdminNotice title="정산 내역을 불러오지 못했어요" body={error} />;
  if (!data) return <AdminSpinner />;

  const s = data.summary;

  return (
    <div className="flex flex-col gap-6">
      <StatGroup label="정산 요약 (최근 30일)">
        <Stat label="대기" value={`${formatWon(s.pendingAmount)} · ${formatNum(s.pendingEvents)}건`} />
        <Stat label="승인" value={`${formatWon(s.approvedAmount)} · ${formatNum(s.approvedEvents)}건`} />
        <Stat label="정산완료" value={`${formatWon(s.paidAmount)} · ${formatNum(s.paidEvents)}건`} />
        <Stat label="반려" value={formatNum(s.rejectedEvents)} />
        <Stat label="전체 건수" value={formatNum(s.totalEvents)} />
      </StatGroup>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={cn(
              "rounded-full border px-3 py-1 text-sm font-medium transition-colors",
              filter === f.value ? "border-accent/60 bg-accent-soft text-accent" : "border-line bg-card text-fg-3 hover:text-fg"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-bad">{error}</p>}

      <div className="overflow-x-auto rounded-2xl border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-raised/50 text-left text-xs text-fg-3">
            <tr>
              <th className="px-4 py-2.5 font-medium">이벤트</th>
              <th className="px-4 py-2.5 font-medium">금액</th>
              <th className="px-4 py-2.5 font-medium">상태</th>
              <th className="px-4 py-2.5 font-medium">일시</th>
              <th className="px-4 py-2.5 font-medium">처리</th>
            </tr>
          </thead>
          <tbody>
            {data.events.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-fg-3">
                  해당 상태의 정산 이벤트가 없어요.
                </td>
              </tr>
            )}
            {data.events.map((event) => (
              <tr key={event.id} className="border-t border-line align-top">
                <td className="px-4 py-3">
                  <div className="text-fg-2">{event.kind}</div>
                  <div className="text-xs text-fg-3">
                    {shortId(event.payerId)} → {shortId(event.recipientId)}
                  </div>
                </td>
                <td className="px-4 py-3 numeral text-fg">{formatWon(event.amountCents)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={event.status} />
                </td>
                <td className="px-4 py-3 text-xs text-fg-3">{new Date(event.createdAt).toLocaleDateString("ko-KR")}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {event.status === "pending" && (
                      <>
                        <button className={adminButtonClass("accent")} disabled={busyId === event.id} onClick={() => void act(event, { kind: "status", status: "approved" })}>
                          승인
                        </button>
                        <button className={adminButtonClass("danger")} disabled={busyId === event.id} onClick={() => void act(event, { kind: "status", status: "rejected" })}>
                          반려
                        </button>
                      </>
                    )}
                    {event.status === "approved" && (
                      <>
                        <button className={adminButtonClass("accent")} disabled={busyId === event.id} onClick={() => void act(event, { kind: "settle" })}>
                          정산완료
                        </button>
                        <button className={adminButtonClass("danger")} disabled={busyId === event.id} onClick={() => void act(event, { kind: "status", status: "revoked" })}>
                          취소
                        </button>
                      </>
                    )}
                    {(event.status === "paid" || event.status === "rejected" || event.status === "revoked") && (
                      <span className="text-xs text-fg-3">—</span>
                    )}
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
