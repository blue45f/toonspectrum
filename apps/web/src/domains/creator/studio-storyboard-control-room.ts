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
  "attention",
  "continuity-risk",
  "locked",
  "missing-metadata",
  "unassigned",
] as const;

export type StoryboardControlFilter = (typeof STORYBOARD_CONTROL_FILTERS)[number];

export const STORYBOARD_READINESS_ISSUES = [
  "empty-page",
  "missing-metadata",
  "draft-review",
  "needs-review",
  "changes-requested",
  "unassigned-review",
  "approved-unlocked",
  "continuity-repeat",
] as const;

export type StoryboardReadinessIssue = (typeof STORYBOARD_READINESS_ISSUES)[number];
export type StoryboardPriority = "blocker" | "attention" | "ready";

export const STORYBOARD_READINESS_ISSUE_LABELS: Record<StoryboardReadinessIssue, string> = {
  "empty-page": "빈 페이지",
  "missing-metadata": "샷 정보 누락",
  "draft-review": "검토 미요청",
  "needs-review": "검토 대기",
  "changes-requested": "수정 요청",
  "unassigned-review": "검토 담당자 미지정",
  "approved-unlocked": "승인 페이지 잠금 해제",
  "continuity-repeat": "연속 동일 구도",
};

export const STORYBOARD_PRIORITY_LABELS: Record<StoryboardPriority, string> = {
  blocker: "차단",
  attention: "확인 필요",
  ready: "제작 준비",
};

const STORYBOARD_READINESS_DEDUCTIONS: Record<StoryboardReadinessIssue, number> = {
  "empty-page": 35,
  "missing-metadata": 25,
  "draft-review": 8,
  "needs-review": 12,
  "changes-requested": 30,
  "unassigned-review": 10,
  "approved-unlocked": 10,
  "continuity-repeat": 8,
};

export interface StoryboardControlPageLike {
  id: string;
  name?: string;
  note?: string;
  shotType?: string;
  cameraAngle?: string;
  review?: unknown;
  /** Optional for lightweight callers; Studio pages provide the real element array. */
  elements?: readonly unknown[];
}

export interface StoryboardControlRoomRow<TPage extends StoryboardControlPageLike> {
  page: TPage;
  originalIndex: number;
  label: string;
  review: PageReviewState;
  metadataComplete: boolean;
  emptyPage: boolean;
  continuityRisk: boolean;
  readinessScore: number;
  priority: StoryboardPriority;
  issues: StoryboardReadinessIssue[];
  searchText: string;
}

export interface StoryboardControlRoomSummary {
  total: number;
  visible: number;
  approvedPercent: number;
  readinessPercent: number;
  blockers: number;
  attention: number;
  ready: number;
  continuityRisks: number;
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

function storyboardContinuitySignature(page: StoryboardControlPageLike): string | null {
  const shotType = normalizedText(page.shotType);
  const cameraAngle = normalizedText(page.cameraAngle);
  return shotType && cameraAngle ? `${shotType}\u0000${cameraAngle}` : null;
}

function repeatedContinuityIndexes(
  pages: readonly StoryboardControlPageLike[],
): ReadonlySet<number> {
  const repeated = new Set<number>();
  let runStart = 0;

  while (runStart < pages.length) {
    const signature = storyboardContinuitySignature(pages[runStart]!);
    if (!signature) {
      runStart += 1;
      continue;
    }

    let runEnd = runStart + 1;
    while (
      runEnd < pages.length
      && storyboardContinuitySignature(pages[runEnd]!) === signature
    ) {
      runEnd += 1;
    }

    if (runEnd - runStart >= 3) {
      for (let index = runStart; index < runEnd; index += 1) repeated.add(index);
    }
    runStart = runEnd;
  }

  return repeated;
}

function diagnoseStoryboardPage(
  page: StoryboardControlPageLike,
  review: PageReviewState,
  metadataComplete: boolean,
  continuityRisk: boolean,
): {
  emptyPage: boolean;
  readinessScore: number;
  priority: StoryboardPriority;
  issues: StoryboardReadinessIssue[];
} {
  const issues: StoryboardReadinessIssue[] = [];
  const emptyPage = Array.isArray(page.elements) && page.elements.length === 0;

  if (emptyPage) issues.push("empty-page");
  if (!metadataComplete) issues.push("missing-metadata");

  if (review.status === "draft") issues.push("draft-review");
  if (review.status === "needs-review") issues.push("needs-review");
  if (review.status === "changes-requested") issues.push("changes-requested");

  if (
    (review.status === "needs-review" || review.status === "changes-requested")
    && !review.assignee
  ) {
    issues.push("unassigned-review");
  }
  if (review.status === "approved" && !review.locked) issues.push("approved-unlocked");
  if (continuityRisk) issues.push("continuity-repeat");

  const readinessScore = Math.max(
    0,
    100 - issues.reduce((total, issue) => total + STORYBOARD_READINESS_DEDUCTIONS[issue], 0),
  );
  const priority: StoryboardPriority =
    issues.includes("empty-page") || issues.includes("changes-requested")
      ? "blocker"
      : issues.length > 0
        ? "attention"
        : "ready";

  return { emptyPage, readinessScore, priority, issues };
}

function storyboardSearchText(
  page: StoryboardControlPageLike,
  label: string,
  review: PageReviewState,
  issues: readonly StoryboardReadinessIssue[],
  priority: StoryboardPriority,
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
    STORYBOARD_PRIORITY_LABELS[priority],
    ...issues.map((issue) => STORYBOARD_READINESS_ISSUE_LABELS[issue]),
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
  if (filter === "attention") return row.priority !== "ready";
  if (filter === "continuity-risk") return row.continuityRisk;
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
  let blockers = 0;
  let attention = 0;
  let ready = 0;
  let continuityRisks = 0;
  let locked = 0;
  let assigned = 0;
  let missingMetadata = 0;
  let withNotes = 0;
  let readinessTotal = 0;

  for (const row of rows) {
    statusCounts[row.review.status] += 1;
    readinessTotal += row.readinessScore;
    if (row.priority === "blocker") blockers += 1;
    if (row.priority !== "ready") attention += 1;
    if (row.priority === "ready") ready += 1;
    if (row.continuityRisk) continuityRisks += 1;
    if (row.review.locked) locked += 1;
    if (row.review.assignee) assigned += 1;
    if (!row.metadataComplete) missingMetadata += 1;
    if (row.page.note?.trim() || row.review.note?.trim()) withNotes += 1;
  }

  return {
    total: rows.length,
    visible,
    approvedPercent: rows.length === 0 ? 0 : Math.round((statusCounts.approved / rows.length) * 100),
    readinessPercent: rows.length === 0 ? 0 : Math.round(readinessTotal / rows.length),
    blockers,
    attention,
    ready,
    continuityRisks,
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
  const continuityIndexes = repeatedContinuityIndexes(pages);
  const rows = pages.map((page, originalIndex) => {
    const review = normalizePageReviewState(page.review);
    const label = storyboardPageLabel(page, originalIndex);
    const metadataComplete = Boolean(page.shotType?.trim() && page.cameraAngle?.trim());
    const continuityRisk = continuityIndexes.has(originalIndex);
    const diagnosis = diagnoseStoryboardPage(page, review, metadataComplete, continuityRisk);
    return {
      page,
      originalIndex,
      label,
      review,
      metadataComplete,
      continuityRisk,
      ...diagnosis,
      searchText: storyboardSearchText(page, label, review, diagnosis.issues, diagnosis.priority),
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
    "제작 준비도",
    "우선순위",
    "진단",
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
    `${row.readinessScore}%`,
    STORYBOARD_PRIORITY_LABELS[row.priority],
    row.issues.length > 0
      ? row.issues.map((issue) => STORYBOARD_READINESS_ISSUE_LABELS[issue]).join(" · ")
      : "없음",
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