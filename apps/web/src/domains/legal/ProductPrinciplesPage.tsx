import { translateCurrentStaticSourceText, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import {
  Accessibility,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  FolderKanban,
  Handshake,
  KeyRound,
  ListChecks,
  Scale,
  ShieldCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { AboutSectionNav } from "./AboutSectionNav";
import { PRODUCT_DECISION_CHECKS, PRODUCT_PRINCIPLE_GROUPS, type ProductPrincipleGroup } from "./product-principles";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { HeroBlock } from "@/shared/components/layout";
import { Container } from "@/shared/components/section";
import {
  AboutJourneyPager,
  IntroActions,
  IntroNote,
  IntroSectionHeading,
} from "@/domains/marketing/public/intro-primitives";
import { IntroTabs } from "@/domains/marketing/public/intro-tabs";
import { INTRO_CARD, INTRO_PAGE, INTRO_SECTION } from "@/domains/marketing/public/intro-tokens";

const SCOPE = "domains.legal.ProductPrinciplesPage";

type GroupId = ProductPrincipleGroup["id"];

const GROUP_ICONS: Readonly<Record<GroupId, LucideIcon>> = {
  "creative-flow": Workflow,
  "rights-and-technology": ShieldCheck,
  collaboration: Handshake,
  community: Accessibility,
};

/** 원칙이 실제 제품 화면에서 어디에 드러나는지 — 문구로만 두지 않고 대표 시작점으로 연결한다. */
const IMPLEMENTATION_LINKS = [
  {
    href: "/production",
    icon: FolderKanban,
    ko: {
      title: "작품·회차 중심 제작 관리",
      body: "업무량 점수보다 담당 산출물, 마감, 의존 관계와 검수 상태를 연결합니다.",
      action: "제작 관리 보기",
    },
    en: {
      title: "Work- and episode-centred production",
      body: "Deliverables, deadlines, dependencies and review state matter more than activity scores.",
      action: "Open production",
    },
  },
  {
    href: "/studio/assets",
    icon: KeyRound,
    ko: {
      title: "사용 권리와 출처 확인",
      body: "상업 이용, 원본 전달, AI 참고·학습 여부와 출처 표기를 프로젝트 목적에 맞게 확인합니다.",
      action: "소재 권리 확인",
    },
    en: {
      title: "Rights and provenance checks",
      body: "Commercial use, source delivery, AI reference or training and attribution are checked against project intent.",
      action: "Review asset rights",
    },
  },
  {
    href: "/settings/ai",
    icon: Bot,
    ko: {
      title: "사용자가 선택하는 AI 연결",
      body: "개인 AI 연결과 키 보관, 공급자와 사용 범위를 한곳에서 관리하도록 구성합니다.",
      action: "AI 설정 보기",
    },
    en: {
      title: "User-controlled AI connections",
      body: "Personal AI connections, key storage, providers and usage scope are managed in one place.",
      action: "Open AI settings",
    },
  },
  {
    href: "/accessibility",
    icon: Accessibility,
    ko: {
      title: "접근성을 제품 기준으로",
      body: "키보드, 스크린 리더, 고대비, 모션 감소와 작은 화면 대응을 별도 부가 기능이 아닌 기본 품질로 다룹니다.",
      action: "접근성 기준 보기",
    },
    en: {
      title: "Accessibility as a product baseline",
      body: "Keyboard, screen reader, high-contrast, reduced-motion and small-screen support are treated as core quality.",
      action: "Review accessibility",
    },
  },
] as const;

function PrincipleGroupPanel({ group }: { readonly group: ProductPrincipleGroup }) {
  const bi = useBilingualLocalizer(SCOPE);
  const copy = bi(group.ko, group.en);
  return (
    <div id={`principle-group-${group.id}`} className="grid gap-5">
      <div className="max-w-3xl">
        <p className="eyebrow text-accent">{copy.eyebrow}</p>
        <h3 className="mt-2 text-balance break-keep text-xl font-bold tracking-tight text-fg sm:text-2xl">{copy.title}</h3>
        <p className="mt-2 break-keep text-base leading-7 text-fg-2">{copy.body}</p>
      </div>
      <ol className="grid gap-3 lg:grid-cols-3" aria-label={copy.title}>
        {group.principles.map((principle, index) => {
          const text = bi(principle.ko, principle.en);
          return (
            <li key={principle.id} id={`principle-${principle.id}`} className="min-w-0 rounded-2xl border border-line/70 bg-card/65 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-panel font-display text-xs font-black text-accent">{group.index}.{index + 1}</span>
                <div className="min-w-0">
                  <h4 className="break-keep text-lg font-bold text-fg">{text.title}</h4>
                  <p className="mt-1.5 break-keep text-base leading-7 text-fg-2">{text.body}</p>
                  <p className="mt-3 flex items-start gap-2 rounded-xl border border-line/65 bg-panel/70 px-3 py-2.5 text-sm leading-6 text-fg-2">
                    <CheckCircle2 size={15} className="mt-1 shrink-0 text-success" aria-hidden="true" />
                    <span className="break-keep"><strong className="text-fg">{bi("제품 적용 기준", "Product practice")}</strong><br />{text.practice}</span>
                  </p>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Product decision principles, separate from binding legal terms and privacy policies. */
export function ProductPrinciplesPage() {
  const bi = useBilingualLocalizer(SCOPE);
  const eyebrow = (text: string) => translateCurrentStaticSourceText(SCOPE, "en", text);

  useDocumentTitle(bi("ToonStudio 제품 원칙 · 창작자의 흐름과 통제권", "ToonStudio product principles · Creative flow and creator control"));

  const tabs = PRODUCT_PRINCIPLE_GROUPS.map((group) => ({
    id: group.id,
    icon: GROUP_ICONS[group.id],
    label: bi(group.ko, group.en).tab,
  }));
  const checks = bi(PRODUCT_DECISION_CHECKS.ko, PRODUCT_DECISION_CHECKS.en);

  return (
    <Container size="wide" className={INTRO_PAGE}>
      <HeroBlock
        eyebrow="PRODUCT PRINCIPLES · CREATOR FIRST"
        title={bi("창작 흐름은 단순하게, 창작자의 통제권은 강하게.", "Simple creative flow. Strong creator control.")}
        lede={bi("새 기능·AI 연결·협업 방식·수익 모델을 정할 때 쓰는 열두 가지 제품 원칙이에요.", "Twelve principles we use to decide features, AI connections, collaboration and monetisation.")}
        actions={(
          <IntroActions
            primary={{ href: "/studio/new", label: bi("새 작품 시작하기", "Start a new work") }}
            secondary={{ href: "/about/technology", label: bi("기술과 신뢰 확인하기", "Review technology and trust"), icon: ShieldCheck }}
          />
        )}
      />

      <AboutSectionNav variant="compact" className="mt-4" />

      <IntroNote
        icon={Scale}
        className="mt-4"
        action={(
          <span className="flex flex-wrap gap-x-4">
            <Link href="/terms" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-accent hover:text-accent-2">{bi("이용약관", "Terms")}<ArrowRight size={14} aria-hidden="true" /></Link>
            <Link href="/privacy" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-bold text-accent hover:text-accent-2">{bi("개인정보처리방침", "Privacy")}<ArrowRight size={14} aria-hidden="true" /></Link>
          </span>
        )}
      >
        {bi("이 페이지는 약관이 아니라 제품 의사결정 기준입니다. 법적 권리와 개인정보 처리는 이용약관과 개인정보처리방침을 확인하세요.", "This page is a product decision standard, not a legal agreement. Binding terms and privacy practices live in the Terms of Service and Privacy Policy.")}
      </IntroNote>

      <section className="pb-8 pt-8 sm:pb-12 sm:pt-12" aria-labelledby="principles-groups-title">
        <IntroSectionHeading
          id="principles-groups-title"
          eyebrow={eyebrow("TWELVE PRINCIPLES")}
          title={bi("네 묶음, 열두 가지 원칙.", "Four groups, twelve principles.")}
        />
        <IntroTabs
          tabs={tabs}
          fallback="creative-flow"
          label={bi("제품 원칙 묶음", "Principle groups")}
          idPrefix="principle-group"
          param="group"
          mount="all"
          className="mt-5"
          panelClassName="mt-4"
        >
          {(id) => {
            const group = PRODUCT_PRINCIPLE_GROUPS.find((candidate) => candidate.id === id);
            return group ? <PrincipleGroupPanel group={group} /> : null;
          }}
        </IntroTabs>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="principles-live-title">
        <IntroSectionHeading
          id="principles-live-title"
          eyebrow={eyebrow("VISIBLE IN THE PRODUCT")}
          title={bi("원칙은 실제 화면에서 확인할 수 있어요.", "See the principles in real screens.")}
        />
        <ul className="mt-5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4" aria-label={bi("원칙이 드러나는 제품 화면", "Product surfaces that show the principles")}>
          {IMPLEMENTATION_LINKS.map((item) => {
            const Icon = item.icon;
            const copy = bi(item.ko, item.en);
            return (
              <li key={item.href} className="min-w-0">
                <Link href={item.href} className={`${INTRO_CARD} group flex h-full min-h-[4.5rem] items-center gap-3 p-3.5 sm:flex-col sm:items-start sm:gap-2 sm:p-4`}>
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={19} aria-hidden="true" /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block break-keep font-bold text-fg">{copy.title}</span>
                    <span className="mt-1 hidden break-keep text-sm leading-6 text-fg-2 sm:block">{copy.body}</span>
                    <span className="mt-1 flex items-center gap-1 break-keep text-sm font-semibold text-accent sm:mt-3">{copy.action}<ArrowRight size={13} className="shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" /></span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="decision-check-title">
        <details className="group rounded-2xl border border-line/70 bg-panel/55">
          <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 rounded-2xl px-4 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 [&::-webkit-details-marker]:hidden">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><ListChecks size={19} aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="eyebrow block text-accent">{eyebrow("DECISION FILTER")}</span>
              <span id="decision-check-title" className="block break-keep font-bold text-fg">{bi("새 기능은 여섯 가지 질문을 통과해야 합니다.", "Every new feature must pass six questions.")}</span>
            </span>
            <ChevronDown size={18} className="shrink-0 text-fg-3 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
          </summary>
          <div className="px-4 pb-4">
            <p className="break-keep text-base leading-7 text-fg-2">{bi("최신 기술이거나 기능 수를 늘린다는 이유만으로 우선하지 않습니다. 작품 완성과 창작자의 통제권에 실제로 도움이 되는지를 먼저 확인합니다.", "A feature is not prioritised merely because it is new technology or increases the feature count. It must help creators finish work while retaining control.")}</p>
            <ol className="mt-3 grid gap-2.5 sm:grid-cols-2">
              {checks.map((check, index) => (
                <li key={check} className="flex min-h-14 items-start gap-3 rounded-xl border border-line/70 bg-card/75 p-3 text-base leading-6 text-fg-2">
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-xs font-black text-accent">{index + 1}</span>
                  <span className="break-keep">{check}</span>
                </li>
              ))}
            </ol>
          </div>
        </details>
      </section>

      <AboutJourneyPager current="/about/principles" className="mt-2" />
    </Container>
  );
}
