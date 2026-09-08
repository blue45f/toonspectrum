import { Images } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import type { CreatorResource } from "@/shared/lib/creator-resources";

import { toast } from "@/shared/lib/toast-store";

interface ModalFocusOptions {
  dialogRef: RefObject<HTMLDivElement | null>;
  initialFocusRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  returnFocus: HTMLElement | null;
}

function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  ));
}

// Shared modal behavior intentionally lives with the dialog-only component helpers.
// eslint-disable-next-line react-refresh/only-export-components
export function useModalFocus({
  dialogRef,
  initialFocusRef,
  onClose,
  returnFocus,
}: ModalFocusOptions) {
  const closeHandlerRef = useRef(onClose);
  closeHandlerRef.current = onClose;
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => {
      (initialFocusRef.current ?? dialogRef.current)?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeHandlerRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const root = dialogRef.current;
      if (!root) return;
      const focusable = focusableIn(root);
      if (focusable.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey && (active === first || !root.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !root.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => returnFocus?.focus({ preventScroll: true }));
    };
  }, [dialogRef, initialFocusRef, returnFocus]);
}

// Clipboard feedback is shared by both reference-asset dialogs.
// eslint-disable-next-line react-refresh/only-export-components
export async function copyText(value: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast(successMessage, { tone: "success" });
  } catch {
    toast("클립보드에 복사하지 못했습니다. 브라우저 권한을 확인하세요.", { tone: "error" });
  }
}

export function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex min-h-8 items-center rounded-full border border-line bg-canvas px-3 text-xs font-semibold text-fg-2">
      {children}
    </span>
  );
}

export function AssetImage({
  item,
  className,
  eager = false,
}: {
  item: CreatorResource;
  className: string;
  eager?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  if (!item.imageUrl || failed) {
    return (
      <div className={`${className} grid place-items-center bg-raised text-fg-3`}>
        <Images size={28} aria-hidden="true" />
        <span className="sr-only">미리보기를 불러오지 못했습니다.</span>
      </div>
    );
  }
  return (
    <img
      src={item.imageUrl}
      alt=""
      loading={eager ? "eager" : "lazy"}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${className} bg-raised object-contain`}
    />
  );
}
