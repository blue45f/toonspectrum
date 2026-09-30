import { useState } from "react";
import { Check, MonitorUp, RefreshCw, TriangleAlert, X } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import type { StudioLocalScreenShareError, StudioLocalScreenShareStatus } from "./studio-virtual-space-screen-share";

/** 요청 대상이 되는 대형 스크린 오브젝트. */
export interface StudioShareRequestScreen {
  readonly id: string;
  readonly labelKo: string;
  readonly labelEn: string;
  /** 이미 다른 사람이 공유 중이면 선택할 수 없다. */
  readonly occupied: boolean;
  readonly occupiedByLabel?: string;
}

/** 내가 받은 화면 공유 요청 (수락/거절 대상). */
export interface StudioIncomingShareRequest {
  readonly requesterLabel: string;
  readonly screenLabel: string;
}

/** 현재 진행 중인 화면 공유. */
export interface StudioActiveShare {
  readonly sharerLabel: string;
  readonly screenLabel: string;
  /** 내가 공유 중인 경우 중지 버튼을 보여준다. */
  readonly isSelf: boolean;
}

/** 거절 알림. */
export interface StudioShareRequestDenial {
  readonly screenLabel: string;
  readonly byLabel: string;
}

/** 화면 공유 실패 알림: 무엇이 문제인지 + 어떻게 해결하는지 함께 보여준다. */
export interface StudioShareRequestError {
  readonly code: StudioLocalScreenShareError;
  /** 에러가 발생한 스크린 라벨 (선택). */
  readonly screenLabel?: string;
}

export type StudioShareRequestPhase = "idle" | "selecting" | "pending";

export interface StudioVirtualSpaceScreenShareRequestProps {
  readonly screens: readonly StudioShareRequestScreen[];
  /** 요청 플로우 단계 (부모가 소유). */
  readonly phase: StudioShareRequestPhase;
  /** pending 단계에서 요청한 스크린 id. */
  readonly pendingScreenId: string | null;
  /** 내가 받은 요청. null이면 요청 패널을 숨긴다. */
  readonly incomingRequest: StudioIncomingShareRequest | null;
  /** 진행 중인 공유. null이면 배너를 숨긴다. */
  readonly activeShare: StudioActiveShare | null;
  /** 거절 알림. null이면 숨긴다. */
  readonly denial: StudioShareRequestDenial | null;
  /** 화면 공유 실패 알림. null이면 숨긴다. */
  readonly error?: StudioShareRequestError | null;
  /** 기존 로컬 미리보기 상태와 이어 붙이는 브리지 (선택). */
  readonly localPreviewStatus?: StudioLocalScreenShareStatus;
  readonly onOpenSelect: () => void;
  readonly onCancelSelect: () => void;
  readonly onRequest: (screenId: string) => void;
  readonly onCancelRequest: () => void;
  readonly onAcceptIncoming: () => void;
  readonly onDeclineIncoming: () => void;
  readonly onStopShare: () => void;
  readonly onDismissDenial: () => void;
  readonly onRetryError?: () => void;
  readonly onDismissError?: () => void;
}

type Bilingual = (ko: string, en: string) => string;

/** 핵심 액션 1개만 강조하는 기본 버튼. */
const buttonBase = cn(
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
  "bg-sky-600 text-white hover:bg-sky-700",
  "dark:bg-sky-500 dark:hover:bg-sky-600",
  "disabled:cursor-not-allowed disabled:opacity-50",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600",
);

/** idle 단계에서 단 하나만 강조되는 히어로 액션 버튼. */
const heroButton = cn(
  "inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-semibold text-white",
  "bg-gradient-to-r from-sky-500 to-indigo-600 shadow-lg shadow-sky-500/25",
  "hover:from-sky-600 hover:to-indigo-700 hover:shadow-sky-500/40",
  "active:scale-[0.99] transition-all motion-reduce:transition-none motion-reduce:transform-none",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600",
  "dark:from-sky-500 dark:to-indigo-500 dark:hover:from-sky-400 dark:hover:to-indigo-600",
);

/** 2차 액션은 눈에 띄지 않게 격하한다. */
const ghostButton = cn(
  "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
  "border border-neutral-300 text-neutral-700 hover:bg-neutral-100",
  "dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-800",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600",
);

const ERROR_COPY: Record<
  StudioLocalScreenShareError,
  { readonly titleKo: string; readonly titleEn: string; readonly fixKo: string; readonly fixEn: string }
> = {
  unsupported: {
    titleKo: "이 브라우저는 화면 공유를 지원하지 않아요.",
    titleEn: "This browser doesn't support screen sharing.",
    fixKo: "Chrome이나 Edge 최신 버전에서 다시 시도해 보세요.",
    fixEn: "Please try again in the latest Chrome or Edge.",
  },
  denied: {
    titleKo: "화면 공유 권한이 거부됐어요.",
    titleEn: "Screen share permission was denied.",
    fixKo: "주소창 옆 자물쇠 아이콘을 눌러 권한을 허용한 뒤 다시 시도해 보세요.",
    fixEn: "Allow the permission from the lock icon next to the address bar, then try again.",
  },
  failed: {
    titleKo: "화면 공유를 시작하지 못했어요.",
    titleEn: "Couldn't start screen sharing.",
    fixKo: "잠시 후 다시 시도해 보세요. 그래도 안 되면 스크린을 다시 선택해 보세요.",
    fixEn: "Try again in a moment, or re-select the screen.",
  },
};

function ShareErrorNotice({
  bt,
  error,
  onRetryError,
  onDismissError,
}: {
  readonly bt: Bilingual;
  readonly error: StudioShareRequestError;
  readonly onRetryError?: () => void;
  readonly onDismissError?: () => void;
}) {
  const copy = ERROR_COPY[error.code];
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-rose-300 bg-gradient-to-br from-rose-50 to-orange-50 p-3",
        "dark:border-rose-800 dark:from-rose-950 dark:to-orange-950",
        "animate-fade-up motion-reduce:animate-none",
      )}
    >
      <p className="flex items-start gap-2 text-sm font-semibold text-rose-900 dark:text-rose-100">
        <TriangleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
        <span>
          {bt(copy.titleKo, copy.titleEn)}
          {error.screenLabel ? (
            <>
              {" "}
              <span className="font-normal">‘{error.screenLabel}’</span>
            </>
          ) : null}
        </span>
      </p>
      <p className="pl-6 text-xs text-rose-700 dark:text-rose-300">
        {bt("해결 방법: ", "How to fix: ")}
        {bt(copy.fixKo, copy.fixEn)}
      </p>
      <div className="flex gap-2 pl-6">
        {onRetryError ? (
          <button type="button" className={buttonBase} onClick={onRetryError}>
            <RefreshCw size={16} aria-hidden="true" />
            {bt("다시 시도", "Try again")}
          </button>
        ) : null}
        {onDismissError ? (
          <button type="button" className={ghostButton} onClick={onDismissError}>
            {bt("닫기", "Dismiss")}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function ActiveShareBanner({
  bt,
  activeShare,
  onStopShare,
}: {
  readonly bt: Bilingual;
  readonly activeShare: StudioActiveShare;
  readonly onStopShare: () => void;
}) {
  return (
    <div
      role="status"
      aria-label={bt("화면 공유 중", "Screen sharing")}
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-sky-200 bg-sky-50 p-3",
        "dark:border-sky-900 dark:bg-sky-950",
        "sm:flex-row sm:items-center sm:justify-between",
      )}
    >
      <p className="text-sm text-sky-900 dark:text-sky-100">
        <span aria-hidden="true">🖥️ </span>
        <strong>{activeShare.sharerLabel}</strong>
        {bt("님이 ", " is sharing ")}
        <strong>‘{activeShare.screenLabel}’</strong>
        {bt(" 화면을 공유 중이에요.", " screen.")}
      </p>
      {activeShare.isSelf ? (
        <button type="button" className={ghostButton} onClick={onStopShare}>
          {bt("공유 중지", "Stop sharing")}
        </button>
      ) : null}
    </div>
  );
}

function IncomingRequestCard({
  bt,
  incomingRequest,
  onAcceptIncoming,
  onDeclineIncoming,
}: {
  readonly bt: Bilingual;
  readonly incomingRequest: StudioIncomingShareRequest;
  readonly onAcceptIncoming: () => void;
  readonly onDeclineIncoming: () => void;
}) {
  return (
    <div
      role="alertdialog"
      aria-label={bt("화면 공유 요청", "Screen share request")}
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3",
        "dark:border-amber-900 dark:bg-amber-950",
        "animate-fade-up motion-reduce:animate-none",
      )}
    >
      <p className="text-sm text-amber-900 dark:text-amber-100">
        <strong>{incomingRequest.requesterLabel}</strong>
        {bt("님이 ", " requested to share ")}
        <strong>‘{incomingRequest.screenLabel}’</strong>
        {bt(" 화면 공유를 요청했어요.", ".")}
      </p>
      <div className="flex gap-2">
        <button type="button" className={buttonBase} onClick={onAcceptIncoming}>
          <Check size={16} aria-hidden="true" />
          {bt("수락", "Accept")}
        </button>
        <button type="button" className={ghostButton} onClick={onDeclineIncoming}>
          <X size={16} aria-hidden="true" />
          {bt("거절", "Decline")}
        </button>
      </div>
    </div>
  );
}

function DenialCard({
  bt,
  denial,
  onDismissDenial,
}: {
  readonly bt: Bilingual;
  readonly denial: StudioShareRequestDenial;
  readonly onDismissDenial: () => void;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3",
        "dark:border-rose-900 dark:bg-rose-950",
        "sm:flex-row sm:items-center sm:justify-between",
      )}
    >
      <p className="text-sm text-rose-900 dark:text-rose-100">
        <strong>{denial.byLabel}</strong>
        {bt("님이 ", " declined your request for ")}
        <strong>‘{denial.screenLabel}’</strong>
        {bt(" 공유 요청을 거절했어요.", ".")}
      </p>
      <button type="button" className={ghostButton} onClick={onDismissDenial}>
        {bt("닫기", "Dismiss")}
      </button>
    </div>
  );
}

/** idle 단계: 단 하나의 히어로 액션 + 3단계 미니 가이드. */
function IdleHero({
  bt,
  localPreviewStatus,
  onOpenSelect,
}: {
  readonly bt: Bilingual;
  readonly localPreviewStatus?: StudioLocalScreenShareStatus;
  readonly onOpenSelect: () => void;
}) {
  const steps = [
    { ko: "스크린 선택", en: "Pick a screen" },
    { ko: "요청 보내기", en: "Send request" },
    { ko: "상대방 수락", en: "Get approved" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <button type="button" className={heroButton} onClick={onOpenSelect}>
        <MonitorUp size={20} aria-hidden="true" />
        {bt("화면 공유 요청하기", "Request screen share")}
      </button>
      <ol className="flex items-center justify-center gap-1 text-xs text-neutral-500 dark:text-neutral-400" aria-label={bt("요청 순서", "Request steps")}>
        {steps.map((step, index) => (
          <li key={step.en} className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold",
                "bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-200",
              )}
            >
              {index + 1}
            </span>
            <span>{bt(step.ko, step.en)}</span>
            {index < steps.length - 1 ? (
              <span aria-hidden="true" className="mx-1 text-neutral-300 dark:text-neutral-600">→</span>
            ) : null}
          </li>
        ))}
      </ol>
      {localPreviewStatus === "previewing" ? (
        <p className="text-center text-xs text-neutral-500 dark:text-neutral-400">
          {bt("로컬 미리보기가 켜져 있어요.", "Local preview is on.")}
        </p>
      ) : null}
    </div>
  );
}

/** 스크린 목록이 비었을 때의 일러스트 + 다음 행동 가이드. */
function NoScreensEmpty({ bt }: { readonly bt: Bilingual }) {
  return (
    <div className="flex flex-col items-center gap-2 py-4 text-center">
      <svg width="120" height="92" viewBox="0 0 120 92" aria-hidden="true" className="opacity-90">
        <defs>
          <linearGradient id="share-empty-screen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#38bdf8" stopOpacity="0.5" />
            <stop offset="1" stopColor="#818cf8" stopOpacity="0.5" />
          </linearGradient>
        </defs>
        <ellipse cx="60" cy="80" rx="36" ry="6" fill="#38bdf8" opacity="0.15" />
        <rect x="28" y="8" width="64" height="44" rx="8" fill="url(#share-empty-screen)" stroke="#7dd3fc" strokeWidth="2" />
        <rect x="37" y="17" width="46" height="26" rx="5" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeDasharray="5 4" opacity="0.8" />
        <rect x="56" y="52" width="8" height="14" rx="2" fill="#94a3b8" opacity="0.7" />
        <rect x="42" y="66" width="36" height="6" rx="3" fill="#94a3b8" opacity="0.7" />
        <circle cx="88" cy="60" r="11" fill="none" stroke="#818cf8" strokeWidth="2.5" />
        <line x1="96" y1="68" x2="103" y2="75" stroke="#818cf8" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M84 60h8M88 56v8" stroke="#818cf8" strokeWidth="2" strokeLinecap="round" />
      </svg>
      <p className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
        {bt("선택할 수 있는 스크린이 없어요.", "No screens available.")}
      </p>
      <p className="max-w-[260px] text-xs text-neutral-500 dark:text-neutral-400">
        {bt(
          "맵 편집에서 대형 스크린 오브젝트를 추가하면 여기서 선택할 수 있어요.",
          "Add a large screen object in the map editor to pick it here.",
        )}
      </p>
    </div>
  );
}

function ScreenOption({
  bt,
  screen,
  selected,
  onSelect,
}: {
  readonly bt: Bilingual;
  readonly screen: StudioShareRequestScreen;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const label = bt(screen.labelKo, screen.labelEn);
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2.5 text-sm",
        "transition-all motion-reduce:transition-none",
        selected
          ? "border-sky-500 bg-sky-50 shadow-sm shadow-sky-500/20 dark:border-sky-400 dark:bg-sky-950"
          : "border-neutral-200 hover:border-sky-300 hover:bg-sky-50/50 dark:border-neutral-700 dark:hover:border-sky-800 dark:hover:bg-sky-950/40",
        screen.occupied && "cursor-not-allowed opacity-60 hover:border-neutral-200 hover:bg-transparent dark:hover:border-neutral-700 dark:hover:bg-transparent",
      )}
    >
      <input
        type="radio"
        name="share-screen"
        value={screen.id}
        checked={selected}
        disabled={screen.occupied}
        onChange={onSelect}
        className="accent-sky-600"
      />
      <span className="flex-1 text-neutral-800 dark:text-neutral-100">{label}</span>
      {screen.occupied ? (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {bt("사용 중", "In use")}
          {screen.occupiedByLabel ? ` · ${screen.occupiedByLabel}` : ""}
        </span>
      ) : null}
    </label>
  );
}

function ScreenPicker({
  bt,
  screens,
  selectedScreenId,
  onSelect,
  onRequest,
  onCancelSelect,
}: {
  readonly bt: Bilingual;
  readonly screens: readonly StudioShareRequestScreen[];
  readonly selectedScreenId: string | null;
  readonly onSelect: (screenId: string) => void;
  readonly onRequest: () => void;
  readonly onCancelSelect: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 animate-fade-up motion-reduce:animate-none">
      <p className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
        {bt("공유할 대형 스크린을 선택하세요.", "Choose a large screen to share.")}
      </p>
      {screens.length === 0 ? (
        <NoScreensEmpty bt={bt} />
      ) : (
        <div role="radiogroup" aria-label={bt("대형 스크린 목록", "Large screens")} className="flex flex-col gap-1.5">
          {screens.map((screen) => (
            <ScreenOption
              key={screen.id}
              bt={bt}
              screen={screen}
              selected={selectedScreenId === screen.id}
              onSelect={() => onSelect(screen.id)}
            />
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <button type="button" className={buttonBase} disabled={selectedScreenId === null} onClick={onRequest}>
          {bt("요청 보내기", "Send request")}
        </button>
        <button type="button" className={ghostButton} onClick={onCancelSelect}>
          {bt("취소", "Cancel")}
        </button>
      </div>
    </div>
  );
}

function PendingState({
  bt,
  screenLabel,
  onCancelRequest,
}: {
  readonly bt: Bilingual;
  readonly screenLabel: string | null;
  readonly onCancelRequest: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 animate-fade-up motion-reduce:animate-none">
      <p className="text-sm text-neutral-800 dark:text-neutral-100">
        <span
          aria-hidden="true"
          className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500 motion-reduce:animate-none"
        />
        {bt("요청을 보냈어요. 응답을 기다리는 중이에요.", "Request sent. Waiting for a response.")}
        {screenLabel ? (
          <>
            {" "}
            <strong>‘{screenLabel}’</strong>
          </>
        ) : null}
      </p>
      <div>
        <button type="button" className={ghostButton} onClick={onCancelRequest}>
          {bt("요청 취소", "Cancel request")}
        </button>
      </div>
    </div>
  );
}

/**
 * 화면 공유 요청 플로우 UI.
 *
 * "화면 공유 요청하기" → 대형 스크린 선택 → 요청 전송 → 수락/거절 안내,
 * 진행 중인 공유가 있으면 "누가 공유 중인지" 배너를 함께 보여준다.
 * 상태 전이는 부모가 소유하고, 이 컴포넌트는 선택된 스크린 id만 내부에 둔다.
 */
export function StudioVirtualSpaceScreenShareRequest({
  screens,
  phase,
  pendingScreenId,
  incomingRequest,
  activeShare,
  denial,
  error,
  localPreviewStatus,
  onOpenSelect,
  onCancelSelect,
  onRequest,
  onCancelRequest,
  onAcceptIncoming,
  onDeclineIncoming,
  onStopShare,
  onDismissDenial,
  onRetryError,
  onDismissError,
}: StudioVirtualSpaceScreenShareRequestProps) {
  const bt = useBilingual("StudioVirtualSpaceScreenShareRequest");
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null);

  const pendingScreen = screens.find((screen) => screen.id === pendingScreenId) ?? null;

  const handleRequest = () => {
    const target = screens.find((screen) => screen.id === selectedScreenId);
    if (!target || target.occupied) return;
    onRequest(target.id);
  };

  const handleOpenSelect = () => {
    setSelectedScreenId(null);
    onOpenSelect();
  };

  return (
    <div className="flex w-full flex-col gap-3">
      {error ? (
        <ShareErrorNotice bt={bt} error={error} onRetryError={onRetryError} onDismissError={onDismissError} />
      ) : null}

      {activeShare ? (
        <ActiveShareBanner bt={bt} activeShare={activeShare} onStopShare={onStopShare} />
      ) : null}

      {incomingRequest ? (
        <IncomingRequestCard
          bt={bt}
          incomingRequest={incomingRequest}
          onAcceptIncoming={onAcceptIncoming}
          onDeclineIncoming={onDeclineIncoming}
        />
      ) : null}

      {denial ? <DenialCard bt={bt} denial={denial} onDismissDenial={onDismissDenial} /> : null}

      <section
        aria-label={bt("화면 공유 요청", "Request screen share")}
        className={cn(
          "rounded-xl border border-neutral-200 bg-white p-3",
          "dark:border-neutral-800 dark:bg-neutral-900",
        )}
      >
        {phase === "idle" ? (
          <IdleHero bt={bt} localPreviewStatus={localPreviewStatus} onOpenSelect={handleOpenSelect} />
        ) : null}

        {phase === "selecting" ? (
          <ScreenPicker
            bt={bt}
            screens={screens}
            selectedScreenId={selectedScreenId}
            onSelect={setSelectedScreenId}
            onRequest={handleRequest}
            onCancelSelect={onCancelSelect}
          />
        ) : null}

        {phase === "pending" ? (
          <PendingState
            bt={bt}
            screenLabel={pendingScreen ? bt(pendingScreen.labelKo, pendingScreen.labelEn) : null}
            onCancelRequest={onCancelRequest}
          />
        ) : null}
      </section>
    </div>
  );
}
