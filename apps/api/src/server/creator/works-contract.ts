// 창작 작품(웹툰/컷툰) 공개 계약 — 타입과 순수 파서. feedback.ts 패턴을 따른다.
import { clampText } from "./shared";

import type { CreatorSeriesStatus } from "./community-contract";
import type { CreatorWorkRevisionComparisonSnapshot, CreatorWorkRevisionSnapshot } from "../creator-work-revisions";

export type CreatorWorkSort = "recent" | "likes" | "views";
export type CreatorWorkFormat = "cuttoon" | "upload";
export type CreatorWorkStatus = "draft" | "published";

export interface CreatorAuthor {
  id?: string;
  name: string;
  avatar: string;
}

export interface CreatorWorkSummary {
  id: string;
  title: string;
  description: string;
  cover: string;
  tags: string[];
  format: CreatorWorkFormat;
  titleId: string | null;
  status: CreatorWorkStatus;
  author: CreatorAuthor;
  likes: number;
  comments: number;
  views: number;
  liked: boolean;
  // 연재 시리즈/챌린지 연결(스키마 미준비 환경에선 항상 null — 하위호환)
  seriesId: string | null;
  episodeNo: number | null;
  seriesTitle: string | null;
  challengeId: string | null;
  challengeTitle: string | null;
  // 리믹스 (이어서 편집하기) 관계 필드
  remixFromId: string | null;
  createdAt: string;
}

// 작품 상세의 시리즈 이웃 회차(이전화/다음화) 내비게이션 항목.
export interface CreatorEpisodeRef {
  id: string;
  title: string;
  episodeNo: number | null;
}

export interface CreatorWorkDetail extends CreatorWorkSummary {
  pages: string[];
  doc: unknown;
  isOwner: boolean;
  /** Owner-only optimistic concurrency token. Public projections omit it. */
  revision?: number;
  updatedAt: string;
  series: { id: string; title: string; status: CreatorSeriesStatus } | null;
  prevEpisode: CreatorEpisodeRef | null;
  nextEpisode: CreatorEpisodeRef | null;
  challenge: { id: string; slug: string; title: string; endsAt: string | null } | null;
  remixFromTitle: string | null;
  remixedChildren?: {
    id: string;
    title: string;
    cover: string;
    author: CreatorAuthor;
  }[];
}

export interface CreatorWorkMutationResult extends CreatorWorkSummary {
  revision: number;
}

export interface CreatorWorkRevisionSummary {
  revision: number;
  restoredFromRevision: number | null;
  createdAt: string;
}

export interface CreatorWorkRevisionDetail extends CreatorWorkRevisionSummary {
  snapshot: CreatorWorkRevisionSnapshot;
}

export interface CreatorWorkRevisionComparisonDetail extends CreatorWorkRevisionSummary {
  snapshot: CreatorWorkRevisionComparisonSnapshot;
}

export interface CreatorWorkComment {
  id: string;
  workId: string;
  author: CreatorAuthor;
  text: string;
  createdAt: string;
}

export interface CreatorWorkInput {
  title?: unknown;
  description?: unknown;
  tags?: unknown;
  format?: unknown;
  titleId?: unknown;
  cover?: unknown;
  pages?: unknown;
  doc?: unknown;
  status?: unknown;
  // 연재 시리즈/챌린지 연결(선택) — 미전달 시 기존 단편 게시 플로우와 완전 동일하게 동작.
  seriesId?: unknown;
  challengeId?: unknown;
  // 리믹스 (이어서 편집하기) 원본 작품 ID
  remixFromId?: unknown;
  // 생략 시 레거시 last-write-wins. 전달 시 현재 revision과 정확히 일치해야만 수정한다.
  baseRevision?: unknown;
}

const SORTS = new Set<CreatorWorkSort>(["recent", "likes", "views"]);
const FORMATS = new Set<CreatorWorkFormat>(["cuttoon", "upload"]);
const STATUSES = new Set<CreatorWorkStatus>(["draft", "published"]);

export function parseFormat(value: unknown): CreatorWorkFormat {
  return FORMATS.has(value as CreatorWorkFormat) ? (value as CreatorWorkFormat) : "cuttoon";
}

export function parseStatus(value: unknown): CreatorWorkStatus {
  return STATUSES.has(value as CreatorWorkStatus) ? (value as CreatorWorkStatus) : "published";
}

export function parseTitleId(value: unknown): string | null {
  const id = clampText(value, 160);
  return id.length > 0 ? id : null;
}

export function parseCreatorSort(value: unknown): CreatorWorkSort {
  return SORTS.has(value as CreatorWorkSort) ? (value as CreatorWorkSort) : "recent";
}
