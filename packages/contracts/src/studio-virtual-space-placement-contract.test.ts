import { describe, expect, it } from "vitest";

import {
  STUDIO_VIRTUAL_MAX_PLACEMENTS,
  STUDIO_VIRTUAL_SCALE_MAX,
  STUDIO_VIRTUAL_SCALE_MIN,
  emptyStudioVirtualDecorationState,
  parseStudioVirtualPlacement,
  validateStudioVirtualDecorationSave,
  type StudioVirtualDecorationSaveDto,
} from "./studio-virtual-space-placement-contract";

function save(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    scopeKey: '["proj-1","office","personal"]',
    districtKey: "story-terrace",
    presetKey: "creator-garden",
    presentationMode: "decorated",
    placements: [],
    expectedRevision: 0,
    layoutWidth: 1280,
    layoutHeight: 960,
    ...overrides,
  };
}

function placement(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "bench-1",
    type: "bench",
    x: 100,
    y: 200,
    rotation: 0,
    scale: 1,
    ...overrides,
  };
}

describe("virtual space placement parse", () => {
  it("keeps a well formed placement", () => {
    expect(parseStudioVirtualPlacement(placement())).toEqual({
      id: "bench-1",
      type: "bench",
      x: 100,
      y: 200,
      rotation: 0,
      scale: 1,
    });
  });

  it("rejects a decor type outside the allow list", () => {
    expect(parseStudioVirtualPlacement(placement({ type: "weapon-rack" }))).toBe("malformed");
  });

  it("rejects a rotation that is not a quarter turn", () => {
    expect(parseStudioVirtualPlacement(placement({ rotation: 45 }))).toBe("malformed");
  });

  it("rejects non finite coordinates", () => {
    expect(parseStudioVirtualPlacement(placement({ x: Number.NaN }))).toBe("malformed");
    expect(parseStudioVirtualPlacement(placement({ y: Number.POSITIVE_INFINITY }))).toBe("malformed");
  });

  it("rejects a scale that would render invisible or inverted", () => {
    expect(parseStudioVirtualPlacement(placement({ scale: 0 }))).toBe("malformed");
    expect(parseStudioVirtualPlacement(placement({ scale: -1 }))).toBe("malformed");
    expect(parseStudioVirtualPlacement(placement({ scale: STUDIO_VIRTUAL_SCALE_MAX + 0.1 }))).toBe("malformed");
  });

  it("accepts the scale bounds themselves", () => {
    expect(typeof parseStudioVirtualPlacement(placement({ scale: STUDIO_VIRTUAL_SCALE_MIN }))).toBe("object");
    expect(typeof parseStudioVirtualPlacement(placement({ scale: STUDIO_VIRTUAL_SCALE_MAX }))).toBe("object");
  });

  it("rejects an id the server could not have issued", () => {
    expect(parseStudioVirtualPlacement(placement({ id: "Bench 1!" }))).toBe("malformed");
    expect(parseStudioVirtualPlacement(placement({ id: "a".repeat(65) }))).toBe("malformed");
  });
});

describe("custom furniture placement", () => {
  const custom = (overrides: Record<string, unknown> = {}) => ({
    id: "custom-1",
    type: "custom",
    assetId: "asset-1",
    x: 10,
    y: 20,
    rotation: 0,
    scale: 1,
    ...overrides,
  });

  it("keeps a custom placement that points at a known asset", () => {
    const parsed = parseStudioVirtualPlacement(custom());

    expect(parsed).toMatchObject({ type: "custom", assetId: "asset-1" });
  });

  it("requires an asset id because there is no atlas frame to fall back on", () => {
    expect(parseStudioVirtualPlacement(custom({ assetId: undefined }))).toBe("malformed");
    expect(parseStudioVirtualPlacement(custom({ assetId: "Not A Token!" }))).toBe("malformed");
  });

  it("refuses an asset id on an atlas furniture, which would make routing ambiguous", () => {
    expect(parseStudioVirtualPlacement(placement({ assetId: "asset-1" }))).toBe("malformed");
  });

  it("refuses a save whose asset list was not offered to the validator", () => {
    const withoutAssets = validateStudioVirtualDecorationSave(save({ placements: [custom()] }));
    expect(withoutAssets).toMatchObject({ ok: false, reason: "asset" });

    const withAssets = validateStudioVirtualDecorationSave(
      save({ placements: [custom()], assetIds: ["asset-1"] }),
    );
    expect(withAssets.ok).toBe(true);
  });

  it("refuses a save that references an asset the user did not declare", () => {
    const result = validateStudioVirtualDecorationSave(
      save({ placements: [custom({ assetId: "someone-elses" })], assetIds: ["asset-1"] }),
    );

    expect(result).toMatchObject({ ok: false, reason: "asset" });
  });
});

describe("virtual space decoration save", () => {
  it("accepts a valid save", () => {
    const result = validateStudioVirtualDecorationSave(save({ placements: [placement()] }));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.placements).toHaveLength(1);
  });

  it("rejects a missing or control character bearing scope", () => {
    expect(validateStudioVirtualDecorationSave({ ...save(), scopeKey: "" })).toMatchObject({ reason: "scope" });
    expect(validateStudioVirtualDecorationSave({ ...save(), scopeKey: "a\u0000b" })).toMatchObject({ reason: "scope" });
    expect(validateStudioVirtualDecorationSave({ ...save(), scopeKey: "x".repeat(241) })).toMatchObject({ reason: "scope" });
  });

  it("keeps the caller scope so two projects keep separate rows", () => {
    const one = validateStudioVirtualDecorationSave({ ...save(), scopeKey: '["proj-1","office","personal"]' });
    const two = validateStudioVirtualDecorationSave({ ...save(), scopeKey: '["proj-2","office","shared"]' });

    expect(one.ok && two.ok && one.value.scopeKey).not.toBe(two.ok ? two.value.scopeKey : "");
  });

  it("rejects an unknown district", () => {
    const result = validateStudioVirtualDecorationSave(save({ districtKey: "moon-base" }));

    expect(result).toMatchObject({ ok: false, reason: "district" });
  });

  it("rejects a negative or fractional expected revision", () => {
    expect(validateStudioVirtualDecorationSave(save({ expectedRevision: -1 }))).toMatchObject({ reason: "revision" });
    expect(validateStudioVirtualDecorationSave(save({ expectedRevision: 1.5 }))).toMatchObject({ reason: "revision" });
  });

  it("truncates placements beyond the cap instead of storing them", () => {
    const many = Array.from({ length: STUDIO_VIRTUAL_MAX_PLACEMENTS + 1 }, (_, index) =>
      placement({ id: `bench-${index}` }),
    );

    expect(validateStudioVirtualDecorationSave(save({ placements: many }))).toMatchObject({
      ok: false,
      reason: "too_many",
    });
  });

  it("rejects duplicate ids so a save cannot depend on input order", () => {
    const result = validateStudioVirtualDecorationSave(
      save({ placements: [placement(), placement({ x: 5 })] }),
    );

    expect(result).toMatchObject({ ok: false, reason: "placement" });
  });

  it("defaults layout size when the client omits it", () => {
    const body = save();
    delete body.layoutWidth;
    delete body.layoutHeight;

    const result = validateStudioVirtualDecorationSave(body);

    expect(result.ok && (result.value as StudioVirtualDecorationSaveDto).layoutWidth).toBe(1280);
  });

  it("rejects a world larger than the coordinate ceiling", () => {
    expect(validateStudioVirtualDecorationSave(save({ layoutWidth: 100_000 }))).toMatchObject({
      ok: false,
      reason: "placement",
    });
  });
});

describe("empty state", () => {
  it("starts at revision zero so the first save is an insert, not an update", () => {
    expect(emptyStudioVirtualDecorationState("proj-1", "sky-port")).toEqual({
      scopeKey: "proj-1",
      districtKey: "sky-port",
      presetKey: "minimal",
      presentationMode: "minimal",
      placements: [],
      revision: 0,
      layoutWidth: 1280,
      layoutHeight: 960,
    });
  });
});
