import type { StudioTextAiProvenance } from "./studio-ai-client";
import type { El } from "../studio-element-model";
import type { ScenarioPreviewItem } from "../studio-scenario-layout";

export interface StudioAiComicDirectorApplyElementInput {
  readonly items: readonly ScenarioPreviewItem[];
  readonly createId: () => string;
  readonly textAiProvenance: StudioTextAiProvenance | null;
}

export interface StudioAiComicDirectorApplyElementResult {
  readonly elements: El[];
  readonly frameCount: number;
  readonly imageCount: number;
  readonly nativeBubbleCount: number;
  readonly decomposedLayerCount: number;
}

/**
 * Compiles an approved Comic Director preview into ordinary Studio elements.
 *
 * Editable layer manifests emit real image elements beneath a border/story-beat frame. A candidate
 * without real layer pixels keeps the established frame-background path. Native bubbles are always
 * emitted after artwork, so dialogue remains editable and is never burned into the generated image.
 */
export function compileStudioAiComicDirectorApplyElements({
  items,
  createId,
  textAiProvenance,
}: StudioAiComicDirectorApplyElementInput): StudioAiComicDirectorApplyElementResult {
  const elements: El[] = [];
  let frameCount = 0;
  let imageCount = 0;
  let nativeBubbleCount = 0;
  let decomposedLayerCount = 0;

  for (const item of items) {
    const editableLayers = item.layerManifest?.editable
      ? item.layerManifest.layers.filter((layer) => layer.imageDataUrl.length > 0)
      : [];

    for (const layer of editableLayers) {
      elements.push({
        id: createId(),
        type: "image",
        src: layer.imageDataUrl,
        x: item.frame.x,
        y: item.frame.y,
        width: item.frame.width,
        height: item.frame.height,
        rotation: 0,
        lockAspect: true,
        name: layer.name,
        ...(item.imageProvenance ? { aiProvenance: item.imageProvenance } : {}),
      });
      imageCount += 1;
      decomposedLayerCount += 1;
    }

    elements.push({
      id: createId(),
      type: "frame",
      x: item.frame.x,
      y: item.frame.y,
      width: item.frame.width,
      height: item.frame.height,
      storyBeat: {
        type: item.beatType,
        summary: item.summary,
        ...(item.continuity ? { continuity: item.continuity } : {}),
        ...(textAiProvenance ? { textAiProvenance } : {}),
      },
      ...(item.imageProvenance ? { aiProvenance: item.imageProvenance } : {}),
      ...(editableLayers.length === 0 && item.imageDataUrl
        ? { bg: item.imageDataUrl }
        : {}),
    });
    frameCount += 1;
    if (editableLayers.length === 0 && item.imageDataUrl) imageCount += 1;

    for (const bubble of item.bubbles) {
      elements.push({ id: createId(), ...bubble });
      nativeBubbleCount += 1;
    }
  }

  return {
    elements,
    frameCount,
    imageCount,
    nativeBubbleCount,
    decomposedLayerCount,
  };
}
