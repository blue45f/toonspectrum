import { describe, expect, it } from "vitest";

import {
  STUDIO_ADVANCED_RULER_MAX_SERIALIZED_BYTES,
  createDefaultStudioAdvancedRulerDocument,
  mirrorStudioAdvancedRulerDocument,
  normalizeStudioAdvancedRulerDocument,
  parseStudioAdvancedRulerDocument,
  resolveActiveStudioAdvancedRuler,
  studioAdvancedRulerAppliesToGroup,
  type StudioAdvancedRulerDocument,
  type StudioAuthoredCurveRuler,
  type StudioAuthoredFisheyeRuler,
} from "./studio-advanced-ruler-document";

const curve: StudioAuthoredCurveRuler = {
  id: "curve-a",
  type: "curve",
  name: "허리선",
  enabled: true,
  visible: true,
  scope: { kind: "page", groupId: null },
  snapMode: "through-start",
  fixedOffset: 0,
  p0: { x: 10, y: 20 },
  p1: { x: 30, y: 5 },
  p2: { x: 70, y: 5 },
  p3: { x: 90, y: 20 },
};

const fisheye: StudioAuthoredFisheyeRuler = {
  id: "fisheye-a",
  type: "fisheye",
  name: "광각",
  enabled: true,
  visible: true,
  scope: { kind: "group", groupId: "background" },
  guideFamily: "auto",
  centerX: 400,
  centerY: 600,
  radius: 320,
  rotationDeg: 15,
  fovDeg: 180,
  strength: 1,
  outsidePolicy: "clamp",
};

function document(): StudioAdvancedRulerDocument {
  return {
    version: 1,
    rulers: [curve, fisheye],
    activeSnapRulerId: "fisheye-a",
    selectedRulerId: "curve-a",
  };
}

describe("studio advanced ruler document", () => {
  it("creates a bounded empty document", () => {
    expect(createDefaultStudioAdvancedRulerDocument()).toEqual({
      version: 1,
      rulers: [],
      activeSnapRulerId: null,
      selectedRulerId: null,
    });
  });

  it("strictly round-trips multiple scoped rulers", () => {
    expect(parseStudioAdvancedRulerDocument(document())).toEqual(document());
    expect(resolveActiveStudioAdvancedRuler(document(), "background")).toEqual(fisheye);
    expect(resolveActiveStudioAdvancedRuler(document(), "characters")).toBeNull();
    expect(studioAdvancedRulerAppliesToGroup(curve, "characters")).toBe(true);
    expect(studioAdvancedRulerAppliesToGroup(fisheye, "background")).toBe(true);
  });

  it("rejects unknown keys, duplicate ids and an inactive snap owner", () => {
    expect(parseStudioAdvancedRulerDocument({ ...document(), future: true })).toBeNull();
    expect(parseStudioAdvancedRulerDocument({
      ...document(),
      rulers: [curve, { ...fisheye, id: curve.id }],
    })).toBeNull();
    expect(parseStudioAdvancedRulerDocument({
      ...document(),
      rulers: [curve, { ...fisheye, enabled: false }],
    })).toBeNull();
  });

  it("normalizes malformed values and drops unsafe ids deterministically", () => {
    expect(normalizeStudioAdvancedRulerDocument({
      rulers: [
        { ...curve, name: "", fixedOffset: Infinity },
        { ...curve },
        { ...fisheye, id: "bad\u0000id" },
      ],
      activeSnapRulerId: "missing",
      selectedRulerId: curve.id,
    })).toEqual({
      version: 1,
      rulers: [{ ...curve, name: "곡선자", fixedOffset: 0 }],
      activeSnapRulerId: null,
      selectedRulerId: curve.id,
    });
  });

  it("trims tolerant input to the same serialized budget enforced by the strict boundary", () => {
    const rulers = Array.from({ length: 12 }, (_, index): StudioAuthoredCurveRuler => ({
      ...curve,
      id: `curve-${index}-${"x".repeat(140)}`,
      name: "곡".repeat(80),
    }));
    const oversized = {
      version: 1,
      rulers,
      activeSnapRulerId: null,
      selectedRulerId: null,
    };
    expect(parseStudioAdvancedRulerDocument(oversized)).toBeNull();

    const normalized = normalizeStudioAdvancedRulerDocument(oversized);
    expect(normalized.rulers.length).toBeLessThan(rulers.length);
    expect(new TextEncoder().encode(JSON.stringify(normalized)).byteLength)
      .toBeLessThanOrEqual(STUDIO_ADVANCED_RULER_MAX_SERIALIZED_BYTES);
    expect(parseStudioAdvancedRulerDocument(normalized)).toEqual(normalized);
  });

  it("rejects accessor-backed strict input without invoking accessors", () => {
    let getterCalls = 0;
    const hostile = {
      version: 1,
      activeSnapRulerId: null,
      selectedRulerId: null,
      get rulers() {
        getterCalls += 1;
        return [];
      },
    };
    expect(parseStudioAdvancedRulerDocument(hostile)).toBeNull();
    expect(getterCalls).toBe(0);
  });

  it("mirrors curve controls and fisheye center without mutating the source", () => {
    const source = document();
    source.rulers[0] = { ...curve, snapMode: "fixed", fixedOffset: 25 };
    const mirrored = mirrorStudioAdvancedRulerDocument(source, 800);
    expect((mirrored.rulers[0] as StudioAuthoredCurveRuler).p0.x).toBe(790);
    expect((mirrored.rulers[0] as StudioAuthoredCurveRuler).p3.x).toBe(710);
    expect((mirrored.rulers[0] as StudioAuthoredCurveRuler).fixedOffset).toBe(-25);
    expect((mirrored.rulers[1] as StudioAuthoredFisheyeRuler).centerX).toBe(400);
    expect((mirrored.rulers[1] as StudioAuthoredFisheyeRuler).rotationDeg).toBe(165);
    expect(curve.p0.x).toBe(10);
    mirrored.rulers[0]!.scope.kind = "group";
    expect(source.rulers[0]!.scope.kind).toBe("page");
  });
});
