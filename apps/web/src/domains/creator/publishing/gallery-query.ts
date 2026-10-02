// 창작 갤러리의 보기 조건(탭·정렬·작품 유형·제작 방식·태그·포트폴리오) — 주소 검색 문자열 ↔ 화면 상태.
// 화면 파일(CreateGalleryPage 등)에서 분리해 두어, 주소 해석 규칙을 화면 없이 테스트하고 한곳에서 고친다.
import { BookOpen, Bookmark, LayoutGrid, UserCheck, type LucideIcon } from "lucide-react";

import type { ShowcaseGalleryTab } from "./showcase-links";

import {
  CREATOR_COMMUNITY_CONTENT_GROUPS,
  CREATOR_COMMUNITY_PROVENANCES,
  type CreatorCommunityContentGroup,
  type CreatorCommunityProvenance,
} from "@/shared/lib/creator-community-publication-contract";
import type { WorkSort } from "@/platform/creator-client";

export type Bilingual = (ko: string, en: string) => string;

/** [한국어, 영어] 한 쌍 — `bt(...pair)`로 펼쳐 쓴다. */
export type LabelPair = readonly [ko: string, en: string];

export const SORTS: readonly { value: WorkSort; ko: string; en: string }[] = [
  { value: "recent", ko: "최신", en: "Latest" },
  { value: "likes", ko: "인기", en: "Popular" },
  { value: "views", ko: "조회", en: "Most viewed" },
];

export const GALLERY_TABS: readonly { value: ShowcaseGalleryTab; ko: string; en: string; icon: LucideIcon }[] = [
  { value: "works", ko: "전체 작품", en: "All works", icon: LayoutGrid },
  { value: "series", ko: "시리즈", en: "Series", icon: BookOpen },
  { value: "following", ko: "팔로잉", en: "Following", icon: UserCheck },
  { value: "saved", ko: "북마크", en: "Bookmarks", icon: Bookmark },
];

export const CONTENT_GROUP_LABEL: Record<CreatorCommunityContentGroup, LabelPair> = {
  all: ["전체", "All"],
  illustration: ["일러스트", "Illustration"],
  webtoon: ["웹툰·만화", "Webtoon & comics"],
  process: ["제작 과정·WIP", "Process & WIP"],
};

export const PROVENANCE_FILTER_LABEL: Record<CreatorCommunityProvenance, LabelPair> = {
  human: ["직접 제작", "Human-made"],
  ai_assisted: ["AI 보조", "AI-assisted"],
  agent_assisted: ["AI 에이전트 협업", "AI agent collaboration"],
  ai_generated: ["AI 생성", "AI-generated"],
  mixed: ["혼합 제작", "Mixed"],
};

export const TABPANEL_ID = "showcase-gallery-panel";
export const galleryTabId = (tab: ShowcaseGalleryTab) => `showcase-gallery-tab-${tab}`;

export interface WorksQuery {
  readonly sort: WorkSort;
  readonly tag: string;
  readonly contentType: CreatorCommunityContentGroup;
  readonly provenance?: CreatorCommunityProvenance;
  readonly portfolio: boolean;
}

export interface GalleryView {
  readonly tab: ShowcaseGalleryTab;
  readonly query: WorksQuery;
}

function isSort(value: string | null): value is WorkSort {
  return SORTS.some((option) => option.value === value);
}

function isTab(value: string | null): value is ShowcaseGalleryTab {
  return GALLERY_TABS.some((option) => option.value === value);
}

function isContentGroup(value: string | null): value is CreatorCommunityContentGroup {
  return CREATOR_COMMUNITY_CONTENT_GROUPS.some((group) => group === value);
}

function isProvenance(value: string | null): value is CreatorCommunityProvenance {
  return CREATOR_COMMUNITY_PROVENANCES.some((item) => item === value);
}

/** 주소의 검색 문자열을 보기 조건으로 읽는다. 알 수 없는 값은 기본값(전체 작품·최신·전체 유형)으로 되돌린다. */
export function parseGalleryView(params: URLSearchParams): GalleryView {
  const tab = params.get("tab");
  const sort = params.get("sort");
  const content = params.get("content");
  const provenance = params.get("provenance");
  return {
    tab: isTab(tab) ? tab : "works",
    query: {
      sort: isSort(sort) ? sort : "recent",
      tag: params.get("tag") ?? "",
      contentType: isContentGroup(content) ? content : "all",
      provenance: isProvenance(provenance) ? provenance : undefined,
      portfolio: params.get("portfolio") === "1",
    },
  };
}

/** 값이 null이면 그 키를 지운다. 원본은 바꾸지 않고 새 객체를 돌려준다. */
export function patchSearchParams(source: URLSearchParams, patch: Readonly<Record<string, string | null>>): URLSearchParams {
  const params = new URLSearchParams(source);
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) params.delete(key);
    else params.set(key, value);
  }
  return params;
}

export function hasActiveFilters(query: WorksQuery): boolean {
  return Boolean(query.tag) || query.contentType !== "all" || Boolean(query.provenance) || query.portfolio;
}
