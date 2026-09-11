export type StudioPresentationBlockKind = "title" | "body" | "image" | "chart" | "diagram" | "footer";

export interface StudioPresentationBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioPresentationBlock {
  readonly id: string;
  readonly kind: StudioPresentationBlockKind;
  readonly bounds: StudioPresentationBounds;
  readonly text: string;
  readonly fontSizePt: number | null;
  readonly assetRightsStatus: "allowed" | "warning" | "blocked" | null;
}

export interface StudioPresentationSlide {
  readonly id: string;
  readonly title: string;
  readonly speakerNotes: string;
  readonly blocks: readonly StudioPresentationBlock[];
}

export interface StudioPresentationFinding {
  readonly code: string;
  readonly severity: "warning" | "error";
  readonly slideId: string;
  readonly blockIds: readonly string[];
}

export interface StudioPresentationPlan {
  readonly status: "ready" | "review" | "blocked";
  readonly findings: readonly StudioPresentationFinding[];
  readonly recommendedLayoutBySlide: Readonly<Record<string, "single-column" | "two-column" | "hero" | "data">>;
}

function overlaps(first: StudioPresentationBounds, second: StudioPresentationBounds): boolean {
  return first.x < second.x + second.width
    && first.x + first.width > second.x
    && first.y < second.y + second.height
    && first.y + first.height > second.y;
}

function inCanvas(bounds: StudioPresentationBounds): boolean {
  return [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    && bounds.x >= 0
    && bounds.y >= 0
    && bounds.width > 0
    && bounds.height > 0
    && bounds.x + bounds.width <= 1
    && bounds.y + bounds.height <= 1;
}

function finding(
  code: string,
  severity: StudioPresentationFinding["severity"],
  slideId: string,
  blockIds: readonly string[],
): StudioPresentationFinding {
  return Object.freeze({ code, severity, slideId, blockIds: Object.freeze([...blockIds]) });
}

function recommendedLayout(slide: StudioPresentationSlide): "single-column" | "two-column" | "hero" | "data" {
  if (slide.blocks.some((block) => block.kind === "chart" || block.kind === "diagram")) return "data";
  if (slide.blocks.filter((block) => block.kind === "image").length === 1
    && slide.blocks.filter((block) => block.kind === "body").length <= 1) return "hero";
  if (slide.blocks.filter((block) => block.kind === "body" || block.kind === "image").length >= 3) return "two-column";
  return "single-column";
}

export function auditStudioPresentation(
  slides: readonly StudioPresentationSlide[],
): StudioPresentationPlan {
  if (slides.length === 0) throw new Error("A presentation requires at least one slide.");
  const slideIds = slides.map((slide) => slide.id);
  if (new Set(slideIds).size !== slideIds.length) throw new Error("Slide ids must be unique.");
  const findings: StudioPresentationFinding[] = [];
  const layouts: Record<string, "single-column" | "two-column" | "hero" | "data"> = {};
  for (const slide of slides) {
    if (!slide.id.trim() || !slide.title.trim()) {
      findings.push(finding("slide-title", "error", slide.id, []));
    }
    const blockIds = slide.blocks.map((block) => block.id);
    if (new Set(blockIds).size !== blockIds.length) {
      findings.push(finding("block-id-duplicate", "error", slide.id, blockIds));
    }
    if (!slide.blocks.some((block) => block.kind === "title")) {
      findings.push(finding("title-block-missing", "warning", slide.id, []));
    }
    for (const block of slide.blocks) {
      if (!block.id.trim() || !inCanvas(block.bounds)) {
        findings.push(finding("block-bounds", "error", slide.id, [block.id]));
      }
      if ((block.kind === "title" || block.kind === "body" || block.kind === "footer")
        && (!block.text.trim() || block.fontSizePt === null || block.fontSizePt <= 0)) {
        findings.push(finding("text-block", "error", slide.id, [block.id]));
      }
      if (block.fontSizePt !== null && block.fontSizePt < (block.kind === "title" ? 24 : 14)) {
        findings.push(finding("text-too-small", "warning", slide.id, [block.id]));
      }
      if (block.text.length > 500) {
        findings.push(finding("text-overflow-risk", "warning", slide.id, [block.id]));
      }
      if (block.assetRightsStatus === "blocked") {
        findings.push(finding("asset-rights", "error", slide.id, [block.id]));
      } else if (block.assetRightsStatus === "warning") {
        findings.push(finding("asset-rights-review", "warning", slide.id, [block.id]));
      }
    }
    for (let left = 0; left < slide.blocks.length; left += 1) {
      for (let right = left + 1; right < slide.blocks.length; right += 1) {
        const first = slide.blocks[left];
        const second = slide.blocks[right];
        if (first && second && overlaps(first.bounds, second.bounds)) {
          findings.push(finding("block-overlap", "warning", slide.id, [first.id, second.id]));
        }
      }
    }
    layouts[slide.id] = recommendedLayout(slide);
  }
  const blocked = findings.some((item) => item.severity === "error");
  const warning = findings.some((item) => item.severity === "warning");
  return Object.freeze({
    status: blocked ? "blocked" : warning ? "review" : "ready",
    findings: Object.freeze(findings),
    recommendedLayoutBySlide: Object.freeze({ ...layouts }),
  });
}
