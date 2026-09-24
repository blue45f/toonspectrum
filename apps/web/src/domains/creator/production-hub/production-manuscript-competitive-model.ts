import {
  episodeScope,
  projectScope,
  type ProductionProjectAggregate,
  type ProductionTask,
  type ProductionTaskStatus,
} from "@toonspectrum/core/production";

import type { StudioProjectRecord, StudioReviewSummary } from "../project-graph/studio-project-graph-contract";
import type { StudioVirtualSpaceReviewPreview } from "../virtual-space/studio-virtual-space-review-preview";
import type { StudioVirtualSpaceReviewSubject } from "../virtual-space/studio-virtual-space-review-subject";
import type { ProductionManuscriptProcess } from "./production-manuscript-model";

export interface ProductionReviewCandidate {
  readonly id: string;
  readonly artifactId: string;
  readonly artifactTitle: string;
  readonly processLabel: string;
  readonly processType: ProductionManuscriptProcess["processType"];
  readonly episodeId: string | null;
  readonly episodeLabel: string;
  readonly review: StudioReviewSummary;
  readonly subject: StudioVirtualSpaceReviewSubject;
}

export function buildProductionReviewCandidates(
  project: StudioProjectRecord,
  processes: readonly ProductionManuscriptProcess[],
  episodeLabels: Readonly<Record<string, string>> = {},
): readonly ProductionReviewCandidate[] {
  return Object.freeze(processes.flatMap((process) => process.reviews.flatMap((review) => {
    const revision = process.revisions.find((candidate) => candidate.id === review.revisionId);
    if (!revision || revision.kind !== "review-snapshot") return [];
    const episodeId = process.artifact.scope.episodeId ?? null;
    return [{
      id: review.id,
      artifactId: process.artifact.id,
      artifactTitle: process.artifact.title,
      processLabel: process.label,
      processType: process.processType,
      episodeId,
      episodeLabel: episodeId ? episodeLabels[episodeId] ?? episodeId : "프로젝트 공통",
      review,
      subject: {
        schemaVersion: 1,
        projectId: project.id,
        workId: project.workId,
        artifactId: process.artifact.id,
        reviewId: review.id,
        revisionId: revision.id,
        rootGraphHash: revision.rootGraphHash,
      },
    } satisfies ProductionReviewCandidate];
  })).sort((left, right) =>
    right.review.updatedAt.localeCompare(left.review.updatedAt)
    || left.episodeLabel.localeCompare(right.episodeLabel, "ko")
    || left.processLabel.localeCompare(right.processLabel, "ko")
    || left.id.localeCompare(right.id)));
}

export type ProductionWorkbenchPaneCount = 2 | 3 | 4;
export type ProductionWorkbenchLayout = "columns" | "overview";
export type ProductionWorkbenchBackground = "neutral" | "light" | "dark";

export interface ProductionWorkbenchState {
  readonly paneCount: ProductionWorkbenchPaneCount;
  readonly reviewIds: readonly string[];
  readonly activeReviewId: string | null;
  readonly layout: ProductionWorkbenchLayout;
  readonly linked: boolean;
  readonly zoom: 75 | 100 | 125 | 150 | 200;
  readonly background: ProductionWorkbenchBackground;
  readonly pageOrdinals: Readonly<Record<string, number>>;
  /** Relative scroll positions in basis points, persisted only for visible immutable snapshots. */
  readonly scrollRatios: Readonly<Record<string, number>>;
}

export interface ParsedProductionWorkbenchState {
  readonly state: ProductionWorkbenchState;
  readonly invalidReviewIds: readonly string[];
  readonly hadExplicitReviews: boolean;
}

const PANE_COUNTS = new Set<number>([2, 3, 4]);
const ZOOM_VALUES = new Set<number>([75, 100, 125, 150, 200]);
const LAYOUTS = new Set<ProductionWorkbenchLayout>(["columns", "overview"]);
const BACKGROUNDS = new Set<ProductionWorkbenchBackground>(["neutral", "light", "dark"]);

function integer(value: string | null): number | null {
  if (!value || !/^(?:0|[1-9][0-9]{0,6})$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

export function parseProductionWorkbenchState(
  params: URLSearchParams,
  candidates: readonly ProductionReviewCandidate[],
  preferredReviewId: string | null = null,
): ParsedProductionWorkbenchState {
  const allowed = new Set(candidates.map((candidate) => candidate.id));
  const explicit = params.has("compareReviews");
  const rawReviewIds = (params.get("compareReviews") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const invalidReviewIds = [...new Set(rawReviewIds.filter((id) => !allowed.has(id)))];
  const validExplicit = [...new Set(rawReviewIds.filter((id) => allowed.has(id)))];
  const requestedPaneCount = integer(params.get("comparePanes"));
  const paneCount = (requestedPaneCount && PANE_COUNTS.has(requestedPaneCount)
    ? requestedPaneCount
    : Math.min(4, Math.max(2, validExplicit.length || Math.min(2, candidates.length || 2)))) as ProductionWorkbenchPaneCount;

  // An explicit bad coordinate is never replaced with a different review. The
  // user must reset the workbench or choose a valid snapshot.
  const defaults = [preferredReviewId, ...candidates.map((candidate) => candidate.id)]
    .filter((id): id is string => Boolean(id && allowed.has(id)));
  const reviewIds = invalidReviewIds.length > 0
    ? []
    : (explicit ? validExplicit : [...new Set(defaults)]).slice(0, paneCount);
  const activeRequested = params.get("compareActive");
  const activeReviewId = activeRequested
    ? reviewIds.includes(activeRequested) ? activeRequested : null
    : reviewIds[0] ?? null;
  const layoutValue = params.get("compareLayout") as ProductionWorkbenchLayout | null;
  const backgroundValue = params.get("compareBackground") as ProductionWorkbenchBackground | null;
  const zoomValue = integer(params.get("compareZoom"));
  const ordinalPairs = (params.get("comparePages") ?? "").split(",").filter(Boolean);
  const pageOrdinals: Record<string, number> = {};
  for (const pair of ordinalPairs) {
    const separator = pair.lastIndexOf(":");
    const id = separator > 0 ? pair.slice(0, separator) : "";
    const ordinalValue = separator > 0 ? integer(pair.slice(separator + 1)) : null;
    if (reviewIds.includes(id) && ordinalValue !== null) pageOrdinals[id] = ordinalValue;
  }
  const scrollPairs = (params.get("compareScroll") ?? "").split(",").filter(Boolean);
  const scrollRatios: Record<string, number> = {};
  for (const pair of scrollPairs) {
    const separator = pair.lastIndexOf(":");
    const id = separator > 0 ? pair.slice(0, separator) : "";
    const ratio = separator > 0 ? integer(pair.slice(separator + 1)) : null;
    if (reviewIds.includes(id) && ratio !== null && ratio <= 10_000) scrollRatios[id] = ratio;
  }
  return {
    hadExplicitReviews: explicit,
    invalidReviewIds: Object.freeze(invalidReviewIds),
    state: Object.freeze({
      paneCount,
      reviewIds: Object.freeze(reviewIds),
      activeReviewId,
      layout: layoutValue && LAYOUTS.has(layoutValue) ? layoutValue : "columns",
      linked: params.get("compareLinked") !== "0",
      zoom: (zoomValue && ZOOM_VALUES.has(zoomValue) ? zoomValue : 100) as ProductionWorkbenchState["zoom"],
      background: backgroundValue && BACKGROUNDS.has(backgroundValue) ? backgroundValue : "neutral",
      pageOrdinals: Object.freeze(pageOrdinals),
      scrollRatios: Object.freeze(scrollRatios),
    }),
  };
}

export function writeProductionWorkbenchState(
  params: URLSearchParams,
  state: ProductionWorkbenchState,
): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set("comparePanes", String(state.paneCount));
  next.set("compareReviews", state.reviewIds.join(","));
  if (state.activeReviewId) next.set("compareActive", state.activeReviewId);
  else next.delete("compareActive");
  next.set("compareLayout", state.layout);
  next.set("compareLinked", state.linked ? "1" : "0");
  next.set("compareZoom", String(state.zoom));
  next.set("compareBackground", state.background);
  const pages = state.reviewIds.flatMap((reviewId) => {
    const ordinal = state.pageOrdinals[reviewId];
    return Number.isInteger(ordinal) && ordinal >= 0 ? [`${reviewId}:${ordinal}`] : [];
  });
  if (pages.length) next.set("comparePages", pages.join(","));
  else next.delete("comparePages");
  const scrolls = state.reviewIds.flatMap((reviewId) => {
    const ratio = state.scrollRatios[reviewId];
    return Number.isInteger(ratio) && ratio >= 0 && ratio <= 10_000 ? [`${reviewId}:${ratio}`] : [];
  });
  if (scrolls.length) next.set("compareScroll", scrolls.join(","));
  else next.delete("compareScroll");
  return next;
}

export interface ProductionManifestPage {
  readonly id: string;
  readonly sourceReviewId: string;
  readonly sourceRevisionId: string;
  readonly sourceArtifactId: string;
  readonly sourceOrdinal: number;
  readonly sha256: string;
  readonly mediaType: StudioVirtualSpaceReviewPreview["mediaType"];
  readonly byteLength: number;
  readonly url: string;
  readonly expiresAt: number;
  readonly mapping: StudioVirtualSpaceReviewPreview["mapping"];
}

export type ProductionManifestPageState = "reused" | "changed" | "new" | "duplicate" | "missing";

export interface ProductionManifestAppendResult {
  readonly pages: readonly ProductionManifestPage[];
  readonly skippedDuplicateCount: number;
}

export function manifestPageFromPreview(
  candidate: ProductionReviewCandidate,
  preview: StudioVirtualSpaceReviewPreview,
): ProductionManifestPage {
  return Object.freeze({
    id: `${candidate.id}:${preview.ordinal}:${preview.sha256}`,
    sourceReviewId: candidate.id,
    sourceRevisionId: candidate.subject.revisionId,
    sourceArtifactId: candidate.artifactId,
    sourceOrdinal: preview.ordinal,
    sha256: preview.sha256,
    mediaType: preview.mediaType,
    byteLength: preview.byteLength,
    url: preview.url,
    expiresAt: preview.expiresAt,
    mapping: preview.mapping,
  });
}

export function appendProductionManifestPages(
  current: readonly ProductionManifestPage[],
  incoming: readonly ProductionManifestPage[],
): ProductionManifestAppendResult {
  const pages = [...current];
  const keys = new Set(current.map((page) => `${page.sourceReviewId}:${page.sourceOrdinal}:${page.sha256}`));
  let skippedDuplicateCount = 0;
  for (const page of incoming) {
    const key = `${page.sourceReviewId}:${page.sourceOrdinal}:${page.sha256}`;
    if (keys.has(key)) {
      skippedDuplicateCount += 1;
      continue;
    }
    keys.add(key);
    pages.push(page);
  }
  return Object.freeze({ pages: Object.freeze(pages), skippedDuplicateCount });
}

export function moveProductionManifestPage(
  pages: readonly ProductionManifestPage[],
  from: number,
  to: number,
): readonly ProductionManifestPage[] {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0
    || from >= pages.length || to >= pages.length || from === to) return pages;
  const next = [...pages];
  const [page] = next.splice(from, 1);
  if (!page) return pages;
  next.splice(to, 0, page);
  return Object.freeze(next);
}

export function replaceProductionManifestPage(
  pages: readonly ProductionManifestPage[],
  index: number,
  page: ProductionManifestPage,
): readonly ProductionManifestPage[] {
  if (!Number.isInteger(index) || index < 0 || index >= pages.length) return pages;
  const next = [...pages];
  next[index] = page;
  return Object.freeze(next);
}

export function removeProductionManifestPage(
  pages: readonly ProductionManifestPage[],
  index: number,
): readonly ProductionManifestPage[] {
  if (!Number.isInteger(index) || index < 0 || index >= pages.length) return pages;
  return Object.freeze(pages.filter((_, candidate) => candidate !== index));
}

export function productionManifestPageState(
  page: ProductionManifestPage | null,
  index: number,
  baseline: readonly ProductionManifestPage[],
  all: readonly ProductionManifestPage[],
): ProductionManifestPageState {
  if (!page) return "missing";
  if (all.findIndex((candidate) => candidate.sha256 === page.sha256) !== index) return "duplicate";
  const prior = baseline[index];
  if (!prior) return "new";
  return prior.sha256 === page.sha256 ? "reused" : "changed";
}

export interface ProductionManifestSummary {
  readonly reused: number;
  readonly changed: number;
  readonly new: number;
  readonly duplicate: number;
  readonly missing: number;
}

function manifestPageIdentity(page: ProductionManifestPage): string {
  return `${page.sourceReviewId}:${page.sourceOrdinal}:${page.sha256}`;
}

export function summarizeProductionManifestPages(
  pages: readonly ProductionManifestPage[],
  baseline: readonly ProductionManifestPage[],
): ProductionManifestSummary {
  const summary = { reused: 0, changed: 0, new: 0, duplicate: 0, missing: 0 };
  pages.forEach((page, index) => {
    summary[productionManifestPageState(page, index, baseline, pages)] += 1;
  });
  const current = new Set(pages.map(manifestPageIdentity));
  summary.missing = baseline.filter((page) => !current.has(manifestPageIdentity(page))).length;
  return Object.freeze(summary);
}

export function productionReviewMatchesApprovedFinal(
  candidate: ProductionReviewCandidate | null,
  process: ProductionManuscriptProcess | null,
): boolean {
  const approved = process?.approvedRevision ?? null;
  return Boolean(
    candidate
      && process
      && approved
      && candidate.artifactId === process.artifact.id
      && candidate.review.status === "approved"
      && candidate.review.revisionId === candidate.subject.revisionId
      && candidate.subject.rootGraphHash === approved.rootGraphHash
      && !process.hasUnapprovedChanges
      && process.openRequiredFeedbackCount === 0,
  );
}

export interface ProductionRolePreset {
  readonly id: "producer" | "writer" | "storyboard" | "line-art" | "color" | "lettering" | "external-reviewer";
  readonly label: string;
  readonly description: string;
  readonly workspaceRole: "admin" | "member" | "guest";
  readonly projectRole: "admin" | "editor" | "commenter" | "viewer";
  readonly capabilities: readonly string[];
  readonly allowedActions: readonly string[];
  readonly blockedActions: readonly string[];
}

export const PRODUCTION_ROLE_PRESETS: readonly ProductionRolePreset[] = Object.freeze([
  { id: "producer", label: "PD·편집자", description: "프로젝트 운영, 검수 정책과 최종 전달을 관리합니다.", workspaceRole: "admin", projectRole: "admin",
    capabilities: ["schedule.manage", "review.configure", "review.decide", "delivery.issue"],
    allowedActions: ["전체 공정 보기", "담당자·기한 관리", "검수 승인", "공식 전달"], blockedActions: ["소유권 이전"] },
  { id: "writer", label: "스토리 작가", description: "대본 공정의 작성·제출·수정에 집중합니다.", workspaceRole: "member", projectRole: "editor",
    capabilities: ["story.edit", "story.submit", "review.comment"],
    allowedActions: ["대본 편집", "검수 제출", "의견 답변"], blockedActions: ["작화 원본 편집", "최종 승인", "공식 전달"] },
  { id: "storyboard", label: "콘티 작가", description: "콘티·연출 공정을 편집하고 검수본을 제출합니다.", workspaceRole: "member", projectRole: "editor",
    capabilities: ["storyboard.edit", "storyboard.submit", "review.comment"],
    allowedActions: ["콘티 편집", "검수 제출", "비교 확인"], blockedActions: ["다른 공정 원본 편집", "최종 승인"] },
  { id: "line-art", label: "선화 작가", description: "선화 원고와 수정 요청을 처리합니다.", workspaceRole: "member", projectRole: "editor",
    capabilities: ["drawing.edit", "drawing.submit", "review.comment"],
    allowedActions: ["선화 편집", "수정 요청 처리", "검수 제출"], blockedActions: ["프로젝트 설정", "최종 승인", "공식 전달"] },
  { id: "color", label: "채색 작가", description: "채색 결과와 색상 수정 요청을 처리합니다.", workspaceRole: "member", projectRole: "editor",
    capabilities: ["color.edit", "color.submit", "review.comment"],
    allowedActions: ["채색 편집", "AI 보조 handoff", "검수 제출"], blockedActions: ["권한 관리", "최종 승인"] },
  { id: "lettering", label: "식자·현지화", description: "대사·식자·번역 공정을 편집하고 제출합니다.", workspaceRole: "member", projectRole: "editor",
    capabilities: ["lettering.edit", "localization.edit", "review.comment"],
    allowedActions: ["텍스트 공정 편집", "검수 제출", "플랫폼 출력 확인"], blockedActions: ["다른 원고 원본 편집", "공식 전달"] },
  { id: "external-reviewer", label: "외부 검토자", description: "고정 검수본만 보고 의견을 남깁니다.", workspaceRole: "guest", projectRole: "commenter",
    capabilities: ["review.view", "review.comment"],
    allowedActions: ["고정 검수본 열람", "의견 작성"], blockedActions: ["원본 편집", "원본 다운로드", "멤버 관리", "검수 승인", "공식 전달"] },
]);

export function productionRolePreset(id: ProductionRolePreset["id"]): ProductionRolePreset {
  return PRODUCTION_ROLE_PRESETS.find((preset) => preset.id === id) ?? PRODUCTION_ROLE_PRESETS[0]!;
}

export interface ProductionAiAssistPlan {
  readonly scope: "selection" | "active-panel" | "active-page";
  readonly lighting: "soft" | "dramatic" | "backlight" | "night";
  readonly color: "preserve" | "warm" | "cool" | "monochrome";
  readonly provider: "project-default" | "local" | "external";
  readonly output: "new-layer" | "new-revision";
}

export function productionAiAssistDisclosure(plan: ProductionAiAssistPlan): readonly string[] {
  const scope = plan.scope === "selection" ? "선택 영역" : plan.scope === "active-panel" ? "현재 컷" : "현재 페이지";
  const transfer = plan.provider === "external"
    ? "선택한 픽셀과 설정이 외부 AI 공급자에게 전송될 수 있습니다."
    : plan.provider === "local"
      ? "지원되는 경우 이 기기의 로컬 모델을 사용합니다."
      : "프로젝트 기본 공급자·비용·외부 전송 여부를 편집기에서 다시 확인합니다.";
  return Object.freeze([
    `${scope}만 처리 대상으로 전달합니다.`,
    transfer,
    plan.output === "new-layer" ? "결과는 원본을 덮지 않고 새 레이어로 적용합니다." : "결과는 새 revision 후보로 적용합니다.",
    "Production 화면에서는 생성하지 않으며 편집기에서 미리보기·비용·실행을 다시 확인합니다.",
  ]);
}

export interface ProductionMatrixCell {
  readonly key: string;
  readonly episodeId: string | null;
  readonly process: ProductionManuscriptProcess;
  readonly task: ProductionTask | null;
  readonly assigneeNames: readonly string[];
}

const PROCESS_KEYS: Readonly<Record<ProductionManuscriptProcess["artifact"]["kind"], string>> = Object.freeze({
  story: "story",
  storyboard: "storyboard",
  "canvas-2d": "drawing",
  "scene-3d": "background-3d",
  asset: "asset",
  audio: "audio",
  localization: "lettering",
  "review-snapshot": "review",
  deliverable: "delivery",
  release: "release",
});

export function productionProcessKey(process: ProductionManuscriptProcess): string {
  return PROCESS_KEYS[process.artifact.kind];
}

function assignmentName(aggregate: ProductionProjectAggregate, assignmentId: string): string {
  const assignment = aggregate.assignments.find((candidate) => candidate.id === assignmentId);
  const party = assignment ? aggregate.parties.find((candidate) => candidate.id === assignment.partyId) : null;
  return party?.internalDisplayName || party?.publicDisplayName || assignment?.roleType || assignmentId;
}

export function buildProductionMatrixCells(
  aggregate: ProductionProjectAggregate,
  processes: readonly ProductionManuscriptProcess[],
): readonly ProductionMatrixCell[] {
  return Object.freeze(processes.map((process) => {
    const episodeId = process.artifact.scope.episodeId ?? null;
    const key = productionProcessKey(process);
    const task = aggregate.tasks.find((candidate) => {
      const sameScope = episodeId
        ? candidate.scope.kind === "episode" && candidate.scope.id === episodeId
        : candidate.scope.kind === "project" && candidate.scope.id === aggregate.projectId;
      return sameScope && candidate.processKey === key;
    }) ?? null;
    return Object.freeze({
      key: `${episodeId ?? "project"}:${process.artifact.id}`,
      episodeId,
      process,
      task,
      assigneeNames: Object.freeze((task?.assignmentIds ?? []).map((id) => assignmentName(aggregate, id))),
    });
  }));
}

export function buildProductionMatrixTaskUpdates(input: {
  readonly aggregate: ProductionProjectAggregate;
  readonly cells: readonly ProductionMatrixCell[];
  readonly selectedKeys: ReadonlySet<string>;
  readonly assignmentId?: string | null;
  readonly dueAt?: string | null;
  readonly status?: ProductionTaskStatus;
  readonly idFactory: () => string;
  readonly now?: string;
}): readonly ProductionTask[] {
  const selected = input.cells.filter((cell) => input.selectedKeys.has(cell.key));
  const now = input.now ?? new Date().toISOString();
  return Object.freeze(selected.map((cell) => {
    if (cell.task) {
      return Object.freeze({
        ...cell.task,
        ...(input.assignmentId === undefined ? {} : { assignmentIds: input.assignmentId ? [input.assignmentId] : [] }),
        ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt }),
        ...(input.status === undefined ? {} : { status: input.status }),
      });
    }
    return Object.freeze({
      id: input.idFactory(),
      projectId: input.aggregate.projectId,
      scope: cell.episodeId
        ? episodeScope(input.aggregate.projectId, cell.episodeId)
        : projectScope(input.aggregate.projectId),
      processKey: productionProcessKey(cell.process),
      title: `${cell.process.artifact.title} · ${cell.process.label}`,
      status: input.status ?? "ready",
      assignmentIds: input.assignmentId ? [input.assignmentId] : [],
      reviewerAssignmentIds: [],
      inputRevisionRefs: [],
      outputDeliverableIds: [],
      dependencyTaskIds: [],
      plannedStartAt: null,
      baselineDueAt: input.dueAt ?? null,
      dueAt: input.dueAt ?? null,
      statusChangedAt: now,
      startedAt: null,
      completedAt: null,
      progressPercent: input.status === "done" ? 100 : 0,
      remainingEstimateHours: null,
      linkedRiskIds: [],
      estimateHours: null,
      completionCriteria: ["고정 검수본과 필수 수정 상태를 확인한다."],
      sourceAgreementMilestoneId: null,
    } satisfies ProductionTask);
  }));
}
