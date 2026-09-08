import {
  PAGE_REVIEW_STATUSES,
  PAGE_REVIEW_STATUS_LABELS,
  normalizePageReviewState,
  type PageReviewState,
  type PageReviewStatus,
} from "./studio-page-review";

export const STORYBOARD_CONTROL_FILTERS = [
  "all",
  ...PAGE_REVIEW_STATUSES,
  "locked",
  "missing-metadata",
  "unassigned",
] as const;

export type StoryboardControlFilter = (typeof STORYBOARD_CONTROL_FILTERS)[number];

export interface StoryboardControlPageLike {
  id: string;
  name?: string;
  note?: string;
  shotType?: string;
  cameraAngle?: string;
  review?: unknown;
}

export interface StoryboardControlRoomRow<TPage extends StoryboardControlPageLike> {
  page: TPage;
  originalIndex: number;
  label: string;
  review: PageReviewState;
  metadataComplete: boolean;
  searchText: string;
}

export interface StoryboardControlRoomSummary {
  total: number;
  visible: number;
  approvedPercent: number;
  locked: number;
  assigned: number;
  missingMetadata: number;
  withNotes: number;
  statusCounts: Record<PageReviewStatus, number>;
}

export interface StoryboardControlRoomResult<TPage extends StoryboardControlPageLike> {
  rows: StoryboardControlRoomRow<TPage>[];
  visibleRows: StoryboardControlRoomRow<TPage>[];
  summary: StoryboardControlRoomSummary;
  filterActive: boolean;
}

function normalizedText(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").trim().toLocaleLowerCase("ko-KR")
    : "";
}

function storyboardPageLabel(page: StoryboardControlPageLike, index: number): string {
  const name = typeof page.name === "string" ? page.name.trim() : "";
  return name || `${index + 1}페이지`;
}

function storyboardSearchText(
  page: StoryboardControlPageLike,
  label: string,
  review: PageReviewState,
): string {
  return [
    label,
    page.name,
    page.note,
    page.shotType,
    page.cameraAngle,
    review.assignee,
    review.note,
    PAGE_REVIEW_STATUS_LABELS[review.status],
    review.locked ? "잠금 locked" : "",
  ]
    .map(normalizedText)
    .filter(Boolean)
    .join(" ");
}

function matchesQuery(searchText: string, query: string): boolean {
  const tokens = normalizedText(query).split(/\s+/).filter(Boolean);
  return tokens.every((token) => searchText.includes(token));
}

function matchesFilter(
  row: StoryboardControlRoomRow<StoryboardControlPageLike>,
  filter: StoryboardControlFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "locked") return row.review.locked;
  if (filter === "missing-metadata") return !row.metadataComplete;
  if (filter === "unassigned") return !row.review.assignee;
  return row.review.status === filter;
}

function summarizeStoryboardRows(
  rows: readonly StoryboardControlRoomRow<StoryboardControlPageLike>[],
  visible: number,
): StoryboardControlRoomSummary {
  const statusCounts: Record<PageReviewStatus, number> = {
    draft: 0,
    "needs-review": 0,
    "changes-requested": 0,
    approved: 0,
  };
  let locked = 0;
  let assigned = 0;
  let missingMetadata = 0;
  let withNotes = 0;

  for (const row of rows) {
    statusCounts[row.review.status] += 1;
    if (row.review.locked) locked += 1;
    if (row.review.assignee) assigned += 1;
    if (!row.metadataComplete) missingMetadata += 1;
    if (row.page.note?.trim() || row.review.note?.trim()) withNotes += 1;
  }

  return {
    total: rows.length,
    visible,
    approvedPercent: rows.length === 0 ? 0 : Math.round((statusCounts.approved / rows.length) * 100),
    locked,
    assigned,
    missingMetadata,
    withNotes,
    statusCounts,
  };
}

export function buildStoryboardControlRoom<TPage extends StoryboardControlPageLike>(
  pages: readonly TPage[],
  query: string,
  filter: StoryboardControlFilter,
): StoryboardControlRoomResult<TPage> {
  const rows = pages.map((page, originalIndex) => {
    const review = normalizePageReviewState(page.review);
    const label = storyboardPageLabel(page, originalIndex);
    return {
      page,
      originalIndex,
      label,
      review,
      metadataComplete: Boolean(page.shotType?.trim() && page.cameraAngle?.trim()),
      searchText: storyboardSearchText(page, label, review),
    } satisfies StoryboardControlRoomRow<TPage>;
  });

  const visibleRows = rows.filter(
    (row) => matchesQuery(row.searchText, query) && matchesFilter(row, filter),
  );

  return {
    rows,
    visibleRows,
    summary: summarizeStoryboardRows(rows, visibleRows.length),
    filterActive: normalizedText(query).length > 0 || filter !== "all",
  };
}

function csvCell(value: unknown): string {
  let text = typeof value === "string" ? value : String(value ?? "");
  // Excel/Sheets can evaluate formula-looking CSV cells. Preserve the text while preventing
  // exported review notes or page names from becoming executable spreadsheet formulas.
  if (/^[\t\r\n ]*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

export function serializeStoryboardControlRoomCsv<TPage extends StoryboardControlPageLike>(
  rows: readonly StoryboardControlRoomRow<TPage>[],
): string {
  const header = [
    "순번",
    "페이지",
    "검토 상태",
    "담당자",
    "잠금",
    "샷 유형",
    "카메라 앵글",
    "페이지 메모",
    "검토 메모",
  ];
  const body = rows.map((row) => [
    row.originalIndex + 1,
    row.label,
    PAGE_REVIEW_STATUS_LABELS[row.review.status],
    row.review.assignee ?? "",
    row.review.locked ? "예" : "아니오",
    row.page.shotType ?? "",
    row.page.cameraAngle ?? "",
    row.page.note ?? "",
    row.review.note ?? "",
  ]);

  return [header, ...body]
    .map((record) => record.map(csvCell).join(","))
    .join("\r\n");
}
