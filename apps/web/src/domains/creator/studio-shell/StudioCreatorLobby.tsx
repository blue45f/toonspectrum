import {
  ArrowRight,
  BookOpenText,
  Brush,
  Clock3,
  FolderKanban,
  ImagePlus,
  MessageCircleMore,
  PanelsTopLeft,
  Sparkles,
  UserRoundPen,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";

import Link from "@/compat/router-link";
import { buttonClass } from "@/shared/components/ui/button-utils";
import {
  formatI18nTemplate,
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

import {
  STUDIO_PROJECT_KIND_LABELS,
  studioProjectIsTemporaryWork,
  studioProjectLibraryDateLabel,
} from "./studio-project-library-management-model";
import type { StudioProjectLibraryManagementController } from "./useStudioProjectLibraryManagementController";

const HERO_ART = "/brand/toonstudio-visual-identity/creator-lobby-hero.webp";
const AI_DIRECTOR_ART = "/brand/toonstudio-visual-identity/ai-creative-director.webp";

const FALLBACK_PROJECT_ART = [
  HERO_ART,
  "/brand/atelier-world-640.webp",
  "/brand/atelier-process-640.webp",
  "/brand/atelier-materials-640.webp",
] as const;

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioCreatorLobby", ko, en);

interface LobbyAction {
  readonly href: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly metaKo: string;
  readonly metaEn: string;
  readonly tone: "violet" | "blue" | "pink" | "cyan" | "amber";
  readonly Icon: LucideIcon;
}

const LOBBY_ACTIONS: readonly LobbyAction[] = [
  {
    href: "/studio/new?kind=webtoon&template=webtoon-vertical",
    labelKo: "새 에피소드",
    labelEn: "New episode",
    metaKo: "세로 웹툰",
    metaEn: "Vertical webtoon",
    tone: "violet",
    Icon: PanelsTopLeft,
  },
  {
    href: "/story-lab",
    labelKo: "스토리 만들기",
    labelEn: "Build a story",
    metaKo: "대본·콘티",
    metaEn: "Script & storyboard",
    tone: "blue",
    Icon: BookOpenText,
  },
  {
    href: "/studio/assets/characters/new",
    labelKo: "캐릭터 만들기",
    labelEn: "Create a character",
    metaKo: "포즈·표정",
    metaEn: "Pose & expression",
    tone: "pink",
    Icon: UserRoundPen,
  },
  {
    href: "/studio/bg3d",
    labelKo: "배경 만들기",
    labelEn: "Create a background",
    metaKo: "2D·3D 장면",
    metaEn: "2D & 3D scene",
    tone: "cyan",
    Icon: ImagePlus,
  },
  {
    href: "/studio/new?kind=illustration&template=illustration-blank",
    labelKo: "빈 캔버스",
    labelEn: "Blank canvas",
    metaKo: "바로 그리기",
    metaEn: "Start drawing",
    tone: "amber",
    Icon: Brush,
  },
] as const;

const STARTER_CARDS = [
  {
    href: "/studio/new?kind=webtoon&template=webtoon-vertical",
    titleKo: "시네마틱 웹툰",
    titleEn: "Cinematic webtoon",
    metaKo: "세로 스크롤 · 컷 중심",
    metaEn: "Vertical scroll · Panel first",
    visual: HERO_ART,
  },
  {
    href: "/studio/new?kind=illustration&template=illustration-blank",
    titleKo: "캐릭터 일러스트",
    titleEn: "Character illustration",
    metaKo: "포스터 · 표지 · 키비주얼",
    metaEn: "Poster · Cover · Key visual",
    visual: "/brand/atelier-materials-640.webp",
  },
  {
    href: "/studio/new?kind=four-cut&template=four-cut-classic",
    titleKo: "4컷 스토리",
    titleEn: "Four-panel story",
    metaKo: "빠른 콘티 · 대사 연출",
    metaEn: "Fast storyboard · Dialogue",
    visual: "/brand/atelier-process-640.webp",
  },
] as const;

function openCreativeDirector(): void {
  globalThis.dispatchEvent(new CustomEvent("toonspectrum:command-palette:open"));
}

function recentProjects(
  controller: StudioProjectLibraryManagementController,
) {
  return controller.library.projects
    .filter((project) => project.status === "active")
    .sort((left, right) => Date.parse(right.lastOpenedAt) - Date.parse(left.lastOpenedAt))
    .slice(0, 4);
}

export function StudioCreatorLobby({
  controller,
}: {
  readonly controller: StudioProjectLibraryManagementController;
}) {
  useBilingualI18nRevision();
  const projects = recentProjects(controller);
  const activeCount = controller.viewCounts.active;
  const temporaryCount = controller.library.projects.filter(
    (project) => project.status === "active"
      && studioProjectIsTemporaryWork(controller.profiles.profileFor(project.id)),
  ).length;
  const safelySavedCount = Math.max(activeCount - temporaryCount, 0);

  return (
    <section
      className="studio-creator-lobby"
      data-studio-creator-lobby="true"
      aria-label={bi("툰스튜디오 크리에이터 로비", "ToonStudio creator lobby")}
    >
      <section className="studio-creator-hero" data-studio-creator-hero="true">
        <div className="studio-creator-hero__ink" aria-hidden="true" />
        <div className="studio-creator-hero__content">
          <div className="studio-creator-hero__eyebrow">
            <Sparkles size={14} aria-hidden="true" />
            TOONSTUDIO CREATOR LOBBY
          </div>
          <h1>{bi("오늘은 어떤 이야기를 만들까요?", "What story will you create today?")}</h1>
          <p>
            {bi(
              "스토리에서 캐릭터, 배경, 컷 연출과 연재까지 하나의 제작 흐름으로 이어집니다.",
              "Move from story to characters, backgrounds, panel direction, and publishing in one production flow.",
            )}
          </p>
          <div className="studio-creator-hero__buttons">
            <Link
              href="/studio/new"
              className={buttonClass({
                size: "lg",
                className: "studio-creator-hero__primary gap-2",
              })}
            >
              <WandSparkles size={17} aria-hidden="true" />
              {bi("새 작품 시작", "Start a new work")}
            </Link>
            <Link
              href="/studio/import"
              className={buttonClass({
                variant: "outline",
                size: "lg",
                className: "studio-creator-hero__secondary gap-2",
              })}
            >
              <FolderKanban size={17} aria-hidden="true" />
              {bi("작업 가져오기", "Import work")}
            </Link>
            <button
              type="button"
              onClick={openCreativeDirector}
              className={buttonClass({
                variant: "quiet",
                size: "lg",
                className: "studio-creator-hero__secondary gap-2",
              })}
            >
              <MessageCircleMore size={17} aria-hidden="true" />
              {bi("AI 디렉터에게 말하기", "Ask the AI director")}
            </button>
          </div>
          <div className="studio-creator-hero__metrics" aria-label={bi("작업 현황", "Workspace status")}>
            <span>
              <strong>{activeCount}</strong>
              {bi("진행 중 작품", "active works")}
            </span>
            <span>
              <strong>{safelySavedCount}</strong>
              {bi("저장 연결", "save connected")}
            </span>
            <span data-warning={temporaryCount > 0 || undefined}>
              <strong>{temporaryCount}</strong>
              {bi("임시 작업", "temporary works")}
            </span>
          </div>
        </div>
        <div className="studio-creator-hero__art" aria-hidden="true">
          <span className="studio-creator-hero__caption">INK · LIGHT · STORY</span>
        </div>
        <div className="studio-creator-quick-actions" aria-label={bi("빠른 시작", "Quick start")}>
          {LOBBY_ACTIONS.map(({ href, labelKo, labelEn, metaKo, metaEn, tone, Icon }) => (
            <Link key={href} href={href} data-tone={tone} className="studio-creator-quick-action">
              <span className="studio-creator-quick-action__icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <span className="studio-creator-quick-action__copy">
                <strong>{bi(labelKo, labelEn)}</strong>
                <small>{bi(metaKo, metaEn)}</small>
              </span>
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <div className="studio-creator-lobby__grid">
        <section className="studio-creator-projects" aria-labelledby="studio-recent-projects-title">
          <header className="studio-creator-section-heading">
            <div>
              <span>{projects.length > 0 ? bi("CONTINUE CREATING", "CONTINUE CREATING") : bi("STARTER WORLDS", "STARTER WORLDS")}</span>
              <h2 id="studio-recent-projects-title">
                {projects.length > 0 ? bi("최근 작업", "Recent work") : bi("추천 시작 템플릿", "Recommended starters")}
              </h2>
              <p>
                {projects.length > 0
                  ? bi("마지막 작업 위치에서 바로 이어서 만드세요.", "Continue exactly where you left off.")
                  : bi("작품의 분위기를 먼저 고르고 빠르게 시작하세요.", "Choose a visual world and start quickly.")}
              </p>
            </div>
            <Link href="/studio?view=active" className="studio-creator-section-link">
              {bi("모든 작업", "All work")}
              <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </header>

          <div className="studio-project-cover-shelf">
            {projects.length > 0
              ? projects.map((project, index) => {
                const resume = controller.projectResumeTarget(project);
                const visual = project.thumbnailUrl ?? FALLBACK_PROJECT_ART[index % FALLBACK_PROJECT_ART.length];
                return (
                  <Link
                    key={project.id}
                    href={resume.href}
                    onClick={() => controller.library.touch(project.id, resume.documentId)}
                    className="studio-project-cover"
                    aria-label={formatI18nTemplate(
                      String(bi("{value0} 이어서 작업", "Continue {value0}")),
                      { value0: project.title },
                    )}
                  >
                    <img src={visual} alt="" loading="lazy" decoding="async" />
                    <span className="studio-project-cover__veil" aria-hidden="true" />
                    <span className="studio-project-cover__kind">
                      {bi(
                        STUDIO_PROJECT_KIND_LABELS[project.kind].ko,
                        STUDIO_PROJECT_KIND_LABELS[project.kind].en,
                      )}
                    </span>
                    <span className="studio-project-cover__copy">
                      <strong>{`${project.title}${bi(" · 최근", " · Recent")}`}</strong>
                      <small>
                        <Clock3 size={12} aria-hidden="true" />
                        {studioProjectLibraryDateLabel(project.lastOpenedAt, controller.locale)}
                      </small>
                    </span>
                    <span className="studio-project-cover__play" aria-hidden="true">
                      <ArrowRight size={17} />
                    </span>
                  </Link>
                );
              })
              : STARTER_CARDS.map((starter) => (
                <Link key={starter.href} href={starter.href} className="studio-project-cover" data-starter="true">
                  <img src={starter.visual} alt="" loading="lazy" decoding="async" />
                  <span className="studio-project-cover__veil" aria-hidden="true" />
                  <span className="studio-project-cover__kind">TEMPLATE</span>
                  <span className="studio-project-cover__copy">
                    <strong>{bi(starter.titleKo, starter.titleEn)}</strong>
                    <small>{bi(starter.metaKo, starter.metaEn)}</small>
                  </span>
                  <span className="studio-project-cover__play" aria-hidden="true">
                    <ArrowRight size={17} />
                  </span>
                </Link>
              ))}
            <Link href="/studio/new" className="studio-project-cover studio-project-cover--new">
              <span className="studio-project-cover--new__icon" aria-hidden="true">
                <WandSparkles size={24} />
              </span>
              <strong>{bi("새 작품", "New work")}</strong>
              <small>{bi("아이디어에서 첫 컷까지", "From idea to first panel")}</small>
            </Link>
          </div>
        </section>

        <aside className="studio-ai-director" aria-labelledby="studio-ai-director-title">
          <div className="studio-ai-director__glow" aria-hidden="true" />
          <div className="studio-ai-director__heading">
            <span className="studio-ai-director__badge">
              <Sparkles size={13} aria-hidden="true" /> AI CREATIVE DIRECTOR
            </span>
            <h2 id="studio-ai-director-title">{bi("AI 디렉터와 함께", "Create with the AI director")}</h2>
            <p>
              {bi(
                "현재 프로젝트의 장면·캐릭터·대사를 이해하고 다음 제작 단계를 제안합니다.",
                "Understands your scenes, characters, and dialogue, then suggests the next production step.",
              )}
            </p>
          </div>
          <img className="studio-ai-director__art" src={AI_DIRECTOR_ART} alt="" aria-hidden="true" />
          <div className="studio-ai-director__prompt" role="group" aria-label={bi("AI 빠른 요청", "AI quick prompts")}>
            <button type="button" onClick={openCreativeDirector}>{bi("다음 장면 구도를 추천해줘", "Suggest the next panel composition")}</button>
            <Link href="/studio/assets/characters/new">{bi("캐릭터 표정 바꾸기", "Change a character expression")}</Link>
            <Link href="/studio/bg3d">{bi("배경을 밤으로 바꾸기", "Turn the background into night")}</Link>
          </div>
          <button type="button" onClick={openCreativeDirector} className="studio-ai-director__cta">
            <WandSparkles size={16} aria-hidden="true" />
            {bi("AI 디렉터 열기", "Open AI director")}
            <ArrowRight size={15} aria-hidden="true" />
          </button>
        </aside>
      </div>
    </section>
  );
}
