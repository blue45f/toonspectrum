import { studioKonvaRuntime } from "../render/studio-konva-runtime";
import { CANVAS_W } from "../studio-assets";
import { STUDIO_VIEW_ZOOM_MAX, STUDIO_VIEW_ZOOM_MIN } from "../studio-view-controls";

/**
 * Live-only tap visibility.
 *
 * A 2.5px pencil nib is the authored document radius. On a zoomed-out webtoon page that
 * downsamples below two CSS pixels, pointerdown looks like a dead canvas even though the committed
 * geometry is correct. Grow only the live draft so the contact is visible; committed replay keeps
 * the planned nib.
 */

/** Two CSS pixels of solid coverage after downsample; the probe requires Δ≥4 on ≥2 pixels. */
const MIN_CSS_RADIUS = 2.5;

export function studioLiveVisibleTapDocumentRadius(
  documentRadius: number,
  viewScale: number,
): number {
  const radius = Number.isFinite(documentRadius) && documentRadius > 0
    ? documentRadius
    : 0;
  const scale = Number.isFinite(viewScale) && viewScale > 1e-6
    ? Math.abs(viewScale)
    : 1;
  return Math.max(radius, MIN_CSS_RADIUS / scale);
}

export function peekStudioStageCssScale(): number {
  const stages = studioKonvaRuntime.stages;
  const stage = stages.length > 0 ? stages[stages.length - 1] : null;
  if (stage) {
    const width = stage.width();
    const content = stage.content as HTMLElement | undefined;
    const clientWidth = content?.clientWidth ?? 0;
    if (width > 0 && clientWidth > 0) {
      const inferred = clientWidth / width;
      // 첫 레이아웃 전에는 stage.width()가 컨테이너보다 작아 비율이 크게 부풀어난다. 그 값으로 첫
      // 획을 지연 배치에 넘기면 짧은 획이 저장되지 않는다. 뷰 줌 범위를 벗어나면 스테이지의 실제 변환을 쓴다.
      if (Number.isFinite(inferred) && inferred >= STUDIO_VIEW_ZOOM_MIN && inferred <= STUDIO_VIEW_ZOOM_MAX) {
        return inferred;
      }
    }
    const scale = stage.scaleX();
    if (typeof scale === "number" && Number.isFinite(scale) && scale > 1e-6) {
      return Math.abs(scale);
    }
  }
  const canvas = globalThis.document?.querySelector(".konvajs-content canvas");
  if (
    typeof HTMLCanvasElement !== "undefined"
    && canvas instanceof HTMLCanvasElement
    && canvas.clientWidth > 0
  ) {
    return canvas.clientWidth / CANVAS_W;
  }
  return 1;
}

/** Live drafts use a view-space floor; committed strokes keep the planned document radius. */
export function resolveStudioDrawTapRadius(
  activeDraft: boolean,
  documentRadius: number,
): number {
  return activeDraft
    ? studioLiveVisibleTapDocumentRadius(documentRadius, peekStudioStageCssScale())
    : documentRadius;
}
