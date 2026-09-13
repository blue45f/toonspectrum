import { STUDIO_CANVAS_WIDTH } from "./canvas/studio-canvas-constants";
import { readStudioProjectDocuments, type StudioProjectDocumentStorage } from "./studio-project-document-reader";
import type { StudioWorkspaceRoute } from "./studio-workspace-route";

export interface StudioLocalCanvasSeed { readonly canvasH: number; readonly title: string }

export function readStudioLocalCanvasSeed(
  route: Pick<StudioWorkspaceRoute, "projectId" | "documentId" | "workId" | "remixSourceWorkId">,
  storage?: StudioProjectDocumentStorage | null,
): StudioLocalCanvasSeed | null {
  if (!route.projectId || !route.documentId || route.workId || route.remixSourceWorkId) return null;
  try {
    const source = storage === undefined ? (typeof window === "undefined" ? null : window.localStorage) : storage;
    if (!source) return null;
    const document = readStudioProjectDocuments(source, route.projectId).documents.find(
      (entry) => entry.id === route.documentId && entry.status === "active",
    );
    if (!document?.width || !document.height) return null;
    // Fixed logical-width engine: preserve the selected aspect ratio at initialization only.
    const canvasH = Math.round(STUDIO_CANVAS_WIDTH * document.height / document.width);
    if (!Number.isSafeInteger(canvasH) || canvasH < 64 || canvasH > 32000) return null;
    return { canvasH, title: document.title };
  } catch {
    return null;
  }
}
