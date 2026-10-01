import {
  BookMarked,
  BookOpen,
  Film,
  GraduationCap,
  LibraryBig,
  NotebookTabs,
  Presentation,
  Scale,
  Wrench,
  type LucideIcon,
} from "lucide-react";

import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 소개 하위 페이지의 단일 목록. 탭 메뉴·허브의 발표 동선·하단 이어보기가 모두 이 목록을 쓴다.
 *
 * 페이지별 목적(중복 없이):
 * - 제작 스토리: 왜·어떻게 만들었나(문제 → 선택 → 대가 서사)
 * - 플레이북: 재사용 가능한 설계 원칙과 아키텍처 결정
 * - 적용 가이드: 다른 서비스에 단계별로 옮기는 방법
 * - 심화 노트: 깊은 기술 노트와 장애·교훈
 * - 발표 모드: 30분 세미나 슬라이드와 발표자 도구
 *
 * 읽기 시간은 콘텐츠 원본으로 계산한 값을 고정해 두고, 테스트가 실제 콘텐츠와 일치하는지 확인한다
 * (허브가 대형 콘텐츠 모듈을 불러오지 않게 하기 위함).
 */

export type EngineeringPageId =
  | "story"
  | "playbook"
  | "guides"
  | "field-notes"
  | "deck"
  | "videos"
  | "references"
  | "glossary"
  | "licenses";

export type EngineeringPageGroup = "path" | "present" | "resources";

export interface EngineeringPageEntry {
  readonly id: EngineeringPageId;
  readonly href: string;
  readonly group: EngineeringPageGroup;
  /** 발표 동선 순서(1~5). 자료 페이지에는 없다. */
  readonly step?: number;
  readonly icon: LucideIcon;
  /** 한 줄로 끝나는 짧은 메뉴 이름. */
  readonly label: LocalizedText;
  /** 허브 카드와 하단 이어보기에 쓰는 한 줄 목적. */
  readonly purpose: LocalizedText;
  /** 한국어 기준 예상 읽기 시간(분). */
  readonly readingMinutes?: number;
  /** 발표 시간(분). */
  readonly talkMinutes?: number;
}

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export const ENGINEERING_PAGE_GROUPS: readonly { readonly id: EngineeringPageGroup; readonly label: LocalizedText }[] = [
  { id: "path", label: t("핵심", "Core") },
  { id: "present", label: t("발표", "Present") },
  { id: "resources", label: t("자료", "Resources") },
];

export const ENGINEERING_PAGES = [
  {
    id: "story",
    href: "/about/technology/story",
    group: "path",
    step: 1,
    icon: BookOpen,
    label: t("제작 스토리", "Story"),
    purpose: t("왜·어떻게 만들었나: 문제, 선택, 대가와 근거", "Why and how it was built: problems, choices, trade-offs, evidence"),
    readingMinutes: 28,
  },
  {
    id: "playbook",
    href: "/about/technology/playbook",
    group: "path",
    step: 2,
    icon: GraduationCap,
    label: t("플레이북", "Playbook"),
    purpose: t("재사용할 설계 원칙과 아키텍처 결정", "Reusable design principles and architecture decisions"),
    readingMinutes: 24,
  },
  {
    id: "guides",
    href: "/about/technology/guides",
    group: "path",
    step: 3,
    icon: Wrench,
    label: t("적용 가이드", "Guides"),
    purpose: t("다른 서비스에 단계별로 옮기는 방법", "Step-by-step adoption in another product"),
    readingMinutes: 23,
  },
  {
    id: "field-notes",
    href: "/about/technology/field-notes",
    group: "path",
    step: 4,
    icon: NotebookTabs,
    label: t("심화 노트", "Field notes"),
    purpose: t("깊은 기술 노트와 장애·교훈 기록", "Deep technical notes, incidents and lessons"),
    readingMinutes: 31,
  },
  {
    id: "deck",
    href: "/about/technology/deck",
    group: "present",
    step: 5,
    icon: Presentation,
    label: t("발표 모드", "Deck"),
    purpose: t("30분 세미나 슬라이드와 발표자 도구", "30-minute seminar slides and presenter tools"),
    talkMinutes: 30,
  },
  {
    id: "videos",
    href: "/about/technology/videos",
    group: "present",
    icon: Film,
    label: t("영상", "Video"),
    purpose: t("같은 원본으로 만드는 기술 소개 영상", "Engineering film rendered from the same source"),
  },
  {
    id: "references",
    href: "/about/technology/references",
    group: "resources",
    icon: LibraryBig,
    label: t("참고 자료", "References"),
    purpose: t("사용·평가·참고한 기술과 제품 구분", "Used, evaluated and referenced technology and products"),
  },
  {
    id: "glossary",
    href: "/about/technology/glossary",
    group: "resources",
    icon: BookMarked,
    label: t("용어집", "Glossary"),
    purpose: t("발표 용어를 쉬운 비유로 설명", "Talk terms explained with plain analogies"),
  },
  {
    id: "licenses",
    href: "/about/technology/licenses",
    group: "resources",
    icon: Scale,
    label: t("라이선스", "Licenses"),
    purpose: t("코드·폰트·에셋·AI 결과물의 권리", "Rights for code, fonts, assets and AI output"),
  },
] as const satisfies readonly EngineeringPageEntry[];

export const ENGINEERING_PATH_PAGES: readonly EngineeringPageEntry[] = ENGINEERING_PAGES
  .filter((page): page is Extract<(typeof ENGINEERING_PAGES)[number], { readonly step: number }> => "step" in page)
  .sort((a, b) => a.step - b.step);

export function findEngineeringPage(id: EngineeringPageId): EngineeringPageEntry {
  const page = ENGINEERING_PAGES.find((entry) => entry.id === id);
  if (!page) throw new Error(`Unknown engineering page: ${id}`);
  return page;
}

/** 현재 경로에 해당하는 페이지. 하위 경로·끝 슬래시도 같은 페이지로 본다. */
export function engineeringPageForPath(pathname: string): EngineeringPageEntry | undefined {
  const normalized = pathname.replace(/\/+$/u, "");
  return ENGINEERING_PAGES.find((page) => normalized === page.href || normalized.startsWith(`${page.href}/`));
}

/** 한국어 본문 읽기 속도(공백 제외 글자/분)와 영어 읽기 속도(단어/분). 안내용 근사치다. */
const KOREAN_CHARACTERS_PER_MINUTE = 500;
const ENGLISH_WORDS_PER_MINUTE = 230;

export function estimateReadingMinutes(texts: readonly string[], locale: "ko" | "en" = "ko"): number {
  const joined = texts.join(" ");
  if (locale === "en") {
    const words = joined.split(/\s+/u).filter(Boolean).length;
    return Math.max(1, Math.round(words / ENGLISH_WORDS_PER_MINUTE));
  }
  const characters = joined.replace(/\s+/gu, "").length;
  return Math.max(1, Math.round(characters / KOREAN_CHARACTERS_PER_MINUTE));
}

type TextSource = LocalizedText | readonly LocalizedText[] | undefined;

function isTextList(value: LocalizedText | readonly LocalizedText[]): value is readonly LocalizedText[] {
  return Array.isArray(value);
}

/** LocalizedText 묶음에서 한국어 문장만 모은다(읽기 시간 계산용). */
export function koreanTexts(values: readonly TextSource[]): string[] {
  const texts: string[] = [];
  for (const value of values) {
    if (!value) continue;
    if (isTextList(value)) texts.push(...value.map((item) => item.ko));
    else texts.push(value.ko);
  }
  return texts;
}
