import { STUDIO_BG3D_CAMERA_MAX_WORLD_COORDINATE } from "./studio-bg3d-camera-framing";

import type { StudioBg3dCameraFramingBounds } from "./studio-bg3d-camera-framing";

interface StudioBg3dFocusSelectionInput {
  readonly selectedIds: ReadonlySet<string>;
  readonly entities: readonly { readonly id: string }[];
  readonly customModels: readonly { readonly id: string }[];
  readonly visibleIds: ReadonlySet<string>;
  readonly readyModelIds: ReadonlySet<string>;
  readonly failedModelIds: ReadonlySet<string>;
  readonly registeredObjects: ReadonlyMap<string, unknown>;
  readonly interactionLocked: boolean;
}

/** Locked objects can be framed; hidden selections do not expand the visible composition. */
export function resolveStudioBg3dFocusSelection(input: StudioBg3dFocusSelectionInput): {
  readonly ids: readonly string[];
  readonly disabledReason: string | null;
} {
  const unavailable = (disabledReason: string) => ({ ids: [], disabledReason });
  if (input.interactionLocked) {
    return unavailable("다른 3D 작업이 끝난 뒤 화면 맞춤을 사용해 주세요.");
  }
  if (input.selectedIds.size === 0) return unavailable("화면에 맞출 객체를 선택해 주세요.");
  const entityIds = new Set(input.entities.map((entity) => entity.id));
  if ([...input.selectedIds].some((id) => !entityIds.has(id))) {
    return unavailable("선택한 객체를 장면에서 찾을 수 없습니다. 다시 선택해 주세요.");
  }
  const ids = [...input.selectedIds].filter((id) => input.visibleIds.has(id));
  if (ids.length === 0) return unavailable("숨겨진 객체는 화면에 맞출 수 없습니다.");
  const modelIds = new Set(input.customModels.map((model) => model.id));
  for (const id of ids) {
    if (modelIds.has(id) && !input.readyModelIds.has(id)) {
      return unavailable(input.failedModelIds.has(id)
        ? "선택한 모델 지오메트리를 불러오지 못했습니다."
        : "선택한 모델 지오메트리를 준비하는 중입니다.");
    }
    if (!input.registeredObjects.has(id)) {
      return unavailable("선택한 객체의 지오메트리를 준비하는 중입니다.");
    }
  }
  return { ids: Object.freeze(ids), disabledReason: null };
}

/** Fail atomically if any chosen object cannot be measured, instead of silently fitting a subset. */
export function readStudioBg3dSelectionBounds(
  ids: readonly string[],
  readBounds: (id: string) => StudioBg3dCameraFramingBounds | null,
): StudioBg3dCameraFramingBounds | null {
  if (ids.length === 0) return null;
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const id of ids) {
    const bounds = readBounds(id);
    if (!bounds) return null;
    for (const axis of [0, 1, 2] as const) {
      const lower = bounds.min[axis];
      const upper = bounds.max[axis];
      if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper ||
        Math.abs(lower) > STUDIO_BG3D_CAMERA_MAX_WORLD_COORDINATE ||
        Math.abs(upper) > STUDIO_BG3D_CAMERA_MAX_WORLD_COORDINATE) return null;
      min[axis] = Math.min(min[axis], lower);
      max[axis] = Math.max(max[axis], upper);
    }
  }
  return Object.freeze({ min: Object.freeze(min), max: Object.freeze(max) });
}
