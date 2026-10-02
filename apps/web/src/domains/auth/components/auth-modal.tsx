import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { useEffect, useId, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";

import { AuthForm } from "./auth-form";

export interface AuthModalProps {
  onClose: () => void;
  returnFocusRef?: RefObject<HTMLElement | null>;
  initialMode?: "login" | "signup";
}

/**
 * AuthModal — 인증 다이얼로그 셸.
 *
 * 폼 본체는 AuthForm이 맡고, 이 셸은 다이얼로그 전용 책임만 진다.
 * 오버레이·포털, Escape 닫기, 배경 스크롤 잠금과 inert 처리, 탭 순환 포커스 트랩,
 * 닫힐 때 호출 트리거로 포커스 복원이 여기 있다.
 * 인증 페이지(/auth/login·signup)는 같은 AuthForm을 셸 없이 페이지 본문에 직접 그린다.
 */
export function AuthModal({
  onClose,
  returnFocusRef,
  initialMode = "login",
}: AuthModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Escape 로 닫기 (키보드 접근성)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Lock document scrolling and hide background branches from assistive tech while open.
  useEffect(() => {
    const panel = panelRef.current;
    const overlay = panel?.parentElement;
    if (!panel || !overlay) return;
    const ownerDocument = panel.ownerDocument;
    const previousBodyOverflow = ownerDocument.body.style.overflow;
    const previousRootOverflow = ownerDocument.documentElement.style.overflow;
    const backgroundBranches = new Set<HTMLElement>();
    let activeBranch: HTMLElement = overlay;
    while (
      activeBranch.parentElement &&
      activeBranch.parentElement !== ownerDocument.body
    ) {
      const parent = activeBranch.parentElement;
      for (const sibling of parent.children) {
        if (sibling instanceof HTMLElement && sibling !== activeBranch) {
          backgroundBranches.add(sibling);
        }
      }
      activeBranch = parent;
    }
    for (const bodyChild of ownerDocument.body.children) {
      if (bodyChild instanceof HTMLElement && bodyChild !== activeBranch) {
        backgroundBranches.add(bodyChild);
      }
    }
    const snapshots = [...backgroundBranches].map((element) => ({
      element,
      ariaHidden: element.getAttribute("aria-hidden"),
      inert: element.getAttribute("inert"),
    }));
    ownerDocument.body.style.overflow = "hidden";
    ownerDocument.documentElement.style.overflow = "hidden";
    for (const snapshot of snapshots) {
      snapshot.element.setAttribute("aria-hidden", "true");
      snapshot.element.setAttribute("inert", "");
    }
    return () => {
      ownerDocument.body.style.overflow = previousBodyOverflow;
      ownerDocument.documentElement.style.overflow = previousRootOverflow;
      for (const snapshot of snapshots) {
        if (snapshot.ariaHidden === null)
          snapshot.element.removeAttribute("aria-hidden");
        else snapshot.element.setAttribute("aria-hidden", snapshot.ariaHidden);
        if (snapshot.inert === null) snapshot.element.removeAttribute("inert");
        else snapshot.element.setAttribute("inert", snapshot.inert);
      }
    };
  }, []);

  // 포커스 트랩(Tab 순환을 다이얼로그 내부로 가둠) + 닫힐 때 호출 트리거로 포커스 복원.
  // prevActive 캡처는 포커스 이동보다 먼저여야 트리거(예: '로그인' 버튼)가 잡힌다.
  // (autoFocus는 commit 단계라 effect보다 먼저 실행돼 트리거 대신 입력을 캡처하므로 사용하지 않음)
  useEffect(() => {
    const prevActive = document.activeElement as HTMLElement | null;
    const explicitReturnTarget = returnFocusRef?.current;
    // 열릴 때 폼의 이메일 입력으로 포커스 이동
    panelRef.current
      ?.querySelector<HTMLElement>('input[name="email"], input[type="email"]')
      ?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !panelRef.current) return;
      const f = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
      // 포커스가 패널 밖이면 무조건 첫 요소로 회수 (배경으로 탭 이탈 방지)
      if (!panelRef.current.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
        return;
      }
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      if (explicitReturnTarget?.isConnected) {
        explicitReturnTarget.focus();
        return;
      }
      if (prevActive?.isConnected) prevActive.focus();
    };
  }, [returnFocusRef]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      data-auth-overlay="true"
      className="fixed inset-0 z-[200] flex items-start justify-center overflow-y-auto overscroll-contain px-3 py-3 sm:px-4 sm:pb-8 sm:pt-[8vh]"
    >
      <button
        type="button"
        aria-label={translateCurrentStaticSourceText(
          "domains.auth.components.auth.modal",
          "ko",
          "닫기"
        )}
        tabIndex={-1}
        data-app-tooltip-exclude="true"
        onClick={onClose}
        className="absolute inset-0 bg-[oklch(0.12_0.012_70/0.64)] backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        data-auth-modal="true"
        className="relative max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-[1.5rem] border border-line-strong bg-panel shadow-2xl shadow-[oklch(0.1_0.02_70/0.46)] motion-safe:animate-[fade-up_0.22s_var(--ease-out-expo)_both] sm:max-h-[calc(100dvh-5rem)]"
      >
        <AuthForm
          variant="dialog"
          initialMode={initialMode}
          titleId={titleId}
          descriptionId={descriptionId}
          onSignedIn={onClose}
          onDismiss={onClose}
        />
      </div>
    </div>,
    document.body
  );
}
