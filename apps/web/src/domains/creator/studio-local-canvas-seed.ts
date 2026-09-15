import { STUDIO_CANVAS_WIDTH } from "./canvas/studio-canvas-constants";
import { readStudioProjectDocuments, type StudioProjectDocumentStorage } from "./studio-project-document-store";
import { readStudioProjectLibrary } from "./studio-project-library-store";

import type { PageState } from "./studio-page-state";
import type { StudioWorkspaceRoute } from "./studio-workspace-route";

export interface StudioLocalCanvasSeed {
  readonly canvasH: number;
  readonly title: string;
  readonly initialLayout: "blank" | "webtoon-four-cut";
}

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
    const canvasH = Math.round(STUDIO_CANVAS_WIDTH * document.height / document.width);
    if (!Number.isSafeInteger(canvasH) || canvasH < 64 || canvasH > 32_000) return null;
    const project = readStudioProjectLibrary(source).projects.find((entry) => entry.id === route.projectId);
    return {
      canvasH,
      title: document.title,
      initialLayout: document.kind === "webtoon" && project?.templateId === "webtoon-four-cut"
        ? "webtoon-four-cut"
        : "blank",
    };
  } catch {
    return null;
  }
}

/** Creation-only page seed. Reopens and workspace switches continue to use the saved document. */
export function studioLocalCanvasSeedPage(
  seed: StudioLocalCanvasSeed,
  pageId: string,
): Pick<PageState, "canvasH" | "elements" | "name"> {
  if (seed.initialLayout !== "webtoon-four-cut") {
    return { canvasH: seed.canvasH, elements: [], name: seed.title };
  }
  const gap = 32;
  const frameHeight = (seed.canvasH - gap * 5) / 4;
  return {
    canvasH: seed.canvasH,
    name: seed.title,
    elements: Array.from({ length: 4 }, (_, index) => ({
      id: `${pageId}-initial-frame-${index + 1}`,
      type: "frame" as const,
      x: gap,
      y: gap + index * (frameHeight + gap),
      width: STUDIO_CANVAS_WIDTH - gap * 2,
      height: frameHeight,
      stroke: "#222222",
      strokeWidth: 2,
    })),
  };
}
