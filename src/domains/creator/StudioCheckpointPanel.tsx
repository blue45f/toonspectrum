import {
  AlertTriangle,
  BookmarkPlus,
  Cloud,
  HardDrive,
  History,
  RefreshCw,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { STUDIO_CHECKPOINT_LIMIT, type StudioCheckpoint } from "./studio-checkpoints";

export interface StudioServerRevisionSummary {
  revision: number;
  restoredFromRevision: number | null;
  createdAt: string;
}

export interface StudioCheckpointPanelProps {
  open: boolean;
  onClose: () => void;
  checkpoints: readonly StudioCheckpoint[];
  error: string | null;
  onCreate: (name: string) => void;
  onRestore: (checkpoint: StudioCheckpoint) => void;
  onDelete: (checkpoint: StudioCheckpoint) => void;
  serverRevisions?: readonly StudioServerRevisionSummary[];
  serverCurrentRevision?: number;
  serverLoading?: boolean;
  serverError?: string | null;
  onReloadServer?: () => void;
  onRestoreServer?: (revision: StudioServerRevisionSummary) => void;
}

function checkpointDate(value: string): string {
  const time = Date.parse(value);
  return Number.isFinite(time)
    ? new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(time)
    : value;
}

export function StudioCheckpointPanel({
  open,
  onClose,
  checkpoints,
  error,
  onCreate,
  onRestore,
  onDelete,
  serverRevisions = [],
  serverCurrentRevision,
  serverLoading = false,
  serverError = null,
  onReloadServer,
  onRestoreServer,
}: StudioCheckpointPanelProps) {
  const [name, setName] = useState("");
  const serverAvailable = Boolean(onReloadServer && onRestoreServer && serverCurrentRevision);
  const [activeTab, setActiveTab] = useState<"local" | "server">("local");
  const visibleTab = serverAvailable ? activeTab : "local";

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", onKeyDown);
    return () => globalThis.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  const visibleError = visibleTab === "server" ? serverError : error;

  const modal = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="이름 있는 복구 지점"
      className="fixed inset-0 z-[80] bg-[oklch(0.08_0.01_70/0.82)] p-2 text-fg backdrop-blur-sm sm:p-4"
    >
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-line bg-panel shadow-2xl">
        <header className="flex shrink-0 items-start gap-3 border-b border-line px-4 py-3">
          <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <History size={18} aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold tracking-tight text-fg">버전 및 복구</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-fg-3">
              브라우저에 이름 있는 지점을 남기고, 저장된 작품은 서버 자동 revision도 비교·복원할 수 있어요.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="복구 지점 닫기"
            className="grid size-11 shrink-0 place-items-center rounded-xl border border-line bg-card text-fg-3 hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <X size={15} aria-hidden />
          </button>
        </header>

        <div
          role="tablist"
          aria-label="버전 저장 위치"
          className="grid shrink-0 grid-cols-2 gap-1 border-b border-line bg-card/25 p-2"
        >
          <button
            type="button"
            role="tab"
            aria-selected={visibleTab === "local"}
            onClick={() => setActiveTab("local")}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors ${
              visibleTab === "local" ? "bg-panel text-fg shadow-sm" : "text-fg-3 hover:bg-raised"
            }`}
          >
            <HardDrive size={15} aria-hidden /> 브라우저 지점 {checkpoints.length}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={visibleTab === "server"}
            aria-disabled={!serverAvailable}
            disabled={!serverAvailable}
            onClick={() => {
              setActiveTab("server");
              onReloadServer?.();
            }}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
              visibleTab === "server" ? "bg-panel text-fg shadow-sm" : "text-fg-3 hover:bg-raised"
            }`}
          >
            <Cloud size={15} aria-hidden /> 서버 자동 버전 {serverRevisions.length}
          </button>
        </div>

        {visibleTab === "local" ? <form
          className="flex shrink-0 flex-wrap gap-2 border-b border-line bg-card/35 px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            const normalized = name.trim();
            if (!normalized) return;
            onCreate(normalized);
            setName("");
          }}
        >
          <label className="min-w-[12rem] flex-1 text-xs font-semibold text-fg-2">
            새 복구 지점 이름
            <input
              value={name}
              onChange={(event) => setName(event.target.value.slice(0, 80))}
              maxLength={80}
              placeholder="예: 1화 대사 수정 전"
              className="mt-1.5 min-h-11 w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-fg outline-none placeholder:text-fg-3 focus:border-accent"
            />
          </label>
          <button
            type="submit"
            disabled={!name.trim()}
            className="mt-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-accent px-4 text-xs font-semibold text-on-accent hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
          >
            <BookmarkPlus size={14} aria-hidden /> 지금 상태 저장
          </button>
        </form> : null}

        {visibleError && (
          <p className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-bad/30 bg-bad/10 px-3 py-2 text-xs leading-relaxed text-bad">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
            {visibleError}
          </p>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {visibleTab === "local" ? (checkpoints.length === 0 ? (
            <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-line bg-card/30 px-4 text-center">
              <div>
                <History size={24} className="mx-auto text-fg-3" aria-hidden />
                <p className="mt-2 text-sm font-semibold text-fg-2">아직 저장한 복구 지점이 없어요</p>
                <p className="mt-1 text-xs text-fg-3">큰 편집이나 AI 적용 전에 하나 만들어 두면 안전합니다.</p>
              </div>
            </div>
          ) : (
            <ol className="space-y-2" aria-label="저장된 복구 지점">
              {checkpoints.map((checkpoint) => (
                <li
                  key={checkpoint.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card/55 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-fg">{checkpoint.name}</p>
                    <time dateTime={checkpoint.createdAt} className="mt-0.5 block text-[0.68rem] text-fg-3">
                      {checkpointDate(checkpoint.createdAt)}
                    </time>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRestore(checkpoint)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent/35 bg-accent-soft/25 px-3 text-xs font-semibold text-accent hover:bg-accent-soft/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    <RotateCcw size={12} aria-hidden /> 이 시점 복원
                  </button>
                  <button
                    type="button"
                    onClick={() => onDelete(checkpoint)}
                    aria-label={`${checkpoint.name} 복구 지점 삭제`}
                    className="grid size-11 place-items-center rounded-lg border border-line text-fg-3 hover:border-bad/45 hover:bg-bad/10 hover:text-bad focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bad"
                  >
                    <Trash2 size={13} aria-hidden />
                  </button>
                </li>
              ))}
            </ol>
          )) : (
            <div>
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card/45 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-fg">현재 서버 revision {serverCurrentRevision}</p>
                  <p className="mt-0.5 text-[0.68rem] leading-relaxed text-fg-3">
                    저장마다 자동 생성하며 최신 20개를 보존합니다. 다른 창이 먼저 저장하면 덮어쓰지 않고 충돌을 알려요.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onReloadServer}
                  disabled={serverLoading}
                  className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-line bg-panel px-3 text-xs font-semibold text-fg-2 hover:bg-raised disabled:cursor-wait disabled:opacity-55"
                >
                  <RefreshCw size={13} className={serverLoading ? "animate-spin" : undefined} aria-hidden /> 새로고침
                </button>
              </div>
              {serverLoading && serverRevisions.length === 0 ? (
                <div className="grid min-h-48 place-items-center text-center text-xs text-fg-3">
                  <div><RefreshCw size={22} className="mx-auto mb-2 animate-spin" aria-hidden />서버 버전을 불러오는 중…</div>
                </div>
              ) : serverRevisions.length === 0 ? (
                <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-line bg-card/30 px-4 text-center">
                  <div>
                    <Cloud size={24} className="mx-auto text-fg-3" aria-hidden />
                    <p className="mt-2 text-sm font-semibold text-fg-2">아직 서버에 저장된 버전이 없어요</p>
                    <p className="mt-1 text-xs text-fg-3">로그인한 작품을 저장하면 자동 revision이 생성됩니다.</p>
                  </div>
                </div>
              ) : (
                <ol className="space-y-2" aria-label="서버 자동 버전">
                  {serverRevisions.map((revision) => {
                    const current = revision.revision === serverCurrentRevision;
                    return (
                      <li
                        key={revision.revision}
                        className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-card/55 px-3 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold text-fg">
                            revision {revision.revision}
                            {current ? <span className="rounded-full bg-good-soft px-2 py-0.5 text-[0.62rem] text-good">현재</span> : null}
                            {revision.restoredFromRevision ? (
                              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.62rem] text-accent">
                                r{revision.restoredFromRevision}에서 복원
                              </span>
                            ) : null}
                          </p>
                          <time dateTime={revision.createdAt} className="mt-0.5 block text-[0.68rem] text-fg-3">
                            {checkpointDate(revision.createdAt)}
                          </time>
                        </div>
                        <button
                          type="button"
                          onClick={() => onRestoreServer?.(revision)}
                          disabled={current || serverLoading}
                          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent/35 bg-accent-soft/25 px-3 text-xs font-semibold text-accent hover:bg-accent-soft/45 disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <RotateCcw size={12} aria-hidden /> 서버에서 복원
                        </button>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          )}
        </div>

        <p className="shrink-0 border-t border-line px-4 py-2 text-[0.68rem] leading-relaxed text-fg-3">
          {visibleTab === "local"
            ? `브라우저 지점은 기기 변경에 유지되지 않으므로 JSON 또는 프로젝트 archive도 함께 보관하세요. 최신 ${STUDIO_CHECKPOINT_LIMIT}개까지 저장합니다.`
            : "서버 복원은 기존 revision을 덮어쓰지 않고 새 revision으로 기록됩니다. 작품 소유자에게만 목록과 내용이 열립니다."}
        </p>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
