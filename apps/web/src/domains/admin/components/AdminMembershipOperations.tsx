import { AlertTriangle, History, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { adminFetch, type AdminApiError } from "./admin-client";
import { AdminNotice, AdminSpinner } from "./admin-ui";
import { adminButtonClass } from "./admin-ui-utils";

type PolicyChange = {
  revision: number | string;
  key: string;
  beforeValue: unknown;
  afterValue: unknown;
  beforeActive: boolean | null;
  afterActive: boolean | null;
  changedBy: string | null;
  changedAt: string;
};

type PendingRecovery = {
  id: string;
  userId: string;
  activity: string;
  sourceRef: string;
  reason: string;
  requestedAmount: number | string;
  reversedAmount: number | string;
  pendingAmount: number | string;
  actorUserId: string | null;
  createdAt: string;
};

export function AdminMembershipOperations({ uid }: { uid: string }) {
  const [history, setHistory] = useState<PolicyChange[] | null>(null);
  const [recoveries, setRecoveries] = useState<PendingRecovery[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [policyHistory, pendingRecoveries] = await Promise.all([
        adminFetch<{ items: PolicyChange[] }>(
          "/membership/operations/policy-history?limit=30",
          uid,
        ),
        adminFetch<{ items: PendingRecovery[] }>(
          "/membership/operations/pending-recoveries?limit=30",
          uid,
        ),
      ]);
      setHistory(policyHistory.items);
      setRecoveries(pendingRecoveries.items);
    } catch (loadError) {
      setError((loadError as AdminApiError).message);
    }
  }, [uid]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!history || !recoveries) {
    if (error) {
      return (
        <AdminNotice
          title="멤버십 운영 이력 오류"
          body={error}
        />
      );
    }
    return <AdminSpinner />;
  }

  return (
    <section className="mt-6 grid gap-4 xl:grid-cols-2">
      <article className="rounded-2xl border border-line bg-panel/55 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 font-semibold text-fg">
              <History size={16} /> 정책 변경 이력
            </h3>
            <p className="mt-1 text-xs leading-5 text-fg-3">
              override의 현재값만 보지 않고 DB가 기록한 before/after revision을 확인합니다.
            </p>
          </div>
          <button
            type="button"
            className={adminButtonClass("ghost")}
            onClick={() => void load()}
          >
            <RefreshCw size={13} /> 새로고침
          </button>
        </div>

        {error ? <p className="mt-3 text-xs text-bad">{error}</p> : null}
        <div className="mt-4 max-h-80 space-y-2 overflow-auto pr-1">
          {history.length === 0 ? (
            <p className="rounded-xl bg-card/45 p-3 text-xs text-fg-3">
              아직 정책 override 변경 이력이 없습니다.
            </p>
          ) : (
            history.map((item) => (
              <div
                key={String(item.revision)}
                className="rounded-xl border border-line bg-card/45 p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <code className="font-semibold text-fg">{item.key}</code>
                  <span className="text-fg-3">rev {String(item.revision)}</span>
                </div>
                <p className="mt-2 break-all font-mono text-[0.68rem] leading-5 text-fg-3">
                  {JSON.stringify(item.beforeValue)} → {JSON.stringify(item.afterValue)}
                </p>
                <p className="mt-1 text-[0.68rem] text-fg-3">
                  {new Date(item.changedAt).toLocaleString("ko-KR")}
                  {item.changedBy ? ` · ${item.changedBy}` : ""}
                </p>
              </div>
            ))
          )}
        </div>
      </article>

      <article className="rounded-2xl border border-line bg-panel/55 p-4">
        <h3 className="flex items-center gap-2 font-semibold text-fg">
          <AlertTriangle size={16} /> 미회수 활동 포인트
        </h3>
        <p className="mt-1 text-xs leading-5 text-fg-3">
          삭제·운영조치 시 잔액 부족으로 즉시 회수하지 못한 포인트입니다.
          이후 Reward Point 지급 시 자동 상계됩니다.
        </p>
        <div className="mt-4 max-h-80 space-y-2 overflow-auto pr-1">
          {recoveries.length === 0 ? (
            <p className="rounded-xl bg-card/45 p-3 text-xs text-good">
              미회수 포인트가 없습니다.
            </p>
          ) : (
            recoveries.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-line bg-card/45 p-3 text-xs"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-fg">{item.userId}</span>
                  <span className="font-black text-warn">
                    {Number(item.pendingAmount).toLocaleString("ko-KR")} P
                  </span>
                </div>
                <p className="mt-1 text-fg-3">
                  {item.activity} · {item.reason}
                </p>
                <p className="mt-1 text-[0.68rem] text-fg-3">
                  요청 {Number(item.requestedAmount).toLocaleString("ko-KR")} P /
                  회수 {Number(item.reversedAmount).toLocaleString("ko-KR")} P ·
                  {new Date(item.createdAt).toLocaleString("ko-KR")}
                </p>
              </div>
            ))
          )}
        </div>
      </article>
    </section>
  );
}
