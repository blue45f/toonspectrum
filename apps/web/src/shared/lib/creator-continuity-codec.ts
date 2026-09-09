import {
  CREATOR_CONTINUITY_MAX_RECENT,
  CREATOR_CONTINUITY_VERSION,
  EMPTY_CREATOR_CONTINUITY,
  freezeCreatorContinuity,
  isCreatorLaunchGoal,
  isCreatorLaunchPace,
  validCreatorContinuityTimestamp,
  type CreatorContinuityState,
  type CreatorDestinationId,
  type CreatorRecentDestination,
} from "./creator-continuity-model";
import {
  CREATOR_DESTINATIONS,
  isCreatorDestinationId,
  safeCreatorDestinationHref,
} from "./creator-continuity-destinations";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const DESTINATION_BY_ID = new Map(
  CREATOR_DESTINATIONS.map((item) => [item.id, item] as const),
);

function storedSearch(value: unknown): string {
  if (typeof value !== "string") return "";
  try {
    return new URL(value, "https://toonstudio.local").search;
  } catch {
    return "";
  }
}

export function parseCreatorContinuity(
  raw: string | null,
  now = Date.now(),
): CreatorContinuityState {
  if (!raw) return EMPTY_CREATOR_CONTINUITY;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.version !== CREATOR_CONTINUITY_VERSION) {
      return EMPTY_CREATOR_CONTINUITY;
    }

    const recent: CreatorRecentDestination[] = [];
    const seen = new Set<CreatorDestinationId>();
    if (Array.isArray(value.recent)) {
      for (const candidate of value.recent) {
        if (!isRecord(candidate) || !isCreatorDestinationId(candidate.id)) continue;
        if (seen.has(candidate.id) || !validCreatorContinuityTimestamp(candidate.visitedAt, now)) continue;
        const destination = DESTINATION_BY_ID.get(candidate.id);
        if (!destination) continue;
        recent.push({
          id: candidate.id,
          href: safeCreatorDestinationHref(destination, storedSearch(candidate.href)),
          visitedAt: candidate.visitedAt,
        });
        seen.add(candidate.id);
        if (recent.length >= CREATOR_CONTINUITY_MAX_RECENT) break;
      }
    }

    const candidatePlan = value.plan;
    const plan = isRecord(candidatePlan)
      && isCreatorLaunchGoal(candidatePlan.goal)
      && isCreatorLaunchPace(candidatePlan.pace)
      && validCreatorContinuityTimestamp(candidatePlan.updatedAt, now)
      ? {
          goal: candidatePlan.goal,
          pace: candidatePlan.pace,
          updatedAt: candidatePlan.updatedAt,
        }
      : null;

    return freezeCreatorContinuity({
      version: CREATOR_CONTINUITY_VERSION,
      recent,
      plan,
    });
  } catch {
    return EMPTY_CREATOR_CONTINUITY;
  }
}

export function serializeCreatorContinuity(state: CreatorContinuityState): string {
  return JSON.stringify(state);
}
