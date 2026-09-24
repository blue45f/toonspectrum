import { ArrowRight, BadgeCheck, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { requestAuthModalOpen } from "@/compat/auth-modal-intent";
import { useSession } from "@/compat/auth-session-store";
import Link from "@/compat/router-link";
import { betaOpenEventGateEligible } from "./beta-open-event-gate-policy";
import { BETA_OPEN_EVENT, resolveMarketingEventStatus } from "./event-catalog";
import {
  hasSeenMarketingEventForIdentity,
  markMarketingEventSeen,
} from "./event-seen";
import { useMarketingEventText } from "./marketing-event-copy";

export function BetaOpenEventGate({ pathname }: { pathname: string }) {
  const text = useMarketingEventText();
  const { data: session, status } = useSession();
  const [visible, setVisible] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const userId = status === "authenticated" ? session?.user?.id ?? null : null;
  const signupMonths = BETA_OPEN_EVENT.signupFreeMonths;
  const publicContentCount = BETA_OPEN_EVENT.minimumPublicContentCount;
  const publicDays = BETA_OPEN_EVENT.minimumPublicDays;
  const active = resolveMarketingEventStatus(BETA_OPEN_EVENT) === "active";
  const eligible = active && betaOpenEventGateEligible(pathname);

  const dismiss = useCallback(() => {
    markMarketingEventSeen(BETA_OPEN_EVENT.id, userId);
    setVisible(false);
  }, [userId]);

  useEffect(() => {
    if (!eligible) {
      setVisible(false);
      return;
    }
    setVisible(!hasSeenMarketingEventForIdentity(BETA_OPEN_EVENT.id, userId));
  }, [eligible, status, userId]);

  useEffect(() => {
    if (!visible) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() => panelRef.current?.focus({ preventScroll: true }));

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        dismiss();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (!panelRef.current.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      const previousFocus = previousFocusRef.current;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [dismiss, visible]);

  const openSignup = () => {
    dismiss();
    requestAuthModalOpen({
      reason: "beta-event",
      source: "first-visit-beta-gate",
      mode: "signup",
    });
  };

  if (!visible || typeof document === "undefined") return null;

  const authenticated = status === "authenticated";

  return createPortal(
    <div
      className="fixed inset-0 z-[190] overflow-y-auto bg-[oklch(0.10_0.025_270/0.94)] px-3 py-3 backdrop-blur-2xl sm:px-6 sm:py-6"
      role="presentation"
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        data-stable-contrast="true"
        aria-labelledby="beta-open-gate-title"
        aria-describedby="beta-open-gate-description"
        className="relative mx-auto flex min-h-[calc(100dvh-1.5rem)] max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/15 bg-[oklch(0.15_0.03_270)] text-white shadow-2xl shadow-black/50 outline-none motion-safe:animate-[beta-gate-enter_0.28s_var(--ease-out-expo)_both] motion-reduce:animate-none sm:min-h-[calc(100dvh-3rem)]"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,oklch(0.8_0.17_75/0.20),transparent_34%),radial-gradient(circle_at_90%_20%,oklch(0.72_0.19_320/0.17),transparent_34%)]"
        />
        <button
          type="button"
          onClick={dismiss}
          aria-label={text({ ko: "베타 이벤트 닫기", en: "Close beta event" })}
          className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-2xl border border-white/10 bg-black/20 text-white/70 hover:bg-white/10 hover:text-white sm:right-5 sm:top-5"
        >
          <X size={19} aria-hidden />
        </button>

        <div className="relative grid flex-1 items-center gap-10 px-6 pb-8 pt-16 sm:px-10 sm:pb-10 lg:grid-cols-[1.08fr_0.92fr] lg:px-14">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-amber-100/20 bg-amber-100/10 px-3 py-1.5 text-[0.68rem] font-black tracking-[0.14em] text-amber-50">
              <Sparkles size={13} aria-hidden /> BETA OPEN
            </p>
            <h2
              id="beta-open-gate-title"
              className="mt-5 max-w-4xl font-display text-[clamp(2.8rem,6vw,6rem)] font-black leading-[0.94] tracking-[-0.06em]"
            >
              {text(BETA_OPEN_EVENT.title)}
            </h2>
            <p
              id="beta-open-gate-description"
              className="mt-6 max-w-2xl text-sm leading-7 text-white/60 sm:text-lg sm:leading-8"
            >
              {text(BETA_OPEN_EVENT.summary)}
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              {authenticated ? (
                <Link
                  href="/studio/new"
                  onClick={dismiss}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-6 text-sm font-black text-black"
                >
                  {text(BETA_OPEN_EVENT.secondaryCta)}<ArrowRight size={16} aria-hidden />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={openSignup}
                  className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white px-6 text-sm font-black text-black"
                >
                  {text(BETA_OPEN_EVENT.primaryCta)}<ArrowRight size={16} aria-hidden />
                </button>
              )}
              <Link
                href="/events/beta-open"
                onClick={dismiss}
                className="inline-flex min-h-14 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.07] px-6 text-sm font-bold text-white hover:bg-white/10"
              >
                {text({ ko: "이벤트 자세히 보기", en: "View full event" })}
              </Link>
            </div>
          </div>

          <div className="grid gap-3">
            {[
              {
                strong: { ko: "베타 기간", en: "During beta" },
                body: { ko: "주요 서비스 이용료 무료 · 공정 사용 한도 적용", en: "Major services free · fair-use limits apply" },
              },
              {
                strong: { ko: "회원가입", en: "Create an account" },
                body: {
                  ko: `가입일부터 ${signupMonths}개월 전 서비스 무료`,
                  en: `${signupMonths} months of every service free`,
                },
              },
              {
                strong: {
                  ko: `공개 작품 ${publicContentCount}개`,
                  en: `Publish ${publicContentCount} work`,
                },
                body: {
                  ko: `${publicDays}일 공개 유지 시 최대 1년 무료`,
                  en: `Keep it public ${publicDays} days for up to 1 year free`,
                },
              },
            ].map((item) => (
              <div
                key={item.strong.ko}
                className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-4 backdrop-blur-sm"
              >
                <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-300/10 text-emerald-200">
                  <BadgeCheck size={16} aria-hidden />
                </span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.1em] text-white/45">
                    {text(item.strong)}
                  </p>
                  <p className="mt-1 text-sm font-bold leading-6 text-white/90 sm:text-base">
                    {text(item.body)}
                  </p>
                </div>
              </div>
            ))}
            <p className="px-1 pt-1 text-[0.7rem] leading-5 text-white/40">
              {text({
                ko: "무료 기간 종료 후 일부 또는 전체 기능이 유료화될 수 있습니다. 이벤트로 확정된 무료 기간은 안내된 기간 동안 유지됩니다.",
                en: "Some or all features may become paid after your free period. Any free period confirmed by this event remains honored for its stated duration.",
              })}
            </p>
          </div>
        </div>

        <div className="relative flex flex-col gap-2 border-t border-white/10 px-6 py-4 text-xs text-white/45 sm:flex-row sm:items-center sm:justify-between sm:px-10">
          <span>
            {text({
              ko: "베타 종료일 및 향후 요금제는 충분한 사전 안내 후 적용합니다.",
              en: "Beta end dates and future pricing will be announced in advance.",
            })}
          </span>
          <button
            type="button"
            onClick={dismiss}
            className="min-h-10 self-start rounded-xl px-3 font-bold text-white/70 hover:bg-white/10 hover:text-white sm:self-auto"
          >
            {text({ ko: "나중에 둘러보기", en: "Explore for now" })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default BetaOpenEventGate;
