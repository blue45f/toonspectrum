import { LogIn, Sparkles } from "lucide-react";
import { useState } from "react";
import { useLocation } from "react-router-dom";

import type { ReactNode } from "react";

import { translateBilingualPair } from "@/shared/lib/i18n-bilingual-copy";

import { GuestEntryButton } from "@/domains/auth/components/guest-entry-button";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import { useGuestSession } from "@/domains/auth/public/session/guest-session";

const SCOPE = "domains.creator.workspace.home.route";

const GUEST_BANNER_DISMISS_KEY = "toonstudio-guest-banner-dismissed-v1";

function isGuestBannerDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(GUEST_BANNER_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Slim, dismissible banner shown to guests inside the workspace. It explains
 * the one real limitation of guest mode (local-only work) and offers the
 * upgrade path without nagging on every visit.
 */
function GuestModeBanner() {
  const [dismissed, setDismissed] = useState(isGuestBannerDismissed);

  if (dismissed) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(GUEST_BANNER_DISMISS_KEY, "1");
    } catch {
      // Best effort only.
    }
    setDismissed(true);
  };

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-line bg-accent-soft/60 px-4 py-2 text-center text-xs text-fg-2"
    >
      <span className="inline-flex items-center gap-1.5">
        <Sparkles size={13} aria-hidden="true" className="text-accent" />
        {translateBilingualPair(
          SCOPE,
          "게스트로 둘러보는 중이에요. 작업물은 이 브라우저에만 저장됩니다.",
          "You're exploring as a guest. Work is saved in this browser only.",
        )}
      </span>
      <button
        type="button"
        onClick={() => requestAuthModalOpen({ reason: "protected-action", mode: "signup" })}
        className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-accent/50 bg-panel px-2.5 font-semibold text-fg outline-none transition-colors hover:border-accent hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        <LogIn size={12} aria-hidden="true" />
        {translateBilingualPair(SCOPE, "로그인하고 저장하기", "Sign in to save")}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label={translateBilingualPair(SCOPE, "안내 닫기", "Dismiss notice")}
        className="rounded-md px-1.5 py-0.5 text-fg-3 outline-none transition-colors hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
      >
        {translateBilingualPair(SCOPE, "닫기", "Dismiss")}
      </button>
    </div>
  );
}

/**
 * Auth gate for the personal workspace surfaces (/home, /team, /hub).
 *
 * The workspace is "my home", but since 2026-09-30 it also welcomes guests:
 * - Signed-in creators go straight in.
 * - Guests (one-click anonymous session) go straight in with a slim banner
 *   explaining that their work stays in this browser until they sign in.
 * - Everyone else meets a friendly gate — sign in or continue as a guest —
 *   instead of being silently bounced to the front door.
 */
export function WorkspaceHomeRoute({ children }: { readonly children: ReactNode }) {
  const { ready, status } = useSession();
  const { isGuest } = useGuestSession();
  const { pathname, search, hash } = useLocation();

  if (!ready) {
    return (
      <section
        aria-label="ToonStudio"
        aria-busy="true"
        className="relative grid min-h-[70dvh] place-items-center overflow-hidden bg-canvas px-5"
      >
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-canvas/40 via-canvas/70 to-canvas" />
        <div className="relative grid max-w-md gap-4 text-center">
          <span className="mx-auto size-12 animate-pulse rounded-2xl border border-accent/35 bg-accent-soft shadow-[0_0_40px_var(--color-accent-soft)] motion-reduce:animate-none" />
          <p className="font-display text-sm font-bold tracking-[0.12em] text-fg-2">TOONSTUDIO</p>
          <p className="text-sm text-fg-3">창작 공간을 준비하고 있습니다.</p>
        </div>
      </section>
    );
  }

  if (status === "authenticated" || isGuest) {
    return (
      <>
        {isGuest && status !== "authenticated" && <GuestModeBanner />}
        {children}
      </>
    );
  }

  const next = `${pathname}${search}${hash}`;
  return (
    <section
      aria-labelledby="workspace-gate-title"
      className="relative grid min-h-[70dvh] place-items-center overflow-hidden bg-canvas px-5 py-16"
    >
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-canvas/40 via-canvas/70 to-canvas" />
      <div className="relative w-full max-w-md rounded-3xl border border-line bg-panel/90 p-8 text-center shadow-xl">
        <p className="font-display text-xs font-bold tracking-[0.22em] text-accent">
          TOONSTUDIO
        </p>
        <h1
          id="workspace-gate-title"
          className="mt-3 font-display text-2xl font-bold text-fg"
        >
          {translateBilingualPair(
            SCOPE,
            "창작 공간에 오신 것을 환영해요",
            "Welcome to your creative space",
          )}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-fg-2">
          {translateBilingualPair(
            SCOPE,
            "로그인하면 모든 기기에서 작업이 이어지고, 게스트로는 지금 바로 둘러볼 수 있어요.",
            "Sign in to continue everywhere, or jump in as a guest right now.",
          )}
        </p>
        <div className="mt-6 grid gap-2.5">
          <button
            type="button"
            onClick={() => requestAuthModalOpen({ mode: "login" })}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-accent bg-accent px-5 text-sm font-bold text-on-accent shadow-lg shadow-accent/15 outline-none transition-[background-color,transform] hover:bg-accent-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99]"
          >
            <LogIn size={17} aria-hidden="true" />
            {translateBilingualPair(SCOPE, "로그인하기", "Sign in")}
          </button>
          <GuestEntryButton next={next} />
        </div>
        <p className="mt-4 text-xs leading-relaxed text-fg-3">
          {translateBilingualPair(
            SCOPE,
            "게스트 작업물은 이 브라우저에만 저장돼요. 나중에 가입하면 그대로 가져올 수 있습니다.",
            "Guest work stays in this browser. Sign up later to bring it along.",
          )}
        </p>
      </div>
    </section>
  );
}
