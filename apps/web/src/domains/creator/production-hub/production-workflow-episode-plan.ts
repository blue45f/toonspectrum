import { buildProductionWorkflowTasks, canonicalProductionProcessKey } from "@toonstudio/contracts/production-workflow";
import { type ProductionProjectAggregate } from "@toonstudio/core/production";
import type {
  BuildEpisodePipelineInput,
  EpisodePipelinePlan,
  EpisodePipelineTemplateStep,
} from "./production-episode-operations";

/** 공정 배열 순서가 아니라 의존 경로의 공수로 마감 간격을 계산한다. */
export function workflowEpisodePipeline(
  aggregate: ProductionProjectAggregate,
): readonly EpisodePipelineTemplateStep[] | null {
  const profile = aggregate.workflowProfile;
  if (!profile) return null;
  const memo = new Map<string, number>();
  const visiting = new Set<string>();
  const remainingHours = (key: string): number => {
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    if (visiting.has(key)) throw new Error("공정 의존성에 순환이 있습니다.");
    visiting.add(key);
    const successors = profile.steps.filter((step) => step.dependsOn.includes(key));
    const hours = Math.max(0, ...successors.map((step) => step.estimateHours + remainingHours(step.key)));
    visiting.delete(key);
    memo.set(key, hours);
    return hours;
  };
  return profile.steps.map((step): EpisodePipelineTemplateStep => ({
    processKey: step.key,
    label: step.name,
    daysBeforeRelease: Math.ceil(remainingHours(step.key) / 8),
    likelyHours: step.estimateHours,
    ownerRoles: [step.defaultRole],
    reviewerRoles: step.reviewRequired ? ["editor", "producer"] : [],
    dependencyProcessKeys: step.dependsOn,
    completionCriteria: step.completionCriteria,
  }));
}

export function buildWorkflowEpisodePlan(input: BuildEpisodePipelineInput): EpisodePipelinePlan | null {
  const template = workflowEpisodePipeline(input.aggregate);
  if (!template || !input.aggregate.workflowProfile) return null;
  if (!Number.isFinite(Date.parse(input.releaseAt))) throw new Error("게시 마감 시간이 올바르지 않습니다.");
  const now = new Date().toISOString();
  const aggregate = {
    ...input.aggregate,
    episodes: [
      ...input.aggregate.episodes.filter((episode) => episode.episodeId !== input.episode.episodeId),
      input.episode,
    ],
  };
  const created = buildProductionWorkflowTasks(aggregate, input.episode.episodeId, crypto.randomUUID(), now);
  const existing = aggregate.tasks.filter(
    (task) => task.scope.kind === "episode" && task.scope.id === input.episode.episodeId,
  );
  const existingIds = new Set(existing.map((task) => task.id));
  const closed = new Set(["approved", "done", "cancelled", "out-of-scope"]);
  let updatedCount = 0;
  let preservedCompletedCount = 0;
  const tasks = [...existing, ...created].map((task) => {
    const step = template.find(
      (entry) =>
        canonicalProductionProcessKey(entry.processKey) === canonicalProductionProcessKey(task.processKey),
    );
    const wasExisting = existingIds.has(task.id);
    if (closed.has(task.status)) {
      if (wasExisting) preservedCompletedCount += 1;
      return task;
    }
    if (!step || (wasExisting && !input.rebaselineExisting)) return task;
    if (wasExisting) updatedCount += 1;
    return {
      ...task,
      dueAt: new Date(Date.parse(input.releaseAt) - step.daysBeforeRelease * 86_400_000).toISOString(),
    };
  });
  return {
    tasks,
    createdCount: created.length,
    updatedCount,
    preservedCompletedCount,
    plannedReleaseAt: input.releaseAt,
    workflowRevision: input.aggregate.workflowProfile.revision,
  };
}
