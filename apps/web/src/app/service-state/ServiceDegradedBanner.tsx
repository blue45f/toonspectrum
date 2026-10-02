import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, LoaderCircle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  requestServiceCapabilityRefresh,
  useServiceCapabilityState,
} from "@/platform/service-capability-state";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useOverlayClearance } from "@/shared/lib/overlay-clearance";
import { cn } from "@/shared/lib/utils";
import Link from "@/shared/navigation/router-link";

const COPY_SCOPE = "ServiceDegradedBanner";

/** 서버가 보고한 기능 키 → 사용자에게 보이는 이름(한국어·영어). */
const CAPABILITY_LABELS = {
  authSession: ["로그인·세션", "Sign-in & sessions"],
  communityRead: ["커뮤니티 조회", "Community browsing"],
  communityWrite: ["커뮤니티 작성", "Community posting"],
  marketplaceRead: ["마켓 리소스", "Market resources"],
  studioProjectRead: ["서버 프로젝트 불러오기", "Loading server projects"],
  studioCloudSave: ["클라우드 저장", "Cloud save"],
  realtimeCollaboration: ["실시간 협업", "Real-time collaboration"],
  publishing: ["게시", "Publishing"],
  serverAi: ["서버 AI", "Server AI"],
} as const satisfies Record<string, readonly [string, string]>;

const DETAIL_LIMIT = 4;

type CapabilityLabel = (typeof CAPABILITY_LABELS)[keyof typeof CAPABILITY_LABELS];

function unavailableLabels(
  capabilities: Record<string, string> | undefined,
): CapabilityLabel[] {
  if (!capabilities) return [];
  return Object.entries(CAPABILITY_LABELS)
    .filter(([key]) => capabilities[key] === "unavailable" || capabilities[key] === "degraded")
    .map(([, label]) => label);
}

export function ServiceDegradedBanner({ immersive = false }: { immersive?: boolean }) {
  const state = useServiceCapabilityState();
  const bt = useBilingual(COPY_SCOPE);
  const [recoveryVisible, setRecoveryVisible] = useState(false);
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  // 몰입형은 모든 폭에서 한 줄로 접고, 일반 화면은 휴대폰 폭(<640px)에서만 설명을 접는다.
  const collapsed = !detailsExpanded;
  const compact = immersive && collapsed;
  const bannerRef = useRef<HTMLElement>(null);
  const visible = state.status === "degraded" || recoveryVisible;

  // 실제 알림 높이를 공유해 OST·베타 안내가 경고·재시도 버튼을 가리거나 그 아래 숨지 않게 한다.
  useOverlayClearance(bannerRef, visible && immersive, compact);

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
  if (state.warmingUp === true && state.status === "degraded") return <ServiceWarmupNotice />;

  const recovered = state.status === "available" && recoveryVisible;
  const hiddenCount = Math.max(0, unavailable.length - DETAIL_LIMIT);
  const detail = unavailable.length > 0
    ? bt(
      `${unavailable.slice(0, DETAIL_LIMIT).map(([ko]) => ko).join(" · ")}${hiddenCount ? ` 외 ${hiddenCount}개` : ""}`,
      `${unavailable.slice(0, DETAIL_LIMIT).map(([, en]) => en).join(" · ")}${hiddenCount ? ` and ${hiddenCount} more` : ""}`,
    )
    : null;
  const title = recovered
    ? bt("온라인 기능이 복구되었습니다.", "Online features are back.")
    : detail
      ? bt("일부 온라인 기능을 잠시 사용할 수 없습니다.", "Some online features are temporarily unavailable.")
      : bt("온라인 연결 상태를 다시 확인하고 있습니다.", "Rechecking the online connection.");
  const description = recovered
    ? bt("대기 중인 저장과 동기화를 순서대로 다시 확인합니다.", "Pending saves and sync are being rechecked in order.")
    : detail
      ? bt(
        `${detail}이 제한됩니다. 탐색과 로컬 편집은 계속 사용할 수 있습니다.`,
        `${detail} are limited. Browsing and local editing keep working.`,
      )
      : bt(
        "일부 온라인 요청의 응답을 확인하지 못했습니다. 서비스 전체 장애로 확인된 것은 아니며, 탐색과 로컬 편집은 계속 사용할 수 있습니다.",
        "Some online requests did not respond. This is not a confirmed full outage, and browsing and local editing keep working.",
      );

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
          && "fixed left-1/2 bottom-[calc(max(5.5rem,var(--immersive-dock-clearance,0px))+env(safe-area-inset-bottom))] z-[90] w-[min(46rem,calc(100vw-1rem))] -translate-x-1/2 rounded-2xl border max-sm:bg-panel",
      )}
    >
      <div className={cn("mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-3 gap-y-2",
        immersive && "max-sm:grid max-sm:grid-cols-[auto_minmax(0,1fr)] max-sm:items-start") }>
        {recovered
          ? <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          : <AlertTriangle className="size-5 shrink-0 text-warn" aria-hidden="true" />}
        <div className="min-w-0 flex-1 break-keep">
          <p className="font-bold">{title}</p>
          <p hidden={compact} className={cn("mt-0.5 text-xs leading-relaxed text-fg-2", !immersive && collapsed && "max-sm:hidden")}>{description}</p>
        </div>
        <button
          type="button"
          aria-label={collapsed
            ? bt("서비스 상태 알림 펼치기", "Expand the service status notice")
            : bt("서비스 상태 알림 접기", "Collapse the service status notice")}
          aria-expanded={!collapsed}
          onClick={() => setDetailsExpanded((expanded) => !expanded)}
          className={cn("grid size-11 shrink-0 place-items-center rounded-xl border border-current/20", !immersive && "sm:hidden")}
        >
          {collapsed ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
        {!recovered ? (
          <div className={cn("ml-auto flex shrink-0 items-center gap-2 max-sm:ml-0 max-sm:grid max-sm:w-full max-sm:grid-cols-2",
            immersive && "max-sm:col-span-2") }>
            <button
              type="button"
              onClick={requestServiceCapabilityRefresh}
              disabled={state.checking}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-warn/40 px-3 text-xs font-bold disabled:opacity-50 max-sm:justify-center"
            >
              <RefreshCw
                className={cn("size-3.5", state.checking && "animate-spin motion-reduce:animate-none")}
                aria-hidden="true"
              />
              {state.checking ? bt("확인 중", "Checking") : bt("다시 확인", "Check again")}
            </button>
            <Link
              href="/status"
              className="inline-flex min-h-11 items-center rounded-xl bg-fg px-3 text-xs font-bold text-canvas max-sm:justify-center"
            >
              {bt("상태 자세히", "Status details")}
            </Link>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/**
 * 알림 열(왼쪽 아래)의 맨 아래 칸. 넓은 화면은 왼쪽 아래 모서리에, 휴대폰은 하단 탭 위 기준선에 놓고
 * 오른쪽 조작 열(⚙·음성 안내·맨 위로)을 비켜 폭을 줄인다.
 * 위에 쌓이는 OST·베타 안내는 이 칩이 게시한 높이(useOverlayClearance)만큼 올라가 서로 가리지 않는다.
 */
const WARMUP_CHIP_CLASS = cn(
  "pointer-events-none fixed left-4 z-[90] flex w-max items-center gap-2.5 border border-line bg-panel/95 text-sm text-fg-2 shadow-lg backdrop-blur-md",
  "bottom-[calc(max(1rem,var(--immersive-dock-clearance,0px))+env(safe-area-inset-bottom))] max-w-[min(24rem,calc(100vw-2rem))] rounded-2xl px-4 py-2",
  "max-md:bottom-[max(var(--site-float-base),calc(var(--immersive-dock-clearance,0px)+env(safe-area-inset-bottom)))] max-md:left-3 max-md:max-w-[calc(100vw-0.75rem-max(0.75rem,var(--site-float-column)))] max-md:rounded-[1.25rem] max-md:px-3",
);

/**
 * 무료 서버가 절전에서 깨어나는 동안(최대 약 1분) 보이는 조용한 안내.
 * 전체 장애 경고처럼 화면을 밀어내지 않고, 자동 재확인이 끝나면 저절로 사라진다.
 * 휴대폰에서는 한 줄 칩으로 줄여 오른쪽 조작 열·하단 탭 라벨과 겹치지 않는다.
 */
function ServiceWarmupNotice() {
  const bt = useBilingual(COPY_SCOPE);
  const chipRef = useRef<HTMLElement>(null);
  useOverlayClearance(chipRef, true);
  return (
    <aside
      ref={chipRef}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-service-degraded-banner="warming"
      className={WARMUP_CHIP_CLASS}
    >
      <LoaderCircle className="size-4 shrink-0 animate-spin text-accent motion-reduce:animate-none" aria-hidden="true" />
      <span className="min-w-0 break-keep">
        <strong className="font-bold text-fg">{bt("온라인 기능을 연결하는 중이에요.", "Connecting online features.")}</strong>{" "}
        <span className="max-md:sr-only">{bt("탐색과 로컬 작업은 지금 바로 할 수 있어요.", "You can browse and work locally right now.")}</span>
      </span>
    </aside>
  );
}

export default ServiceDegradedBanner;
