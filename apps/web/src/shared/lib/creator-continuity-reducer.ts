import {
  CREATOR_CONTINUITY_MAX_RECENT,
  CREATOR_CONTINUITY_VERSION,
  freezeCreatorContinuity,
  type CreatorContinuityState,
  type CreatorLaunchGoal,
  type CreatorLaunchPace,
} from "./creator-continuity-model";
import {
  matchCreatorDestination,
  safeCreatorDestinationHref,
} from "./creator-continuity-destinations";

export function addCreatorDestinationInState(
  state: CreatorContinuityState,
  pathname: string,
  search = "",
  now = Date.now(),
): CreatorContinuityState {
  const destination = matchCreatorDestination(pathname);
  if (!destination) return state;
  const next = {
    id: destination.id,
    href: safeCreatorDestinationHref(destination, search),
    visitedAt: now,
  } as const;
  return freezeCreatorContinuity({
    version: CREATOR_CONTINUITY_VERSION,
    plan: state.plan,
    recent: [next, ...state.recent.filter((item) => item.id !== next.id)]
      .slice(0, CREATOR_CONTINUITY_MAX_RECENT),
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
