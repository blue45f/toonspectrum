import type { DeckTrack } from "./engineering-deck-state";
import { SEMINAR_LESSONS } from "./engineering-seminar-curriculum";
import type { EngineeringChapter, EngineeringStatus, LocalizedText } from "./engineering-story-content";
import { PUBLISHED_ENGINEERING_CHAPTERS } from "./engineering-story-published-content";
import {
  TALK_SLIDES,
  planTalkSections,
  talkSlideStartSeconds,
  type TalkModuleIcon,
  type TalkSlide,
  type TalkSlideLayout,
} from "./engineering-talk-deck";

/**
 * 발표 트랙별 슬라이드 모델. 화면·인쇄·오프라인 발표본이 같은 모델을 사용한다.
 * 문자열 번역은 호출자가 넘긴 `localize`가 담당하므로 이 모듈은 순수 함수로 유지한다.
 */

export type Localize = (text: LocalizedText) => string;

export type DeckSlideLayout = TalkSlideLayout | "chapter";

export interface DeckModuleTile {
  readonly id: string;
  readonly icon: TalkModuleIcon;
  readonly title: string;
  readonly body: string;
  readonly href?: string;
}

export interface DeckDemoStep {
  readonly href: string;
  readonly action: string;
  readonly expected: string;
  readonly fallback: string;
}

export interface DeckFact {
  readonly value: string;
  readonly label: string;
}

export interface DeckLink {
  readonly href: string;
  readonly label: string;
}

export interface DeckArt {
  readonly src: string;
  readonly alt: string;
}

export interface DeckStatusChip {
  readonly id: string;
  readonly title: string;
  readonly status: EngineeringStatus;
}

export interface DeckSlide {
  readonly id: string;
  readonly layout: DeckSlideLayout;
  readonly eyebrow: string;
  readonly title: string;
  readonly lead: string;
  readonly points: readonly string[];
  readonly notes: string;
  readonly sectionId: string;
  readonly plannedSeconds: number;
  readonly plannedStartSeconds: number;
  readonly flow?: readonly string[];
  readonly stack?: readonly string[];
  readonly facts?: readonly DeckFact[];
  readonly modules?: readonly DeckModuleTile[];
  readonly demoSteps?: readonly DeckDemoStep[];
  readonly links?: readonly DeckLink[];
  readonly statusChips?: readonly DeckStatusChip[];
  readonly art?: DeckArt;
  readonly question?: string;
  readonly status?: EngineeringStatus;
  readonly chapterId?: string;
  readonly evidence?: readonly string[];
}

export interface DeckSectionPlan {
  readonly id: string;
  readonly title: string;
  readonly order: number;
  readonly seconds: number;
  readonly startSeconds: number;
  readonly firstSlideIndex: number;
  readonly slideCount: number;
}

export interface DeckTrackModel {
  readonly track: DeckTrack;
  readonly slides: readonly DeckSlide[];
  readonly sections: readonly DeckSectionPlan[];
  readonly totalSeconds: number;
}

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export const DECK_TRACK_META: Record<DeckTrack, { readonly label: LocalizedText; readonly description: LocalizedText }> = {
  talk: {
    label: t("세미나 발표", "Seminar talk"),
    description: t(
      "문제 → 제품·데모 → 아키텍처 → 핵심 기술 → 품질 → 운영 → 한계 → 질의응답",
      "Problem → product and demo → architecture → core technology → quality → operations → limits → Q&A",
    ),
  },
  brief: {
    label: t("핵심 요약", "Executive brief"),
    description: t(
      "제품 문제, 기술 방어력, 비용과 권리 통제를 짧게 공유합니다.",
      "A short pass through the product problem, defensibility, cost and rights controls.",
    ),
  },
  lecture: {
    label: t("심화 강의", "Deep lecture"),
    description: t(
      "한 컷을 따라 입력·렌더링·저장·3D·협업·AI를 레슨 단위로 깊게 다룹니다.",
      "Follows one panel through input, rendering, storage, 3D, collaboration and AI lesson by lesson.",
    ),
  },
};

/** 요약·강의 트랙은 원본에 개별 시간이 없어 균등 배분한다(발표자 페이스 안내용). */
const BRIEF_SECONDS_PER_SLIDE = 60;
const LECTURE_SECONDS_PER_SLIDE = 90;

const chapterById = new Map<string, EngineeringChapter>(
  PUBLISHED_ENGINEERING_CHAPTERS.map((chapter) => [chapter.id, chapter]),
);

function findEngineeringChapter(chapterId: string | undefined): EngineeringChapter | undefined {
  return chapterId ? chapterById.get(chapterId) : undefined;
}

function requireChapter(chapterId: string): EngineeringChapter {
  const chapter = chapterById.get(chapterId);
  if (!chapter) throw new Error(`Unknown engineering chapter: ${chapterId}`);
  return chapter;
}

function withSchedule<T extends Omit<DeckSlide, "plannedStartSeconds">>(slides: readonly T[]): readonly DeckSlide[] {
  let elapsed = 0;
  return slides.map((slide) => {
    const scheduled: DeckSlide = { ...slide, plannedStartSeconds: elapsed };
    elapsed += slide.plannedSeconds;
    return scheduled;
  });
}

function sectionsFromSlides(
  slides: readonly DeckSlide[],
  titles: ReadonlyMap<string, string>,
): readonly DeckSectionPlan[] {
  const plans: DeckSectionPlan[] = [];
  slides.forEach((slide, index) => {
    const last = plans.at(-1);
    if (last && last.id === slide.sectionId) {
      plans[plans.length - 1] = { ...last, seconds: last.seconds + slide.plannedSeconds, slideCount: last.slideCount + 1 };
      return;
    }
    plans.push({
      id: slide.sectionId,
      title: titles.get(slide.sectionId) ?? slide.sectionId,
      order: plans.length + 1,
      seconds: slide.plannedSeconds,
      startSeconds: slide.plannedStartSeconds,
      firstSlideIndex: index,
      slideCount: 1,
    });
  });
  return plans;
}

function talkSlideToDeck(slide: TalkSlide, localize: Localize, startSeconds: number): DeckSlide {
  const chapter = findEngineeringChapter(slide.chapterId);
  return {
    id: slide.id,
    layout: slide.layout,
    eyebrow: localize(slide.eyebrow),
    title: localize(slide.title),
    lead: localize(slide.lead),
    points: slide.points.map(localize),
    notes: localize(slide.notes),
    sectionId: slide.section,
    plannedSeconds: slide.seconds,
    plannedStartSeconds: startSeconds,
    flow: slide.flow?.map(localize),
    stack: slide.stack,
    facts: slide.facts?.map((fact) => ({ value: typeof fact.value === "string" ? fact.value : localize(fact.value), label: localize(fact.label) })),
    modules: slide.modules?.map((module) => ({
      id: module.id,
      icon: module.icon,
      title: localize(module.title),
      body: localize(module.body),
      href: module.href,
    })),
    demoSteps: slide.demoSteps?.map((step) => ({
      href: step.href,
      action: localize(step.action),
      expected: localize(step.expected),
      fallback: localize(step.fallback),
    })),
    links: slide.links?.map((link) => ({ href: link.href, label: localize(link.label) })),
    statusChips: slide.statusChapterIds?.map((chapterId) => {
      const related = requireChapter(chapterId);
      return { id: related.id, title: localize(related.title), status: related.status };
    }),
    art: slide.art ? { src: slide.art.src, alt: localize(slide.art.alt) } : undefined,
    question: slide.question ? localize(slide.question) : undefined,
    status: chapter?.status,
    chapterId: chapter?.id,
    evidence: slide.evidence,
  };
}

function buildTalkTrack(localize: Localize): DeckTrackModel {
  const starts = talkSlideStartSeconds();
  const slides = TALK_SLIDES.map((slide, index) => talkSlideToDeck(slide, localize, starts[index] ?? 0));
  const sections = planTalkSections().map((section) => ({ ...section, title: localize(section.title) }));
  return {
    track: "talk",
    slides,
    sections,
    totalSeconds: slides.reduce((sum, slide) => sum + slide.plannedSeconds, 0),
  };
}

function chapterSlide(chapterId: string, localize: Localize, sectionId: string): Omit<DeckSlide, "plannedStartSeconds"> {
  const chapter = requireChapter(chapterId);
  return {
    id: chapter.id,
    layout: "chapter",
    eyebrow: chapter.eyebrow,
    title: localize(chapter.title),
    lead: localize(chapter.thesis),
    points: [localize(chapter.problem), localize(chapter.decision), localize(chapter.userValue)],
    notes: localize(chapter.tradeoff),
    sectionId,
    plannedSeconds: BRIEF_SECONDS_PER_SLIDE,
    stack: chapter.technologies,
    status: chapter.status,
    chapterId: chapter.id,
    evidence: chapter.evidence.map((item) => item.path),
  };
}

const BRIEF_CHAPTER_IDS = [
  "product-intent",
  "architecture",
  "pwa-continuity",
  "webrtc-media-authority",
  "web-3d-engine",
  "free-ai-routing",
  "cost-engineering",
  "quality",
  "licenses",
] as const;

function buildBriefTrack(localize: Localize): DeckTrackModel {
  const sectionId = "brief";
  const slides = withSchedule([
    {
      id: "brief-opening",
      layout: "cover",
      eyebrow: "TOONSTUDIO ENGINEERING BRIEF",
      title: localize(t("브라우저에서 웹툰 제작 스튜디오를 만들기까지", "Building a webtoon production studio in the browser")),
      lead: localize(t(
        "기획, 드로잉, 3D, 저장, 협업, AI와 연재 운영을 하나의 제작 맥락으로 연결한 기술 이야기입니다.",
        "An engineering story connecting planning, drawing, 3D, storage, collaboration, AI and serialization into one production context.",
      )),
      points: [
        localize(t("제품 문제부터 시작", "Start with the product problem")),
        localize(t("실제 상태와 설계 상태 구분", "Separate live and designed scope")),
        localize(t("코드·테스트·워크플로 근거 연결", "Connect code, tests and workflow evidence")),
      ],
      notes: localize(t(
        "기술 목록을 읽는 발표가 아니라 왜 이 경계를 선택했는지 설명하는 발표입니다.",
        "This presentation explains why boundaries were chosen instead of reading a technology list.",
      )),
      sectionId,
      plannedSeconds: BRIEF_SECONDS_PER_SLIDE,
    },
    ...BRIEF_CHAPTER_IDS.map((chapterId) => chapterSlide(chapterId, localize, sectionId)),
    {
      id: "brief-close",
      layout: "lessons",
      eyebrow: "DEFENSIBILITY · SCALE · TRUST",
      title: localize(t("기술은 기능 수가 아니라 연결된 제작 맥락을 지킵니다.", "The defensible asset is connected production context, not a feature count.")),
      lead: localize(t(
        "도메인 계약, 로컬 우선 데이터, 전문 엔진 경계와 검증 증거를 유지하면 기능을 추가해도 프로젝트의 맥락이 분해되지 않습니다.",
        "Domain contracts, local-first data, specialist engine boundaries and verification evidence keep project context intact as capability grows.",
      )),
      points: [
        localize(t("단계적 전문 기능 확장", "Incremental specialist capability")),
        localize(t("무료 우선에서 승인된 유료 승격", "Approved promotion from free-first infrastructure")),
        localize(t("권리와 provenance를 기능과 함께 관리", "Rights and provenance managed with features")),
      ],
      notes: localize(t(
        "과장된 완성도 주장보다 검증 가능한 현재 상태와 확장 경로를 강조합니다.",
        "Emphasize verifiable present state and expansion path instead of exaggerated completeness claims.",
      )),
      sectionId,
      plannedSeconds: BRIEF_SECONDS_PER_SLIDE,
    },
  ]);
  const titles = new Map([[sectionId, localize(t("핵심 요약", "Executive brief"))]]);
  return {
    track: "brief",
    slides,
    sections: sectionsFromSlides(slides, titles),
    totalSeconds: slides.reduce((sum, slide) => sum + slide.plannedSeconds, 0),
  };
}

function buildLectureTrack(localize: Localize): DeckTrackModel {
  const titles = new Map<string, string>();
  const slides = withSchedule(SEMINAR_LESSONS.map((lesson): Omit<DeckSlide, "plannedStartSeconds"> => {
    const sectionTitle = localize(lesson.section);
    const sectionId = lesson.section.en;
    titles.set(sectionId, sectionTitle);
    return {
      id: lesson.id,
      layout: "chapter",
      eyebrow: sectionTitle,
      title: localize(lesson.title),
      lead: localize(lesson.takeaway),
      points: lesson.points.map(localize),
      flow: lesson.flow.map(localize),
      notes: localize(lesson.script),
      question: localize(lesson.question),
      sectionId,
      plannedSeconds: LECTURE_SECONDS_PER_SLIDE,
      stack: lesson.technologies,
      status: findEngineeringChapter(lesson.chapterId)?.status,
      chapterId: lesson.chapterId,
      demoSteps: "demo" in lesson && lesson.demo
        ? [{
            href: lesson.demo.href,
            action: localize(lesson.demo.action),
            expected: localize(lesson.demo.expected),
            fallback: localize(lesson.demo.fallback),
          }]
        : undefined,
      evidence: findEngineeringChapter(lesson.chapterId)?.evidence.map((item) => item.path),
    };
  }));
  return {
    track: "lecture",
    slides,
    sections: sectionsFromSlides(slides, titles),
    totalSeconds: slides.reduce((sum, slide) => sum + slide.plannedSeconds, 0),
  };
}

/** 번역 없이 트랙별 슬라이드 수만 계산한다(URL 위치 범위 제한용). */
export function deckTrackSlideCount(track: DeckTrack): number {
  if (track === "brief") return BRIEF_CHAPTER_IDS.length + 2;
  if (track === "lecture") return SEMINAR_LESSONS.length;
  return TALK_SLIDES.length;
}

/** 트랙별 예정 발표 시간(초). 번역 없이 계산한다. */
export function deckTrackTotalSeconds(track: DeckTrack): number {
  if (track === "brief") return deckTrackSlideCount("brief") * BRIEF_SECONDS_PER_SLIDE;
  if (track === "lecture") return deckTrackSlideCount("lecture") * LECTURE_SECONDS_PER_SLIDE;
  return TALK_SLIDES.reduce((sum, slide) => sum + slide.seconds, 0);
}

export function buildDeckTrack(track: DeckTrack, localize: Localize): DeckTrackModel {
  if (track === "brief") return buildBriefTrack(localize);
  if (track === "lecture") return buildLectureTrack(localize);
  return buildTalkTrack(localize);
}

export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(Math.abs(totalSeconds)));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** 예정 시각 대비 진행 차이(초). 양수면 늦음, 음수면 여유. */
export function paceDeltaSeconds(elapsedSeconds: number, slide: Pick<DeckSlide, "plannedStartSeconds" | "plannedSeconds">): number {
  if (elapsedSeconds < slide.plannedStartSeconds) return elapsedSeconds - slide.plannedStartSeconds;
  const slideEnd = slide.plannedStartSeconds + slide.plannedSeconds;
  return elapsedSeconds > slideEnd ? elapsedSeconds - slideEnd : 0;
}
