/**
 * 에셋 포인트 지갑 — account 하위의 잔액·내역·적립 안내 화면.
 *
 * 설계(design 6.1-1): 지갑은 결제 화면 옆이 아니라 계정 영역에 둔다.
 * 포인트는 현금이 아니고 충전할 수 없다는 고지를 화면에 명시한다.
 * 게스트에게는 잔액 대신 로그인 유도를 보여준다(게스트 세션 우선 정책).
 */

import {
  ArrowRight,
  CalendarClock,
  Coins,
  History,
  Info,
  ShoppingBag,
  Sparkles,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { Container } from "@/shared/components/section";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useI18n } from "@/shared/lib/i18n-core";
import { useApp } from "@/shared/lib/store";

import {
  ASSET_POINT_EARN_RULES,
  assetPointEarnRule,
} from "./asset-points-policy";
import {
  countEarnsToday,
  ownedResourceIds,
  sortEventsNewestFirst,
  summarizeAssetPoints,
  type AssetPointEvent,
} from "./asset-points-ledger";
import { useAssetPointsStore } from "./asset-points-store";
import { awardDailyLoginBonus } from "./asset-points-triggers";

const HISTORY_LIMIT = 20;

function eventLabel(event: AssetPointEvent, t: (ko: string, en: string) => string): string {
  if (event.kind === "earn") {
    const rule = event.activityKey ? assetPointEarnRule(event.activityKey) : null;
    return rule ? t(rule.labelKo, rule.labelEn) : t("활동 보상", "Activity reward");
  }
  if (event.kind === "spend") {
    return t(`에셋 구매 · ${event.resourceName ?? event.resourceId ?? ""}`, `Asset purchase · ${event.resourceName ?? event.resourceId ?? ""}`);
  }
  return t(`구매 취소 환불 · ${event.resourceName ?? ""}`, `Purchase refund · ${event.resourceName ?? ""}`);
}

export function AssetPointsWalletPage() {
  const t = useBilingual("AssetPointsWalletPage");
  const lang = useI18n((state) => state.lang);
  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const number = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const userId = useApp((state) => state.userId);
  const events = useAssetPointsStore((state) => state.events);
  const [loginBonusPoints, setLoginBonusPoints] = useState<number | null>(null);
  const claimedForUserRef = useRef<string | null>(null);

  // 로그인 사용자에게 하루 첫 방문 보너스를 자동 청구한다 (원장이 중복·상한을 막는다).
  useEffect(() => {
    if (!userId || claimedForUserRef.current === userId) return;
    claimedForUserRef.current = userId;
    const result = awardDailyLoginBonus();
    if (result.granted) setLoginBonusPoints(result.points);
  }, [userId]);

  const summary = useMemo(() => summarizeAssetPoints(events, new Date()), [events]);
  const history = useMemo(
    () => sortEventsNewestFirst(events).slice(0, HISTORY_LIMIT),
    [events],
  );
  const ownedSpends = useMemo(() => {
    const owned = ownedResourceIds(events);
    return sortEventsNewestFirst(
      events.filter(
        (event) => event.kind === "spend" && event.resourceId && owned.has(event.resourceId),
      ),
    );
  }, [events]);

  if (!userId) {
    return (
      <Container size="prose" className="py-10 sm:py-16">
        <p className="text-xs font-black tracking-[0.14em] text-accent">STUDIO POINTS</p>
        <h1 className="mt-2 text-3xl font-black text-fg">{t("포인트 지갑", "Points wallet")}</h1>
        <p className="mt-4 text-sm leading-6 text-fg-2">
          {t(
            "스튜디오 포인트는 로그인·작품 활동으로 쌓이는 보상 재화입니다. 잔액과 적립 내역은 로그인 후 확인할 수 있습니다.",
            "Studio Points are rewards you earn from signing in and creating. Sign in to see your balance and history.",
          )}
        </p>
        <button
          type="button"
          onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "asset-points-wallet", mode: "login" })}
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-fg px-4 text-sm font-bold text-canvas"
        >
          {t("로그인하기", "Sign in")}
        </button>
      </Container>
    );
  }

  return (
    <Container className="py-8 sm:py-14">
      <header className="max-w-3xl">
        <p className="text-xs font-black tracking-[0.14em] text-accent">STUDIO POINTS</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-5xl">
          {t("포인트 지갑", "Points wallet")}
        </h1>
        <p className="mt-4 text-sm leading-7 text-fg-2">
          {t(
            "활동으로 쌓은 스튜디오 포인트로 마켓 에셋을 교환할 수 있습니다. 포인트는 현금이 아니며 충전·환전·양도는 할 수 없습니다.",
            "Exchange Studio Points earned from activity for market assets. Points are not cash and cannot be purchased, cashed out, or transferred.",
          )}
        </p>
      </header>

      {loginBonusPoints !== null ? (
        <div
          role="status"
          className="mt-6 flex items-center gap-2 rounded-2xl border border-good/30 bg-good/5 p-4 text-sm font-semibold text-fg"
        >
          <Sparkles size={16} className="text-good" aria-hidden />
          {t(
            `오늘의 로그인 보너스 +${loginBonusPoints}P가 적립됐습니다.`,
            `Today's login bonus +${loginBonusPoints}P has been added.`,
          )}
        </div>
      ) : null}

      <section className="mt-8 grid gap-4 lg:grid-cols-3">
        <article className="rounded-3xl border border-line bg-panel p-6">
          <Wallet size={20} className="text-accent" aria-hidden />
          <p className="mt-4 text-xs font-bold text-fg-3">{t("사용 가능 포인트", "Available points")}</p>
          <p className="mt-1 text-3xl font-black text-fg">
            {number.format(summary.balance)}
            <span className="ml-1 text-base font-bold text-fg-3">P</span>
          </p>
          <p className="mt-2 text-xs text-fg-3">
            {t(
              `누적 적립 ${number.format(summary.lifetimeEarned)}P · 누적 사용 ${number.format(summary.lifetimeSpent)}P`,
              `Lifetime earned ${number.format(summary.lifetimeEarned)}P · spent ${number.format(summary.lifetimeSpent)}P`,
            )}
          </p>
        </article>

        <article className="rounded-3xl border border-line bg-panel p-6">
          <CalendarClock size={20} className="text-accent" aria-hidden />
          <p className="mt-4 text-xs font-bold text-fg-3">{t("만료 예정", "Expiring soon")}</p>
          <p className="mt-1 text-3xl font-black text-fg">
            {number.format(summary.expiringSoonPoints)}
            <span className="ml-1 text-base font-bold text-fg-3">P</span>
          </p>
          <p className="mt-2 text-xs leading-5 text-fg-3">
            {summary.nextExpiryAt
              ? t(
                  `30일 안에 만료되는 포인트입니다. 가장 빠른 만료: ${new Date(summary.nextExpiryAt).toLocaleDateString(locale)}`,
                  `Points expiring within 30 days. Earliest expiry: ${new Date(summary.nextExpiryAt).toLocaleDateString(locale)}`,
                )
              : t(
                  "30일 안에 만료되는 포인트가 없습니다. 포인트는 지급일로부터 365일 동안 유효합니다.",
                  "No points expire within 30 days. Points stay valid for 365 days from the grant date.",
                )}
          </p>
        </article>

        <article className="rounded-3xl border border-line bg-panel p-6">
          <ShoppingBag size={20} className="text-accent" aria-hidden />
          <p className="mt-4 text-xs font-bold text-fg-3">{t("포인트로 산 에셋", "Assets bought with points")}</p>
          <p className="mt-1 text-3xl font-black text-fg">
            {number.format(ownedSpends.length)}
            <span className="ml-1 text-base font-bold text-fg-3">{t("개", "")}</span>
          </p>
          <Link
            to="/market/library"
            className="mt-3 inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-accent"
          >
            {t("내 에셋 관리", "My assets")}
            <ArrowRight size={14} aria-hidden />
          </Link>
        </article>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-[1fr_1fr]">
        <article className="rounded-3xl border border-line bg-panel p-6">
          <div className="flex items-center gap-2">
            <Coins size={18} className="text-accent" aria-hidden />
            <h2 className="text-xl font-black text-fg">{t("포인트 쌓는 법", "How to earn")}</h2>
          </div>
          <div className="mt-5 space-y-3">
            {Object.values(ASSET_POINT_EARN_RULES).map((rule) => {
              const usedToday = countEarnsToday(events, rule.key, new Date());
              const remaining = Math.max(0, rule.dailyLimit - usedToday);
              return (
                <div key={rule.key} className="rounded-2xl border border-line bg-card/45 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-bold text-fg">{t(rule.labelKo, rule.labelEn)}</span>
                    <span className="text-xs font-black text-accent">+{rule.points}P</span>
                  </div>
                  <p className="mt-1 text-xs text-fg-3">
                    {rule.status === "live"
                      ? t(
                          `하루 ${rule.dailyLimit}회까지 · 오늘 ${remaining}회 남음`,
                          `Up to ${rule.dailyLimit} a day · ${remaining} left today`,
                        )
                      : t("연결 준비 중입니다.", "Coming soon.")}
                  </p>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-xs leading-5 text-fg-3">
            {t(
              "작품 공개·댓글 같은 활동 포인트는 서버 멤버십 지갑에 따로 쌓입니다.",
              "Activity points for publishing and comments are tracked separately in the server membership wallet.",
            )}{" "}
            <Link to="/membership/usage" className="font-bold text-accent">
              {t("멤버십 이용 내역에서 보기", "See membership usage")}
            </Link>
          </p>
        </article>

        <article className="rounded-3xl border border-line bg-panel p-6">
          <div className="flex items-center gap-2">
            <History size={18} className="text-accent" aria-hidden />
            <h2 className="text-xl font-black text-fg">{t("적립·사용 내역", "History")}</h2>
          </div>
          {history.length === 0 ? (
            <p className="mt-5 rounded-2xl bg-card/45 p-4 text-sm text-fg-2">
              {t(
                "아직 내역이 없습니다. 오늘의 로그인 보너스부터 시작해 보세요.",
                "No history yet. Your daily login bonus is a good start.",
              )}
            </p>
          ) : (
            <ul className="mt-5 space-y-2">
              {history.map((event) => (
                <li
                  key={event.id}
                  className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-card/45 p-3.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-fg">{eventLabel(event, t)}</p>
                    <p className="mt-0.5 text-xs text-fg-3">
                      {new Date(event.occurredAt).toLocaleString(locale)}
                    </p>
                  </div>
                  <span
                    className={
                      event.kind === "spend"
                        ? "shrink-0 text-sm font-black text-fg-2"
                        : "shrink-0 text-sm font-black text-good"
                    }
                  >
                    {event.kind === "spend" ? "−" : "+"}
                    {number.format(event.amount)}P
                  </span>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="mt-8 flex items-start gap-3 rounded-3xl border border-line bg-panel p-5">
        <Info className="mt-0.5 shrink-0 text-fg-3" size={18} aria-hidden />
        <p className="text-xs leading-6 text-fg-2">
          {t(
            "스튜디오 포인트는 현금성 재화가 아닙니다. 충전·환전·양도·환불 대상이 아니며, 지급일로부터 365일이 지나면 만료됩니다. 사용할 때는 만료가 가까운 포인트부터 먼저 차감됩니다.",
            "Studio Points are not a cash equivalent. They cannot be purchased, cashed out, transferred, or refunded, and they expire 365 days after they are granted. Points closest to expiry are spent first.",
          )}
        </p>
      </section>
    </Container>
  );
}

export default AssetPointsWalletPage;
