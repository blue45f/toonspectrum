import {
  ArrowRight,
  Clock3,
  Lightbulb,
  Plus,
  Sparkles,
  Upload,
  WandSparkles,
} from "lucide-react";
import { useId, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import Link from "@/shared/navigation/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import type { StudioProjectLibraryEntry } from "../studio-project-library-store";
import { StudioPageIntro } from "../page-intro/StudioPageIntro";
import { StudioProjectCardThumbnail } from "./StudioProjectCardThumbnail";
import {
  STUDIO_LIBRARY_SECTION_ID,
  studioLobbyArtSource,
  studioLobbyDirectorHref,
  studioLobbyDirectorSuggestions,
  studioLobbyIdeaHref,
  studioLobbyRecentProjects,
} from "./studio-creator-lobby-model";
import {
  studioProjectIsTemporaryWork,
  studioProjectLibraryDateLabel,
  studioProjectLibraryTypeLabel,
} from "./studio-project-library-management-model";
import { STUDIO_PROJECT_TITLE_MAX_LENGTH } from "./studio-project-title";
import type { StudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

import "./studio-creator-lobby.css";


const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioCreatorLobby", ko, en);

type LobbyTone = "violet" | "blue" | "pink" | "cyan" | "amber";

interface LobbyAction {
  readonly href: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly metaKo: string;
  readonly metaEn: string;
  readonly tone: LobbyTone;
  readonly art: string;
}

/** 빠른 시작 일곱 갈래. 다섯은 제작 화면으로, 여섯째는 회차·공정을 운영하는 제작 관리로, 마지막 하나는 아바타로 들어가는 가상 스튜디오로 이어진다. */
const LOBBY_ACTIONS: readonly LobbyAction[] = [
  {
    href: "/studio/new?kind=webtoon&template=webtoon-vertical",
    labelKo: "새 웹툰 시작하기",
    labelEn: "Start a webtoon",
    metaKo: "세로 연재 · 컷 중심",
    metaEn: "Vertical episodes · Panels",
    tone: "violet",
    art: "canvas-noir.webp",
  },
  {
    href: "/story-lab",
    labelKo: "스토리 만들기",
    labelEn: "Build a story",
    metaKo: "대본 · 콘티",
    metaEn: "Script & storyboard",
    tone: "blue",
    art: "storyboard.webp",
  },
  {
    href: "/studio/assets/characters/new",
    labelKo: "캐릭터 만들기",
    labelEn: "Create a character",
    metaKo: "포즈 · 표정",
    metaEn: "Pose & expression",
    tone: "pink",
    art: "character-pink.webp",
  },
  {
    href: "/studio/bg3d",
    labelKo: "배경 만들기",
    labelEn: "Create a background",
    metaKo: "2D · 3D 장면",
    metaEn: "2D & 3D scenes",
    tone: "cyan",
    art: "background-city.webp",
  },
  {
    href: "/studio/new?kind=illustration&template=illustration-blank",
    labelKo: "빈 캔버스",
    labelEn: "Blank canvas",
    metaKo: "지금 바로 그리기",
    metaEn: "Start drawing now",
    tone: "amber",
    art: "blank-canvas.webp",
  },
  {
    href: "/production",
    labelKo: "제작 관리 열기",
    labelEn: "Open production",
    metaKo: "회차 · 공정 · 원고 버전",
    metaEn: "Episodes · Stages · Versions",
    tone: "violet",
    art: "materials.webp",
  },
  {
    href: "/studio/space",
    labelKo: "가상 스튜디오 열기",
    labelEn: "Open the virtual studio",
    metaKo: "아바타 · 내 공간",
    metaEn: "Avatar · My space",
    tone: "violet",
    art: "background-classroom.webp",
  },
] as const;

interface StarterCard {
  readonly href: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly metaKo: string;
  readonly metaEn: string;
  readonly visual: string;
}

/** 작품이 없을 때만 보이는 시작 예시(예시 일러스트임을 표시한다). */
const STARTER_CARDS: readonly StarterCard[] = [
  {
    href: "/studio/new?kind=webtoon&template=webtoon-vertical",
    titleKo: "시네마틱 웹툰",
    titleEn: "Cinematic webtoon",
    metaKo: "세로 스크롤 · 컷 중심",
    metaEn: "Vertical scroll · Panel first",
    visual: "project-romance.webp",
  },
  {
    href: "/studio/new?kind=illustration&template=illustration-blank",
    titleKo: "캐릭터 일러스트",
    titleEn: "Character illustration",
    metaKo: "포스터 · 표지 · 키비주얼",
    metaEn: "Poster · Cover · Key visual",
    visual: "character-blue.webp",
  },
  {
    href: "/studio/new?kind=four-cut&template=four-cut-classic",
    titleKo: "4컷 스토리",
    titleEn: "Four-panel story",
    metaKo: "빠른 콘티 · 대사 연출",
    metaEn: "Fast storyboard · Dialogue",
    visual: "project-crimson.webp",
  },
] as const;

function scrollToLibrary(): void {
  const target = document.getElementById(STUDIO_LIBRARY_SECTION_ID);
  if (!target) return;
  const reduceMotion = typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  target.scrollIntoView?.({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
  target.focus({ preventScroll: true });
}

function StudioLobbyIdeaForm() {
  const navigate = useNavigate();
  const inputId = useId();
  const hintId = useId();
  const [idea, setIdea] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    navigate(studioLobbyIdeaHref(idea));
  };

  return (
    <div className="studio-lobby-idea-field">
      <label htmlFor={inputId} className="studio-lobby-idea__label">
        {bi("한 줄 아이디어로 시작", "Start from a one-line idea")}
      </label>
      <form className="studio-lobby-idea" onSubmit={submit}>
        <Lightbulb size={18} aria-hidden="true" />
        <input
          id={inputId}
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          maxLength={STUDIO_PROJECT_TITLE_MAX_LENGTH}
          autoComplete="off"
          enterKeyHint="go"
          aria-describedby={hintId}
          placeholder={bi("예: 비 오는 날의 첫사랑", "e.g. First love on a rainy day")}
        />
        <button type="submit" aria-label={bi("이 아이디어로 새 작품 만들기", "Create a new work from this idea")}>
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </form>
      <p id={hintId} className="studio-lobby-idea__hint">
        {bi(
          "새 작품 화면에서 제목 초안으로 채워지고, ‘아이디어부터’ 시작이 미리 선택됩니다.",
          "It fills the draft title on the new work page and preselects “Start from an idea”.",
        )}
      </p>
    </div>
  );
}

function StudioLobbyQuickStart() {
  return (
    <nav className="studio-lobby-quick" aria-label={bi("빠른 시작", "Quick start")}>
      <ul>
        {LOBBY_ACTIONS.map((action) => {
          const art = studioLobbyArtSource(action.art);
          return (
            <li key={action.href}>
              <Link href={action.href} className="studio-lobby-quick__card" data-tone={action.tone}>
                <img
                  className="studio-lobby-quick__art"
                  src={art.src}
                  srcSet={art.srcSet}
                  sizes="(min-width: 1024px) 18vw, 45vw"
                  alt=""
                  decoding="async"
                />
                <span className="studio-lobby-quick__copy">
                  <strong>{bi(action.labelKo, action.labelEn)}</strong>
                  <small>{bi(action.metaKo, action.metaEn)}</small>
                </span>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function StudioLobbyHero() {
  const heroArt = studioLobbyArtSource("hero.webp");
  return (
    <section className="studio-lobby-hero" aria-labelledby="studio-lobby-title">
      <div className="studio-lobby-hero__copy">
        <p className="studio-lobby-eyebrow">
          <Sparkles size={13} aria-hidden="true" />
          TOONSTUDIO CREATOR LOBBY
        </p>
        <h1 id="studio-lobby-title">{bi("오늘은 어떤 이야기를 만들까요?", "What story will you create today?")}</h1>
        <StudioPageIntro motif="pen" className="studio-lobby-hero__intro" />
        <p className="studio-lobby-hero__lead">
          {bi(
            "스토리에서 캐릭터, 배경, 컷 연출과 연재까지 하나의 제작 흐름으로 이어집니다.",
            "Move from story to characters, backgrounds, panel direction, and publishing in one production flow.",
          )}
        </p>
        <StudioLobbyIdeaForm />
        <div className="studio-lobby-hero__actions">
          <Link href="/studio/new" className={buttonClass({ size: "lg", className: "gap-2" })}>
            <Plus size={17} aria-hidden="true" />
            {bi("새 작품 시작", "Start a new work")}
          </Link>
          <Link href="/studio/import" className={buttonClass({ variant: "outline", size: "lg", className: "gap-2" })}>
            <Upload size={17} aria-hidden="true" />
            {bi("작업 가져오기", "Import work")}
          </Link>
          <Link href={studioLobbyDirectorHref()} className={buttonClass({ variant: "quiet", size: "lg", className: "gap-2" })}>
            <WandSparkles size={17} aria-hidden="true" />
            {bi("AI 디렉터에게 말하기", "Ask the AI director")}
          </Link>
        </div>
      </div>
      <figure className="studio-lobby-hero__art" aria-hidden="true">
        <img src={heroArt.src} srcSet={heroArt.srcSet} sizes="(min-width: 900px) 45vw, 100vw" alt="" decoding="async" fetchPriority="high" />
      </figure>
      <StudioLobbyQuickStart />
    </section>
  );
}

function StudioLobbyMetrics({
  activeCount,
  temporaryCount,
}: {
  readonly activeCount: number;
  readonly temporaryCount: number;
}) {
  const savedCount = Math.max(activeCount - temporaryCount, 0);
  return (
    <ul className="studio-lobby-metrics" aria-label={bi("작업 현황", "Workspace status")}>
      <li><strong>{activeCount}</strong>{bi("진행 중", "active")}</li>
      <li><strong>{savedCount}</strong>{bi("저장 연결", "save connected")}</li>
      <li data-warning={temporaryCount > 0 || undefined}>
        <strong>{temporaryCount}</strong>{bi("임시 작업", "temporary")}
      </li>
    </ul>
  );
}

function StudioLobbyProjectCard({
  controller,
  project,
}: {
  readonly controller: StudioProjectLibraryManagementController;
  readonly project: StudioProjectLibraryEntry;
}) {
  const resume = controller.projectResumeTarget(project);
  const temporary = studioProjectIsTemporaryWork(controller.profiles.profileFor(project.id));
  return (
    <Link
      href={resume.href}
      onClick={() => controller.library.touch(project.id, resume.documentId)}
      className="studio-lobby-project"
      aria-label={formatI18nTemplate(String(bi("{value0} 이어서 작업", "Continue {value0}")), { value0: project.title })}
    >
      <span className="studio-lobby-project__art">
        <StudioProjectCardThumbnail
          variant="cover"
          authUserId={controller.authUserId}
          locale={controller.locale}
          project={project}
        />
        {temporary ? <span className="studio-lobby-project__badge">{bi("임시", "Temporary")}</span> : null}
      </span>
      <span className="studio-lobby-project__copy">
        <strong>{project.title}</strong>
        <small>
          <Clock3 size={12} aria-hidden="true" />
          {`${studioProjectLibraryTypeLabel(project)} · ${studioProjectLibraryDateLabel(project.lastOpenedAt, controller.locale)}`}
        </small>
      </span>
    </Link>
  );
}

function StudioLobbyStarterCard({ starter }: { readonly starter: StarterCard }) {
  const art = studioLobbyArtSource(starter.visual);
  return (
    <Link href={starter.href} className="studio-lobby-project" data-starter="true">
      <span className="studio-lobby-project__art">
        <img src={art.src} srcSet={art.srcSet} sizes="(min-width: 1024px) 16vw, 45vw" alt="" loading="lazy" decoding="async" />
        <span className="studio-lobby-project__badge">{bi("예시", "Example")}</span>
      </span>
      <span className="studio-lobby-project__copy">
        <strong>{bi(starter.titleKo, starter.titleEn)}</strong>
        <small>{bi(starter.metaKo, starter.metaEn)}</small>
      </span>
    </Link>
  );
}

function StudioLobbyRecentShelf({
  controller,
  projects,
  temporaryCount,
}: {
  readonly controller: StudioProjectLibraryManagementController;
  readonly projects: readonly StudioProjectLibraryEntry[];
  readonly temporaryCount: number;
}) {
  const hasProjects = projects.length > 0;
  return (
    <section className="studio-lobby-panel studio-lobby-recent" aria-labelledby="studio-recent-projects-title">
      <header className="studio-lobby-panel__heading">
        <div>
          <h2 id="studio-recent-projects-title">
            {hasProjects ? bi("최근 프로젝트", "Recent projects") : bi("추천 시작 템플릿", "Recommended starters")}
          </h2>
          <p>
            {hasProjects
              ? bi("마지막 작업 위치에서 바로 이어서 만드세요.", "Continue exactly where you left off.")
              : bi("작품의 분위기를 먼저 고르고 빠르게 시작하세요.", "Choose a visual world and start quickly.")}
          </p>
        </div>
        {hasProjects ? (
          <StudioLobbyMetrics activeCount={controller.viewCounts.active} temporaryCount={temporaryCount} />
        ) : null}
        {hasProjects ? (
          <button type="button" className="studio-lobby-panel__link" onClick={scrollToLibrary}>
            {bi("전체 작업 보기", "See all work")}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        ) : (
          <Link href="/studio/templates" className="studio-lobby-panel__link">
            {bi("템플릿 모두 보기", "Browse all templates")}
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        )}
      </header>
      <ul className="studio-lobby-recent__grid">
        {hasProjects
          ? projects.map((project) => (
            <li key={project.id}>
              <StudioLobbyProjectCard controller={controller} project={project} />
            </li>
          ))
          : STARTER_CARDS.map((starter) => (
            <li key={starter.href}>
              <StudioLobbyStarterCard starter={starter} />
            </li>
          ))}
        <li>
          <Link href="/studio/new" className="studio-lobby-project studio-lobby-project--new">
            <span className="studio-lobby-project__new-icon" aria-hidden="true">
              <Plus size={24} />
            </span>
            <strong>{bi("새 프로젝트", "New project")}</strong>
            <small>{bi("아이디어에서 첫 컷까지", "From idea to first panel")}</small>
          </Link>
        </li>
      </ul>
    </section>
  );
}

/**
 * AI 크리에이티브 디렉터 안내. 대화는 AI 허브의 디렉터 영역에서 실제로 이뤄지므로
 * 여기서는 그곳으로 가는 길과 조건(로그인·키, 자동 반영 없음)만 정직하게 보여 준다.
 */
function StudioLobbyAiDirector() {
  const avatar = studioLobbyArtSource("luna.webp");
  return (
    <aside className="studio-lobby-panel studio-lobby-director" aria-labelledby="studio-ai-director-title">
      <div className="studio-lobby-director__head">
        <img className="studio-lobby-director__avatar" src={avatar.src} srcSet={avatar.srcSet} sizes="4rem" alt="" loading="lazy" decoding="async" />
        <div>
          <p className="studio-lobby-eyebrow">
            <Sparkles size={12} aria-hidden="true" /> AI CREATIVE DIRECTOR
          </p>
          <h2 id="studio-ai-director-title">{bi("AI 디렉터와 함께", "Create with the AI director")}</h2>
        </div>
      </div>
      <p className="studio-lobby-director__bubble">
        {bi(
          "아이디어나 장면 설명을 적으면 스토리 확장·캐릭터 설정 분석·장면 구도 추천을 글로 제안해요.",
          "Describe an idea or a scene and get written suggestions for story, characters and composition.",
        )}
      </p>
      <ul className="studio-lobby-director__prompts" aria-label={bi("AI 디렉터 제안 바로 열기", "Open an AI director suggestion")}>
        {studioLobbyDirectorSuggestions().map((suggestion) => (
          <li key={suggestion.id}>
            <Link href={studioLobbyDirectorHref(suggestion.id)} data-director-suggestion={suggestion.id}>
              <span>{bi(suggestion.title.ko, suggestion.title.en)}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ul>
      <p className="studio-lobby-director__note">
        {bi(
          "로그인하거나 내 무료 AI 키를 연결해야 합니다. 제안은 검토용 초안이며 작품에 자동으로 반영되지 않아요.",
          "Sign in or connect your own free AI key. Suggestions are drafts for review and never change your work automatically.",
        )}
      </p>
      <Link href={studioLobbyDirectorHref()} className={buttonClass({ className: "studio-lobby-director__cta gap-2" })}>
        <WandSparkles size={16} aria-hidden="true" />
        {bi("AI 디렉터 열기", "Open AI director")}
      </Link>
    </aside>
  );
}

/**
 * 작품 홈 첫 화면: 무엇을 만들지 → 이어서 할 작업 → 도움 받기 순서로 읽힌다.
 * 작품이 있으면 히어로를 줄여(`data-density="compact"`) 최근 프로젝트가 첫 화면 안에 들어오게 한다.
 */
export function StudioCreatorLobby({
  controller,
}: {
  readonly controller: StudioProjectLibraryManagementController;
}) {
  useBilingualI18nRevision();
  const recentProjects = studioLobbyRecentProjects(controller.library.projects);
  const temporaryCount = controller.library.projects.filter(
    (project) => project.status === "active"
      && studioProjectIsTemporaryWork(controller.profiles.profileFor(project.id)),
  ).length;

  return (
    <section
      className="studio-lobby"
      data-studio-creator-lobby="true"
      data-density={recentProjects.length > 0 ? "compact" : "full"}
      aria-label={bi("툰스튜디오 크리에이터 로비", "ToonStudio creator lobby")}
    >
      <StudioLobbyHero />
      <div className="studio-lobby__grid">
        <StudioLobbyRecentShelf controller={controller} projects={recentProjects} temporaryCount={temporaryCount} />
        <StudioLobbyAiDirector />
      </div>
    </section>
  );
}
