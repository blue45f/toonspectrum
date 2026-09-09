export const CREATOR_CONTINUITY_VERSION = 1 as const;
export const CREATOR_CONTINUITY_MAX_RECENT = 4;
export const CREATOR_CONTINUITY_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1_000;

export type CreatorLaunchGoal = "draw" | "comic" | "character" | "materials";
export type CreatorLaunchPace = "quick" | "project";
export type CreatorContinuityLocale = "ko" | "en";
export type CreatorDestinationId =
  | "studio"
  | "comic"
  | "shaper"
  | "market"
  | "daily"
  | "research"
  | "reference-atlas"
  | "opportunities"
  | "gallery"
  | "explore"
  | "ranking"
  | "calendar"
  | "community";

export interface CreatorRecentDestination {
  readonly id: CreatorDestinationId;
  readonly href: string;
  readonly visitedAt: number;
}

export interface CreatorLaunchPlan {
  readonly goal: CreatorLaunchGoal;
  readonly pace: CreatorLaunchPace;
  readonly updatedAt: number;
}

export interface CreatorContinuityState {
  readonly version: typeof CREATOR_CONTINUITY_VERSION;
  readonly recent: readonly CreatorRecentDestination[];
  readonly plan: CreatorLaunchPlan | null;
}

export type CreatorLaunchRecommendationId =
  | "draw-quick"
  | "draw-project"
  | "comic-quick"
  | "comic-project"
  | "character-quick"
  | "character-project"
  | "materials-quick"
  | "materials-project";

export interface CreatorLaunchRecommendation {
  readonly id: CreatorLaunchRecommendationId;
  readonly href: string;
}

export const EMPTY_CREATOR_CONTINUITY: CreatorContinuityState = Object.freeze({
  version: CREATOR_CONTINUITY_VERSION,
  recent: Object.freeze([]),
  plan: null,
});

export function isCreatorLaunchGoal(value: unknown): value is CreatorLaunchGoal {
  return value === "draw" || value === "comic" || value === "character" || value === "materials";
}

export function isCreatorLaunchPace(value: unknown): value is CreatorLaunchPace {
  return value === "quick" || value === "project";
}

export function validCreatorContinuityTimestamp(value: unknown, now: number): value is number {
  return typeof value === "number"
    && Number.isFinite(value)
    && value > 0
    && value <= now + 5 * 60 * 1_000
    && value >= now - CREATOR_CONTINUITY_MAX_AGE_MS;
}

export function freezeCreatorContinuity(
  state: CreatorContinuityState,
): CreatorContinuityState {
  return Object.freeze({
    version: CREATOR_CONTINUITY_VERSION,
    recent: Object.freeze(state.recent.map((item) => Object.freeze({ ...item }))),
    plan: state.plan ? Object.freeze({ ...state.plan }) : null,
  });
}

export function setCreatorLaunchPlanInState(
  state: CreatorContinuityState,
  goal: CreatorLaunchGoal,
  pace: CreatorLaunchPace,
  now = Date.now(),
): CreatorContinuityState {
  return freezeCreatorContinuity({
    version: CREATOR_CONTINUITY_VERSION,
    recent: state.recent,
    plan: { goal, pace, updatedAt: now },
  });
}

export function clearCreatorRecentInState(
  state: CreatorContinuityState,
): CreatorContinuityState {
  return freezeCreatorContinuity({
    version: CREATOR_CONTINUITY_VERSION,
    recent: [],
    plan: state.plan,
  });
}

export function clearCreatorPlanInState(
  state: CreatorContinuityState,
): CreatorContinuityState {
  return freezeCreatorContinuity({
    version: CREATOR_CONTINUITY_VERSION,
    recent: state.recent,
    plan: null,
  });
}
