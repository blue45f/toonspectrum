import { describe, expect, it } from "vitest";

import {
  resolveStudioLayerGroupDropIntent,
  resolveStudioLayerItemDropIntent,
  studioLayerDragSourceGroup,
  studioLayerDropIntentEqual,
  studioLayerDropSideFromPointer,
  type StudioLayerDragPayload,
} from "./studio-layer-drag";

const rootPayload: StudioLayerDragPayload = {
  kind: "items",
  ids: ["loose"],
  sourceGroupId: null,
  label: "loose",
};
const groupedPayload: StudioLayerDragPayload = {
  kind: "items",
  ids: ["child"],
  sourceGroupId: "source",
  label: "child",
};

describe("studio layer drag intent", () => {
  it("classifies root, common-group, and mixed selections deterministically", () => {
    const items = [
      { id: "root" },
      { id: "a", groupId: "g" },
      { id: "b", groupId: "g" },
      { id: "c", groupId: "other" },
    ];
    expect(studioLayerDragSourceGroup(items, ["root"])).toBeNull();
    expect(studioLayerDragSourceGroup(items, ["a", "b"])).toBe("g");
    expect(studioLayerDragSourceGroup(items, ["a", "c"])).toBe("mixed");
  });

  it("maps the pointer half to front/back panel placement", () => {
    expect(studioLayerDropSideFromPointer(109, 100, 20)).toBe("front");
    expect(studioLayerDropSideFromPointer(111, 100, 20)).toBe("back");
  });

  it("resolves item drops as root reorder, group-local reorder, cross-group move, or detach", () => {
    expect(
      resolveStudioLayerItemDropIntent({
        payload: rootPayload,
        targetKey: "root-target",
        targetId: "target",
        targetGroupId: null,
        side: "front",
      })
    ).toMatchObject({ kind: "around", mode: "units", side: "front" });

    expect(
      resolveStudioLayerItemDropIntent({
        payload: { ...groupedPayload, sourceGroupId: "target" },
        targetKey: "same-group",
        targetId: "sibling",
        targetGroupId: "target",
        side: "back",
      })
    ).toMatchObject({ kind: "around", mode: "within-group", groupId: "target" });

    expect(
      resolveStudioLayerItemDropIntent({
        payload: groupedPayload,
        targetKey: "other-group",
        targetId: "other-child",
        targetGroupId: "target",
        side: "front",
      })
    ).toMatchObject({ kind: "around", mode: "into-group", groupId: "target" });

    expect(
      resolveStudioLayerItemDropIntent({
        payload: groupedPayload,
        targetKey: "root",
        targetId: "loose-target",
        targetGroupId: null,
        side: "back",
      })
    ).toMatchObject({ kind: "around", mode: "to-root" });
  });

  it("uses a group-row center as an explicit membership target and its edges as root order", () => {
    expect(
      resolveStudioLayerGroupDropIntent({
        payload: rootPayload,
        targetKey: "group:g",
        targetGroupId: "g",
        targetId: "g-front",
        relativeY: 0.5,
      })
    ).toEqual({ kind: "into-group", targetKey: "group:g", groupId: "g" });

    expect(
      resolveStudioLayerGroupDropIntent({
        payload: groupedPayload,
        targetKey: "group:g",
        targetGroupId: "g",
        targetId: "g-front",
        relativeY: 0.05,
      })
    ).toMatchObject({ kind: "around", mode: "to-root", side: "front" });

    expect(
      resolveStudioLayerGroupDropIntent({
        payload: rootPayload,
        targetKey: "group:empty",
        targetGroupId: "empty",
        targetId: null,
        relativeY: 0.5,
      })
    ).toEqual({ kind: "into-group", targetKey: "group:empty", groupId: "empty" });
  });

  it("rejects self targets and compares intents without allocations", () => {
    expect(
      resolveStudioLayerItemDropIntent({
        payload: rootPayload,
        targetKey: "self",
        targetId: "loose",
        targetGroupId: null,
        side: "front",
      })
    ).toBeNull();

    const first = {
      kind: "around" as const,
      mode: "units" as const,
      targetKey: "target",
      targetId: "target",
      side: "front" as const,
    };
    expect(studioLayerDropIntentEqual(first, { ...first })).toBe(true);
    expect(studioLayerDropIntentEqual(first, { ...first, side: "back" })).toBe(false);
  });
});
