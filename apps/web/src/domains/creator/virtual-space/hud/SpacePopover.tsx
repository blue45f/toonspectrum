import { X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

const FOCUSABLE = 'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])';

/**
 * HUD의 작은 창.
 * - popover: 비모달(role=dialog, aria-modal=false). 월드 이동을 막지 않고 바깥을 누르면 닫힌다.
 * - sheet: 모바일 모달 바텀시트(<dialog>). 네이티브 모달이 초점을 가두고 Esc로 닫힌다.
 * - palette: 데스크톱 모달 검색 팔레트(<dialog>). 화면 위쪽 가운데에 뜬다.
 */
export function SpacePopover({ open, onClose, title, sheet, palette = false, anchorRef, toggleSelector, className, children, focusFirst = true }: {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly title: string;
  readonly sheet: boolean;
  readonly palette?: boolean;
  /** 바깥 누르기 판정에서 제외할 트리거 영역. 트리거가 스스로 열고 닫는다. */
  readonly anchorRef?: RefObject<HTMLElement | null>;
  /** 바깥 누르기 판정에서 제외할 여닫기 버튼 선택자. 도크·미니맵처럼 트리거가 여러 곳에 있을 때 쓴다. */
  readonly toggleSelector?: string;
  readonly className?: string;
  readonly children: ReactNode;
  /** 비모달 팝오버를 열 때 첫 조작 요소로 초점을 옮긴다. 지도처럼 월드 조작을 이어가야 하면 false. */
  readonly focusFirst?: boolean;
}) {
  const bt = useBilingual("SpacePopover");
  const titleId = useId();
  const popoverRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const modal = sheet || palette;

  useEffect(() => {
    if (!open || modal) return undefined;
    const element = popoverRef.current;
    if (focusFirst) element?.querySelector<HTMLElement>(FOCUSABLE)?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (element?.contains(target) || anchorRef?.current?.contains(target)) return;
      if (toggleSelector && target instanceof Element && target.closest(toggleSelector)) return;
      closeRef.current();
    };
    document.addEventListener("pointerdown", outside, true);
    return () => document.removeEventListener("pointerdown", outside, true);
  }, [open, modal, anchorRef, toggleSelector, focusFirst]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !modal || !dialog) return undefined;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, [open, modal]);

  if (!open) return null;
  const header = <header className={modal ? "space-sheet__header" : "space-popover__header"}>
    {sheet ? <span className="space-sheet__grip" aria-hidden /> : null}
    <h2 id={titleId}>{title}</h2>
    <button type="button" className="space-icon-button" onClick={onClose} aria-label={bt("닫기", "Close")}><X size={18} aria-hidden /></button>
  </header>;
  if (modal) {
    return <dialog ref={dialogRef} className={cn(palette && !sheet ? "space-palette" : "space-sheet", className)} aria-labelledby={titleId}
      data-space-interactive="true" onCancel={(event) => { event.preventDefault(); onClose(); }}
      onKeyDown={(event) => { if (event.key === "Escape") event.stopPropagation(); }}>
      <div className="space-sheet__body">
        {header}
        {children}
      </div>
    </dialog>;
  }
  return <div ref={popoverRef} className={cn("space-popover", className)} role="dialog" aria-modal="false" aria-labelledby={titleId} data-space-interactive="true">
    {header}
    {children}
  </div>;
}
