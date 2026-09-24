import { STUDIO_CANVAS_WIDTH } from "./canvas/studio-canvas-constants";
import { readStudioProjectDocuments, type StudioProjectDocumentStorage } from "./studio-project-document-store";
import { readStudioProjectLibrary } from "./studio-project-library-store";

import type { PageState } from "./studio-page-state";
import type { StudioWorkspaceRoute } from "./studio-workspace-route";

export interface StudioLocalCanvasSeed {
  readonly canvasH: number;
  readonly title: string;
  readonly primaryLocale: string;
  readonly pageCount: number;
  readonly initialLayout: "blank" | "webtoon-four-cut" | "cuttoon-card" | "page-comic-page";
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
    const templateId = project?.templateId ?? "";
    const initialLayout: StudioLocalCanvasSeed["initialLayout"] = templateId === "webtoon-four-cut"
      ? "webtoon-four-cut"
      : templateId.startsWith("cuttoon-")
        ? "cuttoon-card"
        : templateId.startsWith("page-comic-")
          ? "page-comic-page"
          : "blank";
    return {
      canvasH,
      title: document.title,
      primaryLocale: project?.primaryLocale ?? "ko-KR",
      pageCount: Math.min(Math.max(1, document.pageCount), 200),
      initialLayout,
    };
  } catch {
    return null;
  }
}

/** Creation-only page seed. Reopens and workspace switches continue to use the saved document. */
export function studioLocalCanvasSeedPage(
  seed: StudioLocalCanvasSeed,
  pageId: string,
  pageIndex = 0,
): Pick<PageState, "canvasH" | "elements" | "name"> {
  if (seed.initialLayout === "blank") {
    return { canvasH: seed.canvasH, elements: [], name: seed.title };
  }
  if (seed.initialLayout === "webtoon-four-cut") {
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

  const pageNumber = pageIndex + 1;
  const margin = seed.initialLayout === "page-comic-page" ? 48 : 32;
  const korean = seed.primaryLocale.toLowerCase().startsWith("ko");
  const unitLabel = seed.initialLayout === "page-comic-page"
    ? (korean ? `${pageNumber}p` : `Page ${pageNumber}`)
    : (korean ? `카드 ${pageNumber}` : `Card ${pageNumber}`);
  return {
    canvasH: seed.canvasH,
    name: seed.pageCount > 1 ? `${seed.title} · ${unitLabel}` : seed.title,
    elements: [{
      id: `${pageId}-initial-frame-1`,
      type: "frame" as const,
      x: margin,
      y: margin,
      width: STUDIO_CANVAS_WIDTH - margin * 2,
      height: seed.canvasH - margin * 2,
      stroke: seed.initialLayout === "page-comic-page" ? "#6b7280" : "#222222",
      strokeWidth: seed.initialLayout === "page-comic-page" ? 1 : 2,
    }],
  };
}
