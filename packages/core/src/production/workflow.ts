import type {
  EpisodeCollaboration,
  EpisodeCollaborationState,
  ProductionTask,
  ProductionTaskStatus,
  RevisionRef,
} from "./types";

const EPISODE_TRANSITIONS: Readonly<Record<EpisodeCollaborationState, readonly EpisodeCollaborationState[]>> = Object.freeze({
  "episode-planning": ["story-drafting", "cancelled"],
  "story-drafting": ["story-review", "blocked", "paused-health", "cancelled"],
  "story-review": ["story-drafting", "story-ready-for-art", "blocked", "cancelled"],
  "story-ready-for-art": ["art-clarification", "thumbnailing", "change-request-open", "cancelled"],
  "art-clarification": ["story-ready-for-art", "thumbnailing", "blocked", "change-request-open", "cancelled"],
  thumbnailing: ["thumbnail-joint-review", "blocked", "paused-health", "change-request-open", "cancelled"],
  "thumbnail-joint-review": ["thumbnailing", "thumbnail-locked", "blocked", "change-request-open", "cancelled"],
  "thumbnail-locked": ["final-art-production", "change-request-open", "cancelled"],
  "final-art-production": ["lettering-and-integration", "blocked", "paused-health", "change-request-open", "creator-replacement", "cancelled"],
  "lettering-and-integration": ["joint-proof", "final-art-production", "blocked", "change-request-open", "cancelled"],
  "joint-proof": ["lettering-and-integration", "publish-ready", "blocked", "change-request-open", "cancelled"],
  "publish-ready": ["published", "joint-proof", "change-request-open", "cancelled"],
  published: ["change-request-open"],
  blocked: ["story-drafting", "story-review", "art-clarification", "thumbnailing", "final-art-production", "lettering-and-integration", "joint-proof", "cancelled"],
  "paused-health": ["story-drafting", "thumbnailing", "final-art-production", "creator-replacement", "cancelled"],
  "paused-contract": ["story-drafting", "thumbnailing", "final-art-production", "cancelled"],
  "change-request-open": ["story-review", "story-ready-for-art", "thumbnailing", "thumbnail-joint-review", "final-art-production", "lettering-and-integration", "joint-proof", "publish-ready", "published", "cancelled"],
  "creator-replacement": ["story-drafting", "thumbnailing", "final-art-production", "paused-contract", "cancelled"],
  cancelled: [],
});

export interface EpisodeTransitionContext {
  readonly at: string;
  readonly narrativeRevisionRef?: RevisionRef | null;
  readonly visualRevisionRef?: RevisionRef | null;
  readonly integratedRevisionRef?: RevisionRef | null;
  readonly activeHandoffId?: string | null;
  readonly openBlockerCount?: number;
  readonly storyLockApproved?: boolean;
  readonly thumbnailLockApproved?: boolean;
  readonly jointProofApproved?: boolean;
  readonly creditPreflightPassed?: boolean;
  readonly publicationPreflightPassed?: boolean;
}

export function transitionEpisodeCollaboration(
  episode: EpisodeCollaboration,
  target: EpisodeCollaborationState,
  context: EpisodeTransitionContext,
): EpisodeCollaboration {
  if (!EPISODE_TRANSITIONS[episode.state].includes(target)) {
    throw new Error(`Illegal episode collaboration transition: ${episode.state} -> ${target}`);
  }
  const next = { ...episode, ...context, state: target, revision: episode.revision + 1, updatedAt: context.at };
  const blockers = context.openBlockerCount ?? episode.openBlockerCount;
  if (["story-ready-for-art", "art-clarification", "thumbnailing"].includes(target)) {
    if (!(context.storyLockApproved ?? episode.storyLockApproved)) {
      throw new Error("Episode cannot enter art production without StoryLock approval.");
    }
    if (!(context.activeHandoffId ?? episode.activeHandoffId)) {
      throw new Error("Episode cannot enter art production without an active handoff.");
    }
  }
  if (["thumbnail-locked", "final-art-production", "lettering-and-integration", "joint-proof"].includes(target)) {
    if (!(context.thumbnailLockApproved ?? episode.thumbnailLockApproved)) {
      throw new Error("Episode cannot continue without ThumbnailLock approval.");
    }
  }
  if (target === "publish-ready") {
    if (!(context.jointProofApproved ?? episode.jointProofApproved)) throw new Error("Joint proof approval is required.");
    if (!(context.creditPreflightPassed ?? episode.creditPreflightPassed)) throw new Error("Credit preflight is required.");
    if (!(context.publicationPreflightPassed ?? episode.publicationPreflightPassed)) throw new Error("Publication preflight is required.");
  }
  if (target === "published" && episode.state !== "publish-ready") {
    throw new Error("Only a publish-ready episode can be published.");
  }
  if (blockers > 0 && !["blocked", "change-request-open", "cancelled"].includes(target)) {
    throw new Error("Open blockers prevent the requested episode transition.");
  }
  return Object.freeze(next);
}

const TASK_TRANSITIONS: Readonly<Record<ProductionTaskStatus, readonly ProductionTaskStatus[]>> = Object.freeze({
  draft: ["needs-input", "ready", "cancelled", "out-of-scope"],
  "needs-input": ["ready", "blocked", "cancelled", "out-of-scope"],
  ready: ["in-progress", "blocked", "paused", "cancelled", "out-of-scope"],
  "in-progress": ["internal-review", "blocked", "paused", "cancelled"],
  "internal-review": ["changes-requested", "external-review", "conditionally-approved", "approved", "blocked"],
  "external-review": ["changes-requested", "conditionally-approved", "approved", "blocked"],
  "changes-requested": ["in-progress", "blocked", "cancelled"],
  "conditionally-approved": ["approved", "changes-requested", "blocked"],
  approved: ["done", "changes-requested"],
  done: [],
  blocked: ["needs-input", "ready", "in-progress", "cancelled"],
  paused: ["ready", "in-progress", "cancelled"],
  cancelled: [],
  "out-of-scope": [],
});

export function transitionProductionTask(
  task: ProductionTask,
  target: ProductionTaskStatus,
  completedDependencyTaskIds: readonly string[],
): ProductionTask {
  if (!TASK_TRANSITIONS[task.status].includes(target)) {
    throw new Error(`Illegal production task transition: ${task.status} -> ${target}`);
  }
  if (target === "in-progress") {
    const completed = new Set(completedDependencyTaskIds);
    const missing = task.dependencyTaskIds.filter((id) => !completed.has(id));
    if (missing.length > 0) throw new Error(`Task dependencies are incomplete: ${missing.join(", ")}`);
    if (task.inputRevisionRefs.length === 0) throw new Error("Task requires pinned input revisions before work starts.");
  }
  if ((target === "approved" || target === "done") && task.outputDeliverableIds.length === 0) {
    throw new Error("An approved task must have a deliverable.");
  }
  return Object.freeze({ ...task, status: target });
}

export function detectTaskDependencyCycles(tasks: readonly ProductionTask[]): readonly (readonly string[])[] {
  const graph = new Map(tasks.map((task) => [task.id, task.dependencyTaskIds]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cycles: string[][] = [];
  const stack: string[] = [];
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      cycles.push([...stack.slice(start), id]);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    stack.push(id);
    for (const dependency of graph.get(id) ?? []) {
      if (graph.has(dependency)) visit(dependency);
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
  };
  for (const task of tasks) visit(task.id);
  return Object.freeze(cycles.map((cycle) => Object.freeze(cycle)));
}
