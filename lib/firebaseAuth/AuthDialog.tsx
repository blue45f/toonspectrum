import { Loader2, LogIn, UserPlus, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

import { useAuth } from "./useAuth";

type Mode = "signin" | "signup";

const COPY: Record<Mode, { title: string; desc: string; submit: string; toggle: string }> = {
  signin: {
    title: "로그인",
    desc: "이메일과 비밀번호로 로그인하세요. 계정이 없다면 가입하거나 게스트로 시작할 수 있습니다.",
    submit: "로그인",
    toggle: "계정이 없나요? 가입하기",
  },
  signup: {
    title: "회원가입",
    desc: "이메일과 비밀번호로 새 계정을 만드세요. 비밀번호는 6자 이상이어야 합니다.",
    submit: "가입하기",
    toggle: "이미 계정이 있나요? 로그인",
  },
};

/**
 * Firebase 이메일/비밀번호 + 게스트 로그인 다이얼로그 — 접근성 우선.
 * - 로그인 ⇄ 가입 토글, "게스트로 시작하기"(익명 인증)
 * - 로딩/비활성 상태, aria-live 에러(role="alert")
 * - 포커스: 포커스 트랩 + Esc 닫기, 열릴 때 이메일 입력에 초기 포커스, 닫힐 때 트리거로 복원
 *
 * ToonSpectrum 디자인 토큰(panel·line·card·canvas·accent·bad…)에 맞춰 벤더링했다.
 * useAuth API·한국어 에러 매핑은 캐노니컬과 동일(context.ts / AuthProvider.tsx).
 */
export function AuthDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { signIn, signUp, signInAsGuest, error, clearError, user } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"form" | "guest" | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const emailId = useId();
  const passwordId = useId();
  const errorId = useId();

  // 로그인 성공 시 자동으로 닫힌다(prop 콜백 호출 — setState 아님).
  useEffect(() => {
    if (open && user) onOpenChange(false);
  }, [open, user, onOpenChange]);

  // 닫힐 때 폼/에러를 초기화 — 다음 열림이 항상 깨끗한 상태로 시작.
  // (close 전이 함수에 결합하지 않고 open 변화에 반응시켜 effect 의존성을 단순하게 유지)
  useEffect(() => {
    if (open) return;
    setMode("signin");
    setBusy(null);
    setEmail("");
    setPassword("");
    clearError();
  }, [open, clearError]);

  // 포커스 트랩 + Esc 닫기 + 열릴 때 이메일 포커스 + 닫힐 때 트리거 복원.
  // prevActive 캡처는 포커스 이동보다 먼저여야 트리거('로그인' 버튼)가 잡힌다.
  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    emailRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onOpenChange(false);
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const f = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (f.length === 0) return;
      const first = f[0];
      const last = f[f.length - 1];
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [open, onOpenChange]);

  function switchMode() {
    setMode((m) => (m === "signin" ? "signup" : "signin"));
    clearError();
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy("form");
    try {
      if (mode === "signup") await signUp(email, password);
      else await signIn(email, password);
    } catch {
      // 에러는 컨텍스트 state(error)로 노출 — 여기선 무시.
    } finally {
      setBusy(null);
    }
  }

  async function onGuest() {
    if (busy) return;
    setBusy("guest");
    try {
      await signInAsGuest();
    } catch {
      // 위와 동일.
    } finally {
      setBusy(null);
    }
  }

  if (!open || typeof document === "undefined") return null;

  const copy = COPY[mode];
  const formBusy = busy === "form";
  const guestBusy = busy === "guest";
  const anyBusy = busy !== null;

  const dialog = (
    <div className="fixed inset-0 z-[200] flex items-start justify-center overflow-hidden px-4 py-4 sm:pt-[12vh] sm:pb-6">
      <button
        aria-label="닫기"
        tabIndex={-1}
        onClick={() => onOpenChange(false)}
        className="absolute inset-0 bg-[oklch(0.12_0.012_70/0.64)] backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${emailId}-title`}
        aria-describedby={`${emailId}-desc`}
        className="relative max-h-[calc(100dvh-2rem)] w-full max-w-sm overflow-y-auto rounded-2xl border border-line-strong bg-panel shadow-2xl shadow-[oklch(0.1_0.02_70/0.5)]"
        style={{ animation: "fade-up 0.22s var(--ease-out-expo)" }}
      >
        <button
          onClick={() => onOpenChange(false)}
          aria-label="닫기"
          className="absolute right-3 top-3 text-fg-3 transition-colors hover:text-fg"
        >
          <X size={18} />
        </button>
        <div className="p-6">
          <div className="mb-1 flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-md bg-accent-soft text-accent">
              {mode === "signup" ? (
                <UserPlus className="size-4" aria-hidden />
              ) : (
                <LogIn className="size-4" aria-hidden />
              )}
            </span>
            <h2 id={`${emailId}-title`} className="font-display text-lg font-bold text-fg">
              {copy.title}
            </h2>
          </div>
          <p id={`${emailId}-desc`} className="mb-5 text-sm leading-relaxed text-fg-3">
            {copy.desc}
          </p>

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-fg-2">이메일</span>
              <input
                ref={emailRef}
                id={emailId}
                type="email"
                autoComplete="email"
                inputMode="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                aria-describedby={error ? errorId : undefined}
                aria-invalid={error ? true : undefined}
                required
                disabled={anyBusy}
                className="h-11 rounded-xl border border-line bg-canvas px-3.5 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent/60 disabled:opacity-50"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-fg-2">비밀번호</span>
              <input
                id={passwordId}
                type="password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                minLength={6}
                aria-describedby={error ? errorId : undefined}
                aria-invalid={error ? true : undefined}
                required
                disabled={anyBusy}
                className="h-11 rounded-xl border border-line bg-canvas px-3.5 text-sm text-fg outline-none transition-colors placeholder:text-fg-3 focus:border-accent/60 disabled:opacity-50"
              />
            </label>

            {/* 에러는 항상 같은 노드에 두어 aria-live 가 안정적으로 announce 한다. */}
            <div aria-live="assertive">
              {error ? (
                <p
                  id={errorId}
                  role="alert"
                  className="rounded-lg border border-bad/40 bg-bad/10 px-3 py-2 text-[0.8125rem] text-bad"
                >
                  {error}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              className="mt-0.5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-accent text-sm font-semibold text-on-accent transition-colors hover:bg-accent-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50"
              disabled={anyBusy || !email || !password}
              aria-busy={formBusy || undefined}
            >
              {formBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {copy.submit}
            </button>
          </form>

          <button
            type="button"
            onClick={switchMode}
            disabled={anyBusy}
            className="mt-2 w-full text-center text-[0.8125rem] font-medium text-accent transition-colors hover:underline disabled:pointer-events-none disabled:opacity-50"
          >
            {copy.toggle}
          </button>

          <div className="my-3 flex items-center gap-3 text-fg-3">
            <span className="h-px flex-1 bg-line" aria-hidden />
            <span className="text-xs">또는</span>
            <span className="h-px flex-1 bg-line" aria-hidden />
          </div>

          <button
            type="button"
            onClick={onGuest}
            disabled={anyBusy}
            aria-busy={guestBusy || undefined}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-line bg-card text-sm font-medium text-fg transition-colors hover:border-line-strong hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/80 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50"
          >
            {guestBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            게스트로 시작하기
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
