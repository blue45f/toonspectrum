import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CheckCircle2,
  Database,
  Gauge,
  UploadCloud,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  getMembershipOperationsOverview,
  markMembershipNoticeSeen,
  type MembershipOperationsOverview,
} from "@/platform/membership-operations-client";
import { Container } from "@/shared/components/section";
import { useApp } from "@/shared/lib/store";

const number = new Intl.NumberFormat("ko-KR");

function formatBytes(bytes: number): string {
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

const ACTIVITY_LABELS: Record<string, string> = {
  "creator.work.created": "새 작품 만들기",
  "creator.work.published": "작품 공개",
  "community.post.created": "커뮤니티 글",
  "community.comment.created": "댓글",
  "fortune.used": "운세",
  "playground.used": "놀이터",
};

export function MembershipUsagePage() {
  const userId = useApp((state) => state.userId);
  const [overview, setOverview] = useState<MembershipOperationsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setOverview(await getMembershipOperationsOverview());
    } catch {
      setError("멤버십 사용량을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };

  useEffect(() => {
    if (!userId) {
      setOverview(null);
      return;
    }
    void load();
  }, [userId]);

  const unseen = useMemo(
    () => overview?.notices.filter((notice) => !notice.seenAt) ?? [],
    [overview],
  );

  if (!userId) {
    return (
      <Container size="prose" className="py-10 sm:py-16">
        <h1 className="text-3xl font-black text-fg">내 멤버십 사용량</h1>
        <p className="mt-4 text-sm leading-6 text-fg-2">
          저장공간과 활동 포인트 사용량은 로그인 후 확인할 수 있습니다.
        </p>
        <Link
          to="/settings"
          className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-fg px-4 text-sm font-bold text-canvas"
        >
          설정으로 이동
        </Link>
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
          내 멤버십 사용량
        </h1>
        <p className="mt-4 text-sm leading-7 text-fg-2">
          실제 서버에 저장된 Studio 자산, 오늘 업로드량, 활동 포인트 적립 잔여량을 확인합니다.
          멤버십이 낮아져 한도를 넘더라도 기존 데이터는 자동 삭제하지 않습니다.
        </p>
      </header>

      {error ? (
        <div className="mt-6 rounded-2xl border border-bad/30 bg-bad/5 p-4 text-sm text-bad">
          {error}
        </div>
      ) : null}

      {!overview && !error ? (
        <div className="mt-8 rounded-2xl border border-line bg-panel p-6 text-sm text-fg-2">
          사용량을 계산하고 있습니다…
        </div>
      ) : null}

      {overview ? (
        <>
          <section className="mt-8 grid gap-4 lg:grid-cols-3">
            <article className="rounded-3xl border border-line bg-panel p-6">
              <Database size={20} className="text-accent" aria-hidden />
              <p className="mt-4 text-xs font-bold text-fg-3">저장공간</p>
              <p className="mt-1 text-2xl font-black text-fg">
                {formatBytes(overview.storage.totalBytes)}
                <span className="ml-2 text-sm font-semibold text-fg-3">
                  / {formatBytes(overview.storage.limitBytes)}
                </span>
              </p>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-raised">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${percent(overview.storage.usageRatio)}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-fg-3">
                {percent(overview.storage.usageRatio)}% 사용 · {overview.membership.planId.toUpperCase()}
              </p>
            </article>

            <article className="rounded-3xl border border-line bg-panel p-6">
              <UploadCloud size={20} className="text-accent" aria-hidden />
              <p className="mt-4 text-xs font-bold text-fg-3">오늘 업로드</p>
              <p className="mt-1 text-2xl font-black text-fg">
                {formatBytes(overview.upload.todayBytes)}
                <span className="ml-2 text-sm font-semibold text-fg-3">
                  / {formatBytes(overview.upload.dailyLimitBytes)}
                </span>
              </p>
              <p className="mt-3 text-xs leading-5 text-fg-3">
                오늘 남은 용량 {formatBytes(overview.upload.remainingTodayBytes)}
                <br />
                파일 1개 최대 {formatBytes(overview.upload.fileMaxBytes)}
              </p>
            </article>

            <article className="rounded-3xl border border-line bg-panel p-6">
              <CalendarClock size={20} className="text-accent" aria-hidden />
              <p className="mt-4 text-xs font-bold text-fg-3">멤버십 상태</p>
              <p className="mt-1 text-2xl font-black uppercase text-fg">
                {overview.membership.planId}
              </p>
              <p className="mt-3 text-xs leading-5 text-fg-3">
                {overview.membership.daysUntilExpiry === null
                  ? "현재 만료 예정 없음"
                  : `만료까지 ${overview.membership.daysUntilExpiry}일`}
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
                      ? "저장공간 한도에 가까워지고 있습니다."
                      : overview.storage.status === "grace"
                        ? "현재 멤버십 저장공간 한도를 초과했습니다."
                        : "새 업로드가 제한된 상태입니다."}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-fg-2">
                    기존 작품과 파일은 자동 삭제되지 않습니다. 새 업로드는 한도 이하로 정리될 때까지
                    제한될 수 있습니다.
                    {overview.storage.graceEndsAt
                      ? ` 데이터 보존 유예 상태 기준일: ${new Date(overview.storage.graceEndsAt).toLocaleDateString("ko-KR")}.`
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
                <h2 className="text-xl font-black text-fg">오늘의 활동 포인트</h2>
              </div>
              <div className="mt-5 space-y-3">
                {Object.entries(overview.activityRewards).map(([key, usage]) => (
                  <div key={key} className="rounded-2xl border border-line bg-card/45 p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-fg">
                        {ACTIVITY_LABELS[key] ?? key}
                      </span>
                      <span className="text-xs font-black text-accent">
                        {usage.remaining}회 남음
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-fg-3">
                      오늘 {usage.used} / {usage.limit}회 적립
                    </p>
                  </div>
                ))}
              </div>
            </article>

            <article className="rounded-3xl border border-line bg-panel p-6">
              <div className="flex items-center gap-2">
                <Bell size={18} className="text-accent" aria-hidden />
                <h2 className="text-xl font-black text-fg">멤버십 알림</h2>
              </div>
              {overview.notices.length === 0 ? (
                <div className="mt-5 flex items-center gap-2 rounded-2xl bg-card/45 p-4 text-sm text-fg-2">
                  <CheckCircle2 size={18} className="text-good" aria-hidden />
                  확인할 알림이 없습니다.
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
                          ? "멤버십 만료 예정"
                          : notice.type === "storage_warning"
                            ? "저장공간 80% 이상 사용"
                            : notice.type === "storage_read_only"
                              ? "저장공간 업로드 제한"
                              : "저장공간 한도 초과"}
                      </span>
                      <span className="mt-1 block text-xs text-fg-3">
                        {new Date(notice.createdAt).toLocaleString("ko-KR")}
                        {notice.seenAt ? " · 확인함" : " · 눌러서 확인"}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {unseen.length > 0 ? (
                <p className="mt-3 text-xs font-semibold text-accent">
                  확인하지 않은 알림 {unseen.length}개
                </p>
              ) : null}
            </article>
          </section>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/membership"
              className="inline-flex min-h-11 items-center rounded-xl border border-line-strong px-4 text-sm font-bold text-fg"
            >
              전체 멤버십 정책
            </Link>
            <Link
              to="/studio"
              className="inline-flex min-h-11 items-center rounded-xl bg-fg px-4 text-sm font-bold text-canvas"
            >
              Studio로 이동
            </Link>
          </div>
        </>
      ) : null}
    </Container>
  );
}

export default MembershipUsagePage;
