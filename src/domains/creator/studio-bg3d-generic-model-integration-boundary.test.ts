import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./StudioBackground3D.tsx", import.meta.url), "utf8");

function sourceBetween(startNeedle: string, endNeedle: string): string {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function expectInOrder(haystack: string, needles: readonly string[]): void {
  let cursor = -1;
  for (const needle of needles) {
    const index = haystack.indexOf(needle, cursor + 1);
    expect(index, `Expected ${JSON.stringify(needle)} after ${cursor}`).toBeGreaterThan(cursor);
    cursor = index;
  }
}

describe("Studio BG3D generic model mode integration boundary", () => {
  it("owns an explicit generic 3D tab without coupling it to a VRM runtime", () => {
    expect(source).toContain('{ id: "models", label: "범용 3D"');
    expect(source).toContain('aria-label={tab.id === "models" ? "모델" : tab.label}');
    expect(source).toContain("<StudioGeneric3dModelModePanel");
    expect(source).toContain("VRM 별도");
    expect(source).toContain("VRM 아바타의 humanoid·표정·이용 조건과 섞지 않고");
    expect(source).not.toContain('from "./StudioVrmPoser"');
    expect(source).not.toContain('from "./studio-vrm');
  });

  it("records the original GLB, glTF, or OBJ/MTL boundary only after canonical admission", () => {
    const upload = sourceBetween(
      "async function handleUploadModelFiles(",
      "async function handleDeleteModelFromLibrary(",
    );

    expectInOrder(upload, [
      "modelImportRuntime.planStudioBg3dModelImports(files)",
      'item.format === "gltf"',
      'item.format === "obj"',
      'hasSelectedMtl ? "obj-mtl" : "obj"',
      "modelImportRuntime.convertStudioBg3dModelFilesToGlb(files",
      "await importVerifiedBg3dModelsAtomically(",
      "await admitAndCacheModel({",
      "setGenericModelSourceFormats((previous) =>",
      "uploadCommitted = true",
    ]);
  });

  it("profiles renderer structure once while keeping unsupported child transforms read-only", () => {
    const inspect = sourceBetween(
      "function inspectStudioGeneric3dRuntimeHints(",
      "interface ModelThumbnailGpuLease",
    );
    const admission = sourceBetween(
      "async function admitAndCacheModel(",
      "function disposeModelCache(",
    );

    expect(inspect).toContain("partTransformsSupported: false");
    expect(inspect).toContain("renderable.isSkinnedMesh === true");
    expect(inspect).toContain("mapped.normalMap?.isTexture");
    expect(inspect).toContain("new Set(joints.map((joint) => joint.canonicalKey)).size");
    expectInOrder(admission, [
      "loadVerifiedStudioBg3dGlbWithThree",
      "assertStudioBg3dModelPlacementAdmission({",
      "const joints = collectStudioBg3dThreeJoints(loaded.root)",
      "genericHints: inspectStudioGeneric3dRuntimeHints(loaded.root, joints)",
      "args.cache.set(args.record.id, entry)",
    ]);
  });

  it("builds the selected manifest from the verified record and current admitted profile", () => {
    const selection = sourceBetween(
      "const selectedModelCacheEntry = selectedCustomModel",
      "const selectedJointByKey = new Map",
    );

    expect(selection).toContain("createStudioGeneric3dVerifiedManifest({");
    expect(selection).toContain("sourceFormat: genericModelSourceFormats.get(selectedCustomModel.modelId) ?? \"glb\"");
    expect(selection).toContain("profile: deviceQuality.profile");
    expect(selection).toContain("contentHash: selectedModelCacheEntry.record.contentHash");
    expect(selection).toContain("metrics: selectedModelCacheEntry.record.validatorMetrics");
    expect(selection).toContain("createStudioGeneric3dRightsFromAttachment(selectedModelCacheEntry.record.rights)");
    expect(selection).toContain("...selectedModelCacheEntry.genericHints");
    expect(selection).toContain("createStudioGeneric3dPoseProxies({");
    expect(selection).toContain("isBone: true");
  });

  it("connects a bone proxy selection to the existing model-owned pose selection", () => {
    const selectProxy = sourceBetween(
      "function selectGenericModelProxy(",
      "const selectedJointByKey = new Map",
    );
    expectInOrder(selectProxy, [
      "setGenericModelSelectedProxyId(proxyId)",
      "selectedGenericModelProxies.find",
      'proxy?.operation === "bone-rotate"',
      "setPoseJointSelection({ modelId: selectedCustomModel.id, key: proxy.targetKey })",
    ]);
  });

  it("removes session-only source and classification metadata with persistent deletion", () => {
    const remove = sourceBetween(
      "async function handleDeleteModelFromLibrary(",
      "const handlePanelTabChange",
    );
    expectInOrder(remove, [
      "preflightAndDeleteStudioBg3dPersistedModel({",
      "commitSceneEntityRemoval(plan, { resetHistory: true })",
      "setGenericModelSourceFormats((previous) =>",
      "next.delete(id)",
      "setGenericModelClassifications((previous) =>",
      "next.delete(id)",
    ]);
  });
});
