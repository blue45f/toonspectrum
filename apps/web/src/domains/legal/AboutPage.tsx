import { translateCurrentStaticSourceText, useBilingualLocalizer } from "@/shared/lib/i18n-bilingual-copy";
import {
  ArrowRight,
  BookOpen,
  CirclePlay,
  Database,
  FileOutput,
  Layers,
  LifeBuoy,
  PanelsTopLeft,
  Play,
  Save,
  Sparkles,
  UsersRound,
} from "lucide-react";

import { AboutSectionNav } from "./AboutSectionNav";

import Link from "@/shared/navigation/router-link";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { HeroBlock } from "@/shared/components/layout";
import { Container } from "@/shared/components/section";
import { AboutFeatureShowcase, type AboutFeature } from "@/domains/marketing/public/about-feature-showcase";
import {
  AboutJourneyPager,
  IntroActions,
  IntroSectionHeading,
  IntroStepStrip,
  ServiceFlowNext,
  type IntroStep,
} from "@/domains/marketing/public/intro-primitives";
import { StudioWindowMock } from "@/domains/marketing/public/intro-studio-window";
import { INTRO_PAGE, INTRO_SECTION } from "@/domains/marketing/public/intro-tokens";

const SCOPE = "domains.legal.AboutPage";

/** 첫 화면의 한 줄 가치 세 가지(예전 '왜 ToonStudio' 섹션). 자세한 기준은 제품 원칙 페이지가 소유한다. */
const VALUE_CHIPS = [
  { icon: Layers, ko: "기획부터 연재까지 한 프로젝트", en: "One project from plan to release" },
  { icon: Save, ko: "게시보다 저장·내보내기 먼저", en: "Save and export before publishing" },
  { icon: UsersRound, ko: "1인 작가도 팀도 같은 흐름", en: "Same flow for solo and teams" },
] as const;

/** 발표·소개의 핵심 기능 다섯 가지. 모두 실제 작업공간으로 연결한다. */
const ABOUT_CORE_FEATURES = [
  {
    id: "drawing",
    image: "/brand/illustrated-20260928/canvas-noir-640.webp",
    href: "/studio/canvas",
    secondary: "/studio/comic",
    ko: { tab: "드로잉", title: "드로잉·컷 연출", body: "브러시·레이어·보정과 컷·말풍선·식자를 하나의 캔버스에서 다룹니다.", points: ["레이어·선택·보정이 있는 전문 브러시", "컷 분할·말풍선·식자까지 같은 화면", "자동 저장과 버전 기록으로 되돌리기"], cta: "캔버스 열기", secondaryCta: "컷툰 편집기" },
    en: { tab: "Drawing", title: "Drawing and panels", body: "Brushes, layers and corrections sit next to panels, balloons and lettering on one canvas.", points: ["Professional brushes with layers, selection and adjustments", "Panels, balloons and lettering on the same screen", "Autosave and version history to roll back"], cta: "Open the canvas", secondaryCta: "Comic editor" },
  },
  {
    id: "three-d",
    image: "/brand/illustrated-20260928/character-pink-640.webp",
    href: "/studio/assets/characters/new",
    secondary: "/studio/bg3d",
    ko: { tab: "3D", title: "3D 캐릭터·배경", body: "프리셋 캐릭터의 포즈와 3D 배경·카메라 구도를 잡아 현재 컷에 연결합니다.", points: ["얼굴·헤어·의상·포즈 프리셋", "카메라 앵글로 어려운 구도 잡기", "3D 배경을 컷의 밑그림으로"], cta: "3D 캐릭터 만들기", secondaryCta: "3D 배경 스튜디오" },
    en: { tab: "3D", title: "3D characters and sets", body: "Pose preset characters, frame 3D sets and cameras, then bring them to the panel.", points: ["Face, hair, outfit and pose presets", "Camera angles for difficult compositions", "3D sets as a base for the panel"], cta: "Create a 3D character", secondaryCta: "3D background studio" },
  },
  {
    id: "collaboration",
    image: "/brand/workflow-20260928/collaborate-640.webp",
    href: "/production",
    secondary: "/production/projects/sample-project/overview",
    ko: { tab: "협업", title: "협업·제작 관리", body: "회차·담당자·마감·수정 요청·승인을 실제 원고에 연결해 누락 없이 넘깁니다.", points: ["공정 보드에서 카드로 진행 관리", "담당자·마감·검토 상태를 한눈에", "수정 요청과 승인 기록"], cta: "제작 관리 열기", secondaryCta: "샘플 프로젝트 체험" },
    en: { tab: "Team", title: "Collaboration and production", body: "Connect episodes, owners, deadlines, revision requests and approvals to the actual manuscript.", points: ["Track progress as cards on a production board", "Owners, deadlines and review state at a glance", "Revision requests and approvals on record"], cta: "Open production", secondaryCta: "Try a sample project" },
  },
  {
    id: "virtual-studio",
    image: "/assets/virtual-studio/cinematic-v9/campus-social-480.webp",
    href: "/studio/space",
    secondary: "/collaborate",
    ko: { tab: "가상 스튜디오", title: "가상 스튜디오", body: "내 캐릭터로 걷고 만나며, 같은 공간에서 팀과 이야기하고 함께 작업합니다.", points: ["내 캐릭터로 공간을 걸어 다니기", "가까이 다가가면 대화", "팀이 모이는 작업실·회의 공간"], cta: "가상 스튜디오 입장", secondaryCta: "함께할 사람 찾기" },
    en: { tab: "Virtual studio", title: "Virtual studio", body: "Walk and meet as your character, then talk and work with the team in the same space.", points: ["Walk the space as your character", "Talk when you come close", "Shared rooms for work and meetings"], cta: "Enter the virtual studio", secondaryCta: "Find collaborators" },
  },
  {
    id: "ai",
    image: "/brand/illustrated-20260928/luna-640.webp",
    href: "/studio/ai-lab",
    secondary: "/about/principles",
    ko: { tab: "AI 보조", title: "AI 보조", body: "반복 작업과 아이디어 탐색을 돕고, 결과 적용과 최종 판단은 창작자가 결정합니다.", points: ["장면 구도·대사 아이디어 제안", "내 API 키로, 내가 고른 도구", "적용 여부는 항상 창작자가 선택"], cta: "AI 도구 보기", secondaryCta: "AI 원칙 보기" },
    en: { tab: "AI assist", title: "AI assistance", body: "AI helps with repetition and exploration while the creator decides what is applied and final.", points: ["Ideas for framing and dialogue", "Your API key, your chosen tools", "The creator always chooses what to apply"], cta: "See AI tools", secondaryCta: "Read the AI principle" },
  },
] as const satisfies readonly AboutFeature[];

/** 한 작품이 지나는 네 단계와 각 단계에서 남는 결과물. 자세한 일곱 단계는 /about/workflow가 소유한다. */
const HOW_IT_WORKS = [
  { id: "plan", icon: BookOpen, href: "/story-lab", ko: { title: "기획", output: "인물표·시놉시스" }, en: { title: "Plan", output: "Cast sheet · synopsis" } },
  { id: "create", icon: PanelsTopLeft, href: "/studio/new", ko: { title: "제작", output: "컷·말풍선·3D 구도" }, en: { title: "Create", output: "Panels · balloons · 3D framing" } },
  { id: "review", icon: UsersRound, href: "/production", ko: { title: "협업·검토", output: "수정 요청·승인본" }, en: { title: "Review together", output: "Revisions · approved version" } },
  { id: "publish", icon: FileOutput, href: "/studio/publish", ko: { title: "저장·발행", output: "내보내기 파일·게시본" }, en: { title: "Save and publish", output: "Export files · release" } },
] as const;

/** 역할별 시작점. 처음 온 사람이 자기 역할에서 바로 출발한다. */
const AUDIENCES = [
  { href: "/story-lab", icon: Sparkles, ko: { title: "스토리 작가", cta: "스토리 기획하기" }, en: { title: "Story writers", cta: "Plan the story" } },
  { href: "/studio/new", icon: Layers, ko: { title: "1인 작가", cta: "새 작품 시작하기" }, en: { title: "Solo creators", cta: "Start a new work" } },
  { href: "/production", icon: UsersRound, ko: { title: "제작팀", cta: "제작 관리 둘러보기" }, en: { title: "Production teams", cta: "Explore production" } },
  { href: "/learn", icon: BookOpen, ko: { title: "처음 배우는 입문자", cta: "제작 배우기" }, en: { title: "Beginners", cta: "Learn creation" } },
] as const;

/** 영상으로 먼저 보고 싶은 사람을 위한 두 편. 포스터는 저장소에 이미 있는 자산이다. */
const EXPLORE_FILMS = [
  { href: "/product-tour", poster: "/brand/toonstudio-product-tour-poster.jpg", time: "8:24", ko: { title: "8분 제품 투어", meta: "9개 챕터 · 한·영 자막" }, en: { title: "8-minute product tour", meta: "9 chapters · KO/EN captions" } },
  { href: "/brand-film", poster: "/brand/toonstudio-film-poster.jpg", time: "0:24", ko: { title: "24초 브랜드 필름", meta: "창작 흐름을 짧게" }, en: { title: "24-second brand film", meta: "The creative flow, in brief" } },
] as const;

/** 읽을거리: 작품을 지키는 습관, 출처 안내. */
const MORE_LINKS = [
  { href: "/help", icon: LifeBuoy, ko: "저장·복구 도움말", en: "Saving and recovery help" },
  { href: "/about/data", icon: Database, ko: "데이터 출처", en: "Data sources" },
] as const;

export function AboutPage() {
  const bi = useBilingualLocalizer(SCOPE);
  const eyebrow = (text: string) => translateCurrentStaticSourceText(SCOPE, "en", text);

  useDocumentTitle(bi("ToonStudio 서비스 소개 · 웹툰 제작을 잇는 작업실", "About ToonStudio · A connected webtoon production studio"));

  const howSteps: readonly IntroStep[] = HOW_IT_WORKS.map((step) => {
    const copy = bi(step.ko, step.en);
    return { id: step.id, href: step.href, icon: step.icon, title: copy.title, detail: copy.output };
  });

  return (
    <Container size="wide" className={INTRO_PAGE}>
      <HeroBlock
        eyebrow="ABOUT · TOONSTUDIO"
        title={bi("아이디어부터 완성된 웹툰까지, 하나의 작업실에서.", "From the first idea to a finished webtoon, in one studio.")}
        lede={bi("기획·드로잉·3D·협업·발행을 한 작품 흐름으로 잇는 브라우저 웹툰 작업실이에요.", "A browser webtoon studio that connects planning, drawing, 3D, collaboration and publishing in one flow.")}
        actions={(
          <IntroActions
            primary={{ href: "/studio/new", label: bi("새 작품 시작하기", "Start a new work") }}
            secondary={{ href: "/product-tour", label: bi("8분 제품 투어 보기", "Watch the 8-minute tour"), icon: CirclePlay }}
          />
        )}
        media={(
          <div className="grid gap-3">
            <StudioWindowMock caption={false} />
            <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden" aria-label={bi("ToonStudio의 약속", "What ToonStudio stands for")}>
              {VALUE_CHIPS.map((chip) => {
                const Icon = chip.icon;
                return (
                  <li key={chip.en} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-line/70 bg-card/60 px-3 text-sm font-semibold text-fg-2">
                    <Icon size={14} className="text-accent" aria-hidden="true" />{bi(chip.ko, chip.en)}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      />

      <AboutSectionNav variant="compact" className="mt-4" />

      <section className="pb-8 pt-8 sm:pb-12 sm:pt-12" aria-labelledby="about-features-title">
        <IntroSectionHeading
          id="about-features-title"
          eyebrow={eyebrow("CORE FEATURES")}
          title={bi("다섯 가지 핵심 기능, 눌러서 바로 보기.", "Five core features. Tap to see each one.")}
        />
        <div className="mt-5">
          <AboutFeatureShowcase features={ABOUT_CORE_FEATURES} label={bi("핵심 기능", "Core features")} />
        </div>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="about-how-title">
        <IntroSectionHeading
          id="about-how-title"
          eyebrow={eyebrow("HOW IT WORKS")}
          title={bi("하나의 작품이 네 단계로 이어집니다.", "One work moves through four connected stages.")}
          action={(
            <Link href="/about/workflow" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-accent hover:text-accent-2">
              {bi("일곱 단계 자세히 보기", "See all seven stages")}<ArrowRight size={15} aria-hidden="true" />
            </Link>
          )}
        />
        <IntroStepStrip steps={howSteps} label={bi("작품이 지나는 네 단계", "Four stages of a work")} className="mt-5" />
      </section>

      <section className={INTRO_SECTION} aria-labelledby="about-audience-title">
        <IntroSectionHeading
          id="about-audience-title"
          eyebrow={eyebrow("START BY ROLE")}
          title={bi("내 역할에서 바로 시작하세요.", "Start from your role.")}
        />
        <ul className="mt-5 grid grid-cols-2 gap-2.5 lg:grid-cols-4" aria-label={bi("역할별 시작점", "Starting points by role")}>
          {AUDIENCES.map((audience) => {
            const Icon = audience.icon;
            const copy = bi(audience.ko, audience.en);
            return (
              <li key={audience.href} className="min-w-0">
                <Link href={audience.href} className="group flex h-full min-h-16 items-center gap-3 rounded-2xl border border-line/70 bg-card/65 p-3 transition-colors hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 sm:p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent"><Icon size={19} aria-hidden="true" /></span>
                  <span className="min-w-0">
                    <span className="block break-keep text-sm font-bold text-fg sm:text-base">{copy.title}</span>
                    <span className="mt-0.5 flex items-center gap-1 break-keep text-sm font-semibold text-accent">{copy.cta}<ArrowRight size={13} className="shrink-0 transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" /></span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="about-explore-title">
        <IntroSectionHeading
          id="about-explore-title"
          eyebrow={eyebrow("WATCH FIRST")}
          title={bi("읽기보다 보고 싶다면, 영상으로.", "Prefer watching? Start with a film.")}
        />
        <ul className="-mx-4 mt-5 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden" aria-label={bi("소개 영상", "Introduction films")}>
          {EXPLORE_FILMS.map((film) => {
            const copy = bi(film.ko, film.en);
            return (
              <li key={film.href} className="w-[78%] shrink-0 snap-start sm:w-auto">
                <Link href={film.href} className="group grid overflow-hidden rounded-2xl border border-line/70 bg-card/65 transition-colors hover:border-accent/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70">
                  <span className="relative block aspect-video overflow-hidden bg-panel">
                    <img src={film.poster} alt="" width={1280} height={720} loading="lazy" decoding="async" className="size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100" />
                    <span className="absolute inset-0 grid place-items-center bg-gradient-to-t from-canvas/60 via-transparent to-transparent">
                      <span className="grid size-12 place-items-center rounded-full bg-accent text-on-accent shadow-lg"><Play size={20} fill="currentColor" aria-hidden="true" /></span>
                    </span>
                    <span className="absolute bottom-2 right-2 rounded-md bg-canvas/80 px-1.5 py-0.5 text-xs font-bold tabular-nums text-fg">{film.time}</span>
                  </span>
                  <span className="flex items-center justify-between gap-3 p-3.5">
                    <span className="min-w-0">
                      <span className="block break-keep font-bold text-fg">{copy.title}</span>
                      <span className="mt-0.5 block break-keep text-sm text-fg-2">{copy.meta}</span>
                    </span>
                    <ArrowRight size={17} className="shrink-0 text-accent transition-transform group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1" aria-label={bi("더 알아보기", "Learn more")}>
          {MORE_LINKS.map((link) => {
            const Icon = link.icon;
            return (
              <li key={link.href}>
                <Link href={link.href} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-fg-2 hover:text-fg">
                  <Icon size={15} className="text-accent" aria-hidden="true" />{bi(link.ko, link.en)}<ArrowRight size={13} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className={INTRO_SECTION} aria-labelledby="about-start-title">
        <h2 id="about-start-title" className="sr-only">{bi("다음 단계", "Next steps")}</h2>
        <ServiceFlowNext current="about" />
        <AboutJourneyPager current="/about" variant="quiet" className="mt-3" />
      </section>
    </Container>
  );
}
