import { useMemo, useState } from "react";
import { ArrowRight, Check, Info, Minus, Sparkles } from "lucide-react";

import { MEMBERSHIP_PLAN_POLICIES } from "@toonstudio/core/membership-wallet";

import Link from "@/shared/navigation/router-link";
import { HeroBlock, PageShell, SectionContainer } from "@/shared/components/layout";
import { LAYOUT_TOKENS } from "@/shared/components/layout/layout-tokens";
import { cx } from "@/shared/lib/cx";
import { VoiceGuideButton } from "@/shared/voice";
import { normalizeLocaleCode, useI18n, useT } from "@/shared/lib/i18n";
import {
  defineBilingualText,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  useDocumentTitle,
  useMetaDescription,
  usePageSocialMeta,
} from "@/shared/seo/use-document-title";

import { CountUp, PulseCta, TiltCard } from "./PricingPolish";

const COPY = {
  docTitle: defineBilingualText("pricingPage", "docTitle", "요금제 · ToonStudio", "Pricing · ToonStudio"),
  docDescription: defineBilingualText(
    "pricingPage",
    "docDescription",
    "ToonStudio 요금제를 확인하세요. Free는 무료로 시작하고, Pro는 고급 창작 기능을 준비 중입니다. 현재는 실제 결제를 받지 않습니다.",
    "See ToonStudio pricing. Start free with Free; Pro for advanced creative features is on the way. We don't accept payments yet.",
  ),
  heroTitle: defineBilingualText(
    "pricingPage",
    "heroTitle",
    "무료로 시작하고,\n필요할 때 넓히세요.",
    "Start free,\nscale when you need to.",
  ),
  heroLede: defineBilingualText(
    "pricingPage",
    "heroLede",
    "기본 창작 기능은 Free로 무료이며, 고용량 제작·고급 협업을 위한 Pro는 준비 중입니다.",
    "Core creative tools are free with Free; Pro for high-volume production and advanced collaboration is on the way.",
  ),
  ctaStart: defineBilingualText("pricingPage", "ctaStart", "무료로 시작하기", "Start for free"),
  ctaPro: defineBilingualText("pricingPage", "ctaPro", "Pro 출시 문의하기", "Ask about the Pro launch"),
  banner: defineBilingualText(
    "pricingPage",
    "banner",
    "현재는 실제 결제를 받지 않습니다. 멤버십은 현재 구매 상품이 아니며, Pro 유료 구독 도입 전에는 가격·환불·자동갱신 정책을 별도로 고지합니다. 아래 한도와 비교는 멤버십 정책과 같은 기준으로 표시됩니다.",
    "We don't accept payments yet. Membership is not a purchasable product; before any paid Pro subscription launches, we'll announce price, refund, and auto-renewal terms separately. The limits and comparisons below use the same basis as the membership policy.",
  ),
  plansTitle: defineBilingualText("pricingPage", "plansTitle", "요금제", "Plans"),
  freeCardLabel: defineBilingualText("pricingPage", "freeCardLabel", "Free 요금제", "Free plan"),
  freePriceNote: defineBilingualText("pricingPage", "freePriceNote", "/ 무료", "/ free"),
  freeStorage: defineBilingualText("pricingPage", "freeStorage", "저장공간", "Storage"),
  freeCredit: defineBilingualText("pricingPage", "freeCredit", "월 Studio Credit", "Monthly Studio Credit"),
  freeMembers: defineBilingualText("pricingPage", "freeMembers", "협업 멤버", "Collaborators"),
  freeMembersUnit: defineBilingualText("pricingPage", "freeMembersUnit", "{count}명", "{count}"),
  proCardLabel: defineBilingualText("pricingPage", "proCardLabel", "Pro 요금제", "Pro plan"),
  proBadge: defineBilingualText("pricingPage", "proBadge", "준비 중", "Coming soon"),
  proPriceLine: defineBilingualText("pricingPage", "proPriceLine", "출시 전", "Pre-launch"),
  proPriceNote: defineBilingualText("pricingPage", "proPriceNote", "/ 요금 고지 예정", "/ pricing to be announced"),
  proFeatureLine: defineBilingualText(
    "pricingPage",
    "proFeatureLine",
    "고해상도·WebGPU 내보내기, CMYK 소프트프루프 지원",
    "High-res & WebGPU export, CMYK soft-proofing",
  ),
  highlightColumn: defineBilingualText(
    "pricingPage",
    "highlightColumn",
    "Pro 열 강조",
    "Highlight the Pro column",
  ),
  highlightOff: defineBilingualText(
    "pricingPage",
    "highlightOff",
    "강조 끄기",
    "Turn off highlight",
  ),
  compareTitle: defineBilingualText("pricingPage", "compareTitle", "Free · Pro 비교", "Free vs Pro comparison"),
  compareDescription: defineBilingualText(
    "pricingPage",
    "compareDescription",
    "비교 수치는 멤버십 정책의 자원 한도와 같은 기준입니다. Pro 열의 한도는 등급 기준이며, 유료 결제와는 무관합니다.",
    "Comparison figures use the same basis as the membership policy's resource limits. Pro column limits are tier baselines and unrelated to paid billing.",
  ),
  readingGuide: defineBilingualText(
    "pricingPage",
    "readingGuide",
    "읽는 법: Free 열이 지금 바로 쓸 수 있는 범위입니다. 체크는 지원, 줄(–)은 미지원을 뜻합니다.",
    "How to read: the Free column is what you can use right now. A check means supported, a dash (–) means not supported.",
  ),
  tableCaption: defineBilingualText(
    "pricingPage",
    "tableCaption",
    "Free 요금제와 Pro 요금제 비교표",
    "Free vs Pro plan comparison",
  ),
  tableItemHeader: defineBilingualText("pricingPage", "tableItemHeader", "항목", "Item"),
  mobileCompareLabel: defineBilingualText(
    "pricingPage",
    "mobileCompareLabel",
    "Free · Pro 항목별 비교",
    "Free vs Pro item-by-item comparison",
  ),
  faqTitle: defineBilingualText("pricingPage", "faqTitle", "자주 묻는 질문", "Frequently asked questions"),
  linkMembership: defineBilingualText("pricingPage", "linkMembership", "멤버십 정책 보기", "See the membership policy"),
  linkLaunch: defineBilingualText("pricingPage", "linkLaunch", "출시 소식 문의하기", "Ask about the launch"),
  linkContact: defineBilingualText("pricingPage", "linkContact", "문의하기", "Contact us"),
  linksTitle: defineBilingualText(
    "pricingPage",
    "linksTitle",
    "세부 자원 한도와 운영 원칙이 궁금하다면",
    "Want the detailed resource limits and principles?",
  ),
  linksDescription: defineBilingualText(
    "pricingPage",
    "linksDescription",
    "멤버십·포인트·용량 정책 페이지에서 저장공간, Studio Credit, 활동 포인트, 공정 사용 한도의 전체 기준을 확인할 수 있습니다.",
    "See the full basis for storage, Studio Credits, activity points, and fair-use limits in the membership, points, and storage policy.",
  ),
  supported: defineBilingualText("pricingPage", "supported", "지원", "Supported"),
  unsupported: defineBilingualText("pricingPage", "unsupported", "미지원", "Not supported"),
} as const;

const ROW_COPY = {
  monthlyPrice: defineBilingualText("pricingPage", "rowMonthlyPrice", "월 요금", "Monthly price"),
  priceFree: defineBilingualText("pricingPage", "rowPriceFree", "₩0 · 무료", "₩0 · Free"),
  pricePro: defineBilingualText("pricingPage", "rowPricePro", "요금제 준비 중", "Pricing coming soon"),
  priceNote: defineBilingualText(
    "pricingPage",
    "rowPriceNote",
    "Pro 유료 구독 도입 전 가격·환불·자동갱신을 별도로 고지합니다.",
    "We'll announce price, refund, and auto-renewal terms separately before any paid Pro subscription.",
  ),
  storage: defineBilingualText("pricingPage", "rowStorage", "저장공간", "Storage"),
  creditMonthly: defineBilingualText("pricingPage", "rowCreditMonthly", "월 Studio Credit", "Monthly Studio Credit"),
  creditNote: defineBilingualText(
    "pricingPage",
    "rowCreditNote",
    "매월 지급·이월 없음. ToonStudio 비용형 AI·서버 렌더에만 사용합니다.",
    "Granted monthly, no rollover. Only for platform-funded AI and server rendering.",
  ),
  creditDaily: defineBilingualText("pricingPage", "rowCreditDaily", "일일 Credit 한도", "Daily Credit limit"),
  aiUsage: defineBilingualText("pricingPage", "rowAiUsage", "월 AI 사용량", "Monthly AI usage"),
  aiUsageNote: defineBilingualText(
    "pricingPage",
    "rowAiUsageNote",
    "AI 채색·보조 생성 등에 쓰는 월간 한도입니다.",
    "Monthly cap for AI coloring and assistive generation.",
  ),
  fileMax: defineBilingualText("pricingPage", "rowFileMax", "파일 1개 최대 크기", "Max file size"),
  retention: defineBilingualText("pricingPage", "rowRetention", "버전 보관", "Version history"),
  retentionUnit: defineBilingualText("pricingPage", "rowRetentionUnit", "{count}일", "{count} days"),
  collaborators: defineBilingualText("pricingPage", "rowCollaborators", "협업 멤버", "Collaborators"),
  collaboratorsUnit: defineBilingualText("pricingPage", "rowCollaboratorsUnit", "{count}명", "{count}"),
  highRes: defineBilingualText("pricingPage", "rowHighRes", "고해상도 내보내기", "High-res export"),
  webgpu: defineBilingualText("pricingPage", "rowWebgpu", "WebGPU 내보내기", "WebGPU export"),
  webgpuNote: defineBilingualText(
    "pricingPage",
    "rowWebgpuNote",
    "브라우저 고속 렌더로 내보내기(지원 기기에서).",
    "Export with fast browser rendering (on supported devices).",
  ),
  cmyk: defineBilingualText("pricingPage", "rowCmyk", "CMYK 소프트프루프", "CMYK soft-proof"),
  cmykNote: defineBilingualText(
    "pricingPage",
    "rowCmykNote",
    "인쇄 색감을 화면에서 미리 확인.",
    "Preview print colors on screen.",
  ),
  customTools: defineBilingualText("pricingPage", "rowCustomTools", "사용자 추가 도구", "Custom tools"),
  customToolsNote: defineBilingualText(
    "pricingPage",
    "rowCustomToolsNote",
    "직접 만든 도구를 연결해 쓰는 기능.",
    "Connect tools you build yourself.",
  ),
  marketSell: defineBilingualText("pricingPage", "rowMarketSell", "마켓 판매", "Marketplace selling"),
} as const;

type RowValue =
  | { readonly kind: "text"; readonly key: string }
  | { readonly kind: "bytes"; readonly value: number }
  | { readonly kind: "count"; readonly value: number; readonly unitKey?: string }
  | { readonly kind: "bool"; readonly value: boolean };

const COMPARISON_ROWS: ReadonlyArray<{
  readonly labelKey: string;
  readonly free: RowValue;
  readonly pro: RowValue;
  readonly noteKey?: string;
}> = [
  { labelKey: ROW_COPY.monthlyPrice, free: { kind: "text", key: ROW_COPY.priceFree }, pro: { kind: "text", key: ROW_COPY.pricePro }, noteKey: ROW_COPY.priceNote },
  { labelKey: ROW_COPY.storage, free: { kind: "bytes", value: Number(MEMBERSHIP_PLAN_POLICIES.free.entitlements["storage.bytes"]) }, pro: { kind: "bytes", value: Number(MEMBERSHIP_PLAN_POLICIES.pro.entitlements["storage.bytes"]) } },
  { labelKey: ROW_COPY.creditMonthly, free: { kind: "count", value: Number(MEMBERSHIP_PLAN_POLICIES.free.entitlements["credit.monthlyIncluded"]) }, pro: { kind: "count", value: Number(MEMBERSHIP_PLAN_POLICIES.pro.entitlements["credit.monthlyIncluded"]) }, noteKey: ROW_COPY.creditNote },
  { labelKey: ROW_COPY.creditDaily, free: { kind: "count", value: Number(MEMBERSHIP_PLAN_POLICIES.free.entitlements["credit.dailyLimit"]) }, pro: { kind: "count", value: Number(MEMBERSHIP_PLAN_POLICIES.pro.entitlements["credit.dailyLimit"]) } },
  { labelKey: ROW_COPY.aiUsage, free: { kind: "count", value: Number(MEMBERSHIP_PLAN_POLICIES.free.entitlements["ai.monthlyTokens"]) }, pro: { kind: "count", value: Number(MEMBERSHIP_PLAN_POLICIES.pro.entitlements["ai.monthlyTokens"]) }, noteKey: ROW_COPY.aiUsageNote },
  { labelKey: ROW_COPY.fileMax, free: { kind: "bytes", value: Number(MEMBERSHIP_PLAN_POLICIES.free.entitlements["upload.file.maxBytes"]) }, pro: { kind: "bytes", value: Number(MEMBERSHIP_PLAN_POLICIES.pro.entitlements["upload.file.maxBytes"]) } },
  { labelKey: ROW_COPY.retention, free: { kind: "count", value: Number(MEMBERSHIP_PLAN_POLICIES.free.entitlements["retention.versionsDays"]), unitKey: ROW_COPY.retentionUnit }, pro: { kind: "count", value: Number(MEMBERSHIP_PLAN_POLICIES.pro.entitlements["retention.versionsDays"]), unitKey: ROW_COPY.retentionUnit } },
  { labelKey: ROW_COPY.collaborators, free: { kind: "count", value: Number(MEMBERSHIP_PLAN_POLICIES.free.entitlements["collaboration.members"]), unitKey: ROW_COPY.collaboratorsUnit }, pro: { kind: "count", value: Number(MEMBERSHIP_PLAN_POLICIES.pro.entitlements["collaboration.members"]), unitKey: ROW_COPY.collaboratorsUnit } },
  { labelKey: ROW_COPY.highRes, free: { kind: "bool", value: Boolean(MEMBERSHIP_PLAN_POLICIES.free.entitlements["export.highResolution"]) }, pro: { kind: "bool", value: Boolean(MEMBERSHIP_PLAN_POLICIES.pro.entitlements["export.highResolution"]) } },
  { labelKey: ROW_COPY.webgpu, free: { kind: "bool", value: Boolean(MEMBERSHIP_PLAN_POLICIES.free.entitlements["feature.webgpuExport"]) }, pro: { kind: "bool", value: Boolean(MEMBERSHIP_PLAN_POLICIES.pro.entitlements["feature.webgpuExport"]) }, noteKey: ROW_COPY.webgpuNote },
  { labelKey: ROW_COPY.cmyk, free: { kind: "bool", value: Boolean(MEMBERSHIP_PLAN_POLICIES.free.entitlements["feature.cmykSoftProof"]) }, pro: { kind: "bool", value: Boolean(MEMBERSHIP_PLAN_POLICIES.pro.entitlements["feature.cmykSoftProof"]) }, noteKey: ROW_COPY.cmykNote },
  { labelKey: ROW_COPY.customTools, free: { kind: "bool", value: Boolean(MEMBERSHIP_PLAN_POLICIES.free.entitlements["feature.customPlugins"]) }, pro: { kind: "bool", value: Boolean(MEMBERSHIP_PLAN_POLICIES.pro.entitlements["feature.customPlugins"]) }, noteKey: ROW_COPY.customToolsNote },
  { labelKey: ROW_COPY.marketSell, free: { kind: "bool", value: Boolean(MEMBERSHIP_PLAN_POLICIES.free.entitlements["market.sell"]) }, pro: { kind: "bool", value: Boolean(MEMBERSHIP_PLAN_POLICIES.pro.entitlements["market.sell"]) } },
];

const FAQ_ITEMS: ReadonlyArray<{
  readonly q: string;
  readonly a: string;
  readonly link?: { readonly href: string; readonly key: string };
}> = [
  {
    q: defineBilingualText("pricingPage", "faqQ1", "지금 Pro를 결제할 수 있나요?", "Can I pay for Pro right now?"),
    a: defineBilingualText(
      "pricingPage",
      "faqA1",
      "아니요. 현재는 실제 결제를 받지 않습니다. Pro 유료 구독을 도입하더라도 가격·환불·자동갱신 정책을 별도로 고지하기 전에는 유료 구독으로 취급하지 않습니다.",
      "No. We don't accept payments yet. Even if a paid Pro subscription launches, it won't be treated as paid until price, refund, and auto-renewal terms are announced separately.",
    ),
    link: { href: "/membership", key: COPY.linkMembership },
  },
  {
    q: defineBilingualText("pricingPage", "faqQ2", "Free는 정말 무료인가요?", "Is Free really free?"),
    a: defineBilingualText(
      "pricingPage",
      "faqA2",
      "네. 기본 창작·커뮤니티 기능과 개인 작업을 위한 시작 등급으로 무료이며, 저장공간 10GB·공정 사용 한도 같은 안전 기준은 베타 기간에도 적용됩니다.",
      "Yes. It's free as the starting tier for core creation, community, and personal work; safety baselines like 10GB of storage and fair-use limits still apply during beta.",
    ),
  },
  {
    q: defineBilingualText("pricingPage", "faqQ3", "Pro 요금은 언제 정해지나요?", "When will Pro pricing be set?"),
    a: defineBilingualText(
      "pricingPage",
      "faqA3",
      "준비 중입니다. 요금이 확정되면 가격·환불·자동갱신 정책을 이 페이지와 멤버십 정책에 먼저 고지합니다. 출시 소식에 대한 문의는 아래 문의 채널로 보내주세요.",
      "It's being prepared. Once pricing is finalized, we'll announce price, refund, and auto-renewal terms here and in the membership policy first. Send launch questions through the contact channel below.",
    ),
    link: { href: "/contact", key: COPY.linkLaunch },
  },
  {
    q: defineBilingualText("pricingPage", "faqQ4", "결제 없이 Pro급 기능을 이용할 수 있나요?", "Can I use Pro-level features without paying?"),
    a: defineBilingualText(
      "pricingPage",
      "faqA4",
      "멤버십은 현재 베타 혜택·창작자 지원·운영상 권한 부여에 사용하는 등급이라 베타·프로모션·운영 정책으로 별도 부여될 수 있습니다. 멤버십 상향은 포인트를 자동 소모하지 않습니다.",
      "Membership is currently a tier for beta perks, creator support, and operational permissions, so it can be granted through beta, promotion, or operations policy. Moving up never auto-spends points.",
    ),
    link: { href: "/membership", key: COPY.linkMembership },
  },
  {
    q: defineBilingualText("pricingPage", "faqQ5", "포인트와 Studio Credit은 요금제와 어떤 관계인가요?", "How do points and Studio Credits relate to plans?"),
    a: defineBilingualText(
      "pricingPage",
      "faqA5",
      "활동 포인트는 현금성 재화가 아니며 지급일로부터 365일 동안 유효합니다. Studio Credit은 매월 멤버십 포함분으로 지급되고 다음 월로 이월되지 않습니다. 개인 연동 키·개인 AI 작업 환경·브라우저 로컬 작업에는 Credit을 차감하지 않습니다.",
      "Activity points aren't cash-like and stay valid for 365 days from the grant date. Studio Credits are granted with your membership each month and don't roll over. Your own integration keys, personal AI environments, and browser-local work never consume Credits.",
    ),
  },
];

const freePlan = MEMBERSHIP_PLAN_POLICIES.free;
const proPlan = MEMBERSHIP_PLAN_POLICIES.pro;

function formatBytes(bytes: number, number: Intl.NumberFormat): string {
  if (bytes >= 1_000_000_000) {
    return `${number.format(bytes / 1_000_000_000)} GB`;
  }
  return `${number.format(bytes / 1_000_000)} MB`;
}

function PlanCell({ value, number }: { readonly value: RowValue; readonly number: Intl.NumberFormat }) {
  const t = useT();
  if (value.kind === "bool") {
    return value.value ? (
      <span className="inline-flex items-center gap-1.5 font-bold text-fg">
        <Check size={16} className="text-accent" aria-hidden="true" />
        <span>{t(COPY.supported)}</span>
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-fg-3">
        <Minus size={16} aria-hidden="true" />
        <span>{t(COPY.unsupported)}</span>
      </span>
    );
  }
  if (value.kind === "bytes") {
    return <span className="font-bold text-fg">{formatBytes(value.value, number)}</span>;
  }
  if (value.kind === "count") {
    const formatted = number.format(value.value);
    return (
      <span className="font-bold text-fg">
        {value.unitKey ? t(value.unitKey, { count: formatted }) : `${formatted} C`}
      </span>
    );
  }
  return <span className="font-bold text-fg">{t(value.key)}</span>;
}

export function PricingPage() {
  useBilingualI18nRevision();
  const t = useT();
  const language = useI18n((state) => state.lang);
  const isEnglish = (normalizeLocaleCode(language) ?? "").startsWith("en");
  const pageLang = isEnglish ? "en" : "ko";
  const number = useMemo(
    () => new Intl.NumberFormat(isEnglish ? "en-US" : "ko-KR"),
    [isEnglish],
  );
  const [highlightPro, setHighlightPro] = useState(false);

  const title = t(COPY.docTitle);
  const description = t(COPY.docDescription);

  useDocumentTitle(title);
  useMetaDescription(description);
  usePageSocialMeta({ canonicalPath: "/pricing", title, description });

  const proColumnClass = highlightPro ? "bg-accent-soft/60" : undefined;
  const heroLines = t(COPY.heroTitle).split("\n");

  return (
    <div lang={pageLang}>
      <PageShell
        hero={
          <HeroBlock
            eyebrow={
              <>
                <Sparkles size={14} aria-hidden="true" /> PRICING
              </>
            }
            title={
              <>
                {heroLines[0]}
                <br />
                {heroLines[1] ?? ""}
              </>
            }
            lede={t(COPY.heroLede)}
            actions={
              <>
                <PulseCta href="/studio/new">
                  {t(COPY.ctaStart)}
                  <ArrowRight size={16} aria-hidden="true" />
                </PulseCta>
                <Link
                  href="/contact"
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-card px-5 py-3 text-sm font-bold text-fg-2 transition-colors hover:text-accent"
                >
                  {t(COPY.ctaPro)}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
              </>
            }
          />
        }
      >
        <VoiceGuideButton scriptId="pricing" variant="fixed" />

        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-line bg-card/70 p-4">
          <Info size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden="true" />
          <p className="text-sm leading-6 text-fg-2">
            <strong className="text-fg">{t(COPY.banner).split(".")[0]}.</strong>{" "}
            {t(COPY.banner).split(".").slice(1).join(".").trim()}
          </p>
        </div>

        <SectionContainer id="plans" eyebrow="PLANS" title={t(COPY.plansTitle)} align="center" spacing="compact">
          <div className="grid gap-4 md:grid-cols-2">
            <TiltCard label={t(COPY.freeCardLabel)} className={cx(LAYOUT_TOKENS.card.default, "flex flex-col")}>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-accent">Free</p>
              <p className="mt-3 font-display text-4xl font-black text-fg">
                <CountUp value={0} format={(n) => `₩${number.format(Math.round(n))}`} />{" "}
                <span className="text-base font-bold text-fg-3">{t(COPY.freePriceNote)}</span>
              </p>
              <p className="mt-3 text-sm leading-6 text-fg-2">{freePlan.description}</p>
              <ul className="mt-5 space-y-2 text-sm leading-6 text-fg-2">
                <li>
                  • {t(COPY.freeStorage)}{" "}
                  <CountUp
                    value={Number(freePlan.entitlements["storage.bytes"])}
                    format={(n) => formatBytes(Math.round(n), number)}
                  />
                </li>
                <li>
                  • {t(COPY.freeCredit)}{" "}
                  <CountUp
                    value={Number(freePlan.entitlements["credit.monthlyIncluded"])}
                    format={(n) => `${number.format(Math.round(n))} C`}
                  />
                </li>
                <li>
                  • {t(COPY.freeMembers)}{" "}
                  <CountUp
                    value={Number(freePlan.entitlements["collaboration.members"])}
                    format={(n) => t(COPY.freeMembersUnit, { count: number.format(Math.round(n)) })}
                  />
                </li>
              </ul>
              <PulseCta href="/studio/new" className="mt-6">
                {t(COPY.ctaStart)}
                <ArrowRight size={16} aria-hidden="true" />
              </PulseCta>
            </TiltCard>

            <TiltCard
              label={t(COPY.proCardLabel)}
              glow
              className="flex flex-col rounded-2xl border-2 border-accent/50 bg-panel p-5"
            >
              <span className="absolute -top-3.5 left-6 rounded-full bg-accent px-3 py-1 text-xs font-black text-on-accent">
                {t(COPY.proBadge)}
              </span>
              <p className="text-xs font-black uppercase tracking-[0.12em] text-accent">Pro</p>
              <p className="mt-3 font-display text-4xl font-black text-fg">
                {t(COPY.proPriceLine)} <span className="text-base font-bold text-fg-3">{t(COPY.proPriceNote)}</span>
              </p>
              <p className="mt-3 text-sm leading-6 text-fg-2">{proPlan.description}</p>
              <ul className="mt-5 space-y-2 text-sm leading-6 text-fg-2">
                <li>
                  • {t(COPY.freeStorage)}{" "}
                  <CountUp
                    value={Number(proPlan.entitlements["storage.bytes"])}
                    format={(n) => formatBytes(Math.round(n), number)}
                  />
                </li>
                <li>
                  • {t(COPY.freeCredit)}{" "}
                  <CountUp
                    value={Number(proPlan.entitlements["credit.monthlyIncluded"])}
                    format={(n) => `${number.format(Math.round(n))} C`}
                  />
                </li>
                <li>• {t(COPY.proFeatureLine)}</li>
              </ul>
              <Link
                href="/contact"
                className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-line-strong bg-card px-5 py-3 text-sm font-bold text-fg-2 transition-colors hover:text-accent"
              >
                {t(COPY.ctaPro)}
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </TiltCard>
          </div>
        </SectionContainer>

        <SectionContainer
          id="compare"
          eyebrow="COMPARE PLANS"
          title={t(COPY.compareTitle)}
          description={t(COPY.compareDescription)}
          spacing="compact"
        >
          <p className="mt-2 flex max-w-3xl items-start gap-2 text-sm leading-6 text-fg-2">
            <Info size={16} className="mt-1 shrink-0 text-accent" aria-hidden="true" />
            <span>{t(COPY.readingGuide)}</span>
          </p>
          <button
            type="button"
            aria-pressed={highlightPro}
            onClick={() => setHighlightPro((active) => !active)}
            className={cx(
              "mt-4 inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition-colors motion-reduce:transition-none",
              highlightPro
                ? "border-accent/60 bg-accent-soft text-accent"
                : "border-line-strong bg-card text-fg-2 hover:text-accent",
            )}
          >
            {t(highlightPro ? COPY.highlightOff : COPY.highlightColumn)}
          </button>
          {/* 데스크톱/태블릿: 비교 테이블 */}
          <div className="mt-4 hidden overflow-x-auto rounded-[1.75rem] border border-line/70 sm:block">
            <table className="w-full min-w-[34rem] border-collapse bg-panel text-left">
              <caption className="sr-only">{t(COPY.tableCaption)}</caption>
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-line/70">
                  <th scope="col" className="bg-panel px-4 py-4 text-xs font-black tracking-wide text-fg-3 sm:px-6">
                    <span className="sr-only">{t(COPY.tableItemHeader)}</span>
                  </th>
                  <th scope="col" className="bg-panel px-4 py-4 text-sm font-black text-fg sm:px-6">Free</th>
                  <th scope="col" className={cx("bg-panel px-4 py-4 text-sm font-black text-fg sm:px-6", proColumnClass)}>
                    <span className="inline-flex items-center gap-2">
                      Pro
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[0.66rem] font-black text-accent">
                        {t(COPY.proBadge)}
                      </span>
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr
                    key={row.labelKey}
                    className="border-b border-line/50 transition-colors last:border-0 hover:bg-accent-soft/40 motion-reduce:transition-none"
                  >
                    <th scope="row" className="px-4 py-3.5 text-sm font-semibold text-fg-3 sm:px-6">
                      {t(row.labelKey)}
                    </th>
                    <td className="px-4 py-3.5 text-sm sm:px-6">
                      <PlanCell value={row.free} number={number} />
                    </td>
                    <td className={cx("px-4 py-3.5 text-sm sm:px-6", proColumnClass)}>
                      <PlanCell value={row.pro} number={number} />
                      {row.noteKey ? <p className="mt-1 text-xs leading-5 text-fg-3">{t(row.noteKey)}</p> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* 모바일: 항목별 카드 비교 (가로 스크롤 없이) */}
          <ul className="mt-4 space-y-3 sm:hidden" aria-label={t(COPY.mobileCompareLabel)}>
            {COMPARISON_ROWS.map((row) => (
              <li
                key={row.labelKey}
                className="rounded-2xl border border-line/70 bg-panel p-4"
              >
                <p className="text-xs font-black tracking-wide text-fg-3">{t(row.labelKey)}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-line bg-card/70 p-3">
                    <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-accent">Free</p>
                    <div className="mt-1.5 text-sm">
                      <PlanCell value={row.free} number={number} />
                    </div>
                  </div>
                  <div className={cx("rounded-xl border border-accent/30 bg-accent-soft/40 p-3", highlightPro && "ring-1 ring-accent/60")}>
                    <p className="text-[0.68rem] font-black uppercase tracking-[0.12em] text-accent">
                      Pro
                      <span className="ml-1.5 rounded-full bg-accent-soft px-2 py-0.5 text-[0.62rem] text-accent">
                        {t(COPY.proBadge)}
                      </span>
                    </p>
                    <div className="mt-1.5 text-sm">
                      <PlanCell value={row.pro} number={number} />
                    </div>
                  </div>
                </div>
                {row.noteKey ? (
                  <p className="mt-2.5 text-xs leading-5 text-fg-3">{t(row.noteKey)}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </SectionContainer>

        <SectionContainer id="faq" eyebrow="FAQ" title={t(COPY.faqTitle)} spacing="compact">
          <div className="space-y-3">
            {FAQ_ITEMS.map((item) => (
              <details
                key={item.q}
                className="group rounded-2xl border border-line bg-panel p-5 open:bg-card/60 sm:p-6"
              >
                <summary className="cursor-pointer list-none text-base font-bold text-fg marker:hidden [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {t(item.q)}
                    <ArrowRight
                      size={16}
                      aria-hidden="true"
                      className="shrink-0 text-accent transition-transform group-open:rotate-90 motion-reduce:transform-none"
                    />
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-7 text-fg-2">{t(item.a)}</p>
                {item.link ? (
                  <Link
                    href={item.link.href}
                    className="mt-3 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-accent"
                  >
                    {t(item.link.key)}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                ) : null}
              </details>
            ))}
          </div>
        </SectionContainer>

        <SectionContainer id="membership-links" spacing="compact">
          <div className="rounded-[2rem] border border-line/70 bg-panel/70 p-6 shadow-sm sm:p-8 lg:p-10">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-2xl font-black tracking-tight text-fg">
                  {t(COPY.linksTitle)}
                </h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-fg-2">
                  {t(COPY.linksDescription)}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/membership"
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-fg px-5 py-3 text-sm font-bold text-canvas transition-transform hover:-translate-y-0.5 motion-reduce:transform-none"
                >
                  {t(COPY.linkMembership)}
                  <ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-5 py-3 text-sm font-bold text-fg-2 transition-colors hover:text-accent"
                >
                  {t(COPY.linkContact)}
                </Link>
              </div>
            </div>
          </div>
        </SectionContainer>
      </PageShell>
    </div>
  );
}

export default PricingPage;
