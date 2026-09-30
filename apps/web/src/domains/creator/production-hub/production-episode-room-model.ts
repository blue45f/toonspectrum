/**
 * 회차 룸(원고 뷰어 + 핀 코멘트 + 버전 비교 + 승인 게이트)의 순수 모델.
 *
 * 실제 프로젝트의 원고 이미지·댓글은 Studio 원고(ProjectGraph)와 고정 검수본이 권위다.
 * 이 모듈은 그 권위를 대신하지 않고, 샘플 프로젝트에서 같은 흐름을 체험할 수 있게
 * 예시 원고·핀·공정 버전을 만들며, 승인 게이트 계산만 공통으로 제공한다.
 */
import {
  evaluateReviewApproval,
  type ProductionProjectAggregate,
  type ProductionRoleType,
  type ReviewLane,
} from "@toonstudio/core/production";

import {
  addStudioCommentReply,
  addStudioCommentThread,
  assignStudioCommentThread,
  createEmptyStudioCommentsDocument,
  resolveStudioCommentThread,
  type StudioCommentActor,
  type StudioCommentsDocument,
} from "../studio-comments";
import {
  commentsDocumentToManuscriptPins,
  MANUSCRIPT_PIN_URGENT_PREFIX,
  manuscriptPinToCommentAnchor,
  type ManuscriptPinAssigneeOption,
} from "./manuscript-pin-feedback-model";
import { roleTypeLabel } from "./production-labels";
import { buildProcessCompareItems, type ProcessCompareItem } from "./process-compare-model";

import type { CreatorRoleLens } from "@/shared/lib/creator-role-contract";

/** 샘플 원고 페이지. 이미지는 브랜드 예시 아트이며 실제 작품 원고가 아니다. */
export const EPISODE_SAMPLE_PAGE = Object.freeze({
  pageId: "episode-12-page-03",
  imageSrc: "/brand/illustrated-20260928/canvas-noir.webp",
  alt: { ko: "12화 3페이지 흑백 원고 샘플 — 비 오는 밤, 코트를 입은 해온", en: "Sample page 3 of episode 12 — Haeon in a coat on a rainy night" },
});

const SAMPLE_COMPARE_ART = Object.freeze({
  storyboard: "/brand/illustrated-20260928/storyboard.webp",
  lineArt: "/brand/illustrated-20260928/canvas-noir.webp",
  color: "/brand/illustrated-20260928/project-crimson.webp",
});

const HOUR_MS = 3_600_000;

const LENS_ROLE: Readonly<Record<CreatorRoleLens, ProductionRoleType>> = Object.freeze({
  story: "story-lead",
  art: "art-lead",
  producer: "producer",
});

/** 선택한 역할 관점에 해당하는 참여자. 샘플에서 "나"로 행동할 사람이다. */
export function episodeRoomActorForLens(
  aggregate: ProductionProjectAggregate,
  lens: CreatorRoleLens,
): { readonly assignmentId: string; readonly actor: StudioCommentActor } | null {
  const assignment = aggregate.assignments.find((entry) => entry.status === "active" && entry.roleType === LENS_ROLE[lens]);
  if (!assignment) return null;
  const party = aggregate.parties.find((entry) => entry.id === assignment.partyId);
  return {
    assignmentId: assignment.id,
    actor: { id: assignment.id, displayName: party?.publicDisplayName ?? assignment.id },
  };
}

const LENS_LANE: Readonly<Record<CreatorRoleLens, ReviewLane>> = Object.freeze({
  story: "narrative",
  art: "visual-direction",
  producer: "production",
});

export interface EpisodeApprover {
  readonly assignmentId: string;
  readonly actor: StudioCommentActor;
  readonly lane: ReviewLane;
}

/**
 * 이 회차에서 "내가" 승인할 검수 항목.
 * - 샘플: 선택한 역할 관점의 참여자로 행동한다.
 * - 실제 프로젝트: 로그인 사용자와 연결된 참여 배정만 사용하며, 그 배정이 승인 자격을 가진 항목을 고른다.
 *   다른 사람 이름으로 결정을 기록하지 않는다.
 */
export function resolveEpisodeApprover(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
  options: { readonly isDemo: boolean; readonly roleLens: CreatorRoleLens; readonly viewerAssignmentId: string | null },
): EpisodeApprover | null {
  if (options.isDemo) {
    const actor = episodeRoomActorForLens(aggregate, options.roleLens);
    return actor ? { ...actor, lane: LENS_LANE[options.roleLens] } : null;
  }
  const viewerAssignmentId = options.viewerAssignmentId;
  if (!viewerAssignmentId) return null;
  const policy = aggregate.reviewPolicies.find((entry) => entry.scope.id === episodeId);
  const lane = policy?.lanes.find((entry) => entry.eligibleAssignmentIds.includes(viewerAssignmentId))?.lane;
  if (!lane) return null;
  const assignment = aggregate.assignments.find((entry) => entry.id === viewerAssignmentId);
  const party = assignment ? aggregate.parties.find((entry) => entry.id === assignment.partyId) : undefined;
  return { assignmentId: viewerAssignmentId, actor: { id: viewerAssignmentId, displayName: party?.publicDisplayName ?? viewerAssignmentId }, lane };
}

function actorByRole(aggregate: ProductionProjectAggregate, role: ProductionRoleType, fallback: string): StudioCommentActor {
  const assignment = aggregate.assignments.find((entry) => entry.roleType === role);
  const party = assignment ? aggregate.parties.find((entry) => entry.id === assignment.partyId) : undefined;
  return { id: assignment?.id ?? `sample-${role}`, displayName: party?.publicDisplayName ?? fallback };
}

/**
 * 샘플 원고의 핀 코멘트. Studio 댓글 문서와 같은 형식으로 만들어
 * 해결·다시 열기·답글이 실제 댓글 모델 규칙을 그대로 따른다.
 */
export function createEpisodeSampleComments(aggregate: ProductionProjectAggregate, now: Date): StudioCommentsDocument {
  const story = actorByRole(aggregate, "story-lead", "스토리 작가");
  const storyboard = actorByRole(aggregate, "storyboard-artist", "콘티 작가");
  const art = actorByRole(aggregate, "art-lead", "그림 작가");
  const at = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR_MS);
  const pageId = EPISODE_SAMPLE_PAGE.pageId;
  let document = createEmptyStudioCommentsDocument();
  document = addStudioCommentThread(document, {
    id: "comment_sample-envelope",
    anchor: manuscriptPinToCommentAnchor({ x: 0.64, y: 0.72 }, pageId),
    author: story,
    body: `${MANUSCRIPT_PIN_URGENT_PREFIX}코트 안쪽 봉투 문양이 이 컷에서 읽혀요. 마지막 컷 전까지는 문양이 보이지 않게 가려 주세요.`,
  }, at(5));
  document = addStudioCommentReply(document, "comment_sample-envelope", {
    id: "reply_sample-envelope",
    author: art,
    body: "코트 깃 그림자를 늘려서 가리는 방향으로 수정할게요.",
  }, at(4));
  document = assignStudioCommentThread(document, "comment_sample-envelope", art, at(4));
  document = addStudioCommentThread(document, {
    id: "comment_sample-rain",
    anchor: manuscriptPinToCommentAnchor({ x: 0.2, y: 0.28 }, pageId),
    author: storyboard,
    body: "빗줄기 방향이 앞 컷과 반대예요. 왼쪽 위에서 오른쪽 아래로 맞춰 주세요.",
  }, at(3));
  document = addStudioCommentThread(document, {
    id: "comment_sample-eyes",
    anchor: manuscriptPinToCommentAnchor({ x: 0.55, y: 0.4 }, pageId),
    author: story,
    body: "눈빛이 조금 더 지쳐 보이면 좋겠어요. 12화 감정선은 경계 → 안도 → 의심입니다.",
  }, at(8));
  document = resolveStudioCommentThread(document, "comment_sample-eyes", art, at(2));
  return document;
}

/**
 * 핀 반영 담당으로 고를 수 있는 사람: 이 프로젝트의 활성 참여 배정.
 * 댓글 작성자·해결자와 같은 식별자(배정 ID)를 써서 "내 담당" 필터가 맞게 동작한다.
 */
export function episodeRoomAssigneeOptions(
  aggregate: ProductionProjectAggregate,
  localize: (ko: string, en: string) => string,
): ManuscriptPinAssigneeOption[] {
  return aggregate.assignments
    .filter((assignment) => assignment.status === "active")
    .map((assignment) => ({
      id: assignment.id,
      displayName: aggregate.parties.find((party) => party.id === assignment.partyId)?.publicDisplayName ?? assignment.id,
      detail: roleTypeLabel(assignment.roleType, localize),
    }));
}

/** 필수 수정(긴급 표시)으로 남은 미해결 핀 수. 승인 게이트의 잠금 조건이다. */
export function countOpenUrgentPins(document: StudioCommentsDocument, pageId: string): number {
  return commentsDocumentToManuscriptPins(document, pageId).filter((pin) => pin.status === "urgent").length;
}

export function countOpenPins(document: StudioCommentsDocument, pageId: string): number {
  return commentsDocumentToManuscriptPins(document, pageId).filter((pin) => pin.status !== "resolved").length;
}

/** 샘플 공정 버전: 같은 컷을 콘티 → 선화·명암 → 채색 순서로 비교한다(예시 아트). */
export function createEpisodeSampleCompareItems(now: Date, labels: {
  readonly storyboard: string;
  readonly lineArt: string;
  readonly color: string;
}): ProcessCompareItem[] {
  const iso = (hoursAgo: number) => new Date(now.getTime() - hoursAgo * HOUR_MS).toISOString();
  const images: Readonly<Record<string, string>> = {
    "storyboard::storyboard-v1": SAMPLE_COMPARE_ART.storyboard,
    "line-art::line-art-v1": SAMPLE_COMPARE_ART.storyboard,
    "line-art::line-art-v2": SAMPLE_COMPARE_ART.lineArt,
    "color::color-v1": SAMPLE_COMPARE_ART.color,
  };
  return buildProcessCompareItems(
    [
      { id: "storyboard", label: labels.storyboard, kind: "image", revisions: [{ id: "storyboard-v1", createdAt: iso(72) }] },
      { id: "line-art", label: labels.lineArt, kind: "image", revisions: [{ id: "line-art-v1", createdAt: iso(40) }, { id: "line-art-v2", createdAt: iso(20) }] },
      { id: "color", label: labels.color, kind: "image", revisions: [{ id: "color-v1", createdAt: iso(6) }] },
    ],
    (processId, revisionId) => images[`${processId}::${revisionId}`] ?? null,
  );
}

export interface EpisodeApprovalLane {
  readonly lane: ReviewLane;
  readonly approved: boolean;
  readonly approvals: number;
  readonly requiredApprovals: number;
  readonly blocksPublication: boolean;
  readonly changeRequested: boolean;
}

export interface EpisodeApprovalGate {
  readonly policyId: string | null;
  readonly lanes: readonly EpisodeApprovalLane[];
  readonly approved: boolean;
  readonly blockingLaneCount: number;
}

/** 이 회차 검수 정책의 역할별 승인 상태. 정책이 없으면 빈 게이트를 돌려준다. */
export function deriveEpisodeApprovalGate(aggregate: ProductionProjectAggregate, episodeId: string): EpisodeApprovalGate {
  const policy = aggregate.reviewPolicies.find((entry) => entry.scope.id === episodeId) ?? null;
  if (!policy) return { policyId: null, lanes: [], approved: false, blockingLaneCount: 0 };
  const laneIds = new Set(policy.lanes.map((lane) => lane.lane));
  const decisions = aggregate.reviewDecisions.filter((decision) => laneIds.has(decision.lane)
    && decision.evidenceScopeRefs.some((scope) => scope.id === episodeId || scope.ancestors.some((ancestor) => ancestor.id === episodeId)));
  const evaluation = evaluateReviewApproval(policy, decisions);
  const lanes = evaluation.laneResults.map((result) => ({
    lane: result.lane,
    approved: result.approved,
    approvals: result.approvals,
    requiredApprovals: result.requiredApprovals,
    blocksPublication: policy.lanes.find((lane) => lane.lane === result.lane)?.blocksPublication ?? false,
    changeRequested: result.changeRequestedByAssignmentIds.length > 0 || result.vetoedByAssignmentIds.length > 0,
  }));
  return {
    policyId: policy.id,
    lanes,
    approved: evaluation.approved,
    blockingLaneCount: evaluation.blockingLanes.length,
  };
}
