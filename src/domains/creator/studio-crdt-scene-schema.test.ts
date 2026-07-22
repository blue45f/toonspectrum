import { describe, expect, it } from "vitest";

import {
  STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION,
  validateStudioCrdtSceneElementPayload,
  type StudioCrdtJsonObject,
} from "./studio-crdt-scene-schema";
import { STUDIO_CURVE_MAX_CONTROL_POINTS } from "./studio-curves";

import { STUDIO_WORK_ASSET_MAX_CURVE_POINTS } from "@/lib/studio-work-asset-contract";

function imageReferenceProps(overrides: StudioCrdtJsonObject = {}): StudioCrdtJsonObject {
  return {
    elementType: "image",
    x: 10,
    y: 20,
    width: 300,
    height: 400,
    rotation: 0,
    ...overrides,
  };
}

function validateReference(props: StudioCrdtJsonObject) {
  return validateStudioCrdtSceneElementPayload({
    version: STUDIO_CRDT_SCENE_ELEMENT_PAYLOAD_VERSION,
    type: "reference",
    props,
  });
}

describe("studio CRDT structured work-asset filters", () => {
  it("keeps the authoring and shared persistence curve ceilings aligned", () => {
    expect(STUDIO_CURVE_MAX_CONTROL_POINTS).toBe(STUDIO_WORK_ASSET_MAX_CURVE_POINTS);
  });

  it("validates and detaches exact blur, curves, and smart-filter programs", () => {
    const curve = [{ x: 0, y: 4 }, { x: 128, y: 144 }, { x: 255, y: 250 }];
    const props = imageReferenceProps({
      blurFx: { type: "motion", strength: 100, radius: 40, angle: 360 },
      curve,
      curveCh: {
        r: [{ x: 0, y: 0 }, { x: 255, y: 240 }],
        b: [{ x: 0, y: 12 }, { x: 255, y: 255 }],
      },
      smartFilters: {
        version: 1,
        entries: [{
          id: "tone-1",
          engine: "brightness-contrast",
          enabled: true,
          params: { brightness: 0.2, contrast: -40 },
        }],
      },
    });
    const validated = validateReference(props);

    curve[1]!.y = 1;
    expect(validated.props).toMatchObject({
      blurFx: { type: "motion", strength: 100, radius: 40, angle: 360 },
      curve: [{ x: 0, y: 4 }, { x: 128, y: 144 }, { x: 255, y: 250 }],
      curveCh: {
        r: [{ x: 0, y: 0 }, { x: 255, y: 240 }],
        b: [{ x: 0, y: 12 }, { x: 255, y: 255 }],
      },
      smartFilters: {
        version: 1,
        entries: [{ engine: "brightness-contrast", params: { brightness: 0.2, contrast: -40 } }],
      },
    });
  });

  it("fails closed for over-point, unordered, malformed, and non-image structured edits", () => {
    const overPointCurve = Array.from(
      { length: STUDIO_WORK_ASSET_MAX_CURVE_POINTS + 1 },
      (_, index) => ({
        x: Math.round(index * 255 / STUDIO_WORK_ASSET_MAX_CURVE_POINTS),
        y: index,
      })
    );
    const invalidProps = [
      imageReferenceProps({ curve: overPointCurve }),
      imageReferenceProps({
        curve: [{ x: 0, y: 0 }, { x: 128, y: 100 }, { x: 128, y: 120 }, { x: 255, y: 255 }],
      }),
      imageReferenceProps({
        curveCh: { r: [{ x: 0, y: 0 }, { x: 255, y: 255 }], alpha: [] },
      }),
      imageReferenceProps({
        blurFx: { type: "motion", strength: 100, radius: 41, angle: 0 },
      }),
      imageReferenceProps({
        smartFilters: {
          version: 1,
          entries: [{ id: "bad", engine: "arbitrary-code", enabled: true, params: {} }],
        },
      }),
      {
        ...imageReferenceProps({
          blurFx: { type: "gaussian", strength: 100, radius: 10, angle: 0 },
        }),
        elementType: "vrm",
      },
    ];

    for (const props of invalidProps) {
      expect(() => validateReference(props)).toThrow(/구조화 필터/u);
    }
  });
});
