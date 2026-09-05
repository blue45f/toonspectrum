import { isStudioVrmPropSelectable } from "./studio-vrm-prop-quality-policy";
import { createPropInstance, propDefById, VRM_PROPS } from "./studio-vrm-props";

/** Only new selections are filtered; the rendering and document catalogues stay complete. */
export const SELECTABLE_VRM_PROPS = Object.freeze(
  VRM_PROPS.filter((definition) => isStudioVrmPropSelectable(definition.id)),
);

export function selectableStudioVrmPropById(id: string) {
  return isStudioVrmPropSelectable(id) ? propDefById(id) : undefined;
}

/** Entry point for UI and one-shot rail insertions, never for restoring saved scenes. */
export function createSelectableStudioVrmPropInstance(id: string, uid?: string) {
  return selectableStudioVrmPropById(id) ? createPropInstance(id, uid) : null;
}
