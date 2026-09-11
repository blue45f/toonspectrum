/**
 * Canonical ToonStudio route registry. Paths identify durable resources;
 * workspace and view switches live in the query string. Legacy aliases stay
 * here so product navigation, tests and migrations share one authority.
 */

export type StudioRouteShell =
  | "studio-home"
  | "project"
  | "document"
  | "asset"
  | "external-review";

export interface StudioRouteRegistration {
  readonly id: string;
  readonly path: string;
  readonly shell: StudioRouteShell;
  readonly resource: "none" | "draft" | "project" | "document" | "asset" | "token";
  readonly aliases: readonly string[];
  readonly preserveRuntimeBy: "projectId" | "documentId" | "assetId" | null;
}

export const STUDIO_ROUTE_REGISTRY: readonly StudioRouteRegistration[] = Object.freeze([
  { id: "studio.home", path: "/studio", shell: "studio-home", resource: "none", aliases: ["/creator-hub", "/studio/projects"], preserveRuntimeBy: null },
  { id: "studio.new", path: "/studio/new", shell: "studio-home", resource: "none", aliases: ["/make"], preserveRuntimeBy: null },
  { id: "studio.import", path: "/studio/import", shell: "studio-home", resource: "none", aliases: [], preserveRuntimeBy: null },
  { id: "studio.assets", path: "/studio/assets", shell: "asset", resource: "none", aliases: ["/market/library"], preserveRuntimeBy: null },
  { id: "studio.draft", path: "/studio/draft/:draftId", shell: "document", resource: "draft", aliases: ["/studio/canvas"], preserveRuntimeBy: "documentId" },
  { id: "studio.project", path: "/studio/p/:projectId/:section", shell: "project", resource: "project", aliases: [], preserveRuntimeBy: "projectId" },
  { id: "studio.document", path: "/studio/p/:projectId/d/:documentId", shell: "document", resource: "document", aliases: ["/studio/work/:workId/:surface"], preserveRuntimeBy: "documentId" },
  { id: "studio.asset", path: "/studio/assets/:assetType/:assetId", shell: "asset", resource: "asset", aliases: ["/brush-lab", "/shaper"], preserveRuntimeBy: "assetId" },
  { id: "studio.review", path: "/review/:shareToken", shell: "external-review", resource: "token", aliases: [], preserveRuntimeBy: null },
  { id: "studio.present", path: "/present/:presentationToken", shell: "external-review", resource: "token", aliases: ["/studio/present"], preserveRuntimeBy: null },
  { id: "studio.join", path: "/join/:inviteToken", shell: "external-review", resource: "token", aliases: ["/studio/join"], preserveRuntimeBy: null },
]);

export function studioRouteById(id: string): StudioRouteRegistration {
  const route = STUDIO_ROUTE_REGISTRY.find((candidate) => candidate.id === id);
  if (!route) throw new Error(`Unknown ToonStudio route: ${id}`);
  return route;
}

export function auditStudioRouteRegistry(): readonly string[] {
  const issues: string[] = [];
  const ids = new Set<string>();
  const paths = new Set<string>();
  for (const route of STUDIO_ROUTE_REGISTRY) {
    if (ids.has(route.id)) issues.push(`duplicate route id: ${route.id}`);
    if (paths.has(route.path)) issues.push(`duplicate canonical path: ${route.path}`);
    ids.add(route.id);
    paths.add(route.path);
    for (const alias of route.aliases) {
      if (alias === route.path) issues.push(`${route.id} repeats its canonical path as an alias`);
    }
    if (route.shell === "document" && route.preserveRuntimeBy !== "documentId") {
      issues.push(`${route.id} must preserve the document runtime`);
    }
  }
  return Object.freeze(issues);
}
