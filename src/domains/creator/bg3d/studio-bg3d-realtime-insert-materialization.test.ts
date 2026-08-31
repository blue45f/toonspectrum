import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { createStudioShared3dSceneSessionFromElements } from "../studio-shared-3d-scene-bridge";
import {
  resolveStudioShared3dStageCollectionForBundle,
  studioShared3dStageEntryAsDocument,
} from "../studio-shared-3d-stage-collection";
import { createStudioVrmSceneDocument } from "../vrm/studio-vrm-scene-document";

import { planStudioBg3dRealtimeMergedApply } from "./studio-bg3d-lt-apply";
import { DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT } from "./studio-bg3d-scene-document";

import type { StudioBackground3DInsertResult } from "../scene-3d/studio-3d-insert-contract";
import type { El } from "../studio-element-model";

const studioPageSource = readFileSync(new URL("../StudioPage.tsx", import.meta.url), "utf8");

function applyBg3dRenderedImageBody(): string {
  const start = studioPageSource.indexOf("async function applyBg3dRenderedImage(");
  const end = studioPageSource.indexOf("async function addBuiltinRasterAsset", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return studioPageSource.slice(start, end);
}

function characterElement(): Extract<El, { type: "image" }> {
  return {
    id: "character-1",
    type: "image",
    src: "data:image/png;base64,character",
    x: 100,
    y: 120,
    width: 320,
    height: 640,
    rotation: 0,
    name: "주인공",
    vrmScene: createStudioVrmSceneDocument(),
  };
}

type SharedCharacterSource = ReturnType<
  typeof createStudioShared3dSceneSessionFromElements
>["characters"][number];

function insertResult(input: {
  readonly mutation: "connect" | "refresh" | "background-only" | "unlink";
  readonly source?: SharedCharacterSource;
  readonly png?: string;
}): StudioBackground3DInsertResult {
  return {
    kind: "separated",
    width: 960,
    height: 540,
    layers: [{
      role: "color",
      pngDataUrl: input.png ?? "data:image/png;base64,layer",
      width: 960,
      height: 540,
    }],
    compositePngDataUrl: input.png ?? "data:image/png;base64,composite",
    perspectiveGuides: [],
    bg3dScene: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    sharedStageMutation: { kind: input.mutation },
    ...(input.source && input.mutation !== "background-only" && input.mutation !== "unlink"
      ? {
          linkedCharacterCapture: {
            kind: "full-fidelity-linked-vrm-capture" as const,
            elementIds: [input.source.elementId],
            stagePlacements: [{
              elementId: input.source.elementId,
              expectedRuntimeKey: input.source.runtimeKey,
              transform: input.source.stageTransform,
            }],
          },
        }
      : {}),
  };
}

function planConnectedInsert() {
  const character = characterElement();
  const source = createStudioShared3dSceneSessionFromElements([character]).characters[0]!;
  const plan = planStudioBg3dRealtimeMergedApply({
    result: insertResult({ mutation: "connect", source }),
    elements: [character],
    groups: [],
    shared3dStage: undefined,
    targetElementId: undefined,
    canvasHeight: 1080,
    newElementId: "background-1",
    allocatedBundleId: "bundle-1",
    dccSource: null,
  });
  expect(plan.ok).toBe(true);
  if (!plan.ok) throw new Error(plan.message);
  return { source, plan };
}

/**
 * `/studio` opens an instant realtime room even before a work is saved. The raster remains a
 * single self-contained image there, but its background anchor and Shared Stage relationship must
 * survive apply/reopen just like the separated-LT path.
 */
describe("Studio BG3D realtime-room insert materialization", () => {
  it("atomically inserts a merged background and a resolvable persisted character connection", () => {
    const { plan } = planConnectedInsert();
    const background = plan.nextElements.find(({ id }) => id === plan.anchorElementId);
    const character = plan.nextElements.find(({ id }) => id === "character-1");

    expect(background).toMatchObject({
      id: "background-1",
      type: "image",
      src: "data:image/png;base64,composite",
      bg3dLtBundleId: "bundle-1",
      bg3dScene: DEFAULT_STUDIO_BG3D_SCENE_DOCUMENT,
    });
    expect(character).toMatchObject({ id: "character-1", hidden: true });
    expect(plan.hiddenElementIds).toEqual(["character-1"]);
    expect(resolveStudioShared3dStageCollectionForBundle(
      plan.nextShared3dStage,
      plan.nextElements,
      plan.bundleId,
    )).toMatchObject({
      phase: "ready",
      backgroundElementId: "background-1",
      linkedCharacterElementIds: ["character-1"],
    });
  });

  it("keeps the same bundle identity while updating the selected merged background", () => {
    const first = planConnectedInsert();
    const updated = planStudioBg3dRealtimeMergedApply({
      result: insertResult({
        mutation: "refresh",
        source: first.source,
        png: "data:image/png;base64,updated",
      }),
      elements: first.plan.nextElements,
      groups: [],
      shared3dStage: first.plan.nextShared3dStage,
      targetElementId: first.plan.anchorElementId,
      canvasHeight: 1080,
      newElementId: "must-not-be-used",
      allocatedBundleId: "must-not-replace-bundle",
      dccSource: null,
    });

    expect(updated.ok).toBe(true);
    if (!updated.ok) throw new Error(updated.message);
    expect(updated.anchorElementId).toBe("background-1");
    expect(updated.bundleId).toBe("bundle-1");
    expect(updated.nextElements.filter(({ id }) => id === "background-1")).toHaveLength(1);
    expect(updated.nextElements.find(({ id }) => id === "background-1")).toMatchObject({
      src: "data:image/png;base64,updated",
      bg3dLtBundleId: "bundle-1",
    });
    expect(resolveStudioShared3dStageCollectionForBundle(
      updated.nextShared3dStage,
      updated.nextElements,
      updated.bundleId,
    ).phase).toBe("ready");
  });

  it("persists an explicit background-only Stage without hiding character sources", () => {
    const character = characterElement();
    const plan = planStudioBg3dRealtimeMergedApply({
      result: insertResult({ mutation: "background-only" }),
      elements: [character],
      groups: [],
      shared3dStage: undefined,
      targetElementId: undefined,
      canvasHeight: 1080,
      newElementId: "background-only",
      allocatedBundleId: "bundle-background-only",
      dccSource: null,
    });

    expect(plan.ok).toBe(true);
    if (!plan.ok) throw new Error(plan.message);
    expect(plan.hiddenElementIds).toEqual([]);
    expect(plan.nextElements.find(({ id }) => id === character.id)?.hidden).not.toBe(true);
    expect(studioShared3dStageEntryAsDocument(
      plan.nextShared3dStage,
      plan.bundleId,
    )).toMatchObject({ capturePolicy: "background-only", characters: [] });
  });

  it("unlink restores the Stage-owned hidden character and removes the last sidecar", () => {
    const first = planConnectedInsert();
    const unlinked = planStudioBg3dRealtimeMergedApply({
      result: insertResult({ mutation: "unlink" }),
      elements: first.plan.nextElements,
      groups: [],
      shared3dStage: first.plan.nextShared3dStage,
      targetElementId: first.plan.anchorElementId,
      canvasHeight: 1080,
      newElementId: "must-not-be-used",
      allocatedBundleId: "must-not-replace-bundle",
      dccSource: null,
    });

    expect(unlinked.ok).toBe(true);
    if (!unlinked.ok) throw new Error(unlinked.message);
    expect(unlinked.nextShared3dStage).toBeUndefined();
    expect(unlinked.restoredElementIds).toEqual(["character-1"]);
    expect(unlinked.nextElements.find(({ id }) => id === "character-1")?.hidden).not.toBe(true);
    expect(unlinked.nextElements.find(({ id }) => id === "background-1")).toMatchObject({
      bg3dLtBundleId: "bundle-1",
    });
  });

  it("wires the realtime branch through one element+Shared Stage commit before separated LT", () => {
    const body = applyBg3dRenderedImageBody();
    const realtimeBranch = body.indexOf("if (isRealtimeTeamSession) {");
    const masterBranch = body.indexOf("if (masterEditMode) {");
    const realtime = body.slice(realtimeBranch, masterBranch);

    expect(realtimeBranch).toBeGreaterThanOrEqual(0);
    expect(masterBranch).toBeGreaterThan(realtimeBranch);
    expect(realtime).toContain("planStudioBg3dRealtimeMergedApply({");
    expect(realtime).toContain("commit([...realtimePlan.nextElements], {");
    expect(realtime).toContain("shared3dStage: realtimePlan.nextShared3dStage,");
    expect(realtime).toContain("expectStudioRasterImagePresentation({");
    expect(body.indexOf("if (isRealtimeTeamSession) {")).toBeLessThan(
      body.indexOf("const plan = planStudioBg3dLtLayers"),
    );
  });

  it("reports the merged insert and saved Stage as a neutral notice, not an error", () => {
    const body = applyBg3dRenderedImageBody();
    const realtime = body.slice(
      body.indexOf("if (isRealtimeTeamSession) {"),
      body.indexOf("if (masterEditMode) {"),
    );

    expect(realtime).toContain("setStatusNotice(");
    expect(realtime).toContain("한 레이어로 합쳐 추가했어요");
    expect(realtime).toContain("공유 연결도 함께 저장했어요");
    expect(realtime).not.toContain("setError(\n        `실시간 공동 편집이라");
  });

  it("clears a stale notice when a new 3D background insert starts", () => {
    const body = applyBg3dRenderedImageBody();
    const head = body.slice(0, body.indexOf("const anchorLayer"));

    expect(head).toContain("setError(null);");
    expect(head).toContain("setStatusNotice(null);");
  });
});
