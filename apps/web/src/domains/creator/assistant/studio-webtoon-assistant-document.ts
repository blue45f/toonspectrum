import type { El } from "../studio-element-model";

export interface StudioWebtoonAssistantProtectedRegion {
  readonly top: number;
  readonly bottom: number;
  readonly label: string;
}

export interface StudioWebtoonAssistantPanel {
  readonly id: string;
  readonly topY: number;
  readonly bottomY: number;
  readonly heightPx: number;
  readonly dialogueCount: number;
}

export interface StudioWebtoonAssistantDocumentAnalysis {
  readonly protectedRegions: readonly StudioWebtoonAssistantProtectedRegion[];
  readonly panels: readonly StudioWebtoonAssistantPanel[];
}

function elementCenter(element: Pick<El, "type"> & Partial<{ x: number; y: number; width: number; height: number }>) {
  if (typeof element.x !== "number" || typeof element.y !== "number") return null;
  const width = typeof element.width === "number" ? element.width : 0;
  const height = typeof element.height === "number" ? element.height : 0;
  return { x: element.x + width / 2, y: element.y + height / 2 };
}

export function buildStudioWebtoonAssistantDocumentAnalysis(
  elements: readonly El[],
): StudioWebtoonAssistantDocumentAnalysis {
  const frames = elements
    .filter((element) => element.type === "frame")
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const dialogue = elements.filter((element) => element.type === "bubble" || element.type === "text");
  const panels = frames.map((frame) => {
    const dialogueCount = dialogue.reduce((count, element) => {
      const center = elementCenter(element);
      if (!center) return count;
      const inside = center.x >= frame.x && center.x <= frame.x + frame.width
        && center.y >= frame.y && center.y <= frame.y + frame.height;
      return count + (inside ? 1 : 0);
    }, 0);
    return {
      id: frame.id,
      topY: Math.max(0, Math.round(frame.y)),
      bottomY: Math.max(0, Math.round(frame.y + frame.height)),
      heightPx: Math.max(1, Math.round(frame.height)),
      dialogueCount,
    };
  });
  const protectedRegions = panels.map((panel, index) => ({
    top: panel.topY,
    bottom: panel.bottomY,
    label: `원고 컷 ${index + 1}`,
  }));
  return { protectedRegions, panels };
}
