import { productionText, useProductionCopy } from "./production-workboard-copy";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { cn } from "@/shared/lib/utils";

interface Props {
  readonly title: string;
  readonly description: string;
  readonly children: ReactNode;
  readonly onClose: () => void;
  readonly dirty?: boolean;
  readonly busy?: boolean;
  readonly wide?: boolean;
  /** `drawer`: 큰 화면에서는 오른쪽 상세 패널, 작은 화면에서는 아래에서 올라오는 시트. 보드를 곁눈으로 보며 카드를 고칠 때 쓴다. */
  readonly variant?: "dialog" | "drawer";
}
export function ProductionWorkspaceDialog({
  title,
  description,
  children,
  onClose,
  dirty = false,
  busy = false,
  wide = false,
  variant = "dialog",
}: Props) {
  useProductionCopy();
  const [discard, setDiscard] = useState(false);
  const [returnFocus] = useState(() =>
    typeof document !== "undefined" && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const requestClose = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[180] bg-black/55 backdrop-blur-sm" />
        <Dialog.Content
          className={cn(
            "production-workspace-dialog z-[181] overflow-y-auto overscroll-contain border border-line bg-card text-fg shadow-2xl",
            variant === "drawer"
              ? "production-workspace-drawer fixed inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl p-4 sm:p-5 lg:inset-y-0 lg:bottom-auto lg:left-auto lg:right-0 lg:h-dvh lg:max-h-none lg:w-[min(36rem,100vw)] lg:rounded-none lg:rounded-l-3xl"
              : cn(
                  "fixed left-1/2 top-1/2 max-h-[92dvh] w-[calc(100%-1.5rem)] -translate-x-1/2 -translate-y-1/2 rounded-3xl p-5 sm:p-7",
                  wide ? "max-w-5xl" : "max-w-2xl",
                ),
          )}
          aria-busy={busy}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocus?.isConnected) returnFocus.focus();
          }}
          onEscapeKeyDown={(event) => {
            if (busy) event.preventDefault();
          }}
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <Dialog.Title className="text-xl font-bold tracking-tight sm:text-2xl">{title}</Dialog.Title>
              <Dialog.Description className="mt-2 text-sm leading-6 text-fg-2">
                {description}
              </Dialog.Description>
            </div>
            <button
              type="button"
              onClick={requestClose}
              disabled={busy}
              className={cn(buttonClass({ variant: "ghost" }), "min-h-11 min-w-11 shrink-0")}
              aria-label={productionText("대화상자 닫기")}
            >
              <X size={20} />
            </button>
          </div>
          {discard ? (
            <div role="alert" className="mb-5 rounded-2xl border border-warn/40 bg-warn/10 p-4">
              <p className="text-sm font-semibold">{productionText("저장하지 않은 변경이 있습니다.")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className={cn(buttonClass({ variant: "outline" }), "min-h-11")}
                  onClick={() => setDiscard(false)}
                >
                  {productionText("편집 계속")}
                </button>
                <button
                  type="button"
                  className={cn(buttonClass({ variant: "outline" }), "min-h-11 text-bad")}
                  onClick={onClose}
                >
                  {productionText("저장하지 않고 닫기")}
                </button>
              </div>
            </div>
          ) : null}
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
