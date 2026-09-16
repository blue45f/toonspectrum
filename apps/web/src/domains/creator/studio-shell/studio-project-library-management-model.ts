import {
  studioSaveProfileNeedsDestination,
  type StudioSaveProfile,
} from "../save-first/studio-save-profile";
import type {
  StudioProjectKind,
  StudioProjectLibraryEntry,
} from "../studio-project-library-store";

export type StudioProjectLibraryLocale = "ko" | "en";
export type StudioProjectLibraryManagementView = "active" | "archived" | "trash";
export type StudioProjectLibrarySortMode = "recent" | "name" | "created";

export const STUDIO_PROJECT_LIBRARY_MANAGEMENT_LABELS: Readonly<
  Record<StudioProjectLibraryManagementView, Readonly<Record<StudioProjectLibraryLocale, string>>>
> = {
  active: { ko: "내 작업", en: "My work" },
  archived: { ko: "보관함", en: "Archive" },
  trash: { ko: "휴지통", en: "Trash" },
};

export const STUDIO_PROJECT_LIBRARY_MANAGEMENT_DESCRIPTIONS: Readonly<
  Record<StudioProjectLibraryManagementView, Readonly<Record<StudioProjectLibraryLocale, string>>>
> = {
  active: {
    ko: "임시 자동저장 작업과 정식 저장한 프로젝트를 한곳에서 이어서 관리합니다.",
    en: "Continue temporary autosaves and formally saved projects from one place.",
  },
  archived: {
    ko: "잠시 치워 둔 프로젝트를 선택하거나 한꺼번에 내 작업으로 복구합니다.",
    en: "Restore selected or all archived projects to My work.",
  },
  trash: {
    ko: "삭제한 프로젝트를 복구하거나, 확인 후 선택 삭제·휴지통 비우기를 실행합니다.",
    en: "Restore deleted projects or permanently remove selected items after confirmation.",
  },
};

export const STUDIO_PROJECT_KIND_LABELS: Readonly<
  Record<StudioProjectKind, Readonly<Record<StudioProjectLibraryLocale, string>>>
> = {
  webtoon: { ko: "웹툰", en: "Webtoon" },
  illustration: { ko: "일러스트", en: "Illustration" },
  image: { ko: "이미지 편집", en: "Image editing" },
  design: { ko: "디자인", en: "Design" },
  slides: { ko: "발표 자료", en: "Presentation" },
  storyboard: { ko: "스토리보드", en: "Storyboard" },
  "three-d": { ko: "3D 장면", en: "3D scene" },
  animation: { ko: "애니메이션", en: "Animation" },
};

export function studioProjectLibraryLocale(language: string): StudioProjectLibraryLocale {
  return language.toLowerCase().split(/[-_]/u)[0] === "ko" ? "ko" : "en";
}

export function resolveStudioProjectLibraryManagementView(
  value: string | null,
): StudioProjectLibraryManagementView {
  if (value === "archived" || value === "trash") return value;
  return "active";
}

export function studioProjectLibraryManagementViewHref(
  view: StudioProjectLibraryManagementView,
): string {
  return view === "active" ? "/studio" : `/studio?view=${view}`;
}

export function studioProjectLibraryDateLabel(
  value: string | null,
  locale: StudioProjectLibraryLocale,
): string {
  if (!value || !Number.isFinite(Date.parse(value))) {
    return locale === "ko" ? "아직 없음" : "Not yet";
  }
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function studioProjectIsTemporaryWork(profile: StudioSaveProfile): boolean {
  return studioSaveProfileNeedsDestination(profile);
}

export function studioProjectLibrarySearchText(
  project: StudioProjectLibraryEntry,
  locale: StudioProjectLibraryLocale,
): string {
  return [
    project.title,
    project.description,
    STUDIO_PROJECT_KIND_LABELS[project.kind][locale],
  ].join(" ").toLocaleLowerCase();
}

export function sortStudioProjectLibraryProjects(
  projects: readonly StudioProjectLibraryEntry[],
  sort: StudioProjectLibrarySortMode,
): readonly StudioProjectLibraryEntry[] {
  return [...projects].sort((left, right) => {
    if (sort === "name") return left.title.localeCompare(right.title);
    if (sort === "created") return Date.parse(right.createdAt) - Date.parse(left.createdAt);
    return Date.parse(right.lastOpenedAt) - Date.parse(left.lastOpenedAt)
      || Date.parse(right.updatedAt) - Date.parse(left.updatedAt);
  });
}
