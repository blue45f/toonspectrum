import {
  ArrowLeftRight,
  CloudOff,
  Database,
  Download,
  History,
  Loader2,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  resolveStudioDraftOperationSyncAssistant,
  type StudioDraftOperationSyncAction,
  type StudioDraftOperationSyncTone,
} from "./studio-draft-operation-sync-assistant-model";
import { useStudioLiveCollaboration } from "./live/studio-live-collaboration-context";
import { formatStudioLiveLastAck } from "./live/studio-live-sync-safety";

import { cn } from "@/shared/lib/utils";

export interface StudioDraftOperationSyncAssistantProps {
  readonly serverRevision: number | null;
  readonly hasServerDocument: boolean;
  readonly localCheckpointCount: number;
  readonly localRole: "leader" | "follower" | null;
  readonly collaborationSyncPending: boolean;
  readonly hydrated: boolean;
  readonly hydrationFailed: boolean;
  readonly saving: boolean;
  readonly mobileImmersive?: boolean;
  readonly canvasOnlyMode?: boolean;
  readonly onOpenVersions: () => void;
  readonly onExportBackup: () => unknown;
}

const TONE_CLASS: Readonly<Record<StudioDraftOperationSyncTone, string>> = {
  success: "border-accent/35 bg-accent-soft/25 text-accent",
  progress: "border-accent/35 bg-accent-soft/25 text-accent",
  warning: "border-warning/40 bg-warning-soft/25 text-warning",
  danger: "border-danger/40 bg-danger-soft/25 text-danger",
  neutral: "border-line bg-card/95 text-fg-2",
};

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500);
  if (typeof error === "string" && error.trim()) return error.trim().slice(0, 500);
  return "동기화 작업을 완료하지 못했습니다.";
}

function safeCount(value: number): number {
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function StatusIcon({ tone, className }: { tone: StudioDraftOperationSyncTone; className?: string }) {
  if (tone === "danger") return <ShieldAlert aria-hidden className={className} />;
  if (tone === "warning") return <CloudOff aria-hidden className={className} />;
  if (tone === "progress") {
    return <Loader2 aria-hidden className={cn(className, "animate-spin motion-reduce:animate-none")} />;
  }
  if (tone === "success") return <ShieldCheck aria-hidden className={className} />;
  return <ArrowLeftRight aria-hidden className={className} />;
}

function SummaryCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <section className="rounded-xl border border-line bg-card/70 p-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0 text-fg-3" aria-hidden>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] text-fg-3">{label}</p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-fg-2">{value}</p>
        </div>
      </div>
    </section>
  );
}

function ActionIcon({ action, busy }: { action: StudioDraftOperationSyncAction; busy: boolean }) {
  if (busy) return <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />;
  if (action === "export-recovery") return <Download className="h-4 w-4" aria-hidden />;
  if (action === "versions") return <History className="h-4 w-4" aria-hidden />;
  return <RefreshCw className="h-4 w-4" aria-hidden />;
}

export function StudioDraftOperationSyncAssistant({
  serverRevision,
  hasServerDocument,
  localCheckpointCount,
  localRole,
  collaborationSyncPending,
  hydrated,
  hydrationFailed,
  saving,
  mobileImmersive = false,
  canvasOnlyMode = false,
  onOpenVersions,
  onExportBackup,
}: StudioDraftOperationSyncAssistantProps) {
  const live = useStudioLiveCollaboration();
  const [open, setOpen] = useState(false);
  const [busyAction, setBusyAction] = useState<StudioDraftOperationSyncAction>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const dialogId = useId();
  const liveContextAvailable = Boolean(
    live.room
    || live.mode
    || live.availability !== "idle"
    || live.sync.operationSyncReady
    || live.sync.pendingCount > 0
  );
  const model = resolveStudioDraftOperationSyncAssistant({
    liveContextAvailable,
    syncPhase: live.sync.phase,
    pendingCount: live.sync.pendingCount,
    persistenceDurability: live.sync.persistenceDurability,
    editsDurablyProtected: live.sync.editsDurablyProtected,
    mode: live.sync.mode,
    collaborationSyncPending,
    recoveryUpdateCount: live.recovery?.updateCount ?? 0,
    recoveryExportAvailable: live.recovery?.exportAvailable ?? false,
    recoveryExported: live.recovery?.exported ?? false,
    localCheckpointCount,
    localRole,
    serverRevision,
    hasServerDocument,
    hydrated,
    hydrationFailed,
    saving,
  });
  const anchorAtBottom = mobileImmersive || canvasOnlyMode;
  const pendingCount = safeCount(live.sync.pendingCount);
  const lastAckLabel = liveContextAvailable
    ? live.sync.mode === "local"
      ? "이 기기 탭 연결"
      : formatStudioLiveLastAck(live.sync.lastAckAt)
    : "실시간 연결 대기";

  const runPrimaryAction = useCallback(async () => {
    if (!model.primaryAction || busyAction) return;
    setActionError(null);
    if (model.primaryAction === "retry") {
      live.retryServer();
      setOpen(true);
      return;
    }
    if (model.primaryAction === "versions") {
      setOpen(false);
      onOpenVersions();
      return;
    }
    setBusyAction("export-recovery");
    try {
      await live.exportRecovery();
      setOpen(true);
    } catch (error) {
      setActionError(errorMessage(error));
      setOpen(true);
    } finally {
      setBusyAction(null);
    }
  }, [busyAction, live, model.primaryAction, onOpenVersions]);

  useEffect(() => {
    if (model.visible) return;
    setOpen(false);
    setActionError(null);
  }, [model.visible]);

  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (dialogRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!model.visible) return null;

  return (
    <div
      data-studio-operation-sync-assistant
      data-studio-operation-sync-phase={live.sync.phase}
      className={cn(
        "pointer-events-auto fixed right-[max(0.75rem,env(safe-area-inset-right))] lg:z-[58]",
        open ? "z-[58]" : "z-[51]",
        anchorAtBottom
          ? "bottom-[calc(9.75rem+env(safe-area-inset-bottom))]"
          : "top-[calc(8.75rem+env(safe-area-inset-top))]",
      )}
    >
      <span
        className="sr-only"
        role={model.tone === "danger" ? "alert" : "status"}
        aria-live={model.tone === "danger" ? "assertive" : "polite"}
      >
        {model.ariaLiveMessage}
      </span>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={`동기화 상태: ${model.compactLabel}`}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex min-h-11 max-w-[min(19rem,calc(100vw-1.5rem))] items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold shadow-lg backdrop-blur-xl transition",
          "hover:-translate-y-0.5 hover:shadow-xl motion-reduce:hover:translate-y-0",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          TONE_CLASS[model.tone],
        )}
      >
        <StatusIcon tone={model.tone} className="h-4 w-4 shrink-0" />
        <span className="truncate">{model.compactLabel}</span>
        {pendingCount > 0 ? (
          <span className="rounded-full border border-current/20 px-1.5 py-0.5 text-[0.62rem] tabular-nums opacity-85">
            {pendingCount.toLocaleString("ko-KR")}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          ref={dialogRef}
          id={dialogId}
          role="dialog"
          aria-modal="false"
          aria-labelledby={`${dialogId}-title`}
          aria-describedby={`${dialogId}-description`}
          className={cn(
            "absolute right-0 w-[min(34rem,calc(100vw-1rem))] max-h-[min(76dvh,48rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-panel/95 p-4 text-fg shadow-2xl backdrop-blur-xl [scrollbar-gutter:stable]",
            anchorAtBottom ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          <div className="flex items-start gap-3">
            <div className={cn("mt-0.5 rounded-xl border p-2", TONE_CLASS[model.tone])}>
              <StatusIcon tone={model.tone} className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id={`${dialogId}-title`} className="text-base font-black">기기·서버 동기화</h2>
              <p className="mt-0.5 text-sm font-bold leading-snug">{model.headline}</p>
              <p id={`${dialogId}-description`} className="mt-1 text-xs leading-relaxed text-fg-3">
                {model.detail}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                triggerRef.current?.focus({ preventScroll: true });
              }}
              aria-label="기기·서버 동기화 닫기"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <SummaryCard
              label="이 기기"
              icon={<Database className="h-4 w-4" />}
              value={model.deviceSummary}
            />
            <SummaryCard
              label="변경 흐름"
              icon={<ArrowLeftRight className="h-4 w-4" />}
              value={model.operationSummary}
            />
            <SummaryCard
              label="서버 원고"
              icon={<ShieldCheck className="h-4 w-4" />}
              value={model.serverSummary}
            />
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-card/70 px-2 py-2.5">
              <dt className="text-[0.64rem] font-bold uppercase tracking-wide text-fg-3">기기 복구 지점</dt>
              <dd className="mt-1 text-sm font-black">{safeCount(localCheckpointCount)}개</dd>
            </div>
            <div className="rounded-xl border border-line bg-card/70 px-2 py-2.5">
              <dt className="text-[0.64rem] font-bold uppercase tracking-wide text-fg-3">서버 반영 대기</dt>
              <dd className="mt-1 text-sm font-black">{pendingCount}개</dd>
            </div>
            <div className="rounded-xl border border-line bg-card/70 px-2 py-2.5">
              <dt className="text-[0.64rem] font-bold uppercase tracking-wide text-fg-3">마지막 서버 승인</dt>
              <dd className="mt-1 text-xs font-black">{lastAckLabel}</dd>
            </div>
            <div className="rounded-xl border border-line bg-card/70 px-2 py-2.5">
              <dt className="text-[0.64rem] font-bold uppercase tracking-wide text-fg-3">서버 원고</dt>
              <dd className="mt-1 text-sm font-black">{serverRevision === null ? "—" : `r${serverRevision}`}</dd>
            </div>
          </dl>

          {model.primaryAction && model.primaryActionLabel ? (
            <button
              type="button"
              onClick={() => void runPrimaryAction()}
              disabled={busyAction !== null}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-black text-accent-foreground shadow-sm hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ActionIcon action={model.primaryAction} busy={busyAction !== null} />
              {busyAction === "export-recovery" ? "복구 파일 만드는 중" : model.primaryActionLabel}
            </button>
          ) : null}

          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                onOpenVersions();
              }}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <History className="h-4 w-4" aria-hidden />
              버전·복구 확인
            </button>
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                try {
                  void Promise.resolve(onExportBackup()).catch((error: unknown) => {
                    setActionError(errorMessage(error));
                    setOpen(true);
                  });
                } catch (error) {
                  setActionError(errorMessage(error));
                  setOpen(true);
                }
              }}
              disabled={!model.canExportBackup}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Download className="h-4 w-4" aria-hidden />
              {model.canExportBackup ? "프로젝트 백업" : "원고 로드 후 백업"}
            </button>
          </div>

          {actionError ? (
            <p role="alert" className="mt-3 rounded-xl border border-danger/40 bg-danger-soft/25 p-2.5 text-xs font-semibold leading-relaxed text-danger">
              {actionError}
            </p>
          ) : null}

          <p className="mt-3 text-[0.68rem] leading-relaxed text-fg-3">
            기기 복구 저장, 변경 단위 서버 승인, 서버 원고 버전은 서로 다른 보호 단계입니다. 연결이 끊겨도 로컬 변경을 먼저 보관하고, 다시 연결되면 순서대로 전송합니다. 충돌이나 권한 문제가 생기면 자동 덮어쓰기 대신 버전·복구 확인 흐름을 사용합니다.
          </p>
        </div>
      ) : null}
    </div>
  );
}
