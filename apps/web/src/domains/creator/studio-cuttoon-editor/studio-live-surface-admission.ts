import type { DrawEl } from "../studio-element-model";
import type { StudioLiveStrokeMediaSelection } from "../live/studio-live-stroke-media-selection";

/** 획을 다시 시도해도 최초 선택한 렌더러 권위를 유지한다. */
export interface StudioLiveSurfaceAdmission {
  readonly pendingBackdrop?: boolean;
  readonly onAdmitted?: (stroke: DrawEl) => void;
  readonly pinnedMedia?: StudioLiveStrokeMediaSelection;
}
