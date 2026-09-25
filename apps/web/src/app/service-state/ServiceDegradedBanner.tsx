import {
  AlertTriangle,
  CircleCheckBig,
  RefreshCw,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  requestServiceCapabilityRefresh,
  useServiceCapabilityState,
} from "@/platform/service-capability-state";
import Link from "@/shared/navigation/router-link";

const LABELS = {
  communityRead: "커뮤니티 조회",
  communityWrite: "커뮤니티 작성",
  marketplaceRead: "마켓 리소스",
  studioProjectRead: "서버 프로젝트 불러오기",
  studioCloudSave: "클라우드 저장",
  realtimeCollaboration: "실시간 협업",
  publishing: "게시",
  serverAi: "서버 AI",
} as const;

export function ServiceDegradedBanner() {
  const state = useServiceCapabilityState();
  const [showRecovery, setShowRecovery] = useState(false);

  useEffect(() => {
    if (!state.recoveredAt) return;
    setShowRecovery(true);
    const timer = globalThis.setTimeout(() => setShowRecovery(false), 8_000);
    return () => globalThis.clearTimeout(timer);
  }, [state.recoveredAt]);

  if (state.status === "available" && showRecovery) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="border-y border-good/35 bg-good/10 px-4 py-2.5 text-sm text-fg"
      >
        <div className="mx-auto flex w-full max-w-[1320px] items-center gap-2">
          <CircleCheckBig className="size-4 shrink-0 text-good" aria-hidden="true" />
          <span className="font-semibold">온라인 기능이 복구되었습니다.</span>
          <span className="text-fg-2">대기 중인 작업은 각 화면에서 순서대로 다시 확인합니다.</span>
        </div>
      </div>
    );
  }

  if (state.status !== "degraded") return null;

  const unavailable = state.report
    ? Object.entries(state.report.capabilities)
        .filter(([key, value]) => value === "unavailable" && key in LABELS)
        .map(([key]) => LABELS[key as keyof typeof LABELS])
    : [];
  const description = unavailable.length > 0
    ? `${unavailable.slice(0, 4).join(" · ")} 기능이 제한됩니다.`
    : "커뮤니티·클라우드 저장·협업·게시 등 일부 온라인 기능이 제한됩니다.";

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-y border-warn/40 bg-warn/10 px-4 py-3 text-sm text-fg"
      data-service-degraded="true"
    >
      <div className="mx-auto flex w-full max-w-[1320px] flex-wrap items-center gap-x-3 gap-y-2">
        <AlertTriangle className="size-4 shrink-0 text-warn" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">일부 온라인 기능을 잠시 사용할 수 없습니다.</p>
          <p className="mt-0.5 text-xs leading-relaxed text-fg-2">
            {description} 작품 탐색과 로컬 편집은 계속 사용할 수 있습니다.
          </p>
          {state.report?.incidentId ? (
            <p className="mt-0.5 text-[0.68rem] text-fg-3">
              장애 참조: {state.report.incidentId}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={requestServiceCapabilityRefresh}
            disabled={state.checking}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-warn/35 bg-canvas/70 px-3 text-xs font-semibold text-fg disabled:opacity-60"
          >
            <RefreshCw className={`size-3.5 ${state.checking ? "animate-spin" : ""}`} aria-hidden="true" />
            상태 다시 확인
          </button>
          <Link
            href="/status"
            className="inline-flex min-h-11 items-center rounded-xl bg-fg px-3 text-xs font-semibold text-canvas"
          >
            자세히
          </Link>
        </div>
      </div>
    </div>
  );
}

export default ServiceDegradedBanner;
