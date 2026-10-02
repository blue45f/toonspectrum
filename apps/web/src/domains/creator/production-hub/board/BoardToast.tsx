import { CheckCircle2, TriangleAlert, X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

export interface BoardToastMessage {
  readonly id: number;
  readonly tone: "success" | "warning" | "error";
  readonly message: string;
  /** 왜 그런지, 다음에 무엇을 하면 되는지 한두 문장. */
  readonly detail?: string;
  /** 있으면 "되돌리기" 같은 한 번의 행동 버튼을 보여 준다. */
  readonly action?: { readonly label: string; readonly run: () => void };
}

const TONE = {
  success: { icon: CheckCircle2, ring: "border-good/45", text: "text-good" },
  warning: { icon: TriangleAlert, ring: "border-warn/55", text: "text-warn" },
  error: { icon: XCircle, ring: "border-bad/50", text: "text-bad" },
} as const;

/** 보드 아래쪽 알림. 막힘·실패는 alert, 성공은 보이기만 하고(읽어 주기는 보드의 상태 줄이 맡는다) 되돌리기 버튼을 둔다. */
export function BoardToast({ toast, onDismiss }: { readonly toast: BoardToastMessage | null; readonly onDismiss: () => void }) {
  const bt = useBilingual("ProductionBoardToast");
  const [paused, setPaused] = useState(false);
  const id = toast?.id;
  const tone = toast?.tone;
  const hasAction = Boolean(toast?.action);
  useEffect(() => {
    if (id === undefined || paused) return;
    const timer = window.setTimeout(onDismiss, tone === "success" ? (hasAction ? 8000 : 4500) : 10000);
    return () => window.clearTimeout(timer);
  }, [id, tone, hasAction, paused, onDismiss]);
  if (!toast) return null;
  const { icon: Icon, ring, text } = TONE[toast.tone];
  const alert = toast.tone !== "success";
  return (
    <div
      role={alert ? "alert" : "group"}
      aria-label={alert ? undefined : bt("보드 알림", "Board notice")}
      data-production-board-toast={toast.tone}
      className={cn(
        "production-board-toast fixed bottom-20 left-1/2 z-[190] flex w-[min(34rem,calc(100vw-1.5rem))] -translate-x-1/2 items-start gap-3 rounded-2xl border bg-panel p-3 pl-4 text-sm text-fg shadow-2xl",
        ring,
      )}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <Icon className={cn("mt-0.5 size-5 shrink-0", text)} aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="break-words font-semibold leading-6">{toast.message}</p>
        {toast.detail ? <p className="mt-0.5 whitespace-pre-line break-words text-xs leading-5 text-fg-2">{toast.detail}</p> : null}
      </div>
      {toast.action ? (
        <button
          type="button"
          onClick={() => {
            toast.action?.run();
            onDismiss();
          }}
          className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-accent/50 bg-accent-soft px-3 text-sm font-bold text-accent outline-none hover:bg-accent hover:text-on-accent focus-visible:ring-2 focus-visible:ring-accent"
        >
          {toast.action.label}
        </button>
      ) : null}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={bt("알림 닫기", "Dismiss")}
        className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-fg-3 outline-none hover:bg-raised hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </div>
  );
}
