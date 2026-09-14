import { STUDIO_CANVAS_WIDTH } from "./canvas/studio-canvas-constants";
import { clampStudioCanvasHeight } from "./canvas/studio-canvas-size";
import { readStudioProjectDocuments } from "./studio-project-document-store";
import { readStudioProjectLibrary } from "./studio-project-library-store";
import type { PageState } from "./studio-page-state";
import type { StudioProjectDocumentStorage } from "./studio-project-document-store";
import type { StudioWorkspaceRoute } from "./studio-workspace-route";

/** Called only by the initial state factory. Restores and workspace switches never use this seed. */
export function studioLocalDocumentPageSeed(
  route: StudioWorkspaceRoute,
  pageId: string,
  storage?: StudioProjectDocumentStorage | null,
): Pick<PageState, "canvasH" | "elements" | "name"> | null {
  if (route.workId !== null || route.remixSourceWorkId !== null || !route.projectId || !route.documentId) return null;
  try {
    const source = storage === undefined ? (typeof window === "undefined" ? null : window.localStorage) : storage;
    if (!source) return null;
    const document = readStudioProjectDocuments(source, route.projectId).documents.find(
      (item) => item.id === route.documentId && item.status === "active",
    );
    if (!document?.width || !document.height) return null;
    const canvasH = clampStudioCanvasHeight(STUDIO_CANVAS_WIDTH * document.height / document.width);
    const project = readStudioProjectLibrary(source).projects.find((item) => item.id === route.projectId);
    const fourCut = document.kind === "webtoon" && project?.templateId === "webtoon-four-cut";
    const gap = 32;
    const frameHeight = (canvasH - gap * 5) / 4;
    return {
      canvasH,
      name: document.title,
      elements: fourCut ? Array.from({ length: 4 }, (_, index) => ({
        id: `${pageId}-initial-frame-${index + 1}`,
        type: "frame" as const,
        x: gap, y: gap + index * (frameHeight + gap),
        width: STUDIO_CANVAS_WIDTH - gap * 2, height: frameHeight,
        stroke: "#222222", strokeWidth: 2,
      })) : [],
    };
  } catch {
    // Storage denial is not permission to load a remote document as an empty local one.
    return null;
  }
}
