import { Download, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { useId, useRef, useState } from "react";

import { createStudioRecoveryNewDrawingHref } from "./studio-recovery-notice-model";

import { cn } from "@/shared/lib/utils";

export type StudioRecoveryBlockedReason = "legacy-unversioned" | "work-mismatch" | "revision-mismatch" | null;

export interface StudioRecoveryNoticeProps {
  readonly blockedReason: StudioRecoveryBlockedReason;
  readonly onRestore: () => void | Promise<void>;
  readonly onBackup: () => void;
  readonly onDelete: () => void | Promise<void>;
}

const actionClass = "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-wait disabled:opacity-50";

export function StudioRecoveryNotice({ blockedReason, onRestore, onBackup, onDelete }: StudioRecoveryNoticeProps) {
  const titleId = useId();
  const detailsId = useId();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState<"restore" | "delete" | "backup" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newDrawingHref, setNewDrawingHref] = useState(createStudioRecoveryNewDrawingHref);
  const busyRef = useRef(false);
  const safeActionRef = useRef<HTMLButtonElement>(null);

  async function run(action: "restore" | "delete" | "backup") {
    // A ref also excludes a second click before React has committed the disabled state.
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(action);
    setError(null);
    try {
      if (action === "restore") await onRestore();
      else if (action === "delete") await onDelete();
      else onBackup();
    } catch {
      setError("요청을 마치지 못했어요. 다시 시도하거나 백업 파일을 받아 주세요.");
    } finally {
      busyRef.current = false;
      setBusy(null);
      // Re-enable before restoring focus; focusing a disabled button has no effect.
      requestAnimationFrame(() => safeActionRef.current?.focus());
    }
  }

  const description = blockedReason === "revision-mismatch"
    ? "저장된 작품과 내용이 달라요. 덮어쓰지 않고 백업 파일로 보관해 주세요."
    : blockedReason === "work-mismatch"
      ? "다른 작품의 그림이에요. 덮어쓰지 않고 백업 파일로 보관해 주세요."
      : blockedReason
        ? "안전하게 열 수 있는지 확인하지 못했어요. 먼저 백업 파일을 받아 주세요."
        : "이 기기에 마지막으로 그리던 그림이 남아 있어요.";

  return (
    <section
      data-studio-recovery-notice
      aria-labelledby={titleId}
      aria-busy={busy !== null}
      className={cn("mb-3 min-w-0 rounded-xl border bg-panel p-3 text-xs text-fg", blockedReason ? "border-warning/35" : "border-accent/25")}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-48" role="status" aria-live="polite">
          <h2 id={titleId} className="font-bold">{blockedReason ? "남겨 둔 그림을 보관해 주세요" : "이어서 그릴까요?"}</h2>
          <p className="mt-1 leading-relaxed text-fg-2">{description}</p>
        </div>
        <div className="flex max-w-full flex-wrap gap-2">
          <button
            ref={safeActionRef}
            type="button"
            disabled={busy !== null}
            onClick={() => void run(blockedReason ? "backup" : "restore")}
            className={cn(actionClass, "bg-accent text-on-accent hover:bg-accent-hover")}
          >
            {busy === "restore" ? <Loader2 size={15} className="animate-spin motion-reduce:animate-none" aria-hidden /> : blockedReason ? <Download size={15} aria-hidden /> : <RotateCcw size={15} aria-hidden />}
            {busy === "restore" ? "그림 여는 중…" : blockedReason ? "백업 파일 받기" : "이어서 그리기"}
          </button>
          <a
            href={newDrawingHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={busy !== null}
            tabIndex={busy ? -1 : undefined}
            onClick={(event) => {
              if (busyRef.current) { event.preventDefault(); return; }
              // Native navigation avoids popup APIs and preserves this tab and its recovery.
              const href = createStudioRecoveryNewDrawingHref();
              event.currentTarget.href = href;
              setNewDrawingHref(href);
            }}
            className={cn(actionClass, "border border-line bg-card text-fg-2 hover:bg-raised", busy && "pointer-events-none opacity-50")}
          >
            새 그림 그리기 <span className="text-[0.65rem]">새 탭</span>
          </a>
        </div>
      </div>
      <p className="mt-2 text-[0.7rem] leading-relaxed text-fg-3">
        새 탭에서 시작합니다. 현재 그림과 남겨 둔 작업은 유지돼요.
      </p>
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        disabled={busy !== null}
        onClick={() => setExpanded(!expanded)}
        className={cn(actionClass, "mt-1 text-fg-2 hover:bg-raised")}
      >
        다른 방법 <span aria-hidden>{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && (
        <div id={detailsId} className="mt-1 border-t border-line pt-2">
          <p className="leading-relaxed text-fg-2">
            현재 그림은 ‘파일 → 저장 기록’에 먼저 보관합니다. 실패하면 이어 열지 않아요.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {!blockedReason && (
              <button type="button" disabled={busy !== null} onClick={() => void run("backup")} className={cn(actionClass, "border border-line hover:bg-raised")}>
                <Download size={14} aria-hidden /> 백업 파일 받기
              </button>
            )}
            <button type="button" disabled={busy !== null} onClick={() => void run("delete")} className={cn(actionClass, "text-bad hover:bg-bad/10")}>
              <Trash2 size={14} aria-hidden /> {busy === "delete" ? "삭제 확인 중…" : "이전 그림 삭제…"}
            </button>
          </div>
          <p className="mt-2 text-[0.7rem] leading-relaxed text-fg-3">백업에는 이전 그림이 담겨요. 삭제는 현재 캔버스가 아닌 이전 그림에 적용되며, 확인 후 되돌릴 수 없어요.</p>
        </div>
      )}
      {error && <p role="alert" className="mt-2 leading-relaxed text-bad">{error}</p>}
    </section>
  );
}
