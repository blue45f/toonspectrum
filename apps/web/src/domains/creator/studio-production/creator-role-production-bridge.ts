import type { ProductionRole } from "./studio-production-workspace-runtime";

import {
  creatorRoleSelection,
  type CreatorRoleId,
  type CreatorRoleProfile,
  type CreatorSpecialtyId,
} from "@/shared/lib/creator-role-contract";

const ROLE_RECOMMENDATIONS: Readonly<Record<CreatorRoleId, readonly ProductionRole[]>> = {
  creator: ["story", "storyboard", "lineart", "publisher"],
  story: ["story"],
  planner: ["story", "director"],
  storyboard: ["storyboard"],
  "line-art": ["lineart"],
  background: ["background"],
  color: ["color"],
  lettering: ["lettering"],
  character: ["lineart"],
  "three-d": ["background"],
  educator: ["story", "reviewer"],
  assistant: ["lineart"],
  editor: ["reviewer", "director"],
  producer: ["director", "publisher"],
  localization: ["lettering", "reviewer"],
  reviewer: ["reviewer"],
};

const SPECIALTY_RECOMMENDATIONS: Readonly<
  Record<CreatorSpecialtyId, readonly ProductionRole[]>
> = {
  "world-building": ["story"],
  plot: ["story"],
  dialogue: ["story"],
  adaptation: ["story"],
  "episode-planning": ["story", "director"],
  storyboard: ["storyboard"],
  "scroll-direction": ["storyboard"],
  composition: ["storyboard", "lineart"],
  "character-design": ["lineart"],
  "line-art": ["lineart"],
  inking: ["lineart"],
  "background-2d": ["background"],
  "background-3d": ["background"],
  "prop-design": ["background"],
  "flat-color": ["color"],
  rendering: ["color"],
  effects: ["color"],
  retouching: ["color", "reviewer"],
  lettering: ["lettering"],
  balloon: ["lettering"],
  "sound-effects": ["lettering"],
  "production-schedule": ["director"],
  budget: ["director", "publisher"],
  "quality-control": ["reviewer"],
  editing: ["reviewer", "director"],
  proofing: ["reviewer"],
  localization: ["lettering", "reviewer"],
  "file-cleanup": ["lineart"],
};

function appendDistinct(
  result: ProductionRole[],
  seen: Set<ProductionRole>,
  roles: readonly ProductionRole[],
): void {
  for (const role of roles) {
    if (seen.has(role)) continue;
    seen.add(role);
    result.push(role);
  }
}

/**
 * Converts a personal creator profile into suggestions for the existing project-level
 * production-role contract. This never grants access: authorization remains in Studio Team.
 */
export function creatorProfileProductionRoleRecommendations(
  profile: CreatorRoleProfile | null | undefined,
): readonly ProductionRole[] {
  if (!profile?.primaryRole) return [];
  const result: ProductionRole[] = [];
  const seen = new Set<ProductionRole>();
  const selectedRoles = creatorRoleSelection(profile);
  const roleOrder = profile.activeRole
    ? [profile.activeRole, ...selectedRoles.filter((role) => role !== profile.activeRole)]
    : selectedRoles;

  for (const role of roleOrder) appendDistinct(result, seen, ROLE_RECOMMENDATIONS[role]);
  for (const specialty of profile.specialties) {
    appendDistinct(result, seen, SPECIALTY_RECOMMENDATIONS[specialty]);
  }
  return result;
}
