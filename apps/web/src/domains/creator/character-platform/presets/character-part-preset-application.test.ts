import { describe, expect, it } from "vitest";

import { createCharacterDocumentV2 } from "../document/character-document-v2";
import { applyCharacterPartPreset, createCharacterPartPreset } from "./character-part-preset";

describe("complete preset document projection", () => {
  it.each([
    ["expression", "expression"],
    ["full-pose", "pose"],
    ["camera-shot", "camera.activeShotId"],
  ] as const)("records an isolated %s payload as an actual document edit", (kind, path) => {
    const target = createCharacterDocumentV2({ documentId: "target", model: { assetId: "model", assetVersion: "1", contentSha256: null, mode: "compatible" }, compatibility: { grade: "A", supported: [], partial: [], unsupported: [], sourceRevision: "test" }, recipe: { version: 2, slots: {}, accessories: [], handPose: {} }, colors: { skin: null, hairBase: null, hairTip: null, iris: null, top: null, bottom: null, shoes: null } });
    const source = { ...target, expression: { activeEntryId: "custom", weights: { happy: 0.5 } }, pose: { ...target.pose, activeEntryId: "pose:a" }, camera: { ...target.camera, activeShotId: "shot:a" } };
    const preset = createCharacterPartPreset({ presetId: kind, name: kind, kind, scope: "personal", document: source, includeControls: false, includeColors: false });
    const result = applyCharacterPartPreset(target, preset);
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual([path]);
    expect(result.document.revision).toBe(target.revision + 1);
    if (kind === "expression") expect(result.document.expression).toEqual(source.expression);
    else if (kind === "full-pose") expect(result.document.pose).toEqual(source.pose);
    else expect(result.document.camera.activeShotId).toBe(source.camera.activeShotId);
    expect(target.expression.weights).toEqual({});
    expect(target.pose.activeEntryId).toBeNull();
    expect(target.camera.activeShotId).toBeNull();
  });
});
