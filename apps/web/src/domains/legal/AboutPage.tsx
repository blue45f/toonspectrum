import {
  resolveUiLocale,
  translateBilingualValueForLocale,
  translateCurrentStaticSourceText,
  translateLocaleBranchForLocale,
} from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  BookOpen,
  Layers,
  MessageSquare,
  Save,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wrench,
} from "lucide-react";

import { AboutSectionNav } from "./AboutSectionNav";

import Link from "@/compat/router-link";
import { useDocumentTitle } from "@/hooks/use-document-title";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { Container } from "@/shared/components/section";

import { translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("AboutPage", ko, en);

const SERVICE_PILLARS = [
  {
    icon: Layers,
    ko: {
      title: "이야기와 제작을 한 프로젝트로",
      body: "기획, 캐릭터와 세계관, 콘티, 작화, 검수와 내보내기를 서로 끊기지 않는 제작 흐름으로 연결합니다.",
    },
    en: {
      title: "Story and production in one project",
      body: "Connect planning, characters, storyboards, drawing, review and export without breaking the creative flow.",
    },
  },
  {
    icon: Save,
    ko: {
      title: "게시보다 먼저, 안전하게 저장",
      body: "작품 공개를 강요하지 않습니다. 이어서 작업하고, 복구하고, 다른 플랫폼에도 활용할 수 있도록 저장과 내보내기를 우선합니다.",
    },
    en: {
      title: "Save first, publish when ready",
      body: "Publishing is optional. Saving, recovery and export come first so the work can continue or move to another destination.",
    },
  },
  {
    icon: MessageSquare,
    ko: {
      title: "혼자서도, 팀으로도 같은 흐름",
      body: "1인 창작부터 스토리·콘티·작화·편집 담당자가 나뉜 제작팀까지 역할과 전달 단계를 이해하기 쉽게 구성합니다.",
    },
    en: {
      title: "One flow for solo and team creation",
      body: "Use the same understandable handoff from solo creation to teams with separate story, storyboard, art and editing roles.",
    },
  },
] as const;

const AUDIENCES = [
  {
    href: "/story-lab",
    icon: Sparkles,
    ko: {
      title: "이야기를 시작하는 창작자",
      body: "로그라인, 인물의 욕망과 갈등, 에피소드의 중심을 먼저 정리합니다.",
      cta: "스토리 기획하기",
    },
    en: {
      title: "Creators starting with a story",
      body: "Shape the logline, character desire, conflict and the core of each episode.",
      cta: "Plan the story",
    },
  },
  {
    href: "/studio/new",
    icon: Layers,
    ko: {
      title: "직접 완성하는 1인 작가",
      body: "새 프로젝트를 만들고 콘티부터 작화, 저장과 내보내기까지 한곳에서 이어갑니다.",
      cta: "새 작품 시작하기",
    },
    en: {
      title: "Solo creators finishing the work",
      body: "Start a project and continue from storyboard to drawing, saving and export in one place.",
      cta: "Start a new work",
    },
  },
  {
    href: "/collaborate",
    icon: UsersRound,
    ko: {
      title: "역할이 나뉜 제작팀",
      body: "스토리 작가, 콘티 작가, 작화 담당과 편집 담당이 무엇을 주고받는지 명확하게 봅니다.",
      cta: "협업 둘러보기",
    },
    en: {
      title: "Production teams with clear roles",
      body: "Make handoffs between story, storyboard, art and editing roles easier to understand.",
      cta: "Explore collaboration",
    },
  },
  {
    href: "/learn",
    icon: BookOpen,
    ko: {
      title: "처음 배우는 입문자",
      body: "제작 용어와 순서를 먼저 익히고, 실제 작업공간에서 단계별로 연습합니다.",
      cta: "제작 배우기",
    },
    en: {
      title: "Beginners learning the process",
      body: "Learn production terms and sequence, then practice step by step inside the workspace.",
      cta: "Learn creation",
    },
  },
] as const;

const GUIDE_CARDS = [
  {
    href: "/about/workflow",
    icon: Layers,
    eyebrow: "01 · WORKFLOW",
    ko: {
      title: "웹툰은 어떤 순서로 만들어질까요?",
      body: "작품 기획부터 캐릭터 설정, 대본·콘티, 작화, 검수, 저장·내보내기와 연재 운영까지 일곱 단계로 확인합니다.",
      cta: "제작 과정 보기",
    },
    en: {
      title: "How does a webtoon move from idea to release?",
      body: "Follow seven stages from planning and character design to storyboard, drawing, review, saving, export and release operations.",
      cta: "See the workflow",
    },
  },
  {
    href: "/about/technology",
    icon: Wrench,
    eyebrow: "02 · TECHNOLOGY",
    ko: {
      title: "브라우저 작업실은 어떻게 동작할까요?",
      body: "웹 애플리케이션, 2D·3D 제작 엔진, 로컬 저장, 오프라인 기반, 협업과 품질 검증 기술을 사용자 관점에서 설명합니다.",
      cta: "기술과 신뢰 보기",
    },
    en: {
      title: "How does a browser creative studio work?",
      body: "Understand the web app, 2D and 3D engines, local storage, offline foundations, collaboration and quality practices.",
      cta: "See technology and trust",
    },
  },
  {
    href: "/about/principles",
    icon: ShieldCheck,
    eyebrow: "03 · PRINCIPLES",
    ko: {
      title: "어떤 기준으로 제품과 정책을 결정할까요?",
      body: "창작 흐름, 작품 권리, AI 보조, 열린 파일, 협업, 수익화와 접근성을 판단하는 창작자 중심 제품 원칙을 공개합니다.",
      cta: "제품 원칙 보기",
    },
    en: {
      title: "What standards guide product and policy decisions?",
      body: "Review creator-first principles for creative flow, rights, AI assistance, open files, collaboration, monetisation and accessibility.",
      cta: "See product principles",
    },
  },
] as const;

export function AboutPage() {
  useBilingualI18nRevision();




  useDocumentTitle(
    bi("ToonStudio 서비스 소개 · 웹툰 제작을 잇는 작업실", "About ToonStudio · A connected webtoon production studio"),
  );

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <PublicStoryHero
        eyebrow="ABOUT · TOONSTUDIO"
        title={
          bi("아이디어부터 완성된 웹툰까지, 하나의 작업실에서.", "From the first idea to a finished webtoon, in one studio.")
        }
        description={
          bi("ToonStudio는 스토리 기획, 콘티, 드로잉, 캐릭터와 배경, 협업, 검수, 저장과 내보내기를 연결하는 브라우저 기반 웹툰 제작 작업실입니다.", "ToonStudio is a browser-based webtoon production studio connecting story planning, storyboards, drawing, characters, backgrounds, collaboration, review, saving and export.")
        }
        image="world"
        imageAlt={
          bi("이야기 기획과 드로잉, 협업과 완성 원고가 하나의 창작 세계로 연결된 일러스트", "Illustration connecting story planning, drawing, collaboration and finished pages in one creative world")
        }
        caption={
          bi("PLAN → DRAW → REVIEW → SAVE · 연결된 웹툰 제작 작업실", "PLAN → DRAW → REVIEW → SAVE · A connected webtoon production studio")
        }
      >
        <div className="flex flex-wrap gap-3">
          <Link
            href="/studio/new"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2"
          >
            {bi("새 작품 시작하기", "Start a new work")}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link
            href="/about/workflow"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-5 py-3 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg"
          >
            <BookOpen size={16} aria-hidden="true" />
            {bi("제작 과정 알아보기", "Learn the workflow")}
          </Link>
        </div>
      </PublicStoryHero>

      <AboutSectionNav className="mt-8" />

      <section className="py-14 sm:py-20" aria-labelledby="about-purpose-title">
        <div className="grid gap-8 md:grid-cols-[0.72fr_1.28fr] md:gap-14">
          <div>
            <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.AboutPage", "en", "WHAT TOONSTUDIO CONNECTS")}</p>
            <h2
              id="about-purpose-title"
              className="mt-4 max-w-sm text-balance text-2xl font-bold tracking-tight text-fg sm:text-3xl"
            >
              {bi("도구를 늘어놓기보다, 다음 행동을 이어줍니다.", "Not a pile of tools, but a connected next action.")}
            </h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-fg-2">
              {bi("기능이 많아도 창작자가 길을 잃지 않도록 현재 제작 단계에 맞는 작업공간과 자료, 저장 경로를 함께 안내합니다.", "Even as the feature set grows, the studio guides creators toward the workspace, reference and saving path that fit the current stage.")}
            </p>
          </div>

          <div className="grid gap-4">
            {SERVICE_PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              const copy = bi((pillar).ko, (pillar).en);

              return (
                <article
                  key={copy.title}
                  className="flex gap-5 rounded-3xl border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-6"
                >
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
                    <Icon size={21} aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold text-fg">{copy.title}</h3>
                    <p className="mt-2 text-sm leading-7 text-fg-2">{copy.body}</p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section aria-labelledby="about-audience-title">
        <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.AboutPage", "en", "BUILT AROUND CREATOR ROLES")}</p>
        <h2
          id="about-audience-title"
          className="mt-3 text-2xl font-bold tracking-tight text-fg sm:text-3xl"
        >
          {bi("누구의 작업이든, 시작점을 찾기 쉽게.", "An understandable starting point for every creator.")}
        </h2>
        <p className="mt-4 max-w-3xl text-sm leading-7 text-fg-2">
          {bi("처음 방문한 사용자는 자신의 역할과 현재 단계에서 출발하고, 익숙해진 뒤에는 같은 프로젝트 안에서 더 전문적인 작업공간으로 이동할 수 있습니다.", "New visitors can begin from their role and current stage, then move into more advanced workspaces within the same project as they grow.")}
        </p>

        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          {AUDIENCES.map((audience) => {
            const Icon = audience.icon;
            const copy = bi((audience).ko, (audience).en);

            return (
              <Link
                key={audience.href}
                href={audience.href}
                className="group rounded-3xl border border-line/70 bg-card/65 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg sm:p-6"
              >
                <Icon size={21} className="text-accent" aria-hidden="true" />
                <h3 className="mt-5 text-lg font-bold text-fg">{copy.title}</h3>
                <p className="mt-2 text-sm leading-7 text-fg-2">{copy.body}</p>
                <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent">
                  {copy.cta}
                  <ArrowRight
                    size={15}
                    className="transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="py-14 sm:py-20" aria-labelledby="about-guides-title">
        <p className="eyebrow text-accent">{translateCurrentStaticSourceText("domains.legal.AboutPage", "en", "EXPLORE THE PRODUCT")}</p>
        <h2
          id="about-guides-title"
          className="mt-3 text-2xl font-bold tracking-tight text-fg sm:text-3xl"
        >
          {bi("제작 흐름과 기술을 더 깊이 살펴보세요.", "Go deeper into the workflow and technology.")}
        </h2>

        <div className="mt-7 grid gap-5 lg:grid-cols-3">
          {GUIDE_CARDS.map((guide) => {
            const Icon = guide.icon;
            const copy = bi((guide).ko, (guide).en);

            return (
              <Link
                key={guide.href}
                href={guide.href}
                className="group relative overflow-hidden rounded-[2rem] border border-line/70 bg-panel/70 p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-xl sm:p-8"
              >
                <span
                  aria-hidden="true"
                  className="absolute -right-12 -top-12 size-40 rounded-full border border-accent/15"
                />
                <p className="font-display text-[0.65rem] font-bold uppercase tracking-[0.15em] text-accent">
                  {guide.eyebrow}
                </p>
                <Icon size={26} className="mt-8 text-accent" aria-hidden="true" />
                <h3 className="mt-5 max-w-lg text-balance text-xl font-bold tracking-tight text-fg sm:text-2xl">
                  {copy.title}
                </h3>
                <p className="mt-3 max-w-xl text-sm leading-7 text-fg-2">{copy.body}</p>
                <span className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-accent">
                  {copy.cta}
                  <ArrowRight
                    size={16}
                    className="transition-transform group-hover:translate-x-1"
                    aria-hidden="true"
                  />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section
        className="grid gap-7 border-y border-line bg-panel/45 px-6 py-8 md:grid-cols-2 sm:px-8"
        aria-label={bi("제품의 약속과 데이터 안내", "Product commitments and data")}
      >
        <div>
          <ShieldCheck size={22} className="text-accent" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-fg">
            {bi("작업을 지키는 습관까지.", "A practice that protects your work.")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-fg-2">
            {bi("자동 저장과 복구가 있더라도 중요한 작업은 별도 파일로 내보내 보관하는 흐름을 안내합니다. 게시 여부와 관계없이 작품은 먼저 창작자의 작업물입니다.", "Even with autosave and recovery, the product encourages exported copies of important work. A work belongs to its creator before it is ever published.")}
          </p>
          <Link
            href="/help"
            className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent"
          >
            {bi("저장·복구 도움말", "Saving and recovery help")}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <div>
          <BookOpen size={22} className="text-accent" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-fg">
            {bi("출처와 사용 조건을 함께.", "Sources and usage conditions stay visible.")}
          </h2>
          <p className="mt-3 text-sm leading-7 text-fg-2">
            {bi("참고자료와 외부 데이터는 출처, 갱신 상태와 사용 범위를 구분해 안내합니다. 기술 소개에서도 사용자에게 필요한 정보와 공개하면 안 되는 운영 정보를 분리합니다.", "References and external data distinguish source, update state and usage scope. Technology documentation also separates useful user information from sensitive operations detail.")}
          </p>
          <Link
            href="/about/data"
            className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent"
          >
            {bi("데이터 출처 확인하기", "Review data sources")}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </Container>
  );
}
