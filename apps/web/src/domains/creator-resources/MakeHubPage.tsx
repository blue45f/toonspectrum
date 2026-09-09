import {
  ArrowRight,
  BookOpen,
  Box,
  Brush,
  Clock3,
  Images,
  LayoutGrid,
  Lightbulb,
  Music,
  Palette,
  Sparkles,
  Store,
} from "lucide-react";

import Link from "@/compat/router-link";
import { Container } from "@/shared/components/section";
import {
  FriendlyQuickGuide,
  PurposeExperienceStage,
} from "@/shared/components/purpose-experience-stage";
import { useI18n } from "@/shared/lib/i18n";
import { useDocumentTitle } from "@/hooks/use-document-title";

const COPY = {
  ko: {
    eyebrow: "CREATE",
    title: "만들고 싶은 결과에서 시작하세요.",
    body: "도구 이름을 외우지 않아도 됩니다. 빠르게 시작하거나, 프로젝트를 열거나, 자료부터 모을 수 있습니다.",
    projects: "프로젝트 센터",
    projectsBody: "최근 프로젝트, 로컬 초안, 공유받은 작업, 버전과 복구 항목을 확인합니다.",
    continue: "프로젝트 이어가기",
    open: "열기",
    quickTitle: "바로 만들기",
    quickBody: "형식을 고르면 필요한 작업공간으로 바로 연결됩니다.",
    flowTitle: "창작 흐름",
    flowBody: "영감과 자료를 모으는 단계부터 게시 준비까지 이어집니다.",
    toolsTitle: "전문 도구",
    toolsBody: "필요한 순간에만 열어 쓰는 전문 제작 도구입니다.",
    visualLabel: "아이디어에서 실제 결과물까지 이어지는 제작 흐름 미리보기",
    visualSteps: ["결과 선택", "작업공간 열기", "완성하기"],
    guideTitle: "처음 만드는 중이라면 이 순서만 기억하세요",
    guideBody: "툴 이름보다 결과를 먼저 고르면 필요한 기능이 자연스럽게 이어집니다.",
    guideSteps: [
      "빈 캔버스·웹툰·컷툰·캐릭터 중 만들 결과를 고릅니다.",
      "Studio 프로젝트 센터에서 자동 저장 위치와 최근 작업을 확인합니다.",
      "완성한 결과는 공개·마켓·출판 준비 단계로 바로 이어갑니다.",
    ],
    quick: [
      ["빈 캔버스", "일러스트와 자유 드로잉", "/studio?preset=illustration"],
      ["세로 웹툰", "모바일 스크롤 원고", "/studio?preset=webtoon"],
      ["4컷·컷툰", "컷과 대사를 빠르게 구성", "/studio?preset=4cut"],
      ["캐릭터", "캐릭터·표정·포즈 조형", "/studio/character"],
      ["배경·소품", "에셋을 찾고 Studio에 연결", "/market"],
    ],
    flow: [
      ["오늘의 영감", "빈 화면의 부담을 줄이는 짧은 장면 미션", "/now"],
      ["리서치", "출처와 이용조건을 보존하며 자료 모으기", "/research"],
      ["스토리 연구실", "인물·욕망·갈등·전환점을 구조화", "/story-lab"],
      ["Studio 프로젝트", "페이지·레이어·3D·협업으로 실제 원고 제작", "/studio/projects"],
      ["공개와 피드백", "창작 갤러리와 커뮤니티에서 작품 공유", "/create"],
    ],
    tools: [
      ["브러시 연구실", "브러시를 만들고 시험한 뒤 Studio나 마켓에 연결", "/brush-lab"],
      ["음악·사운드", "장면에 사용할 오디오를 제작하고 연결", "/music"],
      ["연재·출판 준비", "원고·권리·소개 자료를 제출 전에 점검", "/publishing"],
      ["작가 기회센터", "공모전·지원사업·제작 기회를 저장하고 추적", "/opportunities"],
    ],
  },
  en: {
    eyebrow: "CREATE",
    title: "Start with what you want to make.",
    body: "You do not need to memorize tool names. Start quickly, reopen a project, or begin with references.",
    projects: "Project Center",
    projectsBody: "Review recent projects, local drafts, shared work, versions and recovery items.",
    continue: "Continue a project",
    open: "Open",
    quickTitle: "Quick start",
    quickBody: "Choose a format and jump directly into the right workspace.",
    flowTitle: "Creative flow",
    flowBody: "Move from inspiration and research all the way to release preparation.",
    toolsTitle: "Specialist tools",
    toolsBody: "Open advanced production tools only when you need them.",
    visualLabel: "Preview of the path from an idea to a finished creative result",
    visualSteps: ["Choose result", "Open workspace", "Finish"],
    guideTitle: "If this is your first project, remember only this sequence",
    guideBody: "Choose the outcome first. The product will lead you to the tools that matter next.",
    guideSteps: [
      "Choose a blank canvas, webtoon, comic or character based on the result you want.",
      "Use Project Center to confirm recent work, autosave and storage before editing.",
      "Move finished work directly into publishing, Market or release preparation.",
    ],
    quick: [
      ["Blank canvas", "Illustration and free drawing", "/studio?preset=illustration"],
      ["Vertical webtoon", "Mobile scrolling manuscript", "/studio?preset=webtoon"],
      ["Four-panel comic", "Arrange panels and dialogue quickly", "/studio?preset=4cut"],
      ["Character", "Shape characters, expressions and poses", "/studio/character"],
      ["Backgrounds & props", "Find assets and connect them to Studio", "/market"],
    ],
    flow: [
      ["Daily inspiration", "Short scene prompts that reduce blank-page pressure", "/now"],
      ["Research", "Collect references while preserving sources and usage terms", "/research"],
      ["Story lab", "Structure character, desire, conflict and turning points", "/story-lab"],
      ["Studio projects", "Build real pages with layers, 3D and collaboration", "/studio/projects"],
      ["Release & feedback", "Share work through the creator gallery and community", "/create"],
    ],
    tools: [
      ["Brush lab", "Build and test brushes, then connect them to Studio or Market", "/brush-lab"],
      ["Music & sound", "Create audio and connect it to scenes", "/music"],
      ["Publishing prep", "Check manuscripts, rights and pitch materials before submission", "/publishing"],
      ["Creator opportunities", "Save and track contests, grants and production opportunities", "/opportunities"],
    ],
  },
} as const;

const QUICK_ICONS = [Brush, LayoutGrid, Images, Box, Store] as const;
const FLOW_ICONS = [Lightbulb, BookOpen, Sparkles, Palette, Images] as const;
const TOOL_ICONS = [Brush, Music, BookOpen, Clock3] as const;

export function MakeHubPage() {
  const language = useI18n((state) => state.lang);
  const locale = language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
  const copy = COPY[locale];
  useDocumentTitle(locale === "ko" ? "새로 만들기" : "New");

  return (
    <Container size="wide" className="py-7 sm:py-10 lg:py-12">
      <header className="relative overflow-hidden rounded-3xl border border-line bg-panel/55 p-5 sm:p-8 lg:p-10">
        <div aria-hidden="true" className="absolute -right-24 -top-32 size-80 rounded-full bg-[radial-gradient(circle,_oklch(0.72_0.185_42/0.2),_transparent_70%)]" />
        <div className="relative grid gap-7 xl:grid-cols-[minmax(0,1.08fr)_minmax(24rem,0.92fr)] xl:items-center">
          <div className="max-w-3xl">
            <p className="eyebrow flex items-center gap-2 text-accent"><Sparkles size={14} aria-hidden="true" />{copy.eyebrow}</p>
            <h1 className="mt-3 text-pretty font-display text-[clamp(2rem,6vw,4.4rem)] font-bold leading-[1] tracking-[-0.05em] text-fg">{copy.title}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-fg-2 sm:text-base">{copy.body}</p>

            <Link
              href="/studio/projects"
              className="mt-7 flex max-w-3xl items-center gap-4 rounded-2xl border border-accent/35 bg-accent-soft/35 p-4 transition-all hover:-translate-y-0.5 hover:border-accent/60 hover:bg-accent-soft/55 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent text-on-accent"><Palette size={20} aria-hidden="true" /></span>
              <span className="min-w-0 flex-1">
                <strong className="block text-sm text-fg">{copy.projects}</strong>
                <span className="mt-1 block text-xs leading-5 text-fg-3">{copy.projectsBody}</span>
              </span>
              <span className="hidden items-center gap-1.5 text-xs font-bold text-accent sm:inline-flex">{copy.continue}<ArrowRight size={14} aria-hidden="true" /></span>
            </Link>
          </div>

          <PurposeExperienceStage
            variant="create"
            ariaLabel={copy.visualLabel}
            steps={copy.visualSteps}
          />
        </div>
      </header>

      <FriendlyQuickGuide
        className="mt-5"
        title={copy.guideTitle}
        description={copy.guideBody}
        steps={copy.guideSteps}
      />

      <section className="mt-10" aria-labelledby="make-quick-title">
        <p className="eyebrow text-accent">01 · QUICK START</p>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="make-quick-title" className="text-2xl font-bold tracking-tight text-fg sm:text-3xl">{copy.quickTitle}</h2>
            <p className="mt-1 text-sm text-fg-3">{copy.quickBody}</p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {copy.quick.map(([title, body, href], index) => {
            const Icon = QUICK_ICONS[index];
            return (
              <Link key={href} href={href} className="group relative flex min-h-40 flex-col overflow-hidden rounded-2xl border border-line bg-card p-4 transition-all hover:-translate-y-1 hover:border-accent/40 hover:bg-raised hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
                <span aria-hidden="true" className="absolute -right-8 -top-8 size-24 rounded-full bg-accent/0 blur-2xl transition-colors group-hover:bg-accent/15" />
                <span className="relative grid size-10 place-items-center rounded-xl border border-line bg-panel text-fg-3 transition-all group-hover:-rotate-3 group-hover:border-accent/35 group-hover:text-accent"><Icon size={18} aria-hidden="true" /></span>
                <strong className="relative mt-4 text-sm text-fg">{title}</strong>
                <span className="relative mt-1.5 flex-1 text-xs leading-5 text-fg-3">{body}</span>
                <ArrowRight size={15} className="relative mt-3 text-accent transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mt-12" aria-labelledby="make-flow-title">
        <p className="eyebrow text-accent">02 · CREATIVE FLOW</p>
        <h2 id="make-flow-title" className="mt-2 text-2xl font-bold tracking-tight text-fg sm:text-3xl">{copy.flowTitle}</h2>
        <p className="mt-1 text-sm text-fg-3">{copy.flowBody}</p>
        <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {copy.flow.map(([title, body, href], index) => {
            const Icon = FLOW_ICONS[index];
            return (
              <li key={href}>
                <Link href={href} className="group flex h-full min-h-44 flex-col rounded-2xl border border-line bg-panel/45 p-4 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
                  <div className="flex items-center justify-between gap-3"><span className="font-display text-xs font-bold text-accent">0{index + 1}</span><Icon size={17} className="text-fg-3 transition-transform group-hover:scale-110 group-hover:text-accent" aria-hidden="true" /></div>
                  <strong className="mt-4 text-sm text-fg">{title}</strong>
                  <span className="mt-1.5 flex-1 text-xs leading-5 text-fg-3">{body}</span>
                  <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-accent">{copy.open}<ArrowRight size={13} className="transition-transform group-hover:translate-x-1" aria-hidden="true" /></span>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="mt-12" aria-labelledby="make-tools-title">
        <p className="eyebrow text-accent">03 · SPECIALIST TOOLS</p>
        <h2 id="make-tools-title" className="mt-2 text-2xl font-bold tracking-tight text-fg sm:text-3xl">{copy.toolsTitle}</h2>
        <p className="mt-1 text-sm text-fg-3">{copy.toolsBody}</p>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {copy.tools.map(([title, body, href], index) => {
            const Icon = TOOL_ICONS[index];
            return (
              <Link key={href} href={href} className="group flex min-h-24 items-center gap-4 rounded-2xl border border-line bg-card/70 p-4 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
                <span className="grid size-11 shrink-0 place-items-center rounded-2xl border border-line bg-panel text-fg-3 transition-transform group-hover:-rotate-3 group-hover:text-accent"><Icon size={19} aria-hidden="true" /></span>
                <span className="min-w-0 flex-1"><strong className="block text-sm text-fg">{title}</strong><span className="mt-1 block text-xs leading-5 text-fg-3">{body}</span></span>
                <ArrowRight size={16} className="shrink-0 text-fg-3 transition-transform group-hover:translate-x-1 group-hover:text-accent" aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      </section>
    </Container>
  );
}
