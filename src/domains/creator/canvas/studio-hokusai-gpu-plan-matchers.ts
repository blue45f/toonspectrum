import { type StudioGpuLiveSourceJournalAdvance } from "../render/studio-webgpu-live-source-journal";
import { type StudioGpuLiveStrokePlan } from "../render/studio-webgpu-live-stroke-plan";
import { type DrawEl } from "../studio-element-model";
import { type StudioHokusaiPinnedLiveStroke } from "../studio-page-editor-types";

export function studioHokusaiVectorTailShadow(
  element: DrawEl,
  state: StudioHokusaiPinnedLiveStroke,
): DrawEl | null {
  const sampleCount = Math.floor(element.points.length / 2);
  const bounds = state.materialCompositeBounds;
  if (!bounds) return null;
  const margin = Math.max(1, state.route.config.radiusPixels * 1.5);
  let presentedSampleCount = 0;
  for (let index = 0; index < sampleCount; index += 1) {
    const x = element.points[index * 2] ?? Number.NaN;
    const y = element.points[index * 2 + 1] ?? Number.NaN;
    const covered = Number.isFinite(x)
      && Number.isFinite(y)
      && x >= bounds.x - margin
      && x <= bounds.x + bounds.width + margin
      && y >= bounds.y - margin
      && y <= bounds.y + bounds.height + margin;
    if (!covered && presentedSampleCount > 0) break;
    if (covered) presentedSampleCount = index + 1;
  }
  if (presentedSampleCount <= 0 || presentedSampleCount >= sampleCount) return null;
  // Retain one overlap sample so the transient suffix joins the material prefix without a gap.
  // A 0.6 alpha bridge approximates the current natural-media energy while the Worker catches
  // up; unlike a full-vector shadow it cannot darken the already receipted material prefix.
  const start = Math.max(0, Math.min(sampleCount - 1, presentedSampleCount - 1));
  const slice = (values: number[] | undefined): number[] | undefined => values?.slice(start);
  return {
    ...element,
    points: element.points.slice(start * 2),
    pressures: slice(element.pressures),
    tiltXs: slice(element.tiltXs),
    tiltYs: slice(element.tiltYs),
    twists: slice(element.twists),
    speeds: slice(element.speeds),
    tangentialPressures: slice(element.tangentialPressures),
    altitudeAngles: slice(element.altitudeAngles),
    azimuthAngles: slice(element.azimuthAngles),
    contactWidths: slice(element.contactWidths),
    contactHeights: slice(element.contactHeights),
    sampleTimeOffsets: slice(element.sampleTimeOffsets),
    opacity: Math.max(0.01, Math.min(1, (element.opacity ?? 1) * 0.6)),
  };
}

export function initialGpuLiveSourceJournalMatchesPlan(
  advanced: StudioGpuLiveSourceJournalAdvance,
  plan: StudioGpuLiveStrokePlan
): boolean {
  if (
    advanced.status !== "advanced"
    || advanced.state.renderedPointCount !== plan.renderedPointCount
    || advanced.suffixes.length !== plan.strokes.length
  ) return false;
  return advanced.suffixes.every((suffix, variationIndex) => {
    const stroke = plan.strokes[variationIndex];
    if (
      !stroke
      || suffix.id !== stroke.id
      || suffix.previousRenderedPointCount !== 0
      || suffix.nextRenderedPointCount !== plan.renderedPointCount
      || suffix.points.length !== stroke.points.length
      || suffix.pressures.length !== stroke.pressures?.length
    ) return false;
    for (let index = 0; index < suffix.points.length; index += 1) {
      if (!Object.is(suffix.points[index], stroke.points[index])) return false;
    }
    for (let index = 0; index < suffix.pressures.length; index += 1) {
      if (!Object.is(suffix.pressures[index], stroke.pressures?.[index])) return false;
    }
    return true;
  });
}
