import {
  ArrowRight,
  BadgeCheck,
  ChevronDown,
  Sparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import Link from "@/shared/navigation/router-link";
import { betaOpenEventGateEligible } from "./beta-open-event-gate-policy";
import { BETA_OPEN_EVENT, resolveMarketingEventStatus } from "./event-catalog";
import {
  hasSeenMarketingEventForIdentity,
  markMarketingEventSeen,
} from "./event-seen";
import { useMarketingEventText } from "./marketing-event-copy";

const ROUTE_VISIT_KEY = "toonstudio:beta-open:eligible-routes:v2";
const MINIMUM_ENGAGEMENT_DELAY_MS = 8_000;
const FALLBACK_REVEAL_DELAY_MS = 32_000;

function eligibleRouteVisits(): number {
  if (typeof window === "undefined") return 0;
  try {
    const value = Number.parseInt(window.sessionStorage.getItem(ROUTE_VISIT_KEY) ?? "0", 10);
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function recordEligibleRouteVisit(): number {
  const next = Math.min(99, eligibleRouteVisits() + 1);
  if (typeof window === "undefined") return next;
  try {
    window.sessionStorage.setItem(ROUTE_VISIT_KEY, String(next));
  } catch {
    // A private browsing context can deny session storage.
  }
  return next;
}

/**
 * A quiet conversion prompt shown after the visitor has had time to inspect the product.
 * It never locks scrolling, steals focus or covers the page as a first-visit interstitial.
 */
export function BetaOpenEventGate({ pathname }: { pathname: string }) {
  const text = useMarketingEventText();
  const { data: session, ready, status } = useSession();
  const [visible, setVisible] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const userId = status === "authenticated" ? session?.user?.id ?? null : null;
  const signupMonths = BETA_OPEN_EVENT.signupFreeMonths;
  const publicContentCount = BETA_OPEN_EVENT.minimumPublicContentCount;
  const publicDays = BETA_OPEN_EVENT.minimumPublicDays;
  const active = resolveMarketingEventStatus(BETA_OPEN_EVENT) === "active";
  const eligible = active && betaOpenEventGateEligible(pathname);

  const dismiss = useCallback(() => {
    markMarketingEventSeen(BETA_OPEN_EVENT.id, userId);
    setVisible(false);
    setDetailsOpen(false);
  }, [userId]);

  useEffect(() => {
    setVisible(false);
    setDetailsOpen(false);
    if (!ready || !eligible || hasSeenMarketingEventForIdentity(BETA_OPEN_EVENT.id, userId)) return undefined;

    const visits = recordEligibleRouteVisit();
    let armed = visits > 1;
    const reveal = () => {
      if (!hasSeenMarketingEventForIdentity(BETA_OPEN_EVENT.id, userId)) setVisible(true);
    };
    const onIntent = () => {
      if (armed) reveal();
    };
    const armTimer = window.setTimeout(() => { armed = true; }, MINIMUM_ENGAGEMENT_DELAY_MS);
    const fallbackTimer = window.setTimeout(reveal, visits > 1 ? 14_000 : FALLBACK_REVEAL_DELAY_MS);
    const passive = { passive: true } as const;
    window.addEventListener("pointerdown", onIntent, passive);
    window.addEventListener("keydown", onIntent);
    window.addEventListener("scroll", onIntent, passive);
    return () => {
      window.clearTimeout(armTimer);
      window.clearTimeout(fallbackTimer);
      window.removeEventListener("pointerdown", onIntent);
      window.removeEventListener("keydown", onIntent);
      window.removeEventListener("scroll", onIntent);
    };
  }, [eligible, pathname, ready, status, userId]);

  const openSignup = () => {
    dismiss();
    requestAuthModalOpen({
      reason: "beta-event",
      source: "engaged-beta-prompt",
      mode: "signup",
    });
  };

  if (!visible || typeof document === "undefined") return null;
  const authenticated = status === "authenticated";
  const benefits = [
    {
      strong: { ko: "베타 기간", en: "During beta" },
      body: { ko: "주요 서비스 이용료 무료 · 공정 사용 한도 적용", en: "Major services free · fair-use limits apply" },
    },
    {
      strong: { ko: "회원가입", en: "Create an account" },
      body: { ko: `가입일부터 ${signupMonths}개월 전 서비스 무료`, en: `${signupMonths} months of every service free` },
    },
    {
      strong: { ko: `공개 작품 ${publicContentCount}개`, en: `Publish ${publicContentCount} work` },
      body: { ko: `${publicDays}일 공개 유지 시 최대 1년 무료`, en: `Keep it public ${publicDays} days for up to 1 year free` },
    },
  ] as const;

  return createPortal(
    <aside
      role="region"
      aria-live="polite"
      aria-label={text({ ko: "베타 오픈 혜택", en: "Beta opening benefit" })}
      data-beta-open-prompt="engaged"
      className="pointer-events-auto fixed inset-x-3 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-[175] ml-auto w-auto max-w-[30rem] overflow-hidden rounded-3xl border border-white/15 bg-[oklch(0.15_0.03_270/0.97)] text-white shadow-2xl shadow-black/50 backdrop-blur-2xl sm:inset-x-auto sm:bottom-5 sm:right-5 sm:w-[min(30rem,calc(100vw-2.5rem))]"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,oklch(0.8_0.17_75/0.20),transparent_38%),radial-gradient(circle_at_100%_20%,oklch(0.72_0.19_320/0.16),transparent_42%)]" />
      <div className="relative flex items-start gap-3 p-4 sm:p-5">
        <span className="grid size-10 shrink-0 place-items-center rounded-2xl border border-amber-100/20 bg-amber-100/10 text-amber-100">
          <Sparkles size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[0.62rem] font-black uppercase tracking-[0.16em] text-amber-100/80">BETA OPEN</p>
          <h2 className="mt-1 text-base font-black leading-6 sm:text-lg">{text(BETA_OPEN_EVENT.title)}</h2>
          <p className="mt-1.5 text-xs leading-5 text-white/65">
            {text({
              ko: "먼저 둘러본 뒤 필요할 때 가입하세요. 혜택과 조건은 한 화면에서 확인할 수 있습니다.",
              en: "Explore first, then join when it is useful. Review every benefit and condition in one place.",
            })}
          </p>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={text({ ko: "베타 혜택 닫기", en: "Dismiss beta benefit" })}
          className="grid size-11 shrink-0 place-items-center rounded-2xl text-white/60 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <X size={18} aria-hidden />
        </button>
      </div>

      {detailsOpen ? (
        <div className="relative grid gap-2 border-t border-white/10 px-4 py-3 sm:px-5">
          {benefits.map((item) => (
            <div key={item.strong.ko} className="flex gap-3 rounded-2xl border border-white/10 bg-white/[0.055] p-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl bg-emerald-300/10 text-emerald-200">
                <BadgeCheck size={15} aria-hidden />
              </span>
              <div>
                <p className="text-[0.62rem] font-black uppercase tracking-[0.12em] text-white/45">{text(item.strong)}</p>
                <p className="mt-0.5 text-xs font-bold leading-5 text-white/90">{text(item.body)}</p>
              </div>
            </div>
          ))}
          <p className="px-1 text-[0.66rem] leading-5 text-white/45">
            {text({
              ko: "무료 기간 종료 후 일부 기능이 유료화될 수 있으며, 적용 전 충분히 안내합니다.",
              en: "Some features may become paid after the free period, with advance notice before any change.",
            })}
          </p>
        </div>
      ) : null}

      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-t border-white/10 bg-black/10 p-3 sm:flex sm:flex-wrap sm:justify-end sm:px-5">
        <button
          type="button"
          aria-expanded={detailsOpen}
          onClick={() => setDetailsOpen((current) => !current)}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-2xl border border-white/12 bg-white/[0.055] px-3 text-xs font-bold text-white/75 hover:bg-white/10 hover:text-white"
        >
          <ChevronDown size={14} className={detailsOpen ? "rotate-180" : undefined} aria-hidden />
          {text(detailsOpen ? { ko: "조건 접기", en: "Hide terms" } : { ko: "혜택·조건", en: "Benefits & terms" })}
        </button>
        {authenticated ? (
          <Link href="/studio/new" onClick={dismiss} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-xs font-black text-black">
            {text(BETA_OPEN_EVENT.secondaryCta)}<ArrowRight size={14} aria-hidden />
          </Link>
        ) : (
          <button type="button" onClick={openSignup} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-xs font-black text-black">
            {text(BETA_OPEN_EVENT.primaryCta)}<ArrowRight size={14} aria-hidden />
          </button>
        )}
        <Link href="/events/beta-open" onClick={dismiss} className="col-span-2 inline-flex min-h-10 items-center justify-center text-xs font-bold text-white/60 hover:text-white sm:mr-auto sm:order-first sm:col-auto">
          {text({ ko: "전체 안내 보기", en: "View full details" })}
        </Link>
      </div>
    </aside>,
    document.body,
  );
}

export default BetaOpenEventGate;
