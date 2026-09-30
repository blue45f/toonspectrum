import {
  BadgeCheck,
  Coins,
  Database,
  Gauge,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import {
  ACTIVITY_POINT_POLICIES,
  CREATOR_LEVEL_AUTO_POLICIES,
  MEMBERSHIP_ECONOMY_POLICY,
  MEMBERSHIP_PLAN_POLICIES,
} from "../../../../../packages/core/src/membership-wallet";

import Link from "@/shared/navigation/router-link";
import { Container } from "@/shared/components/container";
import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";
import {
  getMembershipCatalog,
  getMembershipOverview,
  type MembershipCatalog,
  type MembershipOverview,
} from "@/platform/membership-wallet-client";
import { normalizeLocaleCode, useI18n, useT } from "@/shared/lib/i18n";
import {
  defineBilingualText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { useApp } from "@/shared/lib/store";

/**
 * 멤버십 정책 페이지의 한영 카피. 정적 정책 데이터(플랜 라벨·설명)는
 * packages/core의 정책 소스를 그대로 사용하고, UI 문구만 여기서 번역한다.
 */
const COPY = {
  docTitle: defineBilingualText(
    "membershipPolicy",
    "docTitle",
    "멤버십 · 포인트 · 용량 정책",
    "Membership · points · storage policy",
  ),
  docDescription: defineBilingualText(
    "membershipPolicy",
    "docDescription",
    "ToonStudio의 활동 포인트, 멤버십 등급, 저장공간·업로드·협업 한도를 한곳에서 확인하세요.",
    "Check ToonStudio activity points, membership tiers, and storage, upload, and collaboration limits in one place.",
  ),
  heroTitle: defineBilingualText(
    "membershipPolicy",
    "heroTitle",
    "많이 쓰게 만들기보다,\n오래 창작할 수 있게.",
    "Not built to make you use more,\nbut to let you create longer.",
  ),
  heroLede: defineBilingualText(
    "membershipPolicy",
    "heroLede",
    "현재는 실제 결제를 받지 않습니다. 활동 보상은 Reward Point로, 향후 ToonStudio이 비용을 부담하는 AI·서버 렌더에는 Studio Credit을 사용합니다. 개인 API 키·Creator Runtime·브라우저 로컬 작업에는 Credit을 차감하지 않습니다.",
    "We do not accept payments yet. Activity rewards are paid in Reward Points, and Studio Credits will cover platform-funded AI and server rendering in the future. Your own API keys, Creator Runtime, and browser-local work never consume Credits.",
  ),
  chipNoPayment: defineBilingualText("membershipPolicy", "chipNoPayment", "결제 비활성", "No payments active"),
  chipNotCash: defineBilingualText("membershipPolicy", "chipNotCash", "현금성 포인트 아님", "Not cash-like points"),
  chipFairUse: defineBilingualText(
    "membershipPolicy",
    "chipFairUse",
    "베타도 공정 사용 한도 적용",
    "Fair-use limits apply in beta too",
  ),
  overviewAria: defineBilingualText("membershipPolicy", "overviewAria", "내 멤버십 현황", "My membership status"),
  overviewPlan: defineBilingualText("membershipPolicy", "overviewPlan", "현재 멤버십", "Current membership"),
  overviewPoints: defineBilingualText("membershipPolicy", "overviewPoints", "사용 가능 포인트", "Available points"),
  overviewLifetime: defineBilingualText("membershipPolicy", "overviewLifetime", "누적 활동 포인트", "Lifetime activity points"),
  overviewCreditCycle: defineBilingualText(
    "membershipPolicy",
    "overviewCreditCycle",
    "월 {monthly} C · 오늘 잔여 {remaining} C",
    "{monthly} C per month · {remaining} C left today",
  ),
  overviewLoading: defineBilingualText(
    "membershipPolicy",
    "overviewLoading",
    "내 멤버십 정보를 불러오는 중입니다.",
    "Loading your membership info.",
  ),
  overviewError: defineBilingualText(
    "membershipPolicy",
    "overviewError",
    "내 멤버십 정보를 불러오지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.",
    "Couldn't load your membership info. Check your connection and try again.",
  ),
  retry: defineBilingualText("membershipPolicy", "retry", "다시 시도", "Retry"),
  ledgerTitle: defineBilingualText(
    "membershipPolicy",
    "ledgerTitle",
    "최근 포인트·Credit 내역",
    "Recent point & Credit history",
  ),
  ledgerRecent: defineBilingualText("membershipPolicy", "ledgerRecent", "최근 {count}건", "Latest {count}"),
  assetPoint: defineBilingualText("membershipPolicy", "assetPoint", "Reward Point", "Reward Point"),
  assetCredit: defineBilingualText("membershipPolicy", "assetCredit", "Studio Credit", "Studio Credit"),
  creatorTitle: defineBilingualText(
    "membershipPolicy",
    "creatorTitle",
    "활동과 검증을 분리한 창작자 등급",
    "Creator levels that separate activity from verification",
  ),
  creatorDescription: defineBilingualText(
    "membershipPolicy",
    "creatorDescription",
    "결제 멤버십과 창작자 등급은 별개입니다. Creator 인증, 공개 작품 수, 서버가 확인한 정상 활동 포인트로 자동 등급을 계산하고 Partner는 운영 검토로만 부여합니다.",
    "Paid membership and creator levels are separate. Levels are calculated automatically from Creator verification, published works, and server-confirmed activity points; Partner is granted by operations review only.",
  ),
  metricVerified: defineBilingualText("membershipPolicy", "metricVerified", "Creator 인증", "Creator verification"),
  metricVerifiedDone: defineBilingualText("membershipPolicy", "metricVerifiedDone", "완료", "Done"),
  metricVerifiedNeeded: defineBilingualText("membershipPolicy", "metricVerifiedNeeded", "필요", "Required"),
  metricWorks: defineBilingualText("membershipPolicy", "metricWorks", "공개 작품", "Published works"),
  metricPoints: defineBilingualText(
    "membershipPolicy",
    "metricPoints",
    "등급 산정 활동 포인트",
    "Activity points counted for the level",
  ),
  countUnit: defineBilingualText("membershipPolicy", "countUnit", "{count}개", "{count}"),
  levelVerifiedRequired: defineBilingualText(
    "membershipPolicy",
    "levelVerifiedRequired",
    "Creator 인증 필수",
    "Creator verification required",
  ),
  levelVerifiedOptional: defineBilingualText(
    "membershipPolicy",
    "levelVerifiedOptional",
    "Creator 인증 선택",
    "Creator verification optional",
  ),
  levelWorks: defineBilingualText("membershipPolicy", "levelWorks", " · 공개 작품 {count}+", " · Published works {count}+"),
  levelPoints: defineBilingualText("membershipPolicy", "levelPoints", " · 활동 {points}P+", " · Activity {points}P+"),
  creatorFootnote: defineBilingualText(
    "membershipPolicy",
    "creatorFootnote",
    "Trust Level과 Seller Level은 신고·저작권·판매자 검증 등 별도 운영 신호로 관리하며, Creator Level과 합산하지 않습니다. 관리자 수동 등급이 있으면 자동 계산이 덮어쓰지 않습니다.",
    "Trust Level and Seller Level are managed with separate operations signals such as reports, copyright, and seller verification, and are not combined with the Creator Level. A manually assigned level is never overwritten by the automatic calculation.",
  ),
  resourceTitle: defineBilingualText(
    "membershipPolicy",
    "resourceTitle",
    "멤버십별 자원 한도",
    "Resource limits by membership",
  ),
  resourceDescription: defineBilingualText(
    "membershipPolicy",
    "resourceDescription",
    "한도는 과도한 저장·업로드로 전체 서비스가 느려지는 것을 막기 위한 공정 사용 기준입니다. 저장공간 80%부터 사전 경고하고, 100%를 넘는 새 저장은 차단합니다.",
    "Limits are fair-use guardrails that keep the whole service fast when storage or uploads spike. We warn you from 80% of storage, and block new saves beyond 100%.",
  ),
  resourceLink: defineBilingualText(
    "membershipPolicy",
    "resourceLink",
    "요금제 페이지에서 Free·Pro 비교 보기",
    "Compare Free vs Pro on the pricing page",
  ),
  catalogLoading: defineBilingualText(
    "membershipPolicy",
    "catalogLoading",
    "멤버십 정책 정보를 불러오는 중입니다.",
    "Loading the membership policy info.",
  ),
  catalogError: defineBilingualText(
    "membershipPolicy",
    "catalogError",
    "최신 멤버십 정보를 불러오지 못했습니다. 아래는 기본 정책으로 표시합니다.",
    "Couldn't load the latest membership info. Showing the default policy below.",
  ),
  statStorage: defineBilingualText("membershipPolicy", "statStorage", "저장공간", "Storage"),
  statCreditMonthly: defineBilingualText("membershipPolicy", "statCreditMonthly", "월 Studio Credit", "Monthly Studio Credit"),
  statCreditDaily: defineBilingualText("membershipPolicy", "statCreditDaily", "일일 Credit 한도", "Daily Credit limit"),
  statFileMax: defineBilingualText("membershipPolicy", "statFileMax", "파일 1개", "Max file size"),
  statUploadDaily: defineBilingualText("membershipPolicy", "statUploadDaily", "일일 업로드", "Daily upload"),
  statCollaborators: defineBilingualText("membershipPolicy", "statCollaborators", "협업 멤버", "Collaborators"),
  statCollaboratorsUnit: defineBilingualText("membershipPolicy", "statCollaboratorsUnit", "{count}명", "{count}"),
  statRetention: defineBilingualText("membershipPolicy", "statRetention", "버전 보관", "Version history"),
  statRetentionUnit: defineBilingualText("membershipPolicy", "statRetentionUnit", "{days}일", "{days} days"),
  statHighRes: defineBilingualText("membershipPolicy", "statHighRes", "고해상도 내보내기", "High-res export"),
  supported: defineBilingualText("membershipPolicy", "supported", "지원", "Supported"),
  unsupported: defineBilingualText("membershipPolicy", "unsupported", "미지원", "Not supported"),
  activityTitle: defineBilingualText(
    "membershipPolicy",
    "activityTitle",
    "활동하면 쌓이는 포인트",
    "Points you earn by being active",
  ),
  activityDescription: defineBilingualText(
    "membershipPolicy",
    "activityDescription",
    "포인트는 구매 재화나 현금과 같은 가치가 아닙니다. 작품과 커뮤니티를 건강하게 사용하는 활동을 기록하기 위한 서비스 보상이며, 반복 자동화·도배를 막기 위해 활동별 일일 적립 횟수와 재적립 대기시간을 둡니다.",
    "Points are not cash or a purchasable good. They are a service reward that records healthy creative and community activity, with per-activity daily caps and cooldowns to prevent automation and spam.",
  ),
  activityDaily: defineBilingualText("membershipPolicy", "activityDaily", "하루 최대 {limit}회", "Up to {limit} per day"),
  activityCooldown: defineBilingualText("membershipPolicy", "activityCooldown", "{seconds}초 간격", "{seconds}s interval"),
  activityNoCooldown: defineBilingualText("membershipPolicy", "activityNoCooldown", "별도 대기시간 없음", "No cooldown"),
  activityServer: defineBilingualText("membershipPolicy", "activityServer", "서버 확인", "Server-verified"),
  activityUsage: defineBilingualText("membershipPolicy", "activityUsage", "이용 확인", "Usage-verified"),
  creditTitle: defineBilingualText(
    "membershipPolicy",
    "creditTitle",
    "Studio Credit은 멤버십 포함분으로 운영합니다",
    "Studio Credits come with your membership",
  ),
  creditDescription: defineBilingualText(
    "membershipPolicy",
    "creditDescription",
    "매월 멤버십에 포함된 Studio Credit이 지급되며 다음 월로 이월되지 않습니다. 플랜 승급 시에는 해당 월 목표량과의 차액만 추가 지급됩니다. 현재 운영 중인 개인 API 키·개인 Creator Runtime·브라우저 로컬 작업에는 차감하지 않으며, 향후 플랫폼 비용형 AI·서버 렌더 기능이 활성화될 때만 사용합니다. 추가 구매는 현재 비활성입니다.",
    "Studio Credits are granted with your membership every month and do not roll over. When you move up a plan, only the difference to that month's target is added. Your own API keys, personal Creator Runtime, and browser-local work never consume Credits; they will only be used when platform-funded AI and server rendering go live. Additional purchases are currently inactive.",
  ),
  notProductTitle: defineBilingualText(
    "membershipPolicy",
    "notProductTitle",
    "멤버십은 현재 구매 상품이 아닙니다",
    "Membership is not currently a paid product",
  ),
  notProductDescription: defineBilingualText(
    "membershipPolicy",
    "notProductDescription",
    "현재 멤버십은 베타 혜택, 창작자 지원, 운영상 권한 부여에 사용하는 등급입니다. 향후 결제를 도입하더라도 가격·환불·자동갱신 정책을 별도로 고지하기 전에는 유료 구독으로 취급하지 않습니다.",
    "Membership is currently a tier used for beta perks, creator support, and operational permissions. Even if payments are introduced later, it will not be treated as a paid subscription until price, refund, and auto-renewal terms are announced separately.",
  ),
  opsTitle: defineBilingualText("membershipPolicy", "opsTitle", "세부 운영 원칙", "Operating principles in detail"),
  opsItem1: defineBilingualText(
    "membershipPolicy",
    "opsItem1",
    "베타 무료 이용 중에도 저장공간·파일 크기·동시 처리량 같은 안전 한도는 유지됩니다.",
    "Safety limits on storage, file size, and concurrent processing stay in place even during free beta use.",
  ),
  opsItem2: defineBilingualText(
    "membershipPolicy",
    "opsItem2",
    "표시된 파일 한도는 계정의 상위 한도입니다. PSD·3D·실시간 동기화 등 포맷별 안전 한도가 더 낮으면 해당 기능의 기술 한도가 우선합니다.",
    "The shown file limits are your account ceiling. If a format's safety limit is lower — PSD, 3D, realtime sync — that feature's technical limit wins.",
  ),
  opsItem3: defineBilingualText(
    "membershipPolicy",
    "opsItem3",
    "활동 포인트는 지급일로부터 {days}일 동안 유효하며, 만료가 가까운 무료 재화부터 먼저 사용합니다.",
    "Activity points are valid for {days} days from the grant date; the free currency expiring soonest is used first.",
  ),
  opsItem3Indefinite: defineBilingualText(
    "membershipPolicy",
    "opsItem3Indefinite",
    "활동 포인트는 지급일로부터 무기한 유효하며, 오래된 무료 재화부터 먼저 사용합니다.",
    "Activity points never expire; the oldest free currency is used first.",
  ),
  opsItem4: defineBilingualText(
    "membershipPolicy",
    "opsItem4",
    "멤버십 Studio Credit은 월별로 새로 지급되고 이월되지 않으며, 플랜별 일일 사용 한도도 함께 적용됩니다.",
    "Membership Studio Credits are granted fresh each month, never roll over, and are subject to each plan's daily usage cap.",
  ),
  opsItem5: defineBilingualText(
    "membershipPolicy",
    "opsItem5",
    "같은 글·댓글·작품 ID는 중복 적립되지 않으며 활동별 하루 적립 횟수가 제한됩니다.",
    "The same post, comment, or work ID never grants twice, and each activity has a daily grant cap.",
  ),
  opsItem6: defineBilingualText(
    "membershipPolicy",
    "opsItem6",
    "멤버십 상향은 포인트를 자동 소모하지 않으며, 현재는 베타·프로모션·운영 정책으로 별도 부여됩니다.",
    "Moving up a membership never auto-spends points; it is currently granted through beta, promotion, or operations policy.",
  ),
  linkSettings: defineBilingualText("membershipPolicy", "linkSettings", "내 설정 보기", "My settings"),
  linkEvents: defineBilingualText("membershipPolicy", "linkEvents", "이벤트 혜택 보기", "Event benefits"),
} as const;

/** 원장 액션 코드 → 바이링구얼 키. */
const LEDGER_ACTION_KEYS: Readonly<Record<string, string>> = {
  grant: defineBilingualText("membershipPolicy", "ledgerGrant", "지급", "Granted"),
  reserve: defineBilingualText("membershipPolicy", "ledgerReserve", "사용 예약", "Reserved"),
  capture: defineBilingualText("membershipPolicy", "ledgerCapture", "사용 확정", "Captured"),
  release: defineBilingualText("membershipPolicy", "ledgerRelease", "예약 해제", "Released"),
  refund: defineBilingualText("membershipPolicy", "ledgerRefund", "환불", "Refunded"),
  expire: defineBilingualText("membershipPolicy", "ledgerExpire", "만료", "Expired"),
  adjustment: defineBilingualText("membershipPolicy", "ledgerAdjustment", "조정", "Adjusted"),
  reversal: defineBilingualText("membershipPolicy", "ledgerReversal", "취소", "Reversed"),
};

const creatorLevelLabels: Record<string, string> = {
  new: "New",
  verified: "Verified",
  active: "Active Creator",
  trusted: "Trusted Creator",
  professional: "Professional",
  partner: "Partner",
};

type LoadStatus = "loading" | "ready" | "error";

function formatBytes(bytes: number, number: Intl.NumberFormat): string {
  if (bytes >= 1_000_000_000) {
    return `${number.format(bytes / 1_000_000_000)} GB`;
  }
  return `${number.format(bytes / 1_000_000)} MB`;
}

function formatLimit(
  value: number | boolean,
  t: (key: string) => string,
  number: Intl.NumberFormat,
  unit?: (count: number) => string,
): string {
  if (typeof value === "boolean") return value ? t(COPY.supported) : t(COPY.unsupported);
  return unit ? unit(Number(value)) : number.format(Number(value));
}

function LoadingSkeleton({ label }: { readonly label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="h-28 animate-pulse rounded-2xl border border-line bg-panel"
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">{label}</span>
    </div>
  );
}

function RetryNotice({
  message,
  onRetry,
  retryLabel,
}: {
  readonly message: string;
  readonly onRetry: () => void;
  readonly retryLabel: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-panel p-4 text-sm"
    >
      <p className="text-fg-2">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line-strong px-4 py-2 text-sm font-bold text-fg hover:bg-raised"
      >
        <RefreshCw size={15} aria-hidden="true" />
        {retryLabel}
      </button>
    </div>
  );
}

export function MembershipPolicyPage() {
  useBilingualI18nRevision();
  const t = useT();
  const language = useI18n((state) => state.lang);
  const isEnglish = (normalizeLocaleCode(language) ?? "").startsWith("en");
  const pageLang = isEnglish ? "en" : "ko";
  const formatter = useMemo(
    () => new Intl.NumberFormat(isEnglish ? "en-US" : "ko-KR"),
    [isEnglish],
  );

  const userId = useApp((state) => state.userId);
  const [overview, setOverview] = useState<MembershipOverview | null>(null);
  const [catalog, setCatalog] = useState<MembershipCatalog | null>(null);
  const [catalogStatus, setCatalogStatus] = useState<LoadStatus>("loading");
  const [overviewStatus, setOverviewStatus] = useState<"idle" | LoadStatus>("idle");
  const [catalogAttempt, setCatalogAttempt] = useState(0);
  const [overviewAttempt, setOverviewAttempt] = useState(0);

  const title = t(COPY.docTitle);
  const description = t(COPY.docDescription);

  useDocumentTitle(title);
  useMetaDescription(description);
  usePageSocialMeta({ canonicalPath: "/membership", title, description });

  useEffect(() => {
    let cancelled = false;
    setCatalogStatus("loading");
    void getMembershipCatalog()
      .then((result) => {
        if (!cancelled) {
          setCatalog(result);
          setCatalogStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setCatalogStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [catalogAttempt]);

  useEffect(() => {
    if (!userId) {
      setOverview(null);
      setOverviewStatus("idle");
      return;
    }
    let cancelled = false;
    setOverviewStatus("loading");
    void getMembershipOverview()
      .then((result) => {
        if (!cancelled) {
          setOverview(result);
          setOverviewStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setOverviewStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, overviewAttempt]);

  const plans = catalog?.plans ?? Object.values(MEMBERSHIP_PLAN_POLICIES);
  const activities = catalog?.activityRewards ?? Object.values(ACTIVITY_POINT_POLICIES);
  const economy = catalog?.economy ?? MEMBERSHIP_ECONOMY_POLICY;
  const heroLines = t(COPY.heroTitle).split("\n");

  return (
    <div
      lang={pageLang}
      className="min-h-[calc(100dvh-var(--site-header-height,4.25rem))] bg-canvas py-7 sm:py-10 lg:py-12"
    >
      <Container size="wide">
        <header className="relative overflow-hidden rounded-[2rem] border border-line-strong bg-panel p-6 sm:p-9">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_85%_15%,oklch(0.75_0.16_70/0.12),transparent_32%),radial-gradient(circle_at_10%_95%,oklch(0.7_0.18_315/0.10),transparent_36%)]" />
          <div className="relative max-w-4xl">
            <p className="inline-flex items-center gap-2 rounded-full border border-accent/25 bg-accent-soft px-3 py-1 text-xs font-black tracking-[0.14em] text-accent">
              <Sparkles size={14} aria-hidden /> MEMBERSHIP & FAIR USE
            </p>
            <h1 className="mt-5 font-display text-4xl font-black tracking-[-0.04em] text-fg sm:text-6xl">
              {heroLines[0]}
              <br />
              {heroLines[1] ?? ""}
            </h1>
            <p className="mt-5 max-w-3xl text-base leading-7 text-fg-2 sm:text-lg">
              {t(COPY.heroLede)}
            </p>
            <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full border border-line bg-card px-3 py-2">
                {t(COPY.chipNoPayment)}
              </span>
              <span className="rounded-full border border-line bg-card px-3 py-2">
                {t(COPY.chipNotCash)}
              </span>
              <span className="rounded-full border border-line bg-card px-3 py-2">
                {t(COPY.chipFairUse)}
              </span>
            </div>
          </div>
        </header>

        {overviewStatus === "loading" && (
          <div className="mt-6">
            <LoadingSkeleton label={t(COPY.overviewLoading)} />
          </div>
        )}

        {overviewStatus === "error" && (
          <div className="mt-6">
            <RetryNotice
              message={t(COPY.overviewError)}
              onRetry={() => setOverviewAttempt((attempt) => attempt + 1)}
              retryLabel={t(COPY.retry)}
            />
          </div>
        )}

        {overviewStatus === "ready" && overview && (
          <>
            <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label={t(COPY.overviewAria)}>
              <article className="rounded-2xl border border-line bg-panel p-5">
                <BadgeCheck className="text-accent" size={20} aria-hidden />
                <p className="mt-3 text-xs font-bold text-fg-3">{t(COPY.overviewPlan)}</p>
                <p className="mt-1 text-2xl font-black text-fg">{overview.membership.plan.label}</p>
              </article>
              <article className="rounded-2xl border border-line bg-panel p-5">
                <Coins className="text-accent" size={20} aria-hidden />
                <p className="mt-3 text-xs font-bold text-fg-3">{t(COPY.overviewPoints)}</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-fg">
                  {formatter.format(overview.wallet.points.available)} P
                </p>
              </article>
              <article className="rounded-2xl border border-line bg-panel p-5">
                <Sparkles className="text-accent" size={20} aria-hidden />
                <p className="mt-3 text-xs font-bold text-fg-3">Studio Credit</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-fg">
                  {formatter.format(overview.wallet.studioCredits.available)} C
                </p>
                <p className="mt-1 text-xs text-fg-3">
                  {t(COPY.overviewCreditCycle, {
                    monthly: formatter.format(overview.creditCycle.monthlyIncluded),
                    remaining: formatter.format(overview.creditCycle.remainingToday),
                  })}
                </p>
              </article>
              <article className="rounded-2xl border border-line bg-panel p-5">
                <Gauge className="text-accent" size={20} aria-hidden />
                <p className="mt-3 text-xs font-bold text-fg-3">{t(COPY.overviewLifetime)}</p>
                <p className="mt-1 text-2xl font-black tabular-nums text-fg">
                  {formatter.format(overview.wallet.points.lifetimeGranted)} P
                </p>
              </article>
            </section>

            {overview.recentLedger.length > 0 && (
              <section className="mt-6 rounded-3xl border border-line bg-panel p-6" aria-labelledby="wallet-history-title">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-black tracking-[0.14em] text-accent">WALLET LEDGER</p>
                    <h2 id="wallet-history-title" className="mt-1 text-xl font-black text-fg">{t(COPY.ledgerTitle)}</h2>
                  </div>
                  <span className="text-xs font-semibold text-fg-3">
                    {t(COPY.ledgerRecent, { count: Math.min(overview.recentLedger.length, 8) })}
                  </span>
                </div>
                <div className="mt-4 divide-y divide-line/70">
                  {overview.recentLedger.slice(0, 8).map((entry) => {
                    const unit = entry.asset === "reward_point" ? "P" : "C";
                    const delta = entry.deltaAvailable;
                    const amount = delta === 0 ? entry.amount : Math.abs(delta);
                    const sign = delta > 0 ? "+" : delta < 0 ? "-" : "";
                    const actionKey = LEDGER_ACTION_KEYS[entry.entryType];
                    return (
                      <div key={entry.id} className="grid gap-2 py-3 text-sm sm:grid-cols-[7rem_1fr_auto] sm:items-center">
                        <span className="font-bold text-fg">
                          {entry.asset === "reward_point" ? t(COPY.assetPoint) : t(COPY.assetCredit)}
                        </span>
                        <span className="min-w-0">
                          <span className="font-semibold text-fg-2">{actionKey ? t(actionKey) : entry.entryType}</span>
                          <span className="ml-2 text-xs text-fg-3">{entry.reason}</span>
                        </span>
                        <span className="font-black tabular-nums text-fg">
                          {sign}{formatter.format(amount)} {unit}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="mt-10 rounded-3xl border border-line bg-panel p-6 sm:p-8" aria-labelledby="creator-level-title">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-black tracking-[0.14em] text-accent">CREATOR LEVEL</p>
                  <h2 id="creator-level-title" className="mt-2 text-2xl font-black text-fg">
                    {t(COPY.creatorTitle)}
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-6 text-fg-2">
                    {t(COPY.creatorDescription)}
                  </p>
                </div>
                <span className="rounded-full border border-accent/30 bg-accent-soft px-4 py-2 text-sm font-black text-accent">
                  {creatorLevelLabels[overview.creatorProgress.effectiveLevel] ?? overview.creatorProgress.effectiveLevel}
                </span>
              </div>
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl bg-card/55 p-4">
                  <p className="text-xs font-bold text-fg-3">{t(COPY.metricVerified)}</p>
                  <p className="mt-1 font-black text-fg">
                    {overview.creatorProgress.metrics.verifiedCreator
                      ? t(COPY.metricVerifiedDone)
                      : t(COPY.metricVerifiedNeeded)}
                  </p>
                </div>
                <div className="rounded-2xl bg-card/55 p-4">
                  <p className="text-xs font-bold text-fg-3">{t(COPY.metricWorks)}</p>
                  <p className="mt-1 font-black text-fg">
                    {t(COPY.countUnit, { count: formatter.format(overview.creatorProgress.metrics.publishedWorks) })}
                  </p>
                </div>
                <div className="rounded-2xl bg-card/55 p-4">
                  <p className="text-xs font-bold text-fg-3">{t(COPY.metricPoints)}</p>
                  <p className="mt-1 font-black text-fg">
                    {formatter.format(overview.creatorProgress.metrics.activityPoints)} P
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
                        {policy.verifiedCreator ? t(COPY.levelVerifiedRequired) : t(COPY.levelVerifiedOptional)}
                        {policy.publishedWorks > 0
                          ? t(COPY.levelWorks, { count: formatter.format(policy.publishedWorks) })
                          : ""}
                        {policy.activityPoints > 0
                          ? t(COPY.levelPoints, { points: formatter.format(policy.activityPoints) })
                          : ""}
                      </p>
                    </div>
                  ))}
              </div>
              <p className="mt-4 text-xs leading-5 text-fg-3">
                {t(COPY.creatorFootnote)}
              </p>
            </section>
          </>
        )}

        <section className="mt-10" aria-labelledby="membership-plan-title">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-black tracking-[0.14em] text-accent">RESOURCE POLICY</p>
              <h2 id="membership-plan-title" className="mt-2 text-3xl font-black tracking-tight text-fg">
                {t(COPY.resourceTitle)}
              </h2>
            </div>
            <Database className="hidden text-fg-3 sm:block" size={28} aria-hidden />
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-fg-2">
            {t(COPY.resourceDescription)}{" "}
            <Link href="/pricing" className="font-bold text-accent">
              {t(COPY.resourceLink)}
            </Link>
          </p>

          {catalogStatus === "loading" && (
            <div className="mt-6" role="status" aria-label={t(COPY.catalogLoading)}>
              <LoadingSkeleton label={t(COPY.catalogLoading)} />
            </div>
          )}

          {catalogStatus === "error" && (
            <div className="mt-6">
              <RetryNotice
                message={t(COPY.catalogError)}
                onRetry={() => setCatalogAttempt((attempt) => attempt + 1)}
                retryLabel={t(COPY.retry)}
              />
            </div>
          )}

          {catalogStatus !== "loading" && (
            <div className="mt-6 grid gap-4 lg:grid-cols-4">
              {plans.map((plan) => (
                <article key={plan.id} className="rounded-2xl border border-line bg-panel p-5">
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-accent">{plan.label}</p>
                  <p className="mt-2 min-h-12 text-sm leading-6 text-fg-2">{plan.description}</p>
                  <dl className="mt-5 space-y-3 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-fg-3">{t(COPY.statStorage)}</dt>
                      <dd className="font-bold text-fg">
                        {formatBytes(Number(plan.entitlements["storage.bytes"]), formatter)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-fg-3">{t(COPY.statCreditMonthly)}</dt>
                      <dd className="font-bold text-fg">
                        {formatter.format(Number(plan.entitlements["credit.monthlyIncluded"]))} C
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-fg-3">{t(COPY.statCreditDaily)}</dt>
                      <dd className="font-bold text-fg">
                        {formatter.format(Number(plan.entitlements["credit.dailyLimit"]))} C
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-fg-3">{t(COPY.statFileMax)}</dt>
                      <dd className="font-bold text-fg">
                        {formatBytes(Number(plan.entitlements["upload.file.maxBytes"]), formatter)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-fg-3">{t(COPY.statUploadDaily)}</dt>
                      <dd className="font-bold text-fg">
                        {formatBytes(Number(plan.entitlements["upload.daily.maxBytes"]), formatter)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-fg-3">{t(COPY.statCollaborators)}</dt>
                      <dd className="font-bold text-fg">
                        {formatLimit(plan.entitlements["collaboration.members"], t, formatter, (count) =>
                          t(COPY.statCollaboratorsUnit, { count: formatter.format(count) }),
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-fg-3">{t(COPY.statRetention)}</dt>
                      <dd className="font-bold text-fg">
                        {formatLimit(plan.entitlements["retention.versionsDays"], t, formatter, (days) =>
                          t(COPY.statRetentionUnit, { days: formatter.format(days) }),
                        )}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-fg-3">{t(COPY.statHighRes)}</dt>
                      <dd className="font-bold text-fg">
                        {formatLimit(plan.entitlements["export.highResolution"], t, formatter)}
                      </dd>
                    </div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="mt-10 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <article className="rounded-3xl border border-line bg-panel p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent">
                <Coins size={20} aria-hidden />
              </span>
              <div>
                <p className="text-xs font-black tracking-[0.12em] text-accent">ACTIVITY POINTS</p>
                <h2 className="mt-1 text-2xl font-black text-fg">{t(COPY.activityTitle)}</h2>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-fg-2">
              {t(COPY.activityDescription)}
            </p>
            <div className="mt-6 divide-y divide-line/70 rounded-2xl border border-line bg-card/45 px-4">
              {activities.map((activity) => (
                <div key={activity.key} className="grid gap-2 py-4 sm:grid-cols-[1fr_auto_auto] sm:items-center sm:gap-5">
                  <div>
                    <p className="font-bold text-fg">{activity.label}</p>
                    <p className="mt-1 text-xs text-fg-3">
                      {t(COPY.activityDaily, { limit: formatter.format(activity.dailyGrantLimit) })} ·
                      {activity.cooldownSeconds > 0
                        ? ` ${t(COPY.activityCooldown, { seconds: formatter.format(activity.cooldownSeconds) })}`
                        : ` ${t(COPY.activityNoCooldown)}`}
                    </p>
                  </div>
                  <span className="text-sm font-black text-accent">+{formatter.format(activity.points)} P</span>
                  <span className="text-xs font-semibold text-fg-3">
                    {activity.claimMode === "server" ? t(COPY.activityServer) : t(COPY.activityUsage)}
                  </span>
                </div>
              ))}
            </div>
          </article>

          <div className="space-y-4">
            <article className="rounded-3xl border border-line bg-panel p-6">
              <ShieldCheck className="text-accent" size={22} aria-hidden />
              <h2 className="mt-4 text-xl font-black text-fg">{t(COPY.creditTitle)}</h2>
              <p className="mt-3 text-sm leading-6 text-fg-2">
                {t(COPY.creditDescription)}
              </p>
            </article>
            <article className="rounded-3xl border border-line bg-panel p-6">
              <UsersRound className="text-accent" size={22} aria-hidden />
              <h2 className="mt-4 text-xl font-black text-fg">{t(COPY.notProductTitle)}</h2>
              <p className="mt-3 text-sm leading-6 text-fg-2">
                {t(COPY.notProductDescription)}
              </p>
            </article>
          </div>
        </section>

        <section className="mt-10 rounded-3xl border border-line bg-panel p-6 sm:p-8">
          <h2 className="text-2xl font-black text-fg">{t(COPY.opsTitle)}</h2>
          <ul className="mt-5 grid gap-3 text-sm leading-6 text-fg-2 md:grid-cols-2">
            <li className="rounded-2xl bg-card/55 p-4">• {t(COPY.opsItem1)}</li>
            <li className="rounded-2xl bg-card/55 p-4">• {t(COPY.opsItem2)}</li>
            <li className="rounded-2xl bg-card/55 p-4">
              • {economy.pointExpiryDays == null
                ? t(COPY.opsItem3Indefinite)
                : t(COPY.opsItem3, { days: formatter.format(economy.pointExpiryDays) })}
            </li>
            <li className="rounded-2xl bg-card/55 p-4">• {t(COPY.opsItem4)}</li>
            <li className="rounded-2xl bg-card/55 p-4">• {t(COPY.opsItem5)}</li>
            <li className="rounded-2xl bg-card/55 p-4">• {t(COPY.opsItem6)}</li>
          </ul>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/settings" className="inline-flex min-h-11 items-center rounded-xl bg-fg px-4 text-sm font-bold text-canvas">
              {t(COPY.linkSettings)}
            </Link>
            <Link href="/events" className="inline-flex min-h-11 items-center rounded-xl border border-line-strong px-4 text-sm font-bold text-fg">
              {t(COPY.linkEvents)}
            </Link>
          </div>
        </section>
      </Container>
    </div>
  );
}

export default MembershipPolicyPage;
