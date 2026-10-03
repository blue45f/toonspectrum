import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Database,
  Gauge,
  RefreshCw,
  UploadCloud,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  getMembershipOperationsOverview,
  markMembershipNoticeSeen,
  type MembershipOperationsOverview,
} from "@/platform/membership-operations-client";
import { Container } from "@/shared/components/section";
import { SitePageHeader } from "@/domains/legal/public/site-page-header";
import { ActionableEmptyState } from "@/shared/components/ActionableEmptyState";
import { LoadingState } from "@/shared/components/LoadingState";
import { SectionArt } from "@/shared/components/section-art";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useI18n } from "@/shared/lib/i18n-core";
import { useApp } from "@/shared/lib/store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";
import { MEMBERSHIP_PLAN_POLICIES } from "@toonstudio/core/membership-wallet";

function useNumberLocale(): Intl.NumberFormat {
  const lang = useI18n((state) => state.lang);
  const locale = lang === "ko" ? "ko-KR" : "en-US";
  return useMemo(() => new Intl.NumberFormat(locale), [locale]);
}

function formatBytes(bytes: number, number: Intl.NumberFormat): string {
  if (bytes >= 1_000_000_000) {
    return `${number.format(bytes / 1_000_000_000)} GB`;
  }
  if (bytes >= 1_000_000) {
    return `${number.format(bytes / 1_000_000)} MB`;
  }
  return `${number.format(Math.max(0, Math.round(bytes / 1_000)))} KB`;
}

function percent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 100)));
}

export function MembershipUsagePage() {
  const t = useBilingual("MembershipUsagePage");
  const lang = useI18n((state) => state.lang);
  const locale = lang === "ko" ? "ko-KR" : "en-US";
  const number = useNumberLocale();
  const userId = useApp((state) => state.userId);
  const [overview, setOverview] = useState<MembershipOperationsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activityLabels: Record<string, string> = {
    "creator.work.created": t("새 작품 만들기", "Create a new work"),
    "creator.work.published": t("작품 공개", "Publish a work"),
    "community.post.created": t("커뮤니티 글", "Community post"),
    "community.comment.created": t("댓글", "Comment"),
    "fortune.used": t("운세", "Fortune"),
    "playground.used": t("놀이터", "Playground"),
  };

  const load = useCallback(async () => {
    try {
      setError(null);
      setOverview(await getMembershipOperationsOverview());
    } catch {
      setError(t("멤버십 사용량을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.", "Could not load membership usage. Please try again later."));
    }
  }, [t]);

  useEffect(() => {
    if (!userId) {
      setOverview(null);
      return;
    }
    void load();
  }, [userId, load]);

  const unseen = useMemo(
    () => overview?.notices.filter((notice) => !notice.seenAt) ?? [],
    [overview],
  );

  if (!userId) {
    return (
      <Container size="prose" className="py-10 sm:py-16">
        <SitePageHeader
          surface="plain"
          icon={Gauge}
          eyebrow="MEMBERSHIP USAGE"
          title={t("내 멤버십 사용량", "My membership usage")}
          description={t("저장공간과 활동 포인트 사용량은 로그인 후 확인할 수 있습니다.", "You can check your storage and activity point usage after signing in.")}
        />
        <button
          type="button"
          onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "membership-usage", mode: "login" })}
          className={buttonClass({ className: "mt-6" })}
        >
          {t("로그인하기", "Sign in")}
        </button>
      </Container>
    );
  }

  return (
    <Container className="py-8 sm:py-14">
      <SitePageHeader
        icon={Gauge}
        eyebrow="MEMBERSHIP USAGE"
        title={t("내 멤버십 사용량", "My membership usage")}
        description={t("실제 서버에 저장된 Studio 자산, 오늘 업로드량, 활동 포인트 적립 잔여량을 확인합니다. 멤버십이 낮아져 한도를 넘더라도 기존 데이터는 자동 삭제하지 않습니다.", "Check your Studio assets stored on the server, today's upload volume, and remaining activity points. Even if your membership drops and you exceed limits, existing data is never deleted automatically.")}
        aside={
          <SectionArt
            image="studio-lobby"
            className="aspect-[16/10] w-full rounded-2xl border border-line object-cover"
          />
        }
        asideClassName="hidden md:block"
      />

      {error ? (
        <div
          className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-bad/30 bg-bad/5 p-4"
          role="alert"
        >
          <p className="text-sm text-bad">{error}</p>
          <button
            type="button"
            onClick={() => { void load(); }}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line px-3.5 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised"
          >
            <RefreshCw size={14} aria-hidden />
            {t("다시 시도", "Try again")}
          </button>
        </div>
      ) : null}

      {!overview && !error ? (
        <LoadingState
          variant="cards"
          cardCount={3}
          label={t("멤버십 사용량을 불러오는 중…", "Loading membership usage…")}
          className="mt-8"
        />
      ) : null}

      {overview ? (
        <>
          <section className="mt-8 grid gap-4 lg:grid-cols-3">
            <article className="rounded-3xl border border-line bg-panel p-6">
              <Database size={20} className="text-accent" aria-hidden />
              <p className="mt-4 text-xs font-bold text-fg-3">{t("저장공간", "Storage")}</p>
              <p className="mt-1 text-2xl font-black text-fg">
                {formatBytes(overview.storage.totalBytes, number)}
                <span className="ml-2 text-sm font-semibold text-fg-3">
                  / {formatBytes(overview.storage.limitBytes, number)}
                </span>
              </p>
              <div
                className="mt-4 h-2 overflow-hidden rounded-full bg-raised"
                role="progressbar"
                aria-label={t("저장공간 사용량", "Storage usage")}
                aria-valuenow={percent(overview.storage.usageRatio)}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${percent(overview.storage.usageRatio)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-fg-3">
                {t(`${percent(overview.storage.usageRatio)}% 사용 · ${MEMBERSHIP_PLAN_POLICIES[overview.membership.planId].label}`, `${percent(overview.storage.usageRatio)}% used · ${MEMBERSHIP_PLAN_POLICIES[overview.membership.planId].label}`)}
              </p>
            </article>

            <article className="rounded-3xl border border-line bg-panel p-6">
              <UploadCloud size={20} className="text-accent" aria-hidden />
              <p className="mt-4 text-xs font-bold text-fg-3">{t("오늘 업로드", "Uploaded today")}</p>
              <p className="mt-1 text-2xl font-black text-fg">
                {formatBytes(overview.upload.todayBytes, number)}
                <span className="ml-2 text-sm font-semibold text-fg-3">
                  / {formatBytes(overview.upload.dailyLimitBytes, number)}
                </span>
              </p>
              <p className="mt-3 text-xs leading-5 text-fg-3">
                {t(`오늘 남은 용량 ${formatBytes(overview.upload.remainingTodayBytes, number)}`, `Remaining today: ${formatBytes(overview.upload.remainingTodayBytes, number)}`)}
                <br />
                {t(`파일 1개 최대 ${formatBytes(overview.upload.fileMaxBytes, number)}`, `Max per file: ${formatBytes(overview.upload.fileMaxBytes, number)}`)}
              </p>
            </article>

            <article className="rounded-3xl border border-line bg-panel p-6">
              <CalendarClock size={20} className="text-accent" aria-hidden />
              <p className="mt-4 text-xs font-bold text-fg-3">{t("멤버십 상태", "Membership status")}</p>
              <p className="mt-1 text-2xl font-black uppercase text-fg">
                {MEMBERSHIP_PLAN_POLICIES[overview.membership.planId].label}
              </p>
              <p className="mt-3 text-xs leading-5 text-fg-3">
                {overview.membership.daysUntilExpiry === null
                  ? t("현재 만료 예정 없음", "No expiry scheduled")
                  : t(`만료까지 ${overview.membership.daysUntilExpiry}일`, `${overview.membership.daysUntilExpiry} days until expiry`)}
              </p>
            </article>
          </section>

          {overview.storage.status !== "normal" ? (
            <section className="mt-5 rounded-3xl border border-warn/35 bg-warn/5 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 shrink-0 text-warn" size={20} aria-hidden />
                <div>
                  <h2 className="font-bold text-fg">
                    {overview.storage.status === "warning"
                      ? t("저장공간 한도에 가까워지고 있습니다.", "You are approaching your storage limit.")
                      : overview.storage.status === "grace"
                        ? t("현재 멤버십 저장공간 한도를 초과했습니다.", "You have exceeded your membership storage limit.")
                        : t("새 업로드가 제한된 상태입니다.", "New uploads are currently restricted.")}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-fg-2">
                    {t("기존 작품과 파일은 자동 삭제되지 않습니다. 새 업로드는 한도 이하로 정리될 때까지 제한될 수 있습니다.", "Existing works and files are never deleted automatically. New uploads may be restricted until usage is back under the limit.")}
                    {overview.storage.graceEndsAt
                      ? t(` 데이터 보존 유예 상태 기준일: ${new Date(overview.storage.graceEndsAt).toLocaleDateString(locale)}.`, ` Data retention grace reference date: ${new Date(overview.storage.graceEndsAt).toLocaleDateString(locale)}.`)
                      : ""}
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_1fr]">
            <section aria-labelledby="membership-activity-title" className="rounded-3xl border border-line bg-panel p-6">
              <div className="flex items-center gap-2">
                <Gauge size={18} className="text-accent" aria-hidden />
                <h2 id="membership-activity-title" className="text-xl font-black text-fg">{t("오늘의 활동 포인트", "Today's activity points")}</h2>
              </div>
              {Object.keys(overview.activityRewards).length === 0 ? (
                <ActionableEmptyState
                  art="none"
                  icon={Gauge}
                  className="mt-5 p-4 sm:p-5"
                  title={t("오늘 적립할 수 있는 활동이 없습니다", "No earning activities today")}
                  description={t("작품을 만들거나 커뮤니티에 참여하면 이곳에 활동 포인트 현황이 표시됩니다.", "Create a work or join the community and your activity point status will appear here.")}
                  primary={{ href: "/studio", label: t("스튜디오 열기", "Open Studio") }}
                />
              ) : (
              <div className="mt-5 space-y-3">
                {Object.entries(overview.activityRewards).map(([key, usage]) => (
                  <div key={key} className="rounded-2xl border border-line bg-card/45 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-fg">
                        {activityLabels[key] ?? key}
                      </span>
                      <span className="text-xs font-black text-accent">
                        {t(`${usage.remaining}회 남음`, `${usage.remaining} left`)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-fg-3">
                      {t(`오늘 ${usage.used} / ${usage.limit}회 적립`, `Earned ${usage.used} / ${usage.limit} today`)}
                    </p>
                  </div>
                ))}
              </div>
              )}
            </section>

            <section aria-labelledby="membership-notices-title" className="rounded-3xl border border-line bg-panel p-6">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-accent" aria-hidden />
                <h2 id="membership-notices-title" className="text-xl font-black text-fg">{t("멤버십 알림", "Membership notices")}</h2>
              </div>
              {overview.notices.length === 0 ? (
                <div className="mt-5 flex items-center gap-2 rounded-2xl bg-card/45 p-4 text-sm text-fg-2">
                  <CheckCircle2 size={18} className="text-good" aria-hidden />
                  {t("확인할 알림이 없습니다.", "No notices to review.")}
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {overview.notices.map((notice) => (
                    <button
                      key={notice.id}
                      type="button"
                      className="w-full rounded-2xl border border-line bg-card/45 p-4 text-left disabled:opacity-60"
                      disabled={Boolean(notice.seenAt)}
                      onClick={async () => {
                        await markMembershipNoticeSeen(notice.id);
                        await load();
                      }}
                    >
                      <span className="text-sm font-bold text-fg">
                        {notice.type === "membership_expiring"
                          ? t("멤버십 만료 예정", "Membership expiring soon")
                          : notice.type === "storage_warning"
                            ? t("저장공간 80% 이상 사용", "Storage over 80% used")
                            : notice.type === "storage_read_only"
                              ? t("저장공간 업로드 제한", "Storage uploads restricted")
                              : t("저장공간 한도 초과", "Storage limit exceeded")}
                      </span>
                      <span className="mt-1 block text-xs text-fg-3">
                        {new Date(notice.createdAt).toLocaleString(locale)}
                        {notice.seenAt ? t(" · 확인함", " · Seen") : t(" · 눌러서 확인", " · Tap to acknowledge")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {unseen.length > 0 ? (
                <p className="mt-3 text-xs font-semibold text-accent">
                  {t(`확인하지 않은 알림 ${unseen.length}개`, `${unseen.length} unread notices`)}
                </p>
              ) : null}
            </section>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/membership"
              className="inline-flex min-h-11 items-center rounded-xl border border-line-strong px-4 text-sm font-bold text-fg"
            >
              {t("전체 멤버십 정책", "Full membership policy")}
            </Link>
            <Link
              to="/account/points"
              className="inline-flex min-h-11 items-center rounded-xl border border-line-strong px-4 text-sm font-bold text-fg"
            >
              {t("포인트 지갑 보기", "Open points wallet")}
            </Link>
            <Link
              to="/studio"
              className="inline-flex min-h-11 items-center rounded-xl bg-fg px-4 text-sm font-bold text-canvas"
            >
              {t("Studio로 이동", "Go to Studio")}
            </Link>
          </div>
        </>
      ) : null}
    </Container>
  );
}

export default MembershipUsagePage;
