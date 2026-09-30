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
import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { useI18n } from "@/shared/lib/i18n-core";
import { useApp } from "@/shared/lib/store";
import { requestAuthModalOpen } from "@/domains/auth/public/session/auth-modal-intent";

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
        <h1 className="text-3xl font-black text-fg">{t("내 멤버십 사용량", "My membership usage")}</h1>
        <p className="mt-4 text-sm leading-6 text-fg-2">
          {t("저장공간과 활동 포인트 사용량은 로그인 후 확인할 수 있습니다.", "You can check your storage and activity point usage after signing in.")}
        </p>
        <button
          type="button"
          onClick={() => requestAuthModalOpen({ reason: "protected-action", source: "membership-usage", mode: "login" })}
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
        <p className="text-xs font-black tracking-[0.14em] text-accent">
          MEMBERSHIP USAGE
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-fg sm:text-5xl">
          {t("내 멤버십 사용량", "My membership usage")}
        </h1>
        <p className="mt-4 text-sm leading-7 text-fg-2">
          {t("실제 서버에 저장된 Studio 자산, 오늘 업로드량, 활동 포인트 적립 잔여량을 확인합니다. 멤버십이 낮아져 한도를 넘더라도 기존 데이터는 자동 삭제하지 않습니다.", "Check your Studio assets stored on the server, today's upload volume, and remaining activity points. Even if your membership drops and you exceed limits, existing data is never deleted automatically.")}
        </p>
      </header>

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
        <div className="mt-8" role="status">
          <span className="sr-only">{t("멤버십 사용량을 불러오는 중…", "Loading membership usage…")}</span>
          <div className="grid gap-4 lg:grid-cols-3" aria-hidden>
            {[0, 1, 2].map((index) => (
              <div key={index} className="rounded-3xl border border-line bg-panel p-6">
                <span className="skeleton mb-4 block h-5 w-16 rounded" />
                <span className="skeleton mb-2 block h-8 w-32 rounded" />
                <span className="skeleton mb-3 block h-2 w-full rounded-full" />
                <span className="skeleton block h-4 w-24 rounded" />
              </div>
            ))}
          </div>
        </div>
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
                {t(`${percent(overview.storage.usageRatio)}% 사용 · ${overview.membership.plan.label}`, `${percent(overview.storage.usageRatio)}% used · ${overview.membership.plan.label}`)}
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
                {overview.membership.plan.label}
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

          <section className="mt-8 grid gap-5 lg:grid-cols-[1fr_1fr]">
            <article className="rounded-3xl border border-line bg-panel p-6">
              <div className="flex items-center gap-2">
                <Gauge size={18} className="text-accent" aria-hidden />
                <h2 className="text-xl font-black text-fg">{t("오늘의 활동 포인트", "Today's activity points")}</h2>
              </div>
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
            </article>

            <article className="rounded-3xl border border-line bg-panel p-6">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-accent" aria-hidden />
                <h2 className="text-xl font-black text-fg">{t("멤버십 알림", "Membership notices")}</h2>
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
            </article>
          </section>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/membership"
              className="inline-flex min-h-11 items-center rounded-xl border border-line-strong px-4 text-sm font-bold text-fg"
            >
              {t("전체 멤버십 정책", "Full membership policy")}
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
