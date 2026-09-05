import { describe, expect, it } from "vitest";

import { STUDIO_VRM_PROP_VISUAL_QUARANTINE } from "./studio-vrm-prop-quality-policy";
import {
  createSelectableStudioVrmPropInstance,
  selectableStudioVrmPropById,
  SELECTABLE_VRM_PROPS,
} from "./studio-vrm-prop-selection";
import { createPropInstance, parseVrmProps, propDefById, serializeVrmProps, VRM_PROPS } from "./studio-vrm-props";

const withheldIds = Object.keys(STUDIO_VRM_PROP_VISUAL_QUARANTINE);

describe("wearable new-selection quality boundary", () => {
  it("withholds the 34 reviewed proxies without deleting the complete catalogue", () => {
    expect(withheldIds).toHaveLength(34);
    expect(Object.isFrozen(SELECTABLE_VRM_PROPS)).toBe(true);
    expect(SELECTABLE_VRM_PROPS).toHaveLength(VRM_PROPS.length - withheldIds.length);
    for (const id of withheldIds) {
      expect(propDefById(id)).toBeDefined();
      expect(selectableStudioVrmPropById(id)).toBeUndefined();
      expect(createSelectableStudioVrmPropInstance(id)).toBeNull();
      expect(SELECTABLE_VRM_PROPS.some((definition) => definition.id === id)).toBe(false);
    }
  });

  it("keeps every withheld saved instance editable and preserves its serialized values", () => {
    const items = withheldIds.map((id, index) => {
      const item = createPropInstance(id, `quality-legacy-${index}`)!;
      return { ...item, color: "#385070", scale: 1.1 };
    });
    const serialized = serializeVrmProps(items);
    expect(serialized).toBeDefined();
    expect(parseVrmProps(serialized).items).toEqual(items);
  });

  it("admits all twelve replacement IDs and rejects unknown input", () => {
    const ids = ["mic", "cap", "beret", "sunglasses", "headphones", "ribbon", "beanie", "blender_wizard_hat", "smartphone", "camera", "medicalBag", "shoulderbag"];
    for (const id of ids) {
      expect(createSelectableStudioVrmPropInstance(id, `quality-new-${id}`)?.propId).toBe(id);
    }
    expect(createSelectableStudioVrmPropInstance("unknown-prop")).toBeNull();
    expect(selectableStudioVrmPropById("unknown-prop")).toBeUndefined();
  });
});
