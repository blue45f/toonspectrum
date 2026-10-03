/**
 * 회차 게시 전 QC 체크리스트 — 순수 파생 모델.
 *
 * 판정 재료는 이미 aggregate 안에 다 있다(공정 작업 상태, 회차 확정 플래그, 검수 게이트,
 * 게시 마감, 차단 질문 수). 이 모듈은 그 재료를 "게시 전에 무엇을 확인해야 하는가"라는
 * 하나의 목록으로 조립만 한다. 새 상태를 만들지 않으므로 저장·동기화 계약이 필요 없고,
 * 기존 파생(deriveEpisodeOperationsRow·deriveEpisodeApprovalGate)을 재사용한다.
 *
 * 수동 확인 항목(오탈자 육안 확인 등)의 영속 저장은 aggregate 서버 계약 확장이 필요해
 * 여기서 다루지 않는다 (findings §3-2 설계안 참조).
 */
import { canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";
import type { ProductionProjectAggregate } from "@toonstudio/core/production";

import { deriveEpisodeApprovalGate } from "./production-episode-room-model";
import {
  WEBTOON_EPISODE_PIPELINE,
  deriveEpisodeOperationsRow,
} from "./production-episode-operations";
import { PRODUCTION_PROCESS_LABELS, type BilingualLabel } from "./production-labels";
import type { ProductionSurfaceTarget } from "./production-project-surfaces";
import { workflowEpisodePipeline } from "./production-workflow-episode-plan";

export type EpisodeQcItemId =
  | "story-lock"
  | "storyboard-lock"
  | "final-art"
  | "integrated-art"
  | "processes"
  | "review-gate"
  | "joint-proof"
  | "rights-preflight"
  | "release-schedule"
  | "blockers"
  | "publication-package";

/** pass=통과 · blocked=게시를 막는 미완 · skipped=이 제작 방식·정책에서는 해당 없음 */
export type EpisodeQcItemStatus = "pass" | "blocked" | "skipped";

export interface EpisodeQcItem {
  readonly id: EpisodeQcItemId;
  readonly label: BilingualLabel;
  readonly status: EpisodeQcItemStatus;
  readonly detail: BilingualLabel;
  /** blocked일 때 그 항목을 풀러 갈 화면. pass·skipped면 null. */
  readonly target: ProductionSurfaceTarget | null;
}

export interface EpisodeQcChecklist {
  readonly episodeId: string;
  readonly published: boolean;
  /** 게시 가능 판정 — published이거나 blocked 항목이 하나도 없을 때 true. */
  readonly ready: boolean;
  readonly items: readonly EpisodeQcItem[];
  readonly passedCount: number;
  /** skipped를 뺀 적용 항목 수. */
  readonly applicableCount: number;
  readonly blockedCount: number;
  readonly releaseAt: string | null;
}

const DONE_TASK_STATUSES: ReadonlySet<string> = new Set(["approved", "done"]);
const IGNORED_TASK_STATUSES: ReadonlySet<string> = new Set(["cancelled", "out-of-scope"]);

function processName(aggregate: ProductionProjectAggregate, processKey: string): BilingualLabel {
  const canonical = canonicalProductionProcessKey(processKey);
  const step = aggregate.workflowProfile?.steps.find(
    (candidate) => canonicalProductionProcessKey(candidate.key) === canonical,
  );
  if (step) return { ko: step.name, en: step.name };
  return PRODUCTION_PROCESS_LABELS[canonical] ?? PRODUCTION_PROCESS_LABELS[processKey] ?? { ko: processKey, en: processKey };
}

function joinNames(names: readonly BilingualLabel[]): BilingualLabel {
  return {
    ko: names.map((name) => name.ko).join(" · "),
    en: names.map((name) => name.en).join(" · "),
  };
}

/** 공정별 완료 판정 — 단계마다 작업이 있고 전부 승인·완료여야 통과. */
function incompleteProcesses(aggregate: ProductionProjectAggregate, episodeId: string): readonly BilingualLabel[] {
  const steps = workflowEpisodePipeline(aggregate) ?? WEBTOON_EPISODE_PIPELINE;
  const tasks = aggregate.tasks.filter(
    (task) => task.scope.kind === "episode" && task.scope.id === episodeId && !IGNORED_TASK_STATUSES.has(task.status),
  );
  const incomplete: BilingualLabel[] = [];
  for (const step of steps) {
    const canonical = canonicalProductionProcessKey(step.processKey);
    const stepTasks = tasks.filter((task) => canonicalProductionProcessKey(task.processKey) === canonical);
    if (stepTasks.length === 0 || stepTasks.some((task) => !DONE_TASK_STATUSES.has(task.status))) {
      incomplete.push(processName(aggregate, step.processKey));
    }
  }
  return incomplete;
}

export function deriveEpisodeQcChecklist(
  aggregate: ProductionProjectAggregate,
  episodeId: string,
  now: Date = new Date(),
): EpisodeQcChecklist | null {
  const episode = aggregate.episodes.find((entry) => entry.episodeId === episodeId);
  if (!episode) return null;

  const row = deriveEpisodeOperationsRow(aggregate, episode, now);
  const gate = deriveEpisodeApprovalGate(aggregate, episodeId);
  const published = episode.state === "published";
  const incomplete = incompleteProcesses(aggregate, episodeId);
  const incompleteNames = joinNames(incomplete);
  const rightsMissing: BilingualLabel[] = [
    ...(episode.creditPreflightPassed ? [] : [{ ko: "크레딧", en: "credits" }]),
    ...(episode.publicationPreflightPassed ? [] : [{ ko: "권리·규격", en: "rights & spec" }]),
  ];
  const rightsNames = joinNames(rightsMissing);
  const publicationTask = row.publicationTask;
  const publicationDone = publicationTask ? DONE_TASK_STATUSES.has(publicationTask.status) : false;

  const items: readonly EpisodeQcItem[] = [
    {
      id: "story-lock",
      label: { ko: "스토리 확정", en: "Story locked" },
      status: episode.storyLockApproved ? "pass" : "blocked",
      detail: episode.storyLockApproved
        ? { ko: "스토리가 확정됐어요.", en: "The story is locked." }
        : { ko: "스토리가 아직 확정되지 않았어요.", en: "The story is not locked yet." },
      target: episode.storyLockApproved ? null : { kind: "surface", surface: "production" },
    },
    {
      id: "storyboard-lock",
      label: { ko: "콘티 확정", en: "Storyboard locked" },
      status: episode.thumbnailLockApproved ? "pass" : "blocked",
      detail: episode.thumbnailLockApproved
        ? { ko: "콘티가 확정됐어요.", en: "The storyboard is locked." }
        : { ko: "콘티가 아직 확정되지 않았어요.", en: "The storyboard is not locked yet." },
      target: episode.thumbnailLockApproved ? null : { kind: "surface", surface: "production" },
    },
    {
      id: "final-art",
      label: { ko: "최종 원고 고정", en: "Final art pinned" },
      status: episode.visualRevisionRef ? "pass" : "blocked",
      detail: episode.visualRevisionRef
        ? { ko: "최종 원고 버전이 고정돼 있어요.", en: "A final art revision is pinned." }
        : { ko: "최종 원고 버전이 아직 고정되지 않았어요.", en: "No final art revision is pinned yet." },
      target: episode.visualRevisionRef ? null : { kind: "surface", surface: "manuscripts" },
    },
    {
      id: "integrated-art",
      label: { ko: "식자 통합본 고정", en: "Lettered master pinned" },
      status: episode.integratedRevisionRef ? "pass" : "blocked",
      detail: episode.integratedRevisionRef
        ? { ko: "식자까지 합친 통합본이 고정돼 있어요.", en: "The lettered master revision is pinned." }
        : { ko: "식자 통합본이 아직 없어요.", en: "There is no lettered master revision yet." },
      target: episode.integratedRevisionRef ? null : { kind: "surface", surface: "manuscripts" },
    },
    {
      id: "processes",
      label: { ko: "전 공정 완료", en: "All processes done" },
      status: incomplete.length === 0 ? "pass" : "blocked",
      detail: incomplete.length === 0
        ? { ko: "모든 공정 작업이 승인·완료됐어요.", en: "Every process task is approved or done." }
        : {
            ko: `아직 끝나지 않은 공정: ${incompleteNames.ko}`,
            en: `Processes not finished: ${incompleteNames.en}`,
          },
      target: incomplete.length === 0 ? null : { kind: "surface", surface: "production" },
    },
    {
      id: "review-gate",
      label: { ko: "검수 승인 (공개 전 필수)", en: "Review approval (required)" },
      status: gate.policyId === null ? "skipped" : gate.approved ? "pass" : "blocked",
      detail: gate.policyId === null
        ? { ko: "이 회차에 검수 정책이 없어요. 통합 교정 승인이 대신합니다.", en: "No review policy for this episode — the joint proof approval covers it." }
        : gate.approved
          ? { ko: "공개 전 필수 검수 레인이 모두 승인됐어요.", en: "All required review lanes approved." }
          : {
              ko: `승인이 남은 필수 검수 레인 ${gate.blockingLaneCount}개가 있어요.`,
              en: `${gate.blockingLaneCount} required review lane(s) still need approval.`,
            },
      target: gate.policyId === null || gate.approved ? null : { kind: "surface", surface: "review" },
    },
    {
      id: "joint-proof",
      label: { ko: "통합 교정 승인", en: "Joint proof approved" },
      status: episode.jointProofApproved ? "pass" : "blocked",
      detail: episode.jointProofApproved
        ? { ko: "통합 원고 공동 교정을 통과했어요.", en: "The joint proof passed." }
        : { ko: "통합 교정 승인이 아직 없어요.", en: "The joint proof is not approved yet." },
      target: episode.jointProofApproved ? null : { kind: "surface", surface: "review" },
    },
    {
      id: "rights-preflight",
      label: { ko: "권리·크레딧 사전 점검", en: "Rights & credits preflight" },
      status: rightsMissing.length === 0 ? "pass" : "blocked",
      detail: rightsMissing.length === 0
        ? { ko: "크레딧과 권리·규격 점검을 통과했어요.", en: "Credits and rights/spec checks passed." }
        : {
            ko: `점검이 남은 항목: ${rightsNames.ko}`,
            en: `Checks still open: ${rightsNames.en}`,
          },
      target: rightsMissing.length === 0 ? null : { kind: "surface", surface: "rights" },
    },
    {
      id: "release-schedule",
      label: { ko: "게시 마감 설정", en: "Release date set" },
      status: row.releaseAt ? "pass" : "blocked",
      detail: row.releaseAt
        ? { ko: "게시 마감이 정해져 있어요.", en: "A release date is set." }
        : { ko: "게시 마감이 없어요. 일정에서 정해 주세요.", en: "No release date yet — set one in Schedule." },
      target: row.releaseAt ? null : { kind: "surface", surface: "schedule" },
    },
    {
      id: "blockers",
      label: { ko: "막힌 질문 해결", en: "No blocking questions" },
      status: episode.openBlockerCount === 0 ? "pass" : "blocked",
      detail: episode.openBlockerCount === 0
        ? { ko: "답을 기다리는 막힌 질문이 없어요.", en: "No blocking questions are waiting." }
        : {
            ko: `막힌 질문 ${episode.openBlockerCount}건이 답을 기다리고 있어요.`,
            en: `${episode.openBlockerCount} blocking question(s) are waiting for an answer.`,
          },
      target: episode.openBlockerCount === 0 ? null : { kind: "episode-room" },
    },
    {
      id: "publication-package",
      label: { ko: "게시 패키지 작업", en: "Publish package task" },
      status: publicationTask === null ? "skipped" : publicationDone ? "pass" : "blocked",
      detail: publicationTask === null
        ? { ko: "이 제작 방식에는 게시 패키지 작업이 없어요.", en: "This workflow has no publish package task." }
        : publicationDone
          ? { ko: "게시 패키지 작업이 끝났어요.", en: "The publish package task is done." }
          : { ko: "게시 패키지 작업이 아직 끝나지 않았어요.", en: "The publish package task is not done yet." },
      target: publicationTask === null || publicationDone ? null : { kind: "surface", surface: "production" },
    },
  ];

  const applicable = items.filter((item) => item.status !== "skipped");
  const blockedCount = applicable.filter((item) => item.status === "blocked").length;
  return {
    episodeId,
    published,
    ready: published || blockedCount === 0,
    items,
    passedCount: applicable.filter((item) => item.status === "pass").length,
    applicableCount: applicable.length,
    blockedCount,
    releaseAt: row.releaseAt,
  };
}
