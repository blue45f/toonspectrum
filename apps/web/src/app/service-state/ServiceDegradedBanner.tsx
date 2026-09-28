import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  requestServiceCapabilityRefresh,
  useServiceCapabilityState,
} from "@/platform/service-capability-state";

import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const CAPABILITY_LABELS = {
  authSession: "로그인·세션",
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
    .filter(([key]) => capabilities[key] === "unavailable" || capabilities[key] === "degraded")
    .map(([, label]) => label);
}
export function ServiceDegradedBanner({ immersive = false }: { immersive?: boolean }) {
  const state = useServiceCapabilityState();
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const compact = immersive && !detailsExpanded;
  const bannerRef = useRef<HTMLElement>(null);
  const visible = state.status === "degraded" || recoveryVisible;

  useLayoutEffect(() => {
    const banner = bannerRef.current;
    if (!visible || !immersive || !banner) return;
    // 실제 알림 높이를 공유해 OST가 경고·재시도 버튼을 가리거나 그 아래 숨지 않게 한다.
    const root = banner.ownerDocument.documentElement;
    const property = "--service-status-overlay-clearance";
    const previous = root.style.getPropertyValue(property);
    let published = "";
    const measure = () => {
      const bounds = banner.getBoundingClientRect();
      const fixed = getComputedStyle(banner).position === "fixed" && bounds.height > 0;
      published = `${fixed ? Math.max(0, Math.ceil(window.innerHeight - bounds.top + 12)) : 0}px`;
      root.style.setProperty(property, published);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(banner);
    window.addEventListener("resize", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      if (root.style.getPropertyValue(property) === published) {
        if (previous) root.style.setProperty(property, previous);
        else root.style.removeProperty(property);
      }
    };
  }, [compact, immersive, visible]);

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
  if (!visible) return null;

  const recovered = state.status === "available" && recoveryVisible;
  const detail = unavailable.length > 0
    ? `${unavailable.slice(0, 4).join(" · ")}${unavailable.length > 4 ? ` 외 ${unavailable.length - 4}개` : ""}`
    : null;

  return (
    <aside
      ref={bannerRef}
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
          && "fixed left-1/2 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[70] w-[min(46rem,calc(100vw-1rem))] -translate-x-1/2 rounded-2xl border max-sm:bg-panel",
      )}
    >
      <div className={cn("mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-3 gap-y-2",
        immersive && "max-sm:grid max-sm:grid-cols-[auto_minmax(0,1fr)] max-sm:items-start") }>
        {recovered
          ? <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          : <AlertTriangle className="size-5 shrink-0 text-warn" aria-hidden="true" />}
        <div className="min-w-0 flex-1">
          <p className="font-bold">
            {recovered
              ? "온라인 기능이 복구되었습니다."
              : detail
                ? "일부 온라인 기능을 잠시 사용할 수 없습니다."
                : "온라인 연결 상태를 다시 확인하고 있습니다."}
          </p>
          <p hidden={compact} className="mt-0.5 text-xs leading-relaxed text-fg-2">
            {recovered
              ? "대기 중인 저장과 동기화를 순서대로 다시 확인합니다."
              : detail
                ? `${detail}이 제한됩니다. 탐색과 로컬 편집은 계속 사용할 수 있습니다.`
                : "일부 온라인 요청의 응답을 확인하지 못했습니다. 서비스 전체 장애로 확인된 것은 아니며, 탐색과 로컬 편집은 계속 사용할 수 있습니다."}
          </p>
        </div>
        {immersive ? (
          <button
            type="button"
            aria-label={compact ? "서비스 상태 알림 펼치기" : "서비스 상태 알림 접기"}
            aria-expanded={!compact}
            onClick={() => setDetailsExpanded((expanded) => !expanded)}
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-current/20"
          >
            {compact ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
          </button>
        ) : null}
        {!recovered ? (
          <div className={cn("ml-auto flex shrink-0 items-center gap-2",
            immersive && "max-sm:col-span-2 max-sm:ml-0 max-sm:grid max-sm:grid-cols-2") }>
            <button
              type="button"
              onClick={requestServiceCapabilityRefresh}
              disabled={state.checking}
              className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-warn/40 px-3 text-xs font-bold disabled:opacity-50",
                immersive && "max-sm:justify-center")}
            >
              <RefreshCw
                className={cn("size-3.5", state.checking && "animate-spin motion-reduce:animate-none")}
                aria-hidden="true"
              />
              {state.checking ? "확인 중" : "다시 확인"}
            </button>
            <Link
              href="/status"
              className={cn("inline-flex min-h-11 items-center rounded-xl bg-fg px-3 text-xs font-bold text-canvas",
                immersive && "max-sm:justify-center")}
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
