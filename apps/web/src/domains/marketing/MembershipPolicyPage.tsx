import {
  BadgeCheck,
  Coins,
  Database,
  Gauge,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useEffect, useState } from "react";

import {
  ACTIVITY_POINT_POLICIES,
  CREATOR_LEVEL_AUTO_POLICIES,
  MEMBERSHIP_ECONOMY_POLICY,
  MEMBERSHIP_PLAN_POLICIES,
} from "../../../../../packages/core/src/membership-wallet";

import Link from "@/compat/router-link";
import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/hooks/use-document-title";
import {
  getMembershipCatalog,
  getMembershipOverview,
  type MembershipCatalog,
  type MembershipOverview,
} from "@/infrastructure/membership-wallet-client";
import { useApp } from "@/shared/lib/store";

const number = new Intl.NumberFormat("ko-KR");
const creatorLevelLabels: Record<string, string> = {
  new: "New",
  verified: "Verified",
  active: "Active Creator",
  trusted: "Trusted Creator",
  professional: "Professional",
  partner: "Partner",
};

function formatBytes(bytes: number): string {
  if (bytes >= 1_000_000_000) {
    return `${number.format(bytes / 1_000_000_000)} GB`;
  }
  return `${number.format(bytes / 1_000_000)} MB`;
}

function formatLimit(value: number | boolean, unit = ""): string {
  if (typeof value === "boolean") return value ? "지원" : "미지원";
  return `${number.format(value)}${unit}`;
}

export function MembershipPolicyPage() {
  const userId = useApp((state) => state.userId);
  const [overview, setOverview] = useState<MembershipOverview | null>(null);
  const [catalog, setCatalog] = useState<MembershipCatalog | null>(null);

  const title = "멤버십 · 포인트 · 용량 정책";
  const description =
    "ToonSpectrum의 활동 포인트, 멤버십 등급, 저장공간·업로드·협업 한도를 한곳에서 확인하세요.";

  useDocumentTitle(title);
  useMetaDescription(description);
  usePageSocialMeta({ canonicalPath: "/membership", title, description });

  useEffect(() => {
    let cancelled = false;
    void getMembershipCatalog()
      .then((result) => {
        if (!cancelled) setCatalog(result);
      })
      .catch(() => {
        if (!cancelled) setCatalog(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setOverview(null);
      return;
    }
    let cancelled = false;
    void getMembershipOverview()
      .then((result) => {
        if (!cancelled) setOverview(result);
      })
      .catch(() => {
        if (!cancelled) setOverview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const plans = catalog?.plans ?? Object.values(MEMBERSHIP_PLAN_POLICIES);
  const activities = catalog?.activityRewards
    ?? Object.values(ACTIVITY_POINT_POLICIES);
  const economy = catalog?.economy ?? MEMBERSHIP_ECONOMY_POLICY;

  return (
    <main className="min-h-[calc(100dvh-var(--site-header-height,4.25rem))] bg-canvas px-4 py-10 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-7xl">
        <header className="relative overflow-hidden rounded-[2rem] border border-line-strong bg-panel p-6 sm:p-9">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,oklch(0.75_0.16_70/0.12),transparent_32%),radial-gradient(circle_at_10%_95%,oklch(0.7_0.18_315/0.10),transparent_36%)]" />
          <div className="relative max-w-4xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-soft px-3 py-1 text-xs font-black tracking-[0.14em] text-accent">
              <Sparkles size={14} aria-hidden /> MEMBERSHIP & FAIR USE
            </p>
            <h1 className="mt-5 font-display text-4xl font-black tracking-[-0.04em] text-fg sm:text-6xl">
              많이 쓰게 만들기보다,
              <br />
              오래 창작할 수 있게.
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-fg-2 sm:text-lg">
              현재는 실제 결제를 받지 않습니다. 활동 보상은 Reward Point로,
              향후 ToonSpectrum이 비용을 부담하는 AI·서버 렌더에는 Studio Credit을 사용합니다.
              개인 API 키·Creator Runtime·브라우저 로컬 작업에는 Credit을 차감하지 않습니다.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full border border-line bg-card px-3 py-2">
                결제 비활성
              </span>
              <span className="rounded-full border border-line bg-card px-3 py-2">
                현금성 포인트 아님
              </span>
              <span className="rounded-full border border-line bg-card px-3 py-2">
                베타도 공정 사용 한도 적용
              </span>
            </div>
          </div>
        </header>

        {overview && (
          <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="내 멤버십 현황">
            <article className="rounded-2xl border border-line bg-panel p-5">
              <BadgeCheck className="text-accent" size={20} aria-hidden />
              <p className="mt-3 text-xs font-bold text-fg-3">현재 멤버십</p>
              <p className="mt-1 text-2xl font-black text-fg">{overview.membership.plan.label}</p>
            </article>
            <article className="rounded-2xl border border-line bg-panel p-5">
              <Coins className="text-accent" size={20} aria-hidden />
              <p className="mt-3 text-xs font-bold text-fg-3">사용 가능 포인트</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-fg">
                {number.format(overview.wallet.points.available)} P
              </p>
            </article>
            <article className="rounded-2xl border border-line bg-panel p-5">
              <Sparkles className="text-accent" size={20} aria-hidden />
              <p className="mt-3 text-xs font-bold text-fg-3">Studio Credit</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-fg">
                {number.format(overview.wallet.studioCredits.available)} C
              </p>
              <p className="mt-1 text-xs text-fg-3">
                월 {number.format(overview.creditCycle.monthlyIncluded)} C · 오늘 잔여 {number.format(overview.creditCycle.remainingToday)} C
              </p>
            </article>
            <article className="rounded-2xl border border-line bg-panel p-5">
              <Gauge className="text-accent" size={20} aria-hidden />
              <p className="mt-3 text-xs font-bold text-fg-3">누적 활동 포인트</p>
              <p className="mt-1 text-2xl font-black tabular-nums text-fg">
                {number.format(overview.wallet.points.lifetimeGranted)} P
              </p>
            </article>
          </section>
        )}

        {overview && (
          <section className="mt-10 rounded-3xl border border-line bg-panel p-6 sm:p-8" aria-labelledby="creator-level-title">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black tracking-[0.14em] text-accent">CREATOR LEVEL</p>
                <h2 id="creator-level-title" className="mt-2 text-2xl font-black text-fg">
                  활동과 검증을 분리한 창작자 등급
                </h2>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-fg-2">
                  결제 멤버십과 창작자 등급은 별개입니다. Creator 인증, 공개 작품 수,
                  서버가 확인한 정상 활동 포인트로 자동 등급을 계산하고 Partner는 운영 검토로만 부여합니다.
                </p>
              </div>
              <span className="rounded-full border border-accent/30 bg-accent-soft px-4 py-2 text-sm font-black text-accent">
                {creatorLevelLabels[overview.creatorProgress.effectiveLevel] ?? overview.creatorProgress.effectiveLevel}
              </span>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-card/55 p-4">
                <p className="text-xs font-bold text-fg-3">Creator 인증</p>
                <p className="mt-1 font-black text-fg">
                  {overview.creatorProgress.metrics.verifiedCreator ? "완료" : "필요"}
                </p>
              </div>
              <div className="rounded-2xl bg-card/55 p-4">
                <p className="text-xs font-bold text-fg-3">공개 작품</p>
                <p className="mt-1 font-black text-fg">
                  {number.format(overview.creatorProgress.metrics.publishedWorks)}개
                </p>
              </div>
              <div className="rounded-2xl bg-card/55 p-4">
                <p className="text-xs font-bold text-fg-3">등급 산정 활동 포인트</p>
                <p className="mt-1 font-black text-fg">
                  {number.format(overview.creatorProgress.metrics.activityPoints)} P
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-4">
              {Object.entries(CREATOR_LEVEL_AUTO_POLICIES)
                .filter(([level]) => level !== "new")
                .map(([level, policy]) => (
                  <div key={level} className="rounded-2xl border border-line bg-card/35 p-4 text-sm">
                    <p className="font-black text-fg">{creatorLevelLabels[level] ?? level}</p>
                    <p className="mt-2 text-xs leading-5 text-fg-3">
                      Creator 인증 {policy.verifiedCreator ? "필수" : "선택"}
                      {policy.publishedWorks > 0 ? ` · 공개 작품 ${number.format(policy.publishedWorks)}+` : ""}
                      {policy.activityPoints > 0 ? ` · 활동 ${number.format(policy.activityPoints)}P+` : ""}
                    </p>
                  </div>
                ))}
            </div>
            <p className="mt-4 text-xs leading-5 text-fg-3">
              Trust Level과 Seller Level은 신고·저작권·판매자 검증 등 별도 운영 신호로 관리하며,
              Creator Level과 합산하지 않습니다. 관리자 수동 등급이 있으면 자동 계산이 덮어쓰지 않습니다.
            </p>
          </section>
        )}

        <section className="mt-10" aria-labelledby="membership-plan-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black tracking-[0.14em] text-accent">RESOURCE POLICY</p>
              <h2 id="membership-plan-title" className="mt-2 text-3xl font-black tracking-tight text-fg">
                멤버십별 자원 한도
              </h2>
            </div>
            <Database className="hidden text-fg-3 sm:block" size={28} aria-hidden />
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-fg-2">
            한도는 과도한 저장·업로드로 전체 서비스가 느려지는 것을 막기 위한 공정 사용 기준입니다.
            저장공간 80%부터 사전 경고하고, 100%를 넘는 새 저장은 차단합니다.
          </p>

          <div className="mt-6 grid gap-4 lg:grid-cols-4">
            {plans.map((plan) => (
              <article key={plan.id} className="rounded-2xl border border-line bg-panel p-5">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-accent">{plan.label}</p>
                <p className="mt-2 min-h-12 text-sm leading-6 text-fg-2">{plan.description}</p>
                <dl className="mt-5 space-y-3 text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-3">저장공간</dt>
                    <dd className="font-bold text-fg">
                      {formatBytes(Number(plan.entitlements["storage.bytes"]))}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-3">월 Studio Credit</dt>
                    <dd className="font-bold text-fg">
                      {number.format(Number(plan.entitlements["credit.monthlyIncluded"]))} C
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-3">일일 Credit 한도</dt>
                    <dd className="font-bold text-fg">
                      {number.format(Number(plan.entitlements["credit.dailyLimit"]))} C
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-3">파일 1개</dt>
                    <dd className="font-bold text-fg">
                      {formatBytes(Number(plan.entitlements["upload.file.maxBytes"]))}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-3">일일 업로드</dt>
                    <dd className="font-bold text-fg">
                      {formatBytes(Number(plan.entitlements["upload.daily.maxBytes"]))}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-3">협업 멤버</dt>
                    <dd className="font-bold text-fg">
                      {formatLimit(plan.entitlements["collaboration.members"], "명")}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-3">버전 보관</dt>
                    <dd className="font-bold text-fg">
                      {formatLimit(plan.entitlements["retention.versionsDays"], "일")}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-fg-3">고해상도 내보내기</dt>
                    <dd className="font-bold text-fg">
                      {formatLimit(plan.entitlements["export.highResolution"])}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent">
                <Coins size={20} aria-hidden />
              </span>
              <div>
                <p className="text-xs font-black tracking-[0.12em] text-accent">ACTIVITY POINTS</p>
                <h2 className="mt-1 text-2xl font-black text-fg">활동하면 쌓이는 포인트</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-fg-2">
              포인트는 구매 재화나 현금과 같은 가치가 아닙니다. 작품과 커뮤니티를 건강하게
              사용하는 활동을 기록하기 위한 서비스 보상이며, 반복 자동화·도배를 막기 위해
              활동별 일일 적립 횟수와 재적립 대기시간을 둡니다.
            </p>
            <div className="mt-6 divide-y divide-line/70 rounded-2xl border border-line bg-card/45 px-4">
              {activities.map((activity) => (
                <div key={activity.key} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-5">
                  <div>
                    <p className="font-bold text-fg">{activity.label}</p>
                    <p className="mt-1 text-xs text-fg-3">
                      하루 최대 {number.format(activity.dailyGrantLimit)}회 ·
                      {activity.cooldownSeconds > 0
                        ? ` ${number.format(activity.cooldownSeconds)}초 간격`
                        : " 별도 대기시간 없음"}
                    </p>
                  </div>
                  <span className="text-sm font-black text-accent">+{number.format(activity.points)} P</span>
                  <span className="text-xs font-semibold text-fg-3">
                    {activity.claimMode === "server" ? "서버 확인" : "이용 확인"}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <div className="space-y-4">
            <article className="rounded-3xl border border-line bg-panel p-6">
              <ShieldCheck className="text-accent" size={22} aria-hidden />
              <h2 className="mt-4 text-xl font-black text-fg">Studio Credit은 멤버십 포함분으로 운영합니다</h2>
              <p className="mt-3 text-sm leading-6 text-fg-2">
                매월 멤버십에 포함된 Studio Credit이 지급되며 다음 월로 이월되지 않습니다.
                플랜 승급 시에는 해당 월 목표량과의 차액만 추가 지급됩니다. 현재 운영 중인 개인
                API 키·개인 Creator Runtime·브라우저 로컬 작업에는 차감하지 않으며, 향후 플랫폼
                비용형 AI·서버 렌더 기능이 활성화될 때만 사용합니다. 추가 구매는 현재 비활성입니다.
              </p>
            </article>
            <article className="rounded-3xl border border-line bg-panel p-6">
              <UsersRound className="text-accent" size={22} aria-hidden />
              <h2 className="mt-4 text-xl font-black text-fg">멤버십은 현재 구매 상품이 아닙니다</h2>
              <p className="mt-3 text-sm leading-6 text-fg-2">
                현재 멤버십은 베타 혜택, 창작자 지원, 운영상 권한 부여에 사용하는 등급입니다.
                향후 결제를 도입하더라도 가격·환불·자동갱신 정책을 별도로 고지하기 전에는
                유료 구독으로 취급하지 않습니다.
              </p>
            </article>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-line bg-panel p-6 sm:p-8">
          <h2 className="text-2xl font-black text-fg">세부 운영 원칙</h2>
          <ul className="mt-5 grid gap-3 text-sm leading-6 text-fg-2 md:grid-cols-2">
            <li className="rounded-2xl bg-card/55 p-4">• 베타 무료 이용 중에도 저장공간·파일 크기·동시 처리량 같은 안전 한도는 유지됩니다.</li>
            <li className="rounded-2xl bg-card/55 p-4">• 표시된 파일 한도는 계정의 상위 한도입니다. PSD·3D·실시간 동기화 등 포맷별 안전 한도가 더 낮으면 해당 기능의 기술 한도가 우선합니다.</li>
            <li className="rounded-2xl bg-card/55 p-4">• 활동 포인트는 지급일로부터 {economy.pointExpiryDays ?? "무기한"}일 동안 유효하며, 만료가 가까운 무료 재화부터 먼저 사용합니다.</li>
            <li className="rounded-2xl bg-card/55 p-4">• 멤버십 Studio Credit은 월별로 새로 지급되고 이월되지 않으며, 플랜별 일일 사용 한도도 함께 적용됩니다.</li>
            <li className="rounded-2xl bg-card/55 p-4">• 같은 글·댓글·작품 ID는 중복 적립되지 않으며 활동별 하루 적립 횟수가 제한됩니다.</li>
            <li className="rounded-2xl bg-card/55 p-4">• 멤버십 상향은 포인트를 자동 소모하지 않으며, 현재는 베타·프로모션·운영 정책으로 별도 부여됩니다.</li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/settings" className="inline-flex min-h-11 items-center rounded-xl bg-fg px-4 text-sm font-bold text-canvas">
              내 설정 보기
            </Link>
            <Link href="/events" className="inline-flex min-h-11 items-center rounded-xl border border-line-strong px-4 text-sm font-bold text-fg">
              이벤트 혜택 보기
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}

export default MembershipPolicyPage;
