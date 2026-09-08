import { planStudioAnimaticPreview, sampleStudioAnimaticPreview, type StudioAnimaticPreviewSample, type StudioAnimaticSegment } from "../studio-animatic-timeline";

import type { StudioAnimaticWorkspaceSnapshot } from "./studio-animatic-workspace";

export type StudioAnimaticImages = ReadonlyMap<string, CanvasImageSource>;

/** Preview and video export share document coordinates, camera interpolation and transitions. */
export function drawStudioAnimaticFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  snapshot: StudioAnimaticWorkspaceSnapshot,
  sample: StudioAnimaticPreviewSample,
  images: StudioAnimaticImages,
): void {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  context.fillStyle = "#121110";
  context.fillRect(0, 0, width, height);
  const segment = snapshot.timeline.segments[sample.segmentIndex];
  if (!segment) { context.restore(); return; }

  function drawCut(cut: StudioAnimaticSegment, at: StudioAnimaticPreviewSample, opacity: number): void {
    const artwork = snapshot.artwork.find((item) => item.pageId === cut.pageId);
    const image = artwork ? images.get(artwork.asset.hash) : null;
    if (!artwork || !image) {
      context.fillStyle = "#eeeeee";
      context.font = `${Math.max(14, width / 28)}px sans-serif`;
      context.textAlign = "center";
      context.fillText("원고를 캡처하면 실제 그림을 볼 수 있어요", width / 2, height / 2, width - 32);
      return;
    }
    const rect = cut.sourceRect;
    const sx = rect.x / artwork.documentWidth * artwork.width;
    const sy = rect.y / artwork.documentHeight * artwork.height;
    const sw = rect.width / artwork.documentWidth * artwork.width;
    const sh = rect.height / artwork.documentHeight * artwork.height;
    const fit = Math.min(width / sw, height / sh) * at.camera.zoom;
    const pan = at.transitionKind === "pan" ? (1 - at.transitionProgress) * 0.12 * width : 0;
    context.save();
    context.globalAlpha = opacity;
    context.translate(width / 2 + at.camera.panXPercent * width / 100 + pan, height / 2 + at.camera.panYPercent * height / 100);
    context.drawImage(image, sx, sy, sw, sh, -sw * fit / 2, -sh * fit / 2, sw * fit, sh * fit);
    context.restore();
  }

  if (snapshot.timeline.previewMode === "vertical-scroll") {
    const seen = new Set<string>();
    context.save();
    context.translate(width / 2 + sample.camera.panXPercent * width / 100, height / 2 + sample.camera.panYPercent * height / 100);
    context.scale(sample.camera.zoom, sample.camera.zoom);
    context.translate(-width / 2, -height / 2);
    for (const cut of snapshot.timeline.segments) {
      if (seen.has(cut.pageId)) continue;
      seen.add(cut.pageId);
      const artwork = snapshot.artwork.find((item) => item.pageId === cut.pageId);
      const image = artwork ? images.get(artwork.asset.hash) : null;
      if (!artwork || !image) continue;
      const scale = width / artwork.documentWidth;
      const top = cut.sourceRect.stripY - cut.sourceRect.y;
      context.drawImage(image, 0, (top - sample.scrollY) * scale, width, artwork.documentHeight * scale);
    }
    context.restore();
  } else {
    if (sample.transitionKind === "fade" && sample.transitionProgress < 1 && sample.segmentIndex > 0) {
      const planned = planStudioAnimaticPreview(snapshot.timeline, sample.reducedMotion);
      if (planned.ok) {
        const previous = sampleStudioAnimaticPreview(snapshot.timeline, planned.plan, planned.plan.segments[sample.segmentIndex]!.startMs - 1, sample.reducedMotion);
        if (previous) drawCut(snapshot.timeline.segments[previous.segmentIndex]!, previous, 1);
      }
    }
    drawCut(segment, sample, sample.transitionKind === "fade" ? sample.transitionProgress : 1);
  }
  const captions = sample.cues.filter((cue) => cue.kind === "dialogue" && cue.text.trim()).slice(-2);
  if (captions.length) {
    const fontSize = Math.max(14, width / 28);
    context.font = `${fontSize}px sans-serif`;
    context.textAlign = "center";
    captions.forEach((cue, index) => {
      const y = height - 20 - (captions.length - 1 - index) * (fontSize + 10);
      context.fillStyle = "#000000cc";
      context.fillRect(12, y - fontSize - 4, width - 24, fontSize + 10);
      context.fillStyle = "#ffffff";
      context.fillText(`${cue.speaker ? `${cue.speaker}: ` : ""}${cue.text}`, width / 2, y, width - 40);
    });
  }
  context.restore();
}
