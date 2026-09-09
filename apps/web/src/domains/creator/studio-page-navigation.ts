import { pageDisplayName } from "./studio-page-meta";
import {
  PAGE_REVIEW_STATUS_LABELS,
  normalizePageReviewState,
} from "./studio-page-review";

import type { PageState } from "./studio-page-state";

export const STUDIO_PAGE_LIST_FILTERS = [
  "all",
  "content",
  "empty",
  "notes",
  "needs-review",
  "approved",
  "locked",
] as const;

export type StudioPageListFilter = (typeof STUDIO_PAGE_LIST_FILTERS)[number];

export interface StudioPageNavigationEntry {
  readonly page: PageState;
  readonly index: number;
  readonly displayName: string;
}

const MAX_QUERY_CHARS = 200;
const MAX_QUERY_TOKENS = 12;

function normalizeSearchText(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").toLocaleLowerCase("ko-KR").trim()
    : "";
}

export function tokenizeStudioPageQuery(query: string): string[] {
  const normalized = normalizeSearchText(query.slice(0, MAX_QUERY_CHARS));
  if (!normalized) return [];
  return [...new Set(normalized.split(/\s+/u).filter(Boolean))].slice(0, MAX_QUERY_TOKENS);
}

function pageSearchText(page: PageState, index: number, displayName: string): string {
  const review = normalizePageReviewState(page.review);
  return normalizeSearchText([
    displayName,
    `${index + 1}`,
    `${index + 1}페이지`,
    page.note,
    page.shotType,
    page.cameraAngle,
    review.status,
    PAGE_REVIEW_STATUS_LABELS[review.status],
    review.assignee,
    review.note,
    review.locked ? "잠금 잠김 locked" : "",
  ].filter(Boolean).join(" "));
}

export function studioPageMatchesFilter(
  page: PageState,
  filter: StudioPageListFilter,
): boolean {
  const review = normalizePageReviewState(page.review);
  switch (filter) {
    case "content":
      return page.elements.length > 0;
    case "empty":
      return page.elements.length === 0;
    case "notes":
      return normalizeSearchText(page.note).length > 0
        || normalizeSearchText(review.note).length > 0;
    case "needs-review":
      return review.status === "needs-review" || review.status === "changes-requested";
    case "approved":
      return review.status === "approved";
    case "locked":
      return review.locked;
    case "all":
    default:
      return true;
  }
}

export function filterStudioPageNavigationEntries(
  pages: readonly PageState[],
  query: string,
  filter: StudioPageListFilter,
): StudioPageNavigationEntry[] {
  const tokens = tokenizeStudioPageQuery(query);
  const entries: StudioPageNavigationEntry[] = [];

  pages.forEach((page, index) => {
    if (!studioPageMatchesFilter(page, filter)) return;
    const displayName = pageDisplayName(page, index);
    if (tokens.length > 0) {
      const searchText = pageSearchText(page, index, displayName);
      if (!tokens.every((token) => searchText.includes(token))) return;
    }
    entries.push({ page, index, displayName });
  });

  return entries;
}

function orderedLiveSelection(
  orderedPageIds: readonly string[],
  selectedPageIds: readonly string[],
): string[] {
  const selected = new Set(selectedPageIds);
  return orderedPageIds.filter((id) => selected.has(id));
}

export interface ResolveStudioPageSelectionInput {
  readonly orderedPageIds: readonly string[];
  readonly selectedPageIds: readonly string[];
  readonly targetPageId: string;
  readonly anchorPageId: string | null;
  readonly additive: boolean;
  readonly range: boolean;
}

export interface StudioPageSelectionResult {
  readonly selectedPageIds: string[];
  readonly anchorPageId: string | null;
}

export function resolveStudioPageSelection({
  orderedPageIds,
  selectedPageIds,
  targetPageId,
  anchorPageId,
  additive,
  range,
}: ResolveStudioPageSelectionInput): StudioPageSelectionResult {
  if (!orderedPageIds.includes(targetPageId)) {
    return {
      selectedPageIds: orderedLiveSelection(orderedPageIds, selectedPageIds),
      anchorPageId: orderedPageIds.includes(anchorPageId ?? "") ? anchorPageId : null,
    };
  }

  const liveSelection = orderedLiveSelection(orderedPageIds, selectedPageIds);
  const liveAnchor = orderedPageIds.includes(anchorPageId ?? "")
    ? anchorPageId
    : null;

  if (range) {
    const resolvedAnchor = liveAnchor
      ?? liveSelection[0]
      ?? targetPageId;
    const anchorIndex = orderedPageIds.indexOf(resolvedAnchor);
    const targetIndex = orderedPageIds.indexOf(targetPageId);
    const start = Math.min(anchorIndex, targetIndex);
    const end = Math.max(anchorIndex, targetIndex);
    const rangeIds = orderedPageIds.slice(start, end + 1);
    const rangeSet = new Set(additive ? [...liveSelection, ...rangeIds] : rangeIds);
    return {
      selectedPageIds: orderedPageIds.filter((id) => rangeSet.has(id)),
      anchorPageId: resolvedAnchor,
    };
  }

  if (additive) {
    const next = new Set(liveSelection);
    if (next.has(targetPageId)) next.delete(targetPageId);
    else next.add(targetPageId);
    return {
      selectedPageIds: orderedPageIds.filter((id) => next.has(id)),
      // Keep the established range anchor so Cmd/Ctrl toggles can refine a selection
      // before a later Shift extension, matching professional page managers.
      anchorPageId: liveAnchor ?? targetPageId,
    };
  }

  return {
    selectedPageIds: [targetPageId],
    anchorPageId: targetPageId,
  };
}

export const STUDIO_PAGE_NAVIGATION_KEYS = [
  "ArrowUp",
  "ArrowDown",
  "Home",
  "End",
  "PageUp",
  "PageDown",
] as const;

export type StudioPageNavigationKey = (typeof STUDIO_PAGE_NAVIGATION_KEYS)[number];

export function resolveStudioPageNavigationTarget(
  orderedPageIds: readonly string[],
  currentPageId: string,
  key: StudioPageNavigationKey,
  pageJump = 10,
): string | null {
  if (orderedPageIds.length === 0) return null;
  const currentIndex = Math.max(0, orderedPageIds.indexOf(currentPageId));
  const safeJump = Number.isFinite(pageJump) ? Math.max(1, Math.floor(pageJump)) : 10;
  let nextIndex = currentIndex;

  switch (key) {
    case "ArrowUp":
      nextIndex -= 1;
      break;
    case "ArrowDown":
      nextIndex += 1;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = orderedPageIds.length - 1;
      break;
    case "PageUp":
      nextIndex -= safeJump;
      break;
    case "PageDown":
      nextIndex += safeJump;
      break;
  }

  return orderedPageIds[Math.max(0, Math.min(orderedPageIds.length - 1, nextIndex))] ?? null;
}
