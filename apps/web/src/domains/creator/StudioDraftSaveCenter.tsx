import {
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  Download,
  History,
  Loader2,
  RefreshCw,
  Save,
  ShieldAlert,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  extractStudioDraftSaveError,
  formatStudioDraftSaveInterval,
  formatStudioDraftSaveTime,
  resolveStudioDraftSaveCenter,
  resolveStudioDraftServerRevision,
  resolveStudioDraftServerSavedAt,
  type StudioDraftSaveCenterInput,
  type StudioDraftSaveStatusSection,
  type StudioDraftSaveTone,
} from "./studio-draft-save-center-model";
import {
  clearStudioDraftSaveOutbox,
  createStudioDraftSaveOutboxEntry,
  isStudioDraftSaveOutboxSatisfied,
  readStudioDraftSaveOutbox,
  writeStudioDraftSaveOutbox,
  type StudioDraftSaveOutboxStorage,
} from "./studio-draft-save-outbox";
import { STUDIO_SERVER_AUTOSAVE_IDLE_MS } from "./studio-page-editor-runtime-contracts";
import { useStudioReliabilityStatus } from "./use-studio-reliability-status";

import { cn } from "@/shared/lib/utils";

interface StudioDraftSaveWorkView {
  readonly id?: string;
  readonly revision?: number;
}

interface StudioDraftSaveSharedDocumentView {
  readonly workId?: string;
  readonly revision?: number;
  readonly updatedAt?: string;
}

interface StudioDraftSaveRevisionView {
  readonly revision?: number;
  readonly createdAt?: string;
}

interface StudioDraftSaveLeadershipView {
  readonly role: "leader" | "follower";
  readonly basis: "web-lock" | "promoted-after-handover" | "locks-unavailable";
}

export interface StudioDraftSaveCenterProps {
  readonly saving: boolean;
  readonly workId?: string | null;
  readonly workHydrated?: boolean;
  readonly workHydrationFailed?: boolean;
  readonly pendingSaveIntent?: "draft" | "published" | null;
  readonly loadedWork?: StudioDraftSaveWorkView | null;
  readonly sharedDocument?: StudioDraftSaveSharedDocumentView | null;
  readonly localCheckpointCount?: number;
  readonly serverCurrentRevision?: number;
  readonly serverRevisions?: readonly StudioDraftSaveRevisionView[];
  readonly serverRevisionLoading?: boolean;
  readonly serverRevisionError?: string | null;
  readonly autosaveDocumentLeadership?: StudioDraftSaveLeadershipView | null;
  readonly collaborationOperationSyncPending?: boolean;
  readonly collaborationDocumentLocked?: boolean;
  readonly error?: unknown;
  readonly mobileImmersive?: boolean;
  readonly canvasOnlyMode?: boolean;
  readonly onSaveDraft: () => unknown;
  readonly onContinuePendingSave?: () => unknown;
  readonly onOpenVersions: () => void;
  readonly onExportBackup: () => unknown;
}

const TONE_CLASS: Readonly<Record<StudioDraftSaveTone, string>> = {
  success: "border-accent/35 bg-accent-soft/25 text-accent",
  progress: "border-accent/35 bg-accent-soft/25 text-accent",
  warning: "border-warning/40 bg-warning-soft/25 text-warning",
  danger: "border-danger/40 bg-danger-soft/25 text-danger",
  neutral: "border-line bg-card/95 text-fg-2",
};

function readOnlineStatus(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

function readOutboxStorage(): StudioDraftSaveOutboxStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message.trim().slice(0, 500);
  if (typeof error === "string" && error.trim()) return error.trim().slice(0, 500);
  return "서버 초안 저장 요청을 완료하지 못했습니다.";
}

function safeCount(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function stableWorkId(values: readonly unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function newestRevisionCreatedAt(
  revisions: readonly StudioDraftSaveRevisionView[],
): string | undefined {
  let newest: { timestamp: number; createdAt: string } | null = null;
  for (const revision of revisions) {
    if (!revision.createdAt) continue;
    const timestamp = Date.parse(revision.createdAt);
    if (!Number.isFinite(timestamp) || timestamp <= 0) continue;
    if (newest === null || timestamp > newest.timestamp) {
      newest = { timestamp, createdAt: revision.createdAt };
    }
  }
  return newest?.createdAt;
}

function leadershipBasisLabel(basis: StudioDraftSaveLeadershipView["basis"] | null): string {
  switch (basis) {
    case "web-lock":
      return "문서 잠금으로 조정";
    case "promoted-after-handover":
      return "이전 탭에서 인계";
    case "locks-unavailable":
      return "단독 탭 기준";
    default:
      return "담당 확인 중";
  }
}

function StatusIcon({ tone, className }: { tone: StudioDraftSaveTone; className?: string }) {
  if (tone === "danger") return <ShieldAlert aria-hidden className={className} />;
  if (tone === "warning") return <CloudOff aria-hidden className={className} />;
  if (tone === "progress") {
    return <Loader2 aria-hidden className={cn(className, "animate-spin motion-reduce:animate-none")} />;
  }
  if (tone === "success") return <CheckCircle2 aria-hidden className={className} />;
  return <Save aria-hidden className={className} />;
}

function SaveStatusCard({
  icon,
  label,
  section,
  footer,
}: {
  icon: ReactNode;
  label: string;
  section: StudioDraftSaveStatusSection;
  footer: string;
}) {
  return (
    <section className={cn("rounded-xl border p-3", TONE_CLASS[section.tone])}>
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 shrink-0" aria-hidden>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.08em] opacity-75">{label}</p>
          <p className="mt-0.5 text-sm font-bold leading-snug">{section.title}</p>
          <p className="mt-1 text-xs font-medium leading-relaxed opacity-90">{section.detail}</p>
          <p className="mt-2 text-[0.68rem] font-semibold opacity-80">{footer}</p>
        </div>
      </div>
    </section>
  );
}

export function StudioDraftSaveCenter({
  saving,
  workId = null,
  workHydrated = true,
  workHydrationFailed = false,
  pendingSaveIntent = null,
  loadedWork = null,
  sharedDocument = null,
  localCheckpointCount = 0,
  serverCurrentRevision,
  serverRevisions = [],
  serverRevisionLoading = false,
  serverRevisionError = null,
  autosaveDocumentLeadership = null,
  collaborationOperationSyncPending = false,
  collaborationDocumentLocked = false,
  error = null,
  mobileImmersive = false,
  canvasOnlyMode = false,
  onSaveDraft,
  onContinuePendingSave,
  onOpenVersions,
  onExportBackup,
}: StudioDraftSaveCenterProps) {
  const reliability = useStudioReliabilityStatus();
  const [open, setOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(readOnlineStatus);
  const [deferredSave, setDeferredSave] = useState(false);
  const [deferredSaveQueuedAt, setDeferredSaveQueuedAt] = useState<number | null>(null);
  const [deferredSaveDurable, setDeferredSaveDurable] = useState(false);
  const [outboxWarning, setOutboxWarning] = useState<string | null>(null);
  const [manualSaveError, setManualSaveError] = useState<string | null>(null);
  const [observedServerSaveAt, setObservedServerSaveAt] = useState<number | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const replayInFlightRef = useRef(false);
  const previousSaveRef = useRef<{ saving: boolean; revision: number | null }>({
    saving,
    revision: null,
  });
  const dialogId = useId();
  const checkpointCount = safeCount(localCheckpointCount);
  const outboxWorkId = stableWorkId([workId, loadedWork?.id, sharedDocument?.workId]);

  const serverRevision = resolveStudioDraftServerRevision([
    serverCurrentRevision,
    sharedDocument?.revision,
    loadedWork?.revision,
    ...serverRevisions.map((entry) => entry.revision),
  ]);
  const hasServerDocument = Boolean(outboxWorkId);
  const explicitServerSaveAt = resolveStudioDraftServerSavedAt({
    sharedUpdatedAt: sharedDocument?.updatedAt,
    revisions: [{ createdAt: newestRevisionCreatedAt(serverRevisions) }],
  });
  const lastServerSaveAt = resolveStudioDraftServerSavedAt({
    sharedUpdatedAt: explicitServerSaveAt,
    observedAt: observedServerSaveAt,
  });
  const serverSaveError = manualSaveError ?? extractStudioDraftSaveError(error);

  const input = useMemo<StudioDraftSaveCenterInput>(() => ({
    isOnline,
    hydrated: workHydrated,
    hydrationFailed: workHydrationFailed,
    metadataRequired: pendingSaveIntent === "draft",
    saving,
    deferredSave,
    collaborationLocked: collaborationDocumentLocked,
    collaborationSyncPending: collaborationOperationSyncPending,
    localRole: autosaveDocumentLeadership?.role ?? null,
    localBasis: autosaveDocumentLeadership?.basis ?? null,
    localSaveSignal: reliability.save,
    storageSignal: reliability.storage,
    hasServerDocument,
    serverRevision,
    checkpointCount,
    versionCount: serverRevisions.length,
    lastServerSaveAt,
    serverSaveError,
    serverRevisionLoading,
    serverRevisionError,
  }), [
    autosaveDocumentLeadership?.basis,
    autosaveDocumentLeadership?.role,
    checkpointCount,
    collaborationDocumentLocked,
    collaborationOperationSyncPending,
    deferredSave,
    hasServerDocument,
    isOnline,
    lastServerSaveAt,
    pendingSaveIntent,
    reliability.save,
    reliability.storage,
    saving,
    serverRevision,
    serverRevisionError,
    serverRevisionLoading,
    serverRevisions.length,
    serverSaveError,
    workHydrated,
    workHydrationFailed,
  ]);
  const model = useMemo(() => resolveStudioDraftSaveCenter(input), [input]);
  const anchorAtBottom = mobileImmersive || canvasOnlyMode;
  const backupAvailable = workHydrated && !workHydrationFailed;
  const promoteBackup = model.shouldPromoteBackup && backupAvailable;

  const queueDeferredSave = useCallback(() => {
    const queuedAt = Date.now();
    let durable = false;
    if (outboxWorkId) {
      const entry = createStudioDraftSaveOutboxEntry({
        workId: outboxWorkId,
        serverRevision,
        hasServerDocument,
        now: queuedAt,
      });
      durable = entry !== null && writeStudioDraftSaveOutbox({
        storage: readOutboxStorage(),
        entry,
      });
    }
    setDeferredSaveQueuedAt(queuedAt);
    setDeferredSaveDurable(durable);
    setDeferredSave(true);
    setOutboxWarning(durable
      ? null
      : "저장 예약을 새로고침 복구 영역에 기록하지 못했습니다. 이 탭을 유지하고 연결 후 다시 저장해 주세요.");
  }, [hasServerDocument, outboxWorkId, serverRevision]);

  const clearDeferredSave = useCallback((surfaceFailure = false): boolean => {
    const cleared = outboxWorkId === null
      || clearStudioDraftSaveOutbox({ storage: readOutboxStorage(), workId: outboxWorkId });
    if (!cleared && surfaceFailure) {
      setOutboxWarning("서버 저장 예약을 정리하지 못했습니다. 중복 저장은 revision 검증으로 차단되지만 새로고침 전에 상태를 다시 확인해 주세요.");
      return false;
    }
    setDeferredSave(false);
    setDeferredSaveQueuedAt(null);
    setDeferredSaveDurable(false);
    if (cleared) setOutboxWarning(null);
    return cleared;
  }, [outboxWorkId]);

  const invokeSave = useCallback(async (restoreDeferredOnFailure = false): Promise<boolean> => {
    setManualSaveError(null);
    try {
      await Promise.resolve(onSaveDraft());
      return true;
    } catch (cause) {
      if (restoreDeferredOnFailure) queueDeferredSave();
      setManualSaveError(errorMessage(cause));
      setOpen(true);
      return false;
    }
  }, [onSaveDraft, queueDeferredSave]);

  const requestSave = useCallback(() => {
    if (
      collaborationDocumentLocked
      || saving
      || !workHydrated
      || workHydrationFailed
    ) return;
    if (!isOnline) {
      setManualSaveError(null);
      queueDeferredSave();
      setOpen(true);
      return;
    }
    const restoreDeferredOnFailure = deferredSave;
    clearDeferredSave(false);
    void invokeSave(restoreDeferredOnFailure).then((success) => {
      if (success) clearDeferredSave(true);
    });
  }, [
    clearDeferredSave,
    collaborationDocumentLocked,
    deferredSave,
    invokeSave,
    isOnline,
    queueDeferredSave,
    saving,
    workHydrated,
    workHydrationFailed,
  ]);

  const handlePrimaryAction = useCallback(() => {
    if (model.saveActionDisabled) return;
    if (model.primaryAction === "versions") {
      setOpen(false);
      onOpenVersions();
      return;
    }
    if (model.primaryAction === "metadata") {
      if (!onContinuePendingSave) {
        requestSave();
        return;
      }
      setManualSaveError(null);
      setOpen(false);
      try {
        void Promise.resolve(onContinuePendingSave()).catch((cause: unknown) => {
          setManualSaveError(errorMessage(cause));
          setOpen(true);
        });
      } catch (cause) {
        setManualSaveError(errorMessage(cause));
        setOpen(true);
      }
      return;
    }
    requestSave();
  }, [model.primaryAction, model.saveActionDisabled, onContinuePendingSave, onOpenVersions, requestSave]);

  const cancelDeferredSave = useCallback(() => {
    if (!clearDeferredSave(true)) return;
    setOpen(true);
  }, [clearDeferredSave]);

  useEffect(() => {
    if (!outboxWorkId) return;
    const entry = readStudioDraftSaveOutbox({
      storage: readOutboxStorage(),
      workId: outboxWorkId,
    });
    if (!entry) {
      setDeferredSave(false);
      setDeferredSaveQueuedAt(null);
      setDeferredSaveDurable(false);
      return;
    }
    if (isStudioDraftSaveOutboxSatisfied(entry, serverRevision)) {
      clearStudioDraftSaveOutbox({ storage: readOutboxStorage(), workId: outboxWorkId });
      setDeferredSave(false);
      setDeferredSaveQueuedAt(null);
      setDeferredSaveDurable(false);
      return;
    }
    setDeferredSaveQueuedAt(entry.queuedAt);
    setDeferredSaveDurable(true);
    setDeferredSave(true);
  }, [outboxWorkId, serverRevision]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (
      !deferredSave
      || !isOnline
      || saving
      || replayInFlightRef.current
      || autosaveDocumentLeadership?.role === "follower"
      || collaborationDocumentLocked
      || collaborationOperationSyncPending
      || !workHydrated
      || workHydrationFailed
      || pendingSaveIntent === "draft"
      || serverSaveError !== null
    ) return;
    replayInFlightRef.current = true;
    clearDeferredSave(false);
    void invokeSave(true).then((success) => {
      if (success) clearDeferredSave(true);
    }).finally(() => {
      replayInFlightRef.current = false;
    });
  }, [
    autosaveDocumentLeadership?.role,
    clearDeferredSave,
    collaborationDocumentLocked,
    collaborationOperationSyncPending,
    deferredSave,
    invokeSave,
    isOnline,
    pendingSaveIntent,
    saving,
    serverSaveError,
    workHydrated,
    workHydrationFailed,
  ]);

  useEffect(() => {
    if (explicitServerSaveAt === null) return;
    setObservedServerSaveAt((current) => current === null
      ? explicitServerSaveAt
      : Math.max(current, explicitServerSaveAt));
  }, [explicitServerSaveAt]);

  useEffect(() => {
    const previous = previousSaveRef.current;
    const revisionAdvanced = serverRevision !== null
      && (previous.revision === null || serverRevision > previous.revision);
    if (previous.saving && !saving && revisionAdvanced) {
      setObservedServerSaveAt(Date.now());
      setManualSaveError(null);
      clearDeferredSave(false);
    }
    previousSaveRef.current = { saving, revision: serverRevision };
  }, [clearDeferredSave, saving, serverRevision]);

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

  const closeAndRestoreFocus = () => {
    setOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  return (
    <div
      data-studio-draft-save-center
      data-studio-draft-save-phase={model.phase}
      className={cn(
        "pointer-events-auto fixed right-[max(0.75rem,env(safe-area-inset-right))] z-[58]",
        anchorAtBottom
          ? "bottom-[calc(6.25rem+env(safe-area-inset-bottom))]"
          : "top-[calc(5.25rem+env(safe-area-inset-top))]",
      )}
    >
      <span className="sr-only" role="status" aria-live="polite">{model.ariaLiveMessage}</span>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        aria-label={`저장 상태: ${model.compactLabel}`}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "flex min-h-10 max-w-[min(17rem,calc(100vw-1.5rem))] items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold shadow-lg backdrop-blur-xl transition",
          "hover:-translate-y-0.5 hover:shadow-xl motion-reduce:hover:translate-y-0",
          "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
          TONE_CLASS[model.tone],
        )}
      >
        <StatusIcon tone={model.tone} className="h-4 w-4 shrink-0" />
        <span className="truncate">{model.compactLabel}</span>
        <span className="rounded-full border border-current/20 px-1.5 py-0.5 text-[0.62rem] opacity-80">
          {isOnline ? "온라인" : "오프라인"}
        </span>
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
            "absolute right-0 w-[min(26rem,calc(100vw-1rem))] max-h-[min(76dvh,46rem)] overflow-y-auto overscroll-contain rounded-2xl border border-line bg-panel/95 p-4 text-fg shadow-2xl backdrop-blur-xl [scrollbar-gutter:stable]",
            anchorAtBottom ? "bottom-full mb-2" : "top-full mt-2",
          )}
        >
          <div className="flex items-start gap-3">
            <div className={cn("mt-0.5 rounded-xl border p-2", TONE_CLASS[model.tone])}>
              <StatusIcon tone={model.tone} className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 id={`${dialogId}-title`} className="text-base font-black">초안 저장 센터</h2>
              <p className="mt-0.5 text-sm font-bold leading-snug">{model.headline}</p>
              <p id={`${dialogId}-description`} className="mt-1 text-xs leading-relaxed text-fg-3">
                {model.detail}
              </p>
            </div>
            <button
              type="button"
              onClick={closeAndRestoreFocus}
              aria-label="초안 저장 센터 닫기"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div className="mt-3 rounded-xl border border-line bg-card/70 px-3 py-2.5 text-xs text-fg-2">
            <p className="font-bold text-fg">2단계 자동 보호</p>
            <p className="mt-1 leading-relaxed">
              기기 복구 체크포인트와 서버 revision은 별개입니다. 편집이 멈춘 뒤 약 {formatStudioDraftSaveInterval(STUDIO_SERVER_AUTOSAVE_IDLE_MS)}가 지나면 서버 자동 저장도 시도합니다.
            </p>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <SaveStatusCard
              label="이 기기"
              section={model.device}
              icon={<Database className="h-4 w-4" />}
              footer={leadershipBasisLabel(autosaveDocumentLeadership?.basis ?? null)}
            />
            <SaveStatusCard
              label="서버 초안"
              section={model.server}
              icon={saving
                ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                : <Cloud className="h-4 w-4" />}
              footer={serverRevision === null ? "revision 없음" : `현재 revision #${serverRevision}`}
            />
          </div>

          <dl className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
            <div className="rounded-xl border border-line bg-card/70 px-2 py-2.5">
              <dt className="text-[0.64rem] font-bold uppercase tracking-wide text-fg-3">기기 체크포인트</dt>
              <dd className="mt-1 text-sm font-black">{checkpointCount}개</dd>
            </div>
            <div className="rounded-xl border border-line bg-card/70 px-2 py-2.5">
              <dt className="text-[0.64rem] font-bold uppercase tracking-wide text-fg-3">서버 revision</dt>
              <dd className="mt-1 text-sm font-black">{serverRevision ?? "—"}</dd>
            </div>
            <div className="rounded-xl border border-line bg-card/70 px-2 py-2.5">
              <dt className="text-[0.64rem] font-bold uppercase tracking-wide text-fg-3">서버 버전</dt>
              <dd className="mt-1 flex items-center justify-center gap-1 text-sm font-black">
                {serverRevisionLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-label="버전 기록 불러오는 중" />
                ) : `${serverRevisions.length}개`}
              </dd>
            </div>
            <div className="rounded-xl border border-line bg-card/70 px-2 py-2.5">
              <dt className="text-[0.64rem] font-bold uppercase tracking-wide text-fg-3">마지막 서버 확인</dt>
              <dd className="mt-1 text-xs font-black">
                {lastServerSaveAt === null ? "—" : formatStudioDraftSaveTime(lastServerSaveAt)}
              </dd>
            </div>
          </dl>

          {deferredSave ? (
            <div className="mt-3 rounded-xl border border-warning/40 bg-warning-soft/20 p-3 text-xs text-warning">
              <p className="font-bold">서버 저장 예약 보존 중</p>
              <p className="mt-1 leading-relaxed">
                {deferredSaveDurable
                  ? "원고 본문을 복제하지 않고 저장 의도만 이 탭의 세션 저장소에 기록했습니다. 새로고침 후에도 복구합니다."
                  : "현재 탭 메모리에만 예약되어 있습니다. 새로고침하거나 탭을 닫기 전에 연결 후 저장해 주세요."}
                {deferredSaveQueuedAt === null ? "" : ` · 예약 ${formatStudioDraftSaveTime(deferredSaveQueuedAt)}`}
              </p>
              <button
                type="button"
                onClick={cancelDeferredSave}
                className="mt-2 min-h-9 rounded-lg border border-current/30 px-2.5 py-1.5 font-bold hover:bg-warning-soft/30 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
              >
                저장 예약 취소
              </button>
            </div>
          ) : null}

          {outboxWarning ? (
            <p role="status" className="mt-3 rounded-xl border border-warning/40 bg-warning-soft/25 p-2.5 text-xs font-semibold leading-relaxed text-warning">
              {outboxWarning}
            </p>
          ) : null}

          {serverRevisionError ? (
            <p role="status" className="mt-3 rounded-xl border border-warning/40 bg-warning-soft/25 p-2.5 text-xs font-semibold leading-relaxed text-warning">
              서버 버전 기록을 불러오지 못했습니다. 현재 편집 내용은 그대로 두고 체크포인트 패널에서 다시 시도할 수 있습니다.
            </p>
          ) : null}

          <div className="mt-3 grid gap-2">
            <button
              type="button"
              onClick={handlePrimaryAction}
              disabled={model.saveActionDisabled}
              className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-accent px-3 py-2.5 text-sm font-black text-accent-foreground shadow-sm hover:brightness-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {model.primaryAction === "versions" ? (
                <History className="h-4 w-4" aria-hidden />
              ) : saving || model.phase === "loading" ? (
                <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
              ) : serverSaveError ? (
                <RefreshCw className="h-4 w-4" aria-hidden />
              ) : (
                <Save className="h-4 w-4" aria-hidden />
              )}
              {model.saveActionLabel}
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  onOpenVersions();
                }}
                disabled={!model.canOpenVersions}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-3 py-2 text-xs font-bold hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45"
              >
                <History className="h-4 w-4" aria-hidden />
                버전·체크포인트
              </button>
              <button
                type="button"
                onClick={() => void Promise.resolve(onExportBackup())}
                disabled={!backupAvailable}
                className={cn(
                  "flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-45",
                  promoteBackup
                    ? "border-warning/45 bg-warning-soft/20 text-warning hover:bg-warning-soft/30"
                    : "border-line bg-card hover:bg-raised",
                )}
              >
                <Download className="h-4 w-4" aria-hidden />
                {backupAvailable ? "프로젝트 백업" : "원고 로드 후 백업"}
              </button>
            </div>
          </div>

          <p className="mt-3 text-[0.68rem] leading-relaxed text-fg-3">
            오프라인 저장 예약은 현재 문서의 이 탭에서만 실행되며 새로고침 후에도 복구됩니다. 탭을 닫아 예약이 사라져도 원고 내용은 기존 기기 복구 저장소에 남습니다. 충돌 시에는 자동 덮어쓰기 대신 버전 비교·복원 흐름을 사용합니다.
          </p>
        </div>
      ) : null}
    </div>
  );
}
