import type { StudioWorkspaceRoute } from "./studio-workspace-route";

/** The route entry has already resolved local authority against registered project metadata.
 * Adapters must preserve that result, never infer authority from a URL or ID prefix.
 */
export function studioEditorSourceRoute(route: StudioWorkspaceRoute): StudioWorkspaceRoute {
  return route;
}

/** Compatibility storage helper. A real remote work ID takes precedence over local identity.
 * Remix-aware callers use studioDocumentPersistenceWorkId at the document-access boundary.
 */
export function studioEditorPersistenceWorkId(documentId: string | null, workId: string | null): string | null {
  return workId ?? documentId;
}
