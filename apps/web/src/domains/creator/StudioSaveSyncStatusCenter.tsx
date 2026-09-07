/**
 * Studio save status: plain-language safety first, implementation diagnostics on demand.
 */

import {
  CheckCircle2,
  Clock,
  Cloud,
  CloudOff,
  Copy,
  Database,
  HardDrive,
  RefreshCw,
  TriangleAlert,
  X,
} from "lucide-react";
import { useState } from "react";

import {
  formatRecoveryDiagnostics,
  resolveSaveSyncStatus,
  type StudioOperationJournalState,
} from "./studio-operation-recovery-coordinator";

export interface StudioSaveSyncStatusCenterProps {
  readonly journal: StudioOperationJournalState;
  readonly isOnline?: boolean;
  readonly isOpfsActive?: boolean;
  readonly onForceCheckpoint?: () => void;
}

function cloudStatusCopy(status: "synced" | "pending" | "offline"): string {
  if (status === "synced") return "최신 상태로 저장됐어요.";
  if (status === "pending") return "최근 변경을 서버에 저장하는 중이에요.";
  return "인터넷이 연결되면 자동으로 서버에 저장해요.";
}

export function StudioSaveSyncStatusCenter({
  journal,
  isOnline = true,
  isOpfsActive = true,
  onForceCheckpoint,
}: StudioSaveSyncStatusCenterProps) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const status = resolveSaveSyncStatus(journal, isOnline, isOpfsActive);
  const saveLabel = !status.localDurable
    ? "저장 확인 필요"
    : status.cloudSyncStatus === "offline"
      ? "오프라인 · 이 기기에 보관 중"
      : status.pendingOperationsCount > 0 || status.cloudSyncStatus === "pending"
        ? `${status.pendingOperationsCount}개 변경 저장 중`
        : "저장됨";

  const handleCopyDiagnostics = () => {
    const report = formatRecoveryDiagnostics(journal, status);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(report).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const StatusIcon = !status.localDurable
    ? TriangleAlert
    : status.cloudSyncStatus === "offline"
      ? CloudOff
      : status.pendingOperationsCount > 0 || status.cloudSyncStatus === "pending"
        ? Clock
        : CheckCircle2;

  const statusTone = !status.localDurable
    ? "text-danger"
    : status.cloudSyncStatus === "offline"
      ? "text-warning"
      : status.pendingOperationsCount > 0 || status.cloudSyncStatus === "pending"
        ? "text-accent"
        : "text-success";

  return (
    <div data-studio-save-sync-status-center className="relative inline-block text-xs">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`저장 상태 열기: ${saveLabel}`}
        className="flex min-h-8 items-center gap-1.5 rounded-full border border-line bg-card/90 px-2.5 py-1 text-[0.75rem] font-medium text-fg shadow-sm backdrop-blur transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent pointer-coarse:min-h-11"
      >
        <StatusIcon className={`size-3.5 ${statusTone}`} aria-hidden />
        <span>{saveLabel}</span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="저장 상태 상세"
          className="absolute right-0 top-full z-50 mt-1.5 w-[min(22rem,calc(100vw-1rem))] rounded-xl border border-line bg-card p-3.5 text-fg shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-line/50 pb-2">
            <div>
              <p className="font-semibold text-fg">저장 상태</p>
              <p className="mt-0.5 text-[0.72rem] text-fg-3">
                내 작업이 어디까지 안전하게 보관됐는지 확인해요.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="저장 상태 닫기"
              className="grid min-h-8 min-w-8 place-items-center rounded-lg text-fg-3 hover:bg-raised hover:text-fg pointer-coarse:min-h-11 pointer-coarse:min-w-11"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <div className="mt-3 space-y-2 text-[0.75rem]">
            <section className="rounded-lg bg-panel/60 p-2.5">
              <div className="flex items-start gap-2">
                <HardDrive className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <div>
                  <p className="font-semibold text-fg">이 기기</p>
                  <p className="mt-0.5 leading-relaxed text-fg-3">
                    {status.localDurable
                      ? "최근 작업을 이 기기에 안전하게 보관하고 있어요."
                      : "이 기기에 복구 가능한 작업을 남기지 못하고 있어요. 이 화면을 닫기 전에 프로젝트를 내보내 주세요."}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-lg bg-panel/60 p-2.5">
              <div className="flex items-start gap-2">
                {status.cloudSyncStatus === "offline" ? (
                  <CloudOff className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                ) : (
                  <Cloud className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                )}
                <div>
                  <p className="font-semibold text-fg">서버</p>
                  <p className="mt-0.5 leading-relaxed text-fg-3">
                    {cloudStatusCopy(status.cloudSyncStatus)}
                    {status.pendingOperationsCount > 0
                      ? ` 아직 보내지 않은 변경 ${status.pendingOperationsCount}개가 있어요.`
                      : ""}
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-lg bg-panel/60 p-2.5">
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
                <div>
                  <p className="font-semibold text-fg">복구</p>
                  <p className="mt-0.5 leading-relaxed text-fg-3">
                    마지막 복구 지점은 {new Date(status.lastCheckpointAt).toLocaleTimeString()}에 만들어졌어요.
                  </p>
                </div>
              </div>
            </section>
          </div>

          <div className="mt-3 flex flex-wrap justify-end gap-2 border-t border-line/50 pt-3">
            {onForceCheckpoint ? (
              <button
                type="button"
                onClick={onForceCheckpoint}
                className="flex min-h-9 items-center gap-1.5 rounded-lg border border-line bg-raised px-2.5 text-[0.72rem] font-semibold text-fg-2 hover:bg-accent-soft hover:text-accent pointer-coarse:min-h-11"
              >
                <RefreshCw className="size-3.5" aria-hidden />
                <span>복구 지점 만들기</span>
              </button>
            ) : null}
          </div>

          <details className="mt-3 rounded-lg border border-line bg-panel/35">
            <summary className="cursor-pointer px-2.5 py-2 text-[0.72rem] font-semibold text-fg-2">
              고급 진단 보기
            </summary>
            <div className="space-y-2 border-t border-line/60 px-2.5 py-2 text-[0.68rem] text-fg-3">
              <p className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-1.5">
                  <Database className="size-3.5" aria-hidden />
                  로컬 저장 방식
                </span>
                <span>{status.localDurable ? "OPFS" : "메모리 전용"}</span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span>최근 작업 번호</span>
                <span className="font-mono">#{journal.lastSequence}</span>
              </p>
              <p className="flex items-center justify-between gap-3">
                <span>복구 지점 이후 변경</span>
                <span>{status.pendingOperationsCount}개</span>
              </p>
              <button
                type="button"
                onClick={handleCopyDiagnostics}
                className="mt-1 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-2.5 font-semibold text-fg-2 hover:bg-raised pointer-coarse:min-h-11"
              >
                <Copy className="size-3.5" aria-hidden />
                <span>{copied ? "진단 정보를 복사했어요" : "진단 정보 복사"}</span>
              </button>
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}
