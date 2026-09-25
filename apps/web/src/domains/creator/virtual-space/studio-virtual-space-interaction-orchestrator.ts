import type { StudioVirtualEnvironmentEffect } from "./studio-virtual-space-engine-bridge";
import type { StudioSpatialActionId } from "./studio-virtual-space-spatial-actions";
import type { StudioWorldInteractionDefinition } from "./studio-virtual-space-world-manifest";

export type StudioVirtualWorkspacePanel = "people" | "space" | "search" | "work" | "sessions" | "board" | "annotation" | "team" | "today" | "town" | "rtc";
export type StudioSpatialInteractionDecision =
  | { readonly kind: "world-rule"; readonly interaction: StudioWorldInteractionDefinition }
  | { readonly kind: "panel"; readonly panel: StudioVirtualWorkspacePanel }
  | { readonly kind: "effect"; readonly effect: StudioVirtualEnvironmentEffect }
  | { readonly kind: "route"; readonly href: string };

export interface StudioSpatialInteractionContext {
  readonly projectId: string;
  readonly productionProjectId?: string | null;
  readonly interaction: StudioWorldInteractionDefinition;
}

const panelByAction: Partial<Record<StudioSpatialActionId, StudioVirtualWorkspacePanel>> = Object.freeze({
  "work-inbox": "work",
  sessions: "sessions",
  board: "board",
  people: "people",
  huddle: "people",
  "team-hub": "team",
  "today-board": "today",
  "open-customization": "space",
  bubble: "people",
  spotlight: "town",
  "live-annotation": "annotation",
  "town-hub": "town",
});

const effectByAction: Partial<Record<StudioSpatialActionId, StudioVirtualEnvironmentEffect>> = Object.freeze({
  "waterfall-splash": "waterfall-splash",
  "make-wish": "wish",
  "take-photo": "photo",
  "release-petals": "petals",
  "toggle-lanterns": "lanterns",
  "pet-animal": "pet",
  "ring-gong": "gong",
});

/**
 * Central spatial intent boundary. It produces a destination only; authorization,
 * consent and domain commands remain owned by the destination feature.
 */
export function orchestrateStudioSpatialInteraction(
  action: StudioSpatialActionId,
  context: StudioSpatialInteractionContext,
): StudioSpatialInteractionDecision {
  if (action === "primary") return { kind: "world-rule", interaction: context.interaction };
  const effect = effectByAction[action];
  if (effect) return { kind: "effect", effect };
  const panel = panelByAction[action];
  if (panel) return { kind: "panel", panel };
  const project = encodeURIComponent(context.projectId);
  const production = context.productionProjectId ? encodeURIComponent(context.productionProjectId) : null;
  switch (action) {
    case "schedule": return { kind: "route", href: production ? `/production/projects/${production}/schedule` : `/studio/p/${project}/production` };
    case "production-control": return { kind: "route", href: production ? `/production/projects/${production}/control` : `/studio/p/${project}/production` };
    case "quality-control": return { kind: "route", href: production ? `/production/projects/${production}/review` : `/studio/p/${project}/review` };
    case "release-center": return { kind: "route", href: `/studio/p/${project}/export` };
    case "project-settings": return { kind: "route", href: `/studio/p/${project}/settings` };
    case "project-overview": return { kind: "route", href: `/studio/p/${project}/overview` };
    default: return { kind: "route", href: `/studio/p/${project}/overview` };
  }
}
