import { AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  requestServiceCapabilityRefresh,
  useServiceCapabilityState,
} from "@/platform/service-capability-state";

import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const CAPABILITY_LABELS = {
  communityRead: "커뮤니티 조회",
  communityWrite: "커뮤니티 작성",
  marketplaceRead: "마켓 리소스",
  studioProjectRead: "서버 프로젝트 불러오기",
  studioCloudSave: "클라우드 저장",
  realtimeCollaboration: "실시간 협업",
  publishing: "게시",
  serverAi: "서버 AI",
} as const;

function unavailableLabels(
  capabilities: Record<string, string> | undefined,
): string[] {
  if (!capabilities) return [];
  return Object.entries(CAPABILITY_LABELS)
    .filter(([key]) => capabilities[key] === "unavailable")
    .map(([, label]) => label);
}
export function ServiceDegradedBanner({ immersive = false }: { immersive?: boolean }) {
  const state = useServiceCapabilityState();
  const [recoveryVisible, setRecoveryVisible] = useState(false);

  useEffect(() => {
    if (!state.recoveredAt) return;
    setRecoveryVisible(true);
    const remaining = Math.max(0, 8_000 - (Date.now() - state.recoveredAt));
    const timer = globalThis.setTimeout(() => setRecoveryVisible(false), remaining);
    return () => globalThis.clearTimeout(timer);
  }, [state.recoveredAt]);

  const unavailable = useMemo(
    () => unavailableLabels(state.report?.capabilities),
    [state.report?.capabilities],
  );
  if (state.status !== "degraded" && !recoveryVisible) return null;

  const recovered = state.status === "available" && recoveryVisible;
  const detail = unavailable.length > 0
    ? `${unavailable.slice(0, 4).join(" · ")}${unavailable.length > 4 ? ` 외 ${unavailable.length - 4}개` : ""}`
    : "커뮤니티·클라우드 저장·협업·게시 등 일부 온라인 기능";

  return (
    <aside
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-service-degraded-banner={recovered ? "recovered" : "degraded"}
      className={cn(
        "border-y px-3 py-2.5 text-sm shadow-sm",
        recovered
          ? "border-good/35 bg-good/10 text-good"
          : "border-warn/40 bg-warn/10 text-fg",
        immersive
          && "fixed left-1/2 top-[calc(0.75rem+env(safe-area-inset-top))] z-[90] w-[min(46rem,calc(100vw-1rem))] -translate-x-1/2 rounded-2xl border",
      )}
    >
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-3 gap-y-2">
        {recovered
          ? <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          : <AlertTriangle className="size-5 shrink-0 text-warn" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {recovered
              ? "온라인 기능이 복구되었습니다."
              : "일부 온라인 기능을 잠시 사용할 수 없습니다."}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-2">
            {recovered
              ? "대기 중인 저장과 동기화를 순서대로 다시 확인합니다."
              : `${detail}이 제한됩니다. 탐색과 로컬 편집은 계속 사용할 수 있습니다.`}
          </p>
        </div>
        {!recovered ? (
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={requestServiceCapabilityRefresh}
              disabled={state.checking}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-warn/40 px-3 text-xs font-bold disabled:opacity-50"
            >
              <RefreshCw
                className={cn("size-3.5", state.checking && "animate-spin")}
                aria-hidden="true"
              />
              {state.checking ? "확인 중" : "다시 확인"}
            </button>
            <Link
              href="/status"
              className="inline-flex min-h-11 items-center rounded-xl bg-fg px-3 text-xs font-bold text-canvas"
            >
              상태 자세히
            </Link>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

export default ServiceDegradedBanner;
