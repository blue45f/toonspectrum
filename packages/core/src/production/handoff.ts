import type {
  ClarificationThread,
  HandoffReadiness,
  HandoffReadinessInput,
  HandoffReadinessIssue,
  HandoffStatus,
  StoryToArtHandoffPackage,
} from "./types";

const HANDOFF_TRANSITIONS: Readonly<Record<HandoffStatus, readonly HandoffStatus[]>> = Object.freeze({
  draft: ["internal-story-review", "cancelled"],
  "internal-story-review": ["draft", "ready-to-offer", "cancelled"],
  "ready-to-offer": ["offered-to-art", "draft", "cancelled"],
  "offered-to-art": ["clarification-open", "accepted-by-art", "superseded", "cancelled"],
  "clarification-open": ["offered-to-art", "accepted-by-art", "superseded", "cancelled"],
  "accepted-by-art": ["production-started", "superseded", "cancelled"],
  "production-started": ["superseded", "cancelled"],
  superseded: [],
  cancelled: [],
});

function issue(
  code: string,
  message: string,
  severity: "blocker" | "warning",
): HandoffReadinessIssue {
  return Object.freeze({ code, message, scope: null, severity });
}

function cappedRatio(value: number, target: number): number {
  if (target <= 0) return 0;
  return Math.min(1, value / target);
}

export function evaluateHandoffReadiness(input: HandoffReadinessInput): HandoffReadiness {
  const handoff = input.package;
  const hardBlocks: HandoffReadinessIssue[] = [];
  const advisories: HandoffReadinessIssue[] = [];
  const openBlocking = input.clarifications.filter(
    (thread) => thread.blocking && !["decision-recorded", "accepted-risk", "closed"].includes(thread.status),
  );

  if (!handoff.storySnapshotRef) hardBlocks.push(issue("story-snapshot-missing", "승인된 스토리 스냅샷이 없습니다.", "blocker"));
  if (!handoff.storyLockRef) hardBlocks.push(issue("story-lock-missing", "StoryLock이 없어 작화 시작을 승인할 수 없습니다.", "blocker"));
  if (openBlocking.length > 0) hardBlocks.push(issue("blocking-clarification-open", `차단 질문 ${openBlocking.length}개가 열려 있습니다.`, "blocker"));
  if (handoff.characterBibleRevisionRefs.length === 0) hardBlocks.push(issue("character-reference-missing", "캐릭터 기준 revision이 없습니다.", "blocker"));
  if (handoff.sceneRefs.length > 0 && handoff.locationReferenceRefs.length === 0) {
    hardBlocks.push(issue("location-reference-missing", "장면의 장소 기준 자료가 없습니다.", "blocker"));
  }
  if (!handoff.rightsAndAiPolicyRef) hardBlocks.push(issue("rights-ai-policy-missing", "권리·AI 처리 정책이 확정되지 않았습니다.", "blocker"));

  const narrativeIntent = handoff.episodeIntentRef ? 20 : 0;
  const sceneStructure = Math.round(15 * Math.min(cappedRatio(handoff.sceneRefs.length, 1), cappedRatio(handoff.beatRefs.length, 1)));
  const references = Math.round(15 * ((handoff.characterBibleRevisionRefs.length > 0 ? 0.5 : 0) + (handoff.locationReferenceRefs.length > 0 ? 0.5 : 0)));
  const dialogue = Math.round(10 * cappedRatio(handoff.lockedDialogueRefs.length, 1));
  const continuity = Math.round(10 * cappedRatio(handoff.continuityReferenceRefs.length, 1));
  const technical = handoff.platformProfileRef && handoff.technicalDeliveryRuleRef ? 10 : handoff.platformProfileRef ? 5 : 0;
  const reviewOwnership = handoff.reviewPolicyRef && handoff.decisionOwnerAssignmentIds.length > 0 ? 10 : 0;
  const rightsAiCredit = Math.round(10 * ([handoff.rightsAndAiPolicyRef, handoff.creditPolicyRef].filter(Boolean).length / 2));
  const metrics = Object.freeze({
    narrativeIntent,
    sceneStructure,
    references,
    dialogue,
    continuity,
    technical,
    reviewOwnership,
    rightsAiCredit,
  });
  const score = Object.values(metrics).reduce((sum, value) => sum + value, 0);
  if (!handoff.episodeIntentRef) advisories.push(issue("episode-intent-missing", "회차 의도표를 추가하면 시각 해석의 기준이 분명해집니다.", "warning"));
  if (handoff.instructions.filter((entry) => entry.priority === "MUST_PRESERVE").length > handoff.instructions.length * 0.6 && handoff.instructions.length >= 5) {
    advisories.push(issue("over-constrained-handoff", "MUST_PRESERVE 비율이 높아 그림 작가의 해석 자율성이 지나치게 낮을 수 있습니다.", "warning"));
  }
  if (!handoff.dueAt) advisories.push(issue("due-date-missing", "인수인계 기한이 없습니다.", "warning"));
  if (score < 70) advisories.push(issue("readiness-score-low", `인수인계 준비도 점수가 ${score}점입니다.`, "warning"));

  return Object.freeze({
    ready: hardBlocks.length === 0,
    score,
    hardBlocks: Object.freeze(hardBlocks),
    advisories: Object.freeze(advisories),
    metrics,
  });
}

export function transitionHandoff(
  handoff: StoryToArtHandoffPackage,
  target: HandoffStatus,
  context: { readonly readiness?: HandoffReadiness; readonly assignmentId?: string; readonly at: string },
): StoryToArtHandoffPackage {
  if (!HANDOFF_TRANSITIONS[handoff.status].includes(target)) {
    throw new Error(`Illegal handoff transition: ${handoff.status} -> ${target}`);
  }
  if (target === "accepted-by-art") {
    if (!context.readiness?.ready) throw new Error("Handoff cannot be accepted while readiness blockers remain.");
    if (!context.assignmentId) throw new Error("Handoff acceptance requires an assignment identity.");
  }
  return Object.freeze({
    ...handoff,
    status: target,
    ...(target === "accepted-by-art"
      ? { acceptedByAssignmentId: context.assignmentId ?? null, acceptedAt: context.at }
      : {}),
  });
}

export function unresolvedHandoffClarifications(
  clarifications: readonly ClarificationThread[],
  handoffId: string,
): readonly ClarificationThread[] {
  return Object.freeze(clarifications.filter(
    (thread) => thread.handoffId === handoffId && !["decision-recorded", "accepted-risk", "closed"].includes(thread.status),
  ));
}
