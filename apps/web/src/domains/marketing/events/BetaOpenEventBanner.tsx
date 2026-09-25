import { ArrowRight, Gift, Sparkles } from "lucide-react";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { useSession } from "@/domains/auth/public/session/auth-session-store";
import Link from "@/shared/navigation/router-link";

import { BETA_OPEN_EVENT, resolveMarketingEventStatus } from "./event-catalog";
import { useMarketingEventText } from "./marketing-event-copy";

export function BetaOpenEventBanner() {
  const text = useMarketingEventText();
  const { status } = useSession();

  if (resolveMarketingEventStatus(BETA_OPEN_EVENT) !== "active") return null;

  const authenticated = status === "authenticated";
  const signupMonths = BETA_OPEN_EVENT.signupFreeMonths;
  const publicContentCount = BETA_OPEN_EVENT.minimumPublicContentCount;
  const publicDays = BETA_OPEN_EVENT.minimumPublicDays;
  const handleSignup = () => {
    requestAuthModalOpen({
      reason: "beta-event",
      source: "home-beta-banner",
      mode: "signup",
    });
  };

  return (
    <aside
      aria-label={text({ ko: "베타 오픈 이벤트", en: "Beta open event" })}
      className="relative isolate overflow-hidden border-b border-accent/25 bg-[linear-gradient(100deg,oklch(0.2_0.04_265),oklch(0.18_0.06_310),oklch(0.22_0.05_28))] text-white"
    >
      <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,oklch(0.78_0.17_75/0.18),transparent_36%),radial-gradient(circle_at_88%_100%,oklch(0.72_0.18_330/0.18),transparent_35%)]" />
      <div className="relative mx-auto flex max-w-[1320px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:px-6">
        <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/15 bg-white/10 shadow-inner">
            <Gift size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-sm font-black">
              <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[0.68rem] tracking-[0.12em]">
                <Sparkles size={12} aria-hidden /> BETA OPEN
              </span>
              <span>{text({ ko: "지금 가입하면 최대 1년 전 서비스 무료", en: "Join now for up to 1 year of every service free" })}</span>
            </p>
            <p className="mt-1 text-xs leading-5 text-white/72">
              {text({
                ko: `베타 기간 전 기능 무료 · 가입 시 ${signupMonths}개월 · 공개 작품 ${publicContentCount}개를 ${publicDays}일 유지하면 최대 1년`,
                en: `Everything free during beta · ${signupMonths} months for joining · up to 1 year when ${publicContentCount} public work stays published for ${publicDays} days`,
              })}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link href="/events/beta-open" className="inline-flex min-h-10 items-center gap-1 rounded-xl px-3 text-xs font-bold text-white/80 hover:bg-white/10 hover:text-white">
            {text({ ko: "혜택 자세히", en: "See benefits" })}<ArrowRight size={14} aria-hidden />
          </Link>
          {authenticated ? (
            <Link href="/studio/new" className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-white px-3.5 text-xs font-black text-black shadow-lg shadow-black/15">
              {text(BETA_OPEN_EVENT.secondaryCta)}<ArrowRight size={14} aria-hidden />
            </Link>
          ) : (
            <button type="button" onClick={handleSignup} className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-white px-3.5 text-xs font-black text-black shadow-lg shadow-black/15">
              {text({ ko: "무료 가입", en: "Join free" })}<ArrowRight size={14} aria-hidden />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
