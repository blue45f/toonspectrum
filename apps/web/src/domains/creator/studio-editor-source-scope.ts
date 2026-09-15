import type { StudioWorkspaceRoute } from "./studio-workspace-route";

/**
 * The legacy route contract uses documentId as workId for canonical project routes.
 * That id is a local recovery identity, not proof that a creator_works record exists.
 * Only explicit saved-work/remix routes may ask the editor to hydrate a server source.
 * Keep the route's canonical identity and workspace intact across this adapter boundary.
 */
export function studioEditorSourceRoute(route: StudioWorkspaceRoute): StudioWorkspaceRoute {
  if (route.projectId !== null && route.documentId !== null) {
    return Object.freeze({ ...route, workId: null });
  }
  return route;
}

/**
 * Storage-only identity. Retain the existing work:<documentId> recovery slots so separating
 * source hydration does not hide existing OPFS/SQLite autosaves or merge local manuscripts
 * into the generic new-draft slot. Never use this value for server reads or authorization.
 */
export function studioEditorPersistenceWorkId(
  documentId: string | null,
  workId: string | null,
): string | null {
  return documentId ?? workId;
}
