import { BellRing, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { translateBilingualPair } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";

import {
  subscribeAccountNudge,
  type AccountNudgeAction,
  type AccountNudgeDetail,
} from "./account-nudge-bus";

/**
 * Gentle "you'll need an account for that" nudge.
 *
 * Ownership-requiring actions (save, publish, payment, …) call
 * `ensureAccount(action)` from `useAccountGate()`. Signed-in creators pass
 * straight through; everyone else gets a calm, dismissible dialog that
 * explains what happens to their current work instead of a dead-end error.
 */

const SCOPE = "domains.auth.components.account.nudge";

const ACTION_COPY: Record<AccountNudgeAction, { ko: string; en: string }> = {
  save: { ko: "작업물을 저장하려면 로그인이 필요해요", en: "Sign in to save your work" },
  publish: { ko: "발행하려면 로그인이 필요해요", en: "Sign in to publish" },
  payment: {
    ko: "결제는 로그인 후 이용할 수 있어요",
    en: "Sign in to continue to payment",
  },
  comment: {
    ko: "댓글을 남기려면 로그인이 필요해요",
    en: "Sign in to leave a comment",
  },
  like: {
    ko: "좋아요를 누르려면 로그인이 필요해요",
    en: "Sign in to like",
  },
  sync: {
    ko: "여러 기기에서 이어보려면 로그인이 필요해요",
    en: "Sign in to sync across your devices",
  },
};

function AccountNudgeDialog({
  detail,
  onClose,
}: {
  readonly detail: AccountNudgeDetail;
  readonly onClose: () => void;
}) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const titleId = "account-nudge-title";
  const copy = ACTION_COPY[detail.action] ?? ACTION_COPY.save;

  useEffect(() => {
    primaryRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    globalThis.addEventListener("keydown", handleKey);
    return () => globalThis.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const title = translateBilingualPair(SCOPE, copy.ko, copy.en);
  const guestNote = translateBilingualPair(
    SCOPE,
    "게스트로 만든 작업물은 이 브라우저에 그대로 있어요. 로그인하면 계정으로 가져올 수 있습니다.",
    "Your guest work stays in this browser. Sign in to bring it into your account.",
  );
  const visitorNote = translateBilingualPair(
    SCOPE,
    "둘러보기는 계속 무료예요. 계정이 있으면 저장·발행·결제를 이어서 할 수 있습니다.",
    "Exploring stays free. With an account you can save, publish, and check out.",
  );
  const signInLabel = translateBilingualPair(SCOPE, "로그인하기", "Sign in");
  const laterLabel = translateBilingualPair(SCOPE, "나중에", "Later");

  const handleSignIn = () => {
    onClose();
    requestAuthModalOpen({ reason: "protected-action", mode: "login" });
  };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center p-4">
      <button
        type="button"
        tabIndex={-1}
        aria-label={translateBilingualPair(SCOPE, "닫기", "Close")}
        onClick={onClose}
        className="absolute inset-0 bg-black/45"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <BellRing size={18} aria-hidden="true" />
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={translateBilingualPair(SCOPE, "닫기", "Close")}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-fg-3 outline-none transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <h2 id={titleId} className="mt-3 text-base font-bold text-fg">
          {title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-fg-2">
          {detail.isGuest ? guestNote : visitorNote}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            ref={primaryRef}
            type="button"
            onClick={handleSignIn}
            className={cn(
              "min-h-11 rounded-xl border border-accent bg-accent px-4 text-sm font-bold text-on-accent",
              "outline-none transition-[background-color,transform] hover:bg-accent-2",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.99]",
            )}
          >
            {signInLabel}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-line bg-card px-4 text-sm font-semibold text-fg-2 outline-none transition-colors hover:bg-raised hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {laterLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Global host for the account nudge dialog. Mount once near the app root
 * (next to the header auth menu) — it renders nothing until requested.
 */
export function AccountNudgeHost() {
  const [detail, setDetail] = useState<AccountNudgeDetail | null>(null);

  useEffect(() => subscribeAccountNudge(setDetail), []);

  if (!detail) return null;
  return <AccountNudgeDialog detail={detail} onClose={() => setDetail(null)} />;
}
