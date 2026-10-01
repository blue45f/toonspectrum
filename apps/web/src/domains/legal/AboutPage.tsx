import { translateCurrentStaticSourceText, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  BookOpen,
  Bot,
  Boxes,
  Brush,
  CirclePlay,
  Clapperboard,
  FileOutput,
  Layers,
  Map as MapIcon,
  MessageSquare,
  PanelsTopLeft,
  Save,
  ShieldCheck,
  Sparkles,
  UsersRound,
  Wrench,
} from "lucide-react";

import { AboutSectionNav } from "./AboutSectionNav";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { PublicStoryHero } from "@/shared/components/public-story-hero";
import { Container } from "@/shared/components/section";

const SCOPE = "domains.legal.AboutPage";
const SECTION_SCROLL_MARGIN = "scroll-mt-[calc(var(--site-header-sticky-offset,5rem)+1rem)]";
/** 좁은 화면에서는 카드를 가로로 넘겨 보게 해 소개 페이지가 지나치게 길어지지 않도록 한다. */
const MOBILE_RAIL = "-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto overscroll-x-contain px-4 pb-3 [scrollbar-width:thin] sm:mx-0 sm:grid sm:snap-none sm:overflow-visible sm:px-0 sm:pb-0";
const MOBILE_RAIL_ITEM = "w-[82%] shrink-0 snap-start sm:w-auto";

interface AboutCopy {
  readonly title: string;
  readonly body: string;
}

const SERVICE_PILLARS = [
  {
    icon: Layers,
    ko: { title: "이야기와 제작을 한 프로젝트로", body: "기획, 캐릭터와 세계관, 콘티, 작화, 검수와 내보내기를 서로 끊기지 않는 제작 흐름으로 연결합니다." },
    en: { title: "Story and production in one project", body: "Connect planning, characters, storyboards, drawing, review and export without breaking the creative flow." },
  },
  {
    icon: Save,
    ko: { title: "게시보다 먼저, 안전하게 저장", body: "작품 공개를 강요하지 않습니다. 이어서 작업하고, 복구하고, 다른 플랫폼에도 활용할 수 있도록 저장과 내보내기를 우선합니다." },
    en: { title: "Save first, publish when ready", body: "Publishing is optional. Saving, recovery and export come first so the work can continue or move to another destination." },
  },
  {
    icon: MessageSquare,
    ko: { title: "혼자서도, 팀으로도 같은 흐름", body: "1인 창작부터 스토리·콘티·작화·편집 담당자가 나뉜 제작팀까지 역할과 전달 단계를 이해하기 쉽게 구성합니다." },
    en: { title: "One flow for solo and team creation", body: "Use the same understandable handoff from solo creation to teams with separate story, storyboard, art and editing roles." },
  },
] as const;

const AUDIENCES = [
  {
    href: "/story-lab",
    icon: Sparkles,
    ko: { title: "이야기를 시작하는 창작자", body: "로그라인, 인물의 욕망과 갈등, 에피소드의 중심을 먼저 정리합니다.", cta: "스토리 기획하기" },
    en: { title: "Creators starting with a story", body: "Shape the logline, character desire, conflict and the core of each episode.", cta: "Plan the story" },
  },
  {
    href: "/studio/new",
    icon: Layers,
    ko: { title: "직접 완성하는 1인 작가", body: "새 프로젝트를 만들고 콘티부터 작화, 저장과 내보내기까지 한곳에서 이어갑니다.", cta: "새 작품 시작하기" },
    en: { title: "Solo creators finishing the work", body: "Start a project and continue from storyboard to drawing, saving and export in one place.", cta: "Start a new work" },
  },
  {
    href: "/production",
    icon: UsersRound,
    ko: { title: "역할이 나뉜 제작팀", body: "스토리 작가, 콘티 작가, 작화 담당과 편집 담당이 무엇을 주고받는지 명확하게 봅니다.", cta: "제작 관리 둘러보기" },
    en: { title: "Production teams with clear roles", body: "Make handoffs between story, storyboard, art and editing roles easier to understand.", cta: "Explore production" },
  },
  {
    href: "/learn",
    icon: BookOpen,
    ko: { title: "처음 배우는 입문자", body: "제작 용어와 순서를 먼저 익히고, 실제 작업공간에서 단계별로 연습합니다.", cta: "제작 배우기" },
    en: { title: "Beginners learning the process", body: "Learn production terms and sequence, then practice step by step inside the workspace.", cta: "Learn creation" },
  },
] as const;

/** 발표·소개의 핵심 기능 다섯 가지. 모두 실제 작업공간으로 연결한다. */
const ABOUT_CORE_FEATURES = [
  {
    id: "drawing",
    icon: Brush,
    image: "/brand/illustrated-20260928/canvas-noir-640.webp",
    width: 640,
    height: 638,
    href: "/studio/canvas",
    secondary: "/studio/comic",
    ko: { title: "드로잉·컷 연출", body: "브러시·레이어·선택·보정과 컷·말풍선·식자를 하나의 캔버스에서 다룹니다.", cta: "캔버스 열기", secondaryCta: "컷툰 편집기" },
    en: { title: "Drawing and panels", body: "Brushes, layers, selection and corrections sit next to panels, balloons and lettering on one canvas.", cta: "Open the canvas", secondaryCta: "Comic editor" },
  },
  {
    id: "three-d",
    icon: Boxes,
    image: "/brand/illustrated-20260928/character-pink-640.webp",
    width: 640,
    height: 637,
    href: "/studio/assets/characters/new",
    secondary: "/studio/bg3d",
    ko: { title: "3D 캐릭터·배경", body: "프리셋 캐릭터의 얼굴·헤어·의상·포즈와 3D 배경·카메라 구도를 잡아 현재 컷에 연결합니다.", cta: "3D 캐릭터 만들기", secondaryCta: "3D 배경 스튜디오" },
    en: { title: "3D characters and sets", body: "Adjust preset faces, hair, outfits and poses, frame 3D sets and cameras, then bring them to the panel.", cta: "Create a 3D character", secondaryCta: "3D background studio" },
  },
  {
    id: "collaboration",
    icon: UsersRound,
    image: "/brand/workflow-20260928/collaborate-640.webp",
    width: 640,
    height: 400,
    href: "/production",
    secondary: "/production/projects/sample-project/overview",
    ko: { title: "협업·제작 관리", body: "회차·담당자·마감·수정 요청·승인을 실제 원고에 연결해 누락 없이 넘깁니다.", cta: "제작 관리 열기", secondaryCta: "샘플 프로젝트 체험" },
    en: { title: "Collaboration and production", body: "Connect episodes, owners, deadlines, revision requests and approvals to the actual manuscript.", cta: "Open production", secondaryCta: "Try a sample project" },
  },
  {
    id: "virtual-studio",
    icon: MapIcon,
    image: "/assets/virtual-studio/cinematic-v9/campus-social-480.webp",
    width: 480,
    height: 270,
    href: "/studio/space",
    secondary: "/collaborate",
    ko: { title: "가상 스튜디오", body: "내 캐릭터로 걷고 만나며, 같은 공간에서 팀과 이야기하고 함께 작업합니다.", cta: "가상 스튜디오 입장", secondaryCta: "함께할 사람 찾기" },
    en: { title: "Virtual studio", body: "Walk and meet as your character, then talk and work with the team in the same space.", cta: "Enter the virtual studio", secondaryCta: "Find collaborators" },
  },
  {
    id: "ai",
    icon: Bot,
    image: "/brand/illustrated-20260928/luna-640.webp",
    width: 640,
    height: 637,
    href: "/studio/ai-lab",
    secondary: "/about/principles",
    ko: { title: "AI 보조", body: "반복 작업과 아이디어 탐색을 돕고, 결과 적용과 최종 판단은 창작자가 결정합니다.", cta: "AI 도구 보기", secondaryCta: "AI 원칙 보기" },
    en: { title: "AI assistance", body: "AI helps with repetition and exploration while the creator decides what is applied and final.", cta: "See AI tools", secondaryCta: "Read the AI principle" },
  },
] as const;

const HOW_IT_WORKS = [
  { icon: BookOpen, href: "/story-lab", ko: { title: "기획", body: "세계관·인물·회차 목표를 스토리 연구실에서 정리" }, en: { title: "Plan", body: "Shape the world, cast and episode goals in Story Lab" } },
  { icon: PanelsTopLeft, href: "/studio/new", ko: { title: "제작", body: "콘티·드로잉·3D로 컷을 완성하고 자동 저장" }, en: { title: "Create", body: "Finish panels with storyboards, drawing and 3D, saved automatically" } },
  { icon: UsersRound, href: "/production", ko: { title: "협업·검토", body: "담당자·수정 요청·승인을 작품 단위로 관리" }, en: { title: "Review together", body: "Manage owners, revisions and approvals per work" } },
  { icon: FileOutput, href: "/studio/publish", ko: { title: "저장·발행", body: "규격을 검사하고 내보내거나 독자에게 공개" }, en: { title: "Save and publish", body: "Validate, export, or publish to readers" } },
] as const;

const GUIDE_CARDS = [
  {
    href: "/about/studio",
    icon: Sparkles,
    eyebrow: "01 · STUDIO",
    ko: { title: "작업실은 어떻게 구성되어 있나요?", body: "시작 동선, 핵심 기능, 제작 흐름과 제품 원칙을 한 화면에서 둘러봅니다.", cta: "작업실 소개 보기" },
    en: { title: "How is the studio organized?", body: "Tour the starting points, core features, workflow and principles on one page.", cta: "See the studio tour" },
  },
  {
    href: "/about/workflow",
    icon: Layers,
    eyebrow: "02 · WORKFLOW",
    ko: { title: "웹툰은 어떤 순서로 만들어질까요?", body: "작품 기획부터 캐릭터 설정, 대본·콘티, 작화, 검수, 저장·내보내기와 연재 운영까지 일곱 단계로 확인합니다.", cta: "제작 과정 보기" },
    en: { title: "How does a webtoon move from idea to release?", body: "Follow seven stages from planning and character design to storyboard, drawing, review, saving, export and release operations.", cta: "See the workflow" },
  },
  {
    href: "/about/technology",
    icon: Wrench,
    eyebrow: "03 · TECHNOLOGY",
    ko: { title: "브라우저 작업실은 어떻게 동작할까요?", body: "웹 애플리케이션, 2D·3D 제작 엔진, 로컬 저장, 오프라인 기반, 협업과 품질 검증 기술을 사용자 관점에서 설명합니다.", cta: "기술과 신뢰 보기" },
    en: { title: "How does a browser creative studio work?", body: "Understand the web app, 2D and 3D engines, local storage, offline foundations, collaboration and quality practices.", cta: "See technology and trust" },
  },
  {
    href: "/about/principles",
    icon: ShieldCheck,
    eyebrow: "04 · PRINCIPLES",
    ko: { title: "어떤 기준으로 제품과 정책을 결정할까요?", body: "창작 흐름, 작품 권리, AI 보조, 열린 파일, 협업, 수익화와 접근성을 판단하는 창작자 중심 제품 원칙을 공개합니다.", cta: "제품 원칙 보기" },
    en: { title: "What standards guide product and policy decisions?", body: "Review creator-first principles for creative flow, rights, AI assistance, open files, collaboration, monetisation and accessibility.", cta: "See product principles" },
  },
] as const;

const VIDEOS = [
  { href: "/product-tour", poster: "/brand/toonstudio-product-tour-poster.jpg", icon: CirclePlay, ko: { title: "8분 제품 투어", body: "기획부터 게시 준비까지 9개 챕터 · 챕터마다 기능 바로 열기" }, en: { title: "8-minute product tour", body: "Nine chapters from planning to publishing, each opening its feature" } },
  { href: "/brand-film", poster: "/brand/toonstudio-film-poster.jpg", icon: Clapperboard, ko: { title: "24초 브랜드 필름", body: "아이디어가 첫 장면이 되는 순간 · 16:9·9:16·1:1" }, en: { title: "24-second brand film", body: "The moment an idea becomes a first scene · 16:9, 9:16, 1:1" } },
] as const;

const ON_PAGE_SECTIONS = [
  { id: "about-audience-title", ko: "누구를 위한가", en: "Who it's for" },
  { id: "about-purpose-title", ko: "왜 ToonStudio", en: "Why ToonStudio" },
  { id: "about-features-title", ko: "핵심 기능", en: "Core features" },
  { id: "about-how-title", ko: "작동 방식", en: "How it works" },
  { id: "about-videos-title", ko: "영상으로 보기", en: "Watch" },
  { id: "about-guides-title", ko: "더 알아보기", en: "Go deeper" },
] as const;

function SectionHeading({ id, eyebrow, title, body }: { readonly id: string; readonly eyebrow: string; readonly title: string; readonly body?: string }) {
  return (
    <div className="max-w-3xl">
      <p className="eyebrow text-accent">{eyebrow}</p>
      <h2 id={id} tabIndex={-1} className={`mt-3 text-balance break-keep text-2xl font-bold tracking-tight text-fg sm:text-3xl ${SECTION_SCROLL_MARGIN}`}>{title}</h2>
      {body ? <p className="mt-4 break-keep text-sm leading-7 text-fg-2 sm:text-base">{body}</p> : null}
    </div>
  );
}

function CardTitleBody({ copy }: { readonly copy: AboutCopy }) {
  return (
    <>
      <h3 className="break-keep text-lg font-bold text-fg">{copy.title}</h3>
      <p className="mt-2 break-keep text-sm leading-7 text-fg-2">{copy.body}</p>
    </>
  );
}

export function AboutPage() {
  const bi = useBilingualLocalizer(SCOPE);
  const eyebrow = (text: string) => translateCurrentStaticSourceText(SCOPE, "en", text);

  useDocumentTitle(bi("ToonStudio 서비스 소개 · 웹툰 제작을 잇는 작업실", "About ToonStudio · A connected webtoon production studio"));

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <PublicStoryHero
        purpose="create"
        eyebrow="ABOUT · TOONSTUDIO"
        title={bi("아이디어부터 완성된 웹툰까지, 하나의 작업실에서.", "From the first idea to a finished webtoon, in one studio.")}
        description={bi("ToonStudio는 스토리 기획, 드로잉, 3D 캐릭터·배경, 협업과 가상 스튜디오, 검수와 발행을 하나의 작품 흐름으로 잇는 브라우저 기반 웹툰 제작 작업실입니다.", "ToonStudio is a browser-based webtoon studio connecting story planning, drawing, 3D characters and sets, collaboration, a virtual studio, review and publishing in one flow.")}
        image="world"
        imageAlt={bi("이야기 기획과 드로잉, 협업과 완성 원고가 하나의 창작 세계로 연결된 일러스트", "Illustration connecting story planning, drawing, collaboration and finished pages in one creative world")}
        caption={bi("PLAN → DRAW → REVIEW → SAVE · 연결된 웹툰 제작 작업실", "PLAN → DRAW → REVIEW → SAVE · A connected webtoon production studio")}
      >
        <div className="flex flex-wrap gap-3">
          <Link href="/studio/new" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2">
            {bi("새 작품 시작하기", "Start a new work")}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/product-tour" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-5 py-3 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg">
            <CirclePlay size={16} aria-hidden="true" />
            {bi("8분 제품 투어 보기", "Watch the 8-minute tour")}
          </Link>
        </div>
      </PublicStoryHero>

      <AboutSectionNav className="mt-8" />

      <nav aria-label={bi("서비스 소개 목차", "About page sections")} className="mt-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        {ON_PAGE_SECTIONS.map((section) => (
          <a key={section.id} href={`#${section.id}`} className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-line/70 bg-panel/60 px-4 text-sm font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg">
            {bi(section.ko, section.en)}
          </a>
        ))}
      </nav>

      <section className="pt-12 sm:pt-16" aria-labelledby="about-audience-title">
        <SectionHeading
          id="about-audience-title"
          eyebrow={eyebrow("WHO IT'S FOR")}
          title={bi("누구의 작업이든, 시작점을 찾기 쉽게.", "An understandable starting point for every creator.")}
          body={bi("처음 방문한 사용자는 자신의 역할과 현재 단계에서 출발하고, 익숙해진 뒤에는 같은 프로젝트 안에서 더 전문적인 작업공간으로 이동할 수 있습니다.", "New visitors can begin from their role and current stage, then move into more advanced workspaces within the same project as they grow.")}
        />
        <div className={`mt-7 ${MOBILE_RAIL} sm:grid-cols-2 sm:gap-4 xl:grid-cols-4`}>
          {AUDIENCES.map((audience) => {
            const Icon = audience.icon;
            const copy = bi(audience.ko, audience.en);
            return (
              <Link key={audience.href} href={audience.href} className={`${MOBILE_RAIL_ITEM} group flex flex-col rounded-3xl border border-line/70 bg-card/65 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-lg sm:p-6`}>
                <Icon size={21} className="text-accent" aria-hidden="true" />
                <div className="mt-5"><CardTitleBody copy={copy} /></div>
                <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-semibold text-accent">
                  {copy.cta}
                  <ArrowRight size={15} className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="py-12 sm:py-16" aria-labelledby="about-purpose-title">
        <div className="grid gap-8 md:grid-cols-[0.72fr_1.28fr] md:gap-14">
          <SectionHeading
            id="about-purpose-title"
            eyebrow={eyebrow("WHY TOONSTUDIO")}
            title={bi("도구를 늘어놓기보다, 다음 행동을 이어줍니다.", "Not a pile of tools, but a connected next action.")}
            body={bi("기능이 많아도 창작자가 길을 잃지 않도록 현재 제작 단계에 맞는 작업공간과 자료, 저장 경로를 함께 안내합니다.", "Even as the feature set grows, the studio guides creators toward the workspace, reference and saving path that fit the current stage.")}
          />
          <div className="grid gap-4">
            {SERVICE_PILLARS.map((pillar) => {
              const Icon = pillar.icon;
              const copy = bi(pillar.ko, pillar.en);
              return (
                <article key={copy.title} className="flex gap-5 rounded-3xl border border-line/70 bg-panel/55 p-5 shadow-sm sm:p-6">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-accent/25 bg-accent-soft text-accent">
                    <Icon size={21} aria-hidden="true" />
                  </span>
                  <div><CardTitleBody copy={copy} /></div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-t border-line/70 py-12 sm:py-16" aria-labelledby="about-features-title">
        <SectionHeading
          id="about-features-title"
          eyebrow={eyebrow("CORE FEATURES")}
          title={bi("그리기부터 함께 만들기까지, 다섯 가지 핵심 기능.", "Five core features, from drawing to making together.")}
          body={bi("모든 카드는 실제 작업공간으로 바로 열립니다. 로그인 없이 둘러볼 수 있는 화면은 로컬에서 먼저 체험할 수 있어요.", "Every card opens the real workspace. Screens that work without signing in can be tried locally first.")}
        />
        <ul className={`mt-7 ${MOBILE_RAIL} sm:grid-cols-2 sm:gap-4 lg:grid-cols-5`}>
          {ABOUT_CORE_FEATURES.map((feature) => {
            const Icon = feature.icon;
            const copy = bi(feature.ko, feature.en);
            return (
              <li key={feature.id} data-about-feature={feature.id} className={`${MOBILE_RAIL_ITEM} flex flex-col overflow-hidden rounded-3xl border border-line/70 bg-card/70 transition-colors hover:border-accent/40`}>
                <img src={feature.image} alt="" width={feature.width} height={feature.height} loading="lazy" decoding="async" className="aspect-[16/10] w-full object-cover" />
                <div className="flex flex-1 flex-col p-5">
                  <span className="inline-flex size-9 items-center justify-center rounded-xl border border-accent/25 bg-accent-soft text-accent"><Icon size={18} aria-hidden="true" /></span>
                  <div className="mt-4"><CardTitleBody copy={copy} /></div>
                  <div className="mt-auto grid gap-1 pt-4">
                    <Link href={feature.href} className="inline-flex min-h-11 items-center justify-between gap-2 rounded-xl bg-accent px-4 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2">
                      {copy.cta}<ArrowRight size={15} aria-hidden="true" />
                    </Link>
                    <Link href={feature.secondary} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-fg-2 hover:text-fg">
                      {copy.secondaryCta}<ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="border-t border-line/70 py-12 sm:py-16" aria-labelledby="about-how-title">
        <SectionHeading
          id="about-how-title"
          eyebrow={eyebrow("HOW IT WORKS")}
          title={bi("하나의 작품이 네 단계로 이어집니다.", "One work moves through four connected stages.")}
          body={bi("각 단계의 결과물이 다음 단계의 입력이 됩니다. 단계별 자세한 결과물은 웹툰 제작 과정에서 확인하세요.", "Each stage's output becomes the next stage's input. See the webtoon workflow for detailed outputs.")}
        />
        <ol className="mt-7 grid grid-cols-2 gap-3 md:grid-cols-4">
          {HOW_IT_WORKS.map((step, index) => {
            const Icon = step.icon;
            const copy = bi(step.ko, step.en);
            return (
              <li key={step.href} className="relative">
                <Link href={step.href} className="group flex h-full flex-col rounded-3xl border border-line/70 bg-panel/60 p-5 transition-colors hover:border-accent/40">
                  <span className="flex items-center justify-between">
                    <span className="font-display text-sm font-bold tracking-[0.12em] text-accent">{String(index + 1).padStart(2, "0")}</span>
                    <Icon size={19} className="text-fg-3 group-hover:text-accent" aria-hidden="true" />
                  </span>
                  <span className="mt-4 text-lg font-bold text-fg">{copy.title}</span>
                  <span className="mt-2 break-keep text-sm leading-6 text-fg-2">{copy.body}</span>
                </Link>
                {index < HOW_IT_WORKS.length - 1 ? (
                  <ArrowRight size={16} className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-accent p-0.5 text-on-accent md:block" aria-hidden="true" />
                ) : null}
              </li>
            );
          })}
        </ol>
        <Link href="/about/workflow" className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent hover:text-accent-2">
          {bi("일곱 단계 제작 과정 자세히 보기", "See the seven-stage workflow")}<ArrowRight size={15} aria-hidden="true" />
        </Link>
      </section>

      <section className="border-t border-line/70 py-12 sm:py-16" aria-labelledby="about-videos-title">
        <SectionHeading
          id="about-videos-title"
          eyebrow={eyebrow("WATCH")}
          title={bi("영상으로 먼저 살펴보세요.", "Watch it first.")}
        />
        <div className="mt-7 grid gap-4 md:grid-cols-2">
          {VIDEOS.map((video) => {
            const Icon = video.icon;
            const copy = bi(video.ko, video.en);
            return (
              <Link key={video.href} href={video.href} className="group relative block overflow-hidden rounded-3xl border border-line/70 bg-panel">
                <img src={video.poster} alt="" width={1280} height={720} loading="lazy" decoding="async" className="aspect-video w-full object-cover opacity-80 transition-transform duration-500 group-hover:scale-[1.02] motion-reduce:transition-none" />
                <span className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/40 to-transparent" aria-hidden="true" />
                <span className="absolute inset-x-5 bottom-5 flex items-end justify-between gap-4">
                  <span>
                    <span className="block text-xl font-bold text-fg">{copy.title}</span>
                    <span className="mt-1 block break-keep text-sm text-fg-2">{copy.body}</span>
                  </span>
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-on-accent"><Icon size={22} aria-hidden="true" /></span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="border-t border-line/70 py-12 sm:py-16" aria-labelledby="about-guides-title">
        <SectionHeading
          id="about-guides-title"
          eyebrow={eyebrow("EXPLORE THE PRODUCT")}
          title={bi("작업실·제작 흐름·기술·원칙을 더 깊이.", "Go deeper into the studio, workflow, technology and principles.")}
        />
        <div className={`mt-7 ${MOBILE_RAIL} sm:grid-cols-2 sm:gap-4 xl:grid-cols-4`}>
          {GUIDE_CARDS.map((guide) => {
            const Icon = guide.icon;
            const copy = bi(guide.ko, guide.en);
            return (
              <Link key={guide.href} href={guide.href} className={`${MOBILE_RAIL_ITEM} group relative flex flex-col overflow-hidden rounded-[2rem] border border-line/70 bg-panel/70 p-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-xl motion-reduce:transition-none`}>
                <p className="font-display text-xs font-bold uppercase tracking-[0.15em] text-accent">{guide.eyebrow}</p>
                <Icon size={24} className="mt-6 text-accent" aria-hidden="true" />
                <h3 className="mt-4 text-balance break-keep text-lg font-bold tracking-tight text-fg sm:text-xl">{copy.title}</h3>
                <p className="mt-3 break-keep text-sm leading-7 text-fg-2">{copy.body}</p>
                <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-bold text-accent">
                  {copy.cta}
                  <ArrowRight size={16} className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none" aria-hidden="true" />
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="grid gap-7 rounded-3xl border border-line/70 bg-panel/45 px-6 py-8 md:grid-cols-2 sm:px-8" aria-label={bi("제품의 약속과 데이터 안내", "Product commitments and data")}>
        <div>
          <ShieldCheck size={22} className="text-accent" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-fg">{bi("작업을 지키는 습관까지.", "A practice that protects your work.")}</h2>
          <p className="mt-3 break-keep text-sm leading-7 text-fg-2">
            {bi("자동 저장과 복구가 있더라도 중요한 작업은 별도 파일로 내보내 보관하는 흐름을 안내합니다. 게시 여부와 관계없이 작품은 먼저 창작자의 작업물입니다.", "Even with autosave and recovery, the product encourages exported copies of important work. A work belongs to its creator before it is ever published.")}
          </p>
          <Link href="/help" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent">
            {bi("저장·복구 도움말", "Saving and recovery help")}<ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
        <div>
          <BookOpen size={22} className="text-accent" aria-hidden="true" />
          <h2 className="mt-4 text-lg font-bold text-fg">{bi("출처와 사용 조건을 함께.", "Sources and usage conditions stay visible.")}</h2>
          <p className="mt-3 break-keep text-sm leading-7 text-fg-2">
            {bi("참고자료와 외부 데이터는 출처, 갱신 상태와 사용 범위를 구분해 안내합니다. 기술 소개에서도 사용자에게 필요한 정보와 공개하면 안 되는 운영 정보를 분리합니다.", "References and external data distinguish source, update state and usage scope. Technology documentation also separates useful user information from sensitive operations detail.")}
          </p>
          <Link href="/about/data" className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-accent">
            {bi("데이터 출처 확인하기", "Review data sources")}<ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section className="mt-12 flex flex-col gap-6 rounded-[2rem] border border-accent/30 bg-gradient-to-br from-accent-soft via-panel to-panel p-6 sm:p-10 md:flex-row md:items-center md:justify-between" aria-labelledby="about-start-title">
        <div className="max-w-2xl">
          <p className="eyebrow text-accent">{eyebrow("START NOW")}</p>
          <h2 id="about-start-title" className="mt-3 text-balance break-keep text-2xl font-bold tracking-tight text-fg sm:text-3xl">{bi("첫 장면은 지금 바로 시작할 수 있어요.", "Your first scene can start right now.")}</h2>
          <p className="mt-3 break-keep text-sm leading-7 text-fg-2">{bi("빈 캔버스, 스토리 기획, 3D 캐릭터, 가상 스튜디오 — 가장 편한 곳에서 출발하세요.", "A blank canvas, story planning, a 3D character or the virtual studio—start wherever feels natural.")}</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href="/studio/new" className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-on-accent transition-colors hover:bg-accent-2">
            {bi("새 작품 시작하기", "Start a new work")}<ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/about/studio" rel="next" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong px-5 py-3 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg">
            {bi("다음: 작업실 둘러보기", "Next: Tour the studio")}<ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>
    </Container>
  );
}
