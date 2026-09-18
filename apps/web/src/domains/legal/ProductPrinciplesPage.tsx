import {
  formatI18nTemplate,
  resolveUiLocale,
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
  translateLocaleBranchForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  Accessibility,
  ArrowRight,
  Bot,
  CheckCircle2,
  FolderKanban,
  Handshake,
  KeyRound,
  Scale,
  ShieldCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";

import { AboutSectionNav } from "./AboutSectionNav";
import {
  PRODUCT_DECISION_CHECKS,
  PRODUCT_PRINCIPLE_GROUPS,
  type ProductPrinciplesLocale,
} from "./product-principles";

import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { Container } from "@/shared/components/section";
import { useI18n } from "@/shared/lib/i18n";

const GROUP_ICONS: Readonly<Record<(typeof PRODUCT_PRINCIPLE_GROUPS)[number]["id"], LucideIcon>> = {
  "creative-flow": Workflow,
  "rights-and-technology": ShieldCheck,
  collaboration: Handshake,
  community: Accessibility,
};

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

function resolveLocale(language: string): ProductPrinciplesLocale {
  return resolveUiLocale(language);
}

/** Product decision principles, separate from binding legal terms and privacy policies. */
export function ProductPrinciplesPage() {
  const language = useI18n((state) => state.lang);
  const locale = resolveLocale(language);  useDocumentTitle(
    translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "ToonStudio 제품 원칙 · 창작자의 흐름과 통제권", "ToonStudio product principles · Creative flow and creator control"),
  );

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <PublicStoryHero
        eyebrow="PRODUCT PRINCIPLES · CREATOR FIRST"
        title={
          translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "모든 기능은 창작 흐름을 단순하게, 모든 정책은 창작자의 통제권을 강하게.", "Every feature should simplify the creative flow. Every policy should strengthen creator control.")
        }
        description={
          translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "ToonStudio가 새 기능, AI 연결, 협업 방식과 수익 모델을 결정할 때 사용하는 제품 원칙입니다. 기획부터 연재까지 한곳에서 이어지되 작품과 선택권은 창작자에게 남아야 합니다.", "These principles guide ToonStudio decisions about features, AI connections, collaboration and monetisation. The workflow can stay connected from planning to publishing while the work and choices remain with the creator.")
        }
        image="process"
        imageAlt={
          translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "웹툰 기획, 제작, 협업, 검수와 내보내기가 창작자 중심으로 연결된 제작 과정 일러스트", "Illustration of a creator-centred workflow connecting webtoon planning, production, collaboration, review and export")
        }
        caption={
          translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "CREATE WITH CONTROL · 연결하되 가두지 않는 창작 환경", "CREATE WITH CONTROL · A connected studio without lock-in")
        }
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/studio/new"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
          >
            {translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "새 작품 시작하기", "Start a new work")}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link
            href="/about/technology"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-5 py-3 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg"
          >
            <ShieldCheck size={16} aria-hidden="true" />
            {translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "기술과 신뢰 확인하기", "Review technology and trust")}
          </Link>
        </div>
      </PublicStoryHero>

      <AboutSectionNav className="mt-8" />

      <section className="py-12 sm:py-16" aria-labelledby="principles-context-title">
        <div className="grid gap-6 rounded-[2rem] border border-accent/25 bg-gradient-to-br from-accent-soft/75 via-panel/70 to-card/65 p-6 shadow-sm md:grid-cols-[auto_1fr] md:gap-7 sm:p-8">
          <span className="grid size-12 place-items-center rounded-2xl border border-accent/30 bg-card text-accent shadow-sm">
            <Scale size={23} aria-hidden="true" />
          </span>
          <div>
            <h2 id="principles-context-title" className="text-xl font-bold tracking-tight text-fg sm:text-2xl">
              {translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "이 페이지는 약관이 아니라 제품 의사결정 기준입니다.", "This page is a product decision standard, not a legal agreement.")}
            </h2>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-fg-2">
              {translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "현재 베타에 적용된 기능과 앞으로 확장할 기능 모두 이 기준으로 검토합니다. 법적 권리와 개인정보 처리에 관한 구속력 있는 내용은 이용약관과 개인정보처리방침에서 별도로 확인할 수 있습니다.", "Both current beta features and future work are reviewed against these standards. Binding terms and privacy practices remain documented separately in the Terms of Service and Privacy Policy.")}
            </p>
            <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold">
              <Link href="/terms" className="inline-flex min-h-10 items-center gap-2 text-accent hover:text-accent-2">
                {translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "이용약관", "Terms of Service")}<ArrowRight size={14} aria-hidden="true" />
              </Link>
              <Link href="/privacy" className="inline-flex min-h-10 items-center gap-2 text-accent hover:text-accent-2">
                {translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "개인정보처리방침", "Privacy Policy")}<ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-16 pb-16 sm:space-y-20 sm:pb-20">
        {PRODUCT_PRINCIPLE_GROUPS.map((group) => {
          const Icon = GROUP_ICONS[group.id];
          const groupCopy = translateLocaleBranchForLocale(locale, "domains.legal.ProductPrinciplesPage", group);

          return (
            <section key={group.id} aria-labelledby={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.ProductPrinciplesPage", "en", "principle-group-{v0}"), { v0: String(group.id) })}>
              <div className="grid gap-7 md:grid-cols-[0.72fr_1.28fr] md:gap-12">
                <div>
                  <div className="flex items-center gap-3">
                    <span className="font-display text-xs font-black tracking-[0.14em] text-accent">{group.index}</span>
                    <span className="h-px flex-1 bg-line" aria-hidden="true" />
                  </div>
                  <span className="mt-6 grid size-11 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
                    <Icon size={21} aria-hidden="true" />
                  </span>
                  <p className="mt-5 font-display text-[0.65rem] font-bold uppercase tracking-[0.15em] text-accent">
                    {groupCopy.eyebrow}
                  </p>
                  <h2
                    id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.ProductPrinciplesPage", "en", "principle-group-{v0}"), { v0: String(group.id) })}
                    className="mt-3 max-w-md text-balance text-2xl font-bold tracking-tight text-fg sm:text-3xl"
                  >
                    {groupCopy.title}
                  </h2>
                  <p className="mt-4 max-w-md text-sm leading-7 text-fg-2">{groupCopy.body}</p>
                </div>

                <div className="grid gap-4">
                  {group.principles.map((principle, index) => {
                    const copy = translateLocaleBranchForLocale(locale, "domains.legal.ProductPrinciplesPage", principle);
                    return (
                      <article
                        key={principle.id}
                        id={formatI18nTemplate(translateCurrentStaticSourceText("domains.legal.ProductPrinciplesPage", "en", "principle-{v0}"), { v0: String(principle.id) })}
                        className="rounded-3xl border border-line/70 bg-panel/60 p-5 shadow-sm sm:p-6"
                      >
                        <div className="flex items-start gap-4">
                          <span className="grid size-9 shrink-0 place-items-center rounded-xl border border-line bg-card font-display text-xs font-black text-accent">
                            {group.index}.{index + 1}
                          </span>
                          <div className="min-w-0">
                            <h3 className="text-lg font-bold text-fg">{copy.title}</h3>
                            <p className="mt-2 text-sm leading-7 text-fg-2">{copy.body}</p>
                            <p className="mt-4 flex items-start gap-2 rounded-2xl border border-line/65 bg-card/70 px-3 py-3 text-xs leading-6 text-fg-3">
                              <CheckCircle2 size={15} className="mt-1 shrink-0 text-success" aria-hidden="true" />
                              <span><strong className="text-fg-2">{translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "제품 적용 기준", "Product practice")}</strong><br />{copy.practice}</span>
                            </p>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <section className="border-y border-line py-14 sm:py-20" aria-labelledby="principles-live-title">
        <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.ProductPrinciplesPage", "en", "VISIBLE IN THE PRODUCT")}</p>
        <h2 id="principles-live-title" className="mt-3 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
          {translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "원칙을 문구로만 두지 않고, 실제 화면과 선택지에 연결합니다.", "The principles are connected to real surfaces and choices, not left as copy.")}
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2">
          {translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "아래 화면은 창작 흐름, 권리 확인, AI 통제와 접근성 원칙을 현재 제품에서 확인할 수 있는 대표적인 시작점입니다.", "These surfaces are representative places where the current product exposes creative flow, rights checks, AI control and accessibility.")}
        </p>

        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {IMPLEMENTATION_LINKS.map((item) => {
            const Icon = item.icon;
            const copy = translateLocaleBranchForLocale(locale, "domains.legal.ProductPrinciplesPage", item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className="group flex min-h-44 flex-col rounded-3xl border border-line/70 bg-card/65 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg sm:p-6"
              >
                <Icon size={22} className="text-accent" aria-hidden="true" />
                <h3 className="mt-5 text-lg font-bold text-fg">{copy.title}</h3>
                <p className="mt-2 text-sm leading-7 text-fg-2">{copy.body}</p>
                <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-bold text-accent">
                  {copy.action}<ArrowRight size={15} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="py-14 sm:py-20" aria-labelledby="decision-check-title">
        <div className="grid gap-8 rounded-[2rem] border border-line/70 bg-panel/55 p-6 shadow-sm md:grid-cols-[0.8fr_1.2fr] md:gap-12 sm:p-8">
          <div>
            <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.ProductPrinciplesPage", "en", "DECISION FILTER")}</p>
            <h2 id="decision-check-title" className="mt-3 text-2xl font-bold tracking-tight text-fg sm:text-3xl">
              {translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "새 기능은 여섯 가지 질문을 통과해야 합니다.", "Every new feature must pass six questions.")}
            </h2>
            <p className="mt-4 text-sm leading-7 text-fg-2">
              {translateBilingualValueForLocale(locale, "domains.legal.ProductPrinciplesPage", "최신 기술이거나 기능 수를 늘린다는 이유만으로 우선하지 않습니다. 작품 완성과 창작자의 통제권에 실제로 도움이 되는지를 먼저 확인합니다.", "A feature is not prioritised merely because it is new technology or increases the feature count. It must help creators finish work while retaining control.")}
            </p>
          </div>
          <ol className="grid gap-3 sm:grid-cols-2">
            {translateLocaleBranchForLocale(locale, "domains.legal.ProductPrinciplesPage", PRODUCT_DECISION_CHECKS).map((check, index) => (
              <li key={check} className="flex min-h-20 items-start gap-3 rounded-2xl border border-line/70 bg-card/75 p-4 text-sm leading-6 text-fg-2">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft font-display text-[0.65rem] font-black text-accent">
                  {index + 1}
                </span>
                <span>{check}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </Container>
  );
}
