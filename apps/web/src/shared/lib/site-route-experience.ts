import {
  resolveSiteRouteUxContract,
  type SiteRouteUxContract,
} from "./site-route-ux";

export type SiteRouteEmptyStateId =
  | "generic"
  | "projects"
  | "planning"
  | "production"
  | "assets"
  | "review"
  | "publishing"
  | "collaboration"
  | "learning";

export type SiteRouteNextActionId =
  | "start-work"
  | "continue-work"
  | "create-project"
  | "build-episode"
  | "create-scene"
  | "add-asset"
  | "open-next-task"
  | "request-review"
  | "run-publishing-checks"
  | "find-help"
  | "explore";

export type SiteRouteTerminologyScope =
  | "public"
  | "projects"
  | "planning"
  | "studio"
  | "production"
  | "assets"
  | "collaboration"
  | "publishing"
  | "learning";

export interface SiteRouteExperience extends SiteRouteUxContract {
  readonly emptyStateId: SiteRouteEmptyStateId;
  readonly nextActionId: SiteRouteNextActionId | null;
  readonly terminologyScope: SiteRouteTerminologyScope;
  readonly requiresProjectContextBar: boolean;
  readonly saveTrustRequired: boolean;
}

function routeEmptyState(pathname: string): SiteRouteEmptyStateId {
  if (pathname === "/studio" || pathname.startsWith("/studio/projects")) return "projects";
  if (pathname === "/story-lab" || pathname.includes("/planning")) return "planning";
  if (pathname.includes("/review")) return "review";
  if (pathname === "/studio/publish" || pathname.includes("/publish")) return "publishing";
  if (pathname.startsWith("/studio/assets") || pathname.startsWith("/market")) return "assets";
  if (pathname.startsWith("/production")) return "production";
  if (pathname.startsWith("/collaborate")) return "collaboration";
  if (pathname.startsWith("/learn") || pathname.startsWith("/help")) return "learning";
  return "generic";
}

function routeNextAction(pathname: string): SiteRouteNextActionId | null {
  if (pathname === "/") return "start-work";
  if (pathname === "/studio") return "continue-work";
  if (pathname === "/studio/new") return "create-project";
  if (pathname === "/story-lab") return "build-episode";
  if (pathname === "/studio/bg3d") return "create-scene";
  if (pathname.startsWith("/studio/assets") || pathname.startsWith("/market")) return "add-asset";
  if (pathname.includes("/review")) return "request-review";
  if (pathname === "/studio/publish" || pathname.includes("/publish")) return "run-publishing-checks";
  if (pathname.startsWith("/production")) return "open-next-task";
  if (pathname.startsWith("/learn") || pathname.startsWith("/help")) return "find-help";
  if (pathname.startsWith("/explore") || pathname.startsWith("/ranking")) return "explore";
  return null;
}

function routeTerminologyScope(pathname: string): SiteRouteTerminologyScope {
  if (pathname === "/story-lab" || pathname.includes("/planning")) return "planning";
  if (pathname.startsWith("/production")) return "production";
  if (pathname.startsWith("/studio/assets") || pathname.startsWith("/market")) return "assets";
  if (pathname.startsWith("/collaborate")) return "collaboration";
  if (pathname === "/studio/publish" || pathname.includes("/publish")) return "publishing";
  if (pathname.startsWith("/studio")) return "studio";
  if (pathname.startsWith("/learn") || pathname.startsWith("/help")) return "learning";
  if (pathname.startsWith("/projects")) return "projects";
  return "public";
}

/**
 * Adds implementation requirements to the user-facing route contract without forcing every route
 * declaration to repeat the same derived policy. Pages consume this projection; route metadata
 * and aliases remain owned by the existing registries.
 */
export function resolveSiteRouteExperience(input: string): SiteRouteExperience {
  const contract = resolveSiteRouteUxContract(input);
  const pathname = contract.canonicalPath;
  return {
    ...contract,
    emptyStateId: routeEmptyState(pathname),
    nextActionId: routeNextAction(pathname),
    terminologyScope: routeTerminologyScope(pathname),
    requiresProjectContextBar: contract.contextLevel !== "global",
    saveTrustRequired: contract.recoveryPolicy !== "none",
  };
}
