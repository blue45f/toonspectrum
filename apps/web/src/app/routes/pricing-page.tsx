import { BadgeCheck, Check, Minus, Sparkles } from "lucide-react";

import { MEMBERSHIP_ECONOMY_POLICY, MEMBERSHIP_PLAN_POLICIES } from "../../../../../packages/core/src/membership-wallet";

import { Container } from "@/shared/components/container";
import { buttonClass } from "@/shared/components/ui/button-utils";
import { defineBilingualText, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";
import { useT } from "@/shared/lib/i18n";
import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";
import Link from "@/shared/navigation/router-link";

const COPY = {
  eyebrow: defineBilingualText("pricingPage", "eyebrow", "요금제", "Pricing"),
  title: defineBilingualText("pricingPage", "title", "핵심 기능은 무료로 시작하세요", "Start free with the core features"),
  description: defineBilingualText(
    "pricingPage",
    "description",
    "ToonStudio의 핵심 창작 기능은 당분간 무료로 운영합니다. 더 크게 만들고 싶을 때 등급을 올리세요.",
    "ToonStudio's core creative features stay free for now. Upgrade when you need more room to grow.",
  ),
  betaNotice: defineBilingualText(
    "pricingPage",
    "betaNotice",
    "지금은 베타 기간이라 결제가 꺼져 있습니다. 모든 등급의 기능을 무료로 써 보고, 정식 과금이 시작되기 전에 미리 안내해 드릴게요.",
    "Billing is turned off during the beta. Try every tier free for now — we'll announce well before paid billing starts.",
  ),
  freePrice: defineBilingualText("pricingPage", "freePrice", "무료", "Free"),
  betaFreePrice: defineBilingualText("pricingPage", "betaFreePrice", "베타 기간 무료", "Free during beta"),
  officialPriceLater: defineBilingualText("pricingPage", "officialPriceLater", "정식 요금은 추후 안내", "Official pricing announced later"),
  storage: defineBilingualText("pricingPage", "storage", "저장공간", "Storage"),
  aiTokens: defineBilingualText("pricingPage", "aiTokens", "AI 월 토큰", "Monthly AI tokens"),
  credits: defineBilingualText("pricingPage", "credits", "월 크레딧", "Monthly credits"),
  collaborators: defineBilingualText("pricingPage", "collaborators", "협업 인원", "Collaborators"),
  marketSell: defineBilingualText("pricingPage", "marketSell", "마켓 판매", "Market selling"),
  hiResExport: defineBilingualText("pricingPage", "hiResExport", "고해상도 내보내기", "High-res export"),
  supported: defineBilingualText("pricingPage", "supported", "지원", "Included"),
  notSupported: defineBilingualText("pricingPage", "notSupported", "미지원", "Not included"),
  recommended: defineBilingualText("pricingPage", "recommended", "추천", "Recommended"),
  compareTitle: defineBilingualText("pricingPage", "compareTitle", "전체 등급 비교", "Compare all tiers"),
  compareCaption: defineBilingualText(
    "pricingPage",
    "compareCaption",
    "Creator와 Team 등급은 특정 활동·역할에 맞춰 열립니다. 자세한 한도는 멤버십 정책에서 확인하세요.",
    "Creator and Team tiers open up for specific activities and roles. See the membership policy for exact limits.",
  ),
  faqTitle: defineBilingualText("pricingPage", "faqTitle", "자주 묻는 질문", "Frequently asked questions"),
  faqFreeQ: defineBilingualText("pricingPage", "faqFreeQ", "정말 무료인가요?", "Is it really free?"),
  faqFreeA: defineBilingualText(
    "pricingPage",
    "faqFreeA",
    "네. ToonStudio의 핵심 기능은 당분간 무료로 운영합니다. Free 등급만으로도 작품 제작·커뮤니티·기본 AI 기능을 쓸 수 있어요.",
    "Yes. ToonStudio's core features stay free for now. The Free tier already covers creating, community, and basic AI features.",
  ),
  faqDonateQ: defineBilingualText("pricingPage", "faqDonateQ", "후원하면 등급이 올라가나요?", "Does donating raise my tier?"),
  faqDonateA: defineBilingualText(
    "pricingPage",
    "faqDonateA",
    "아니요. 후원은 완전히 선택 사항이며, 후원 여부나 금액은 계정 등급·기능 제한 해제와 연결되지 않습니다. 후원은 서버·스토리지 같은 운영비를 돕는 1회성 응원입니다.",
    "No. Donations are entirely optional and never tied to account tiers or unlocked features. They are one-time contributions toward operating costs like servers and storage.",
  ),
  faqTierQ: defineBilingualText("pricingPage", "faqTierQ", "등급별 정확한 한도가 궁금해요.", "Where are the exact tier limits?"),
  faqTierA: defineBilingualText(
    "pricingPage",
    "faqTierA",
    "멤버십 정책 페이지에서 저장공간·업로드·협업·AI·크레딧 한도와 활동 포인트 정책을 자세히 확인할 수 있습니다.",
    "See the membership policy page for exact storage, upload, collaboration, AI, and credit limits plus activity point policies.",
  ),
  faqPaidQ: defineBilingualText("pricingPage", "faqPaidQ", "유료 과금은 언제 시작되나요?", "When does paid billing start?"),
  faqPaidA: defineBilingualText(
    "pricingPage",
    "faqPaidA",
    "아직 정해지지 않았습니다. 정식 과금이 시작되기 전에 공지로 충분히 미리 알려드리며, 그전까지는 모든 등급을 무료로 이용할 수 있습니다.",
    "Not decided yet. We'll announce well in advance before paid billing begins — until then every tier is free to use.",
  ),
  membershipPolicyCta: defineBilingualText("pricingPage", "membershipPolicyCta", "멤버십 정책 자세히 보기", "See membership policy"),
  supportCta: defineBilingualText("pricingPage", "supportCta", "ToonStudio 응원하기", "Support ToonStudio"),
  startCta: defineBilingualText("pricingPage", "startCta", "무료로 시작하기", "Start free"),
  // MEMBERSHIP_PLAN_POLICIES의 description은 한국어 고정이므로 페이지에서 bilingual로 덮는다.
  planDescriptionFree: defineBilingualText("pricingPage", "planDescriptionFree", "기본 창작·커뮤니티 기능과 개인 작업을 위한 시작 등급", "The starter tier for core creation, community, and personal projects"),
  planDescriptionCreator: defineBilingualText("pricingPage", "planDescriptionCreator", "꾸준히 작품을 제작·공개하는 개인 창작자를 위한 운영 등급", "The operating tier for creators who publish works regularly"),
  planDescriptionPro: defineBilingualText("pricingPage", "planDescriptionPro", "고용량 제작·배포와 고급 협업을 위한 전문 창작자 등급", "The professional tier for high-volume production and advanced collaboration"),
  planDescriptionTeam: defineBilingualText("pricingPage", "planDescriptionTeam", "스튜디오·팀 단위 장기 제작과 다인 협업을 위한 최상위 운영 등급", "The top tier for studio-scale, long-term team production"),
} as const;

const GB = 1_000_000_000;

function formatStorage(bytes: number): string {
  return bytes >= GB ? `${Math.round(bytes / GB)}GB` : `${Math.round(bytes / 1_000_000)}MB`;
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

const HERO_PLAN_IDS = ["free", "pro"] as const;
const PLAN_ORDER = ["free", "creator", "pro", "team"] as const;

/** MEMBERSHIP_PLAN_POLICIES.description은 한국어 고정이므로 페이지에서 bilingual로 덮는다. */
const PLAN_DESCRIPTIONS = {
  free: "planDescriptionFree",
  creator: "planDescriptionCreator",
  pro: "planDescriptionPro",
  team: "planDescriptionTeam",
} as const;

function planDescription(t: ReturnType<typeof useT>, id: keyof typeof PLAN_DESCRIPTIONS): string {
  return t(COPY[PLAN_DESCRIPTIONS[id]]);
}

interface PlanFeature {
  label: string;
  value: string;
  included: boolean;
}

function planFeatures(
  t: ReturnType<typeof useT>,
  plan: (typeof MEMBERSHIP_PLAN_POLICIES)[keyof typeof MEMBERSHIP_PLAN_POLICIES],
): PlanFeature[] {
  const entitlements = plan.entitlements;
  return [
    { label: t(COPY.storage), value: formatStorage(Number(entitlements["storage.bytes"])), included: true },
    { label: t(COPY.aiTokens), value: formatCount(Number(entitlements["ai.monthlyTokens"])), included: true },
    { label: t(COPY.credits), value: formatCount(Number(entitlements["credit.monthlyIncluded"])), included: true },
    { label: t(COPY.collaborators), value: formatCount(Number(entitlements["collaboration.members"])), included: true },
    { label: t(COPY.marketSell), value: t(entitlements["market.sell"] ? COPY.supported : COPY.notSupported), included: Boolean(entitlements["market.sell"]) },
    { label: t(COPY.hiResExport), value: t(entitlements["export.highResolution"] ? COPY.supported : COPY.notSupported), included: Boolean(entitlements["export.highResolution"]) },
  ];
}

export function PricingPage() {
  useBilingualI18nRevision();
  const t = useT();

  const title = t(COPY.title);
  const description = t(COPY.description);
  useDocumentTitle(t(COPY.eyebrow));
  useMetaDescription(description);
  usePageSocialMeta({ canonicalPath: "/pricing", title: t(COPY.eyebrow), description });

  const featureRows = planFeatures(t, MEMBERSHIP_PLAN_POLICIES.free).map((_, rowIndex) => ({
    label: planFeatures(t, MEMBERSHIP_PLAN_POLICIES.free)[rowIndex].label,
    cells: PLAN_ORDER.map((id) => planFeatures(t, MEMBERSHIP_PLAN_POLICIES[id])[rowIndex]),
  }));

  return (
    <div className="min-h-[calc(100dvh-var(--site-header-height,4.25rem))] bg-canvas py-7 sm:py-10 lg:py-12">
      <Container size="wide">
        <header className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-accent">{t(COPY.eyebrow)}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-fg sm:text-4xl">{title}</h1>
          <p className="mt-3 text-sm leading-7 text-fg-2 sm:text-base">{description}</p>
        </header>

        {!MEMBERSHIP_ECONOMY_POLICY.paymentsEnabled ? (
          <p className="mt-6 flex items-start gap-2.5 rounded-2xl border border-line bg-panel p-4 text-sm leading-6 text-fg-2" role="note">
            <Sparkles size={16} aria-hidden="true" className="mt-1 shrink-0 text-accent" />
            <span>{t(COPY.betaNotice)}</span>
          </p>
        ) : null}

        <section aria-label={t(COPY.eyebrow)} className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-2">
          {HERO_PLAN_IDS.map((id) => {
            const plan = MEMBERSHIP_PLAN_POLICIES[id];
            const features = planFeatures(t, plan);
            const isPro = plan.id === "pro";
            return (
              <article
                key={plan.id}
                aria-label={plan.label}
                className={`relative flex flex-col rounded-3xl border bg-panel p-6 ${isPro ? "border-accent/60 shadow-[0_0_0_1px_var(--color-accent)]" : "border-line"}`}
              >
                {isPro ? (
                  <span className="absolute -top-3 left-6 inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-bold text-white">
                    <BadgeCheck size={13} aria-hidden="true" />{t(COPY.recommended)}
                  </span>
                ) : null}
                <h2 className="text-lg font-bold text-fg">{plan.label}</h2>
                <p className="mt-1 min-h-10 text-[0.8125rem] leading-5 text-fg-2">{planDescription(t, plan.id)}</p>
                <p className="mt-4 text-2xl font-extrabold tracking-tight text-fg">
                  {plan.id === "free" ? t(COPY.freePrice) : t(COPY.betaFreePrice)}
                </p>
                <p className="mt-1 text-xs text-fg-3">{t(COPY.officialPriceLater)}</p>
                <ul className="mt-5 space-y-2.5 border-t border-line pt-5 text-sm">
                  {features.map((feature) => (
                    <li key={feature.label} className="flex items-center justify-between gap-3">
                      <span className="text-fg-2">{feature.label}</span>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
                        {feature.included
                          ? <Check size={14} aria-hidden="true" className="text-accent" />
                          : <Minus size={14} aria-hidden="true" className="text-fg-3" />}
                        {feature.value}
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </section>

        <section aria-labelledby="pricing-compare-title" className="mx-auto mt-12 max-w-4xl">
          <h2 id="pricing-compare-title" className="text-xl font-bold tracking-tight text-fg sm:text-2xl">{t(COPY.compareTitle)}</h2>
          <p className="mt-2 text-sm leading-6 text-fg-2">{t(COPY.compareCaption)}</p>
          <div className="mt-4 overflow-x-auto rounded-2xl border border-line">
            <table className="w-full min-w-[34rem] border-collapse bg-panel text-sm">
              <caption className="sr-only">{t(COPY.compareTitle)}</caption>
              <thead>
                <tr className="border-b border-line">
                  <th scope="col" className="px-4 py-3 text-left font-semibold text-fg-3"><span className="sr-only">{t(COPY.compareTitle)}</span></th>
                  {PLAN_ORDER.map((id) => (
                    <th key={id} scope="col" className="px-4 py-3 text-center font-bold text-fg">
                      {MEMBERSHIP_PLAN_POLICIES[id].label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {featureRows.map((row) => (
                  <tr key={row.label} className="border-b border-line/60 last:border-0">
                    <th scope="row" className="px-4 py-3 text-left font-medium text-fg-2">
                      {row.label}
                    </th>
                    {row.cells.map((feature, cellIndex) => (
                      <td key={PLAN_ORDER[cellIndex]} className="px-4 py-3 text-center font-semibold text-fg">
                        <span className="inline-flex items-center justify-center gap-1.5">
                          {feature.included
                            ? <Check size={14} aria-hidden="true" className="text-accent" />
                            : <Minus size={14} aria-hidden="true" className="text-fg-3" />}
                          {feature.value}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="pricing-faq-title" className="mx-auto mt-12 max-w-3xl">
          <h2 id="pricing-faq-title" className="text-xl font-bold tracking-tight text-fg sm:text-2xl">{t(COPY.faqTitle)}</h2>
          <div className="mt-4 grid gap-2.5">
            {[
              { q: COPY.faqFreeQ, a: COPY.faqFreeA },
              { q: COPY.faqDonateQ, a: COPY.faqDonateA },
              { q: COPY.faqTierQ, a: COPY.faqTierA },
              { q: COPY.faqPaidQ, a: COPY.faqPaidA },
            ].map((item) => (
              <details key={item.q} className="group rounded-xl border border-line bg-card/40 open:border-line-strong open:bg-card/70">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-fg [&::-webkit-details-marker]:hidden">
                  {t(item.q)}
                </summary>
                <p className="px-4 pb-4 text-sm leading-7 text-fg-2">{t(item.a)}</p>
              </details>
            ))}
          </div>
        </section>

        <div className="mt-10 flex flex-wrap justify-center gap-3">
          <Link href="/studio/new" className={buttonClass({ className: "min-h-11 gap-2" })}>{t(COPY.startCta)}</Link>
          <Link href="/membership" className={buttonClass({ variant: "quiet", className: "min-h-11" })}>{t(COPY.membershipPolicyCta)}</Link>
          <Link href="/support-us" className={buttonClass({ variant: "quiet", className: "min-h-11" })}>{t(COPY.supportCta)}</Link>
        </div>
      </Container>
    </div>
  );
}
