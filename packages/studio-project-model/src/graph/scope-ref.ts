import { z } from "zod";

import { studioEntityIdSchema } from "./ids";

import type {
  ElementId,
  EpisodeId,
  PanelId,
  ProjectId,
  SeasonId,
  SequenceId,
  StorySceneId,
} from "./ids";

export interface ScopeRef {
  projectId: ProjectId;
  seasonId?: SeasonId;
  episodeId?: EpisodeId;
  sequenceId?: SequenceId;
  sceneId?: StorySceneId;
  panelId?: PanelId;
  elementId?: ElementId;
}

export const scopeRefSchema = z
  .object({
    projectId: studioEntityIdSchema,
    seasonId: studioEntityIdSchema.optional(),
    episodeId: studioEntityIdSchema.optional(),
    sequenceId: studioEntityIdSchema.optional(),
    sceneId: studioEntityIdSchema.optional(),
    panelId: studioEntityIdSchema.optional(),
    elementId: studioEntityIdSchema.optional(),
  })
  .strict();

const ORDERED_SCOPE_KEYS = [
  "projectId",
  "seasonId",
  "episodeId",
  "sequenceId",
  "sceneId",
  "panelId",
  "elementId",
] as const;

export function parseScopeRef(value: unknown): ScopeRef {
  return scopeRefSchema.parse(value) as ScopeRef;
}

export function scopeRefKey(scope: ScopeRef): string {
  return ORDERED_SCOPE_KEYS.flatMap((key) => {
    const value = scope[key];
    return value === undefined ? [] : [`${key}:${encodeURIComponent(value)}`];
  }).join("/");
}

export function scopeRefEquals(left: ScopeRef, right: ScopeRef): boolean {
  return ORDERED_SCOPE_KEYS.every((key) => left[key] === right[key]);
}

/** Returns true when candidate belongs to the same or a narrower work scope. */
export function scopeRefContains(container: ScopeRef, candidate: ScopeRef): boolean {
  if (container.projectId !== candidate.projectId) return false;
  return ORDERED_SCOPE_KEYS.slice(1).every((key) => {
    const expected = container[key];
    return expected === undefined || expected === candidate[key];
  });
}

export function scopeRefDepth(scope: ScopeRef): number {
  return ORDERED_SCOPE_KEYS.reduce(
    (depth, key) => depth + (scope[key] === undefined ? 0 : 1),
    0,
  );
}
