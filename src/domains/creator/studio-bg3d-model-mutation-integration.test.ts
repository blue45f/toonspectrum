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

describe("Studio BG3D model placement and persistent deletion integration", () => {
  it("threads revocable leases through decode, cache ownership, and destructive persistence", () => {
    const admission = sourceBetween(
      "async function admitAndCacheModel(",
      "function disposeModelCache(",
    );
    const add = sourceBetween(
      "async function ensureModelRootCached(",
      "function publishPlacementSession(",
    );
    const remove = sourceBetween(
      "async function handleDeleteModelFromLibrary(",
      "const handlePanelTabChange",
    );

    expectInOrder(admission, [
      "studioBg3dGlobalAssetLoadGate.run(async (lease)",
      "lease.throwIfRevoked()",
      "const combinedSignal = combineStudioBg3dAbortSignals(",
      "signal: combinedSignal.signal",
      "if (!lease.isCurrent() || !args.isActive())",
      "loaded.dispose()",
      "args.cache.set(args.record.id, entry)",
      "combinedSignal.dispose()",
    ]);
    expect(add).toContain(
      "isActive: () => isModalAssetSessionCurrent(session) && isOperationCurrent()",
    );
    expectInOrder(remove, [
      "async (lease) =>",
      "lease.throwIfRevoked()",
      "deleteStoredBg3dModel(storageModelId, { signal: lease.signal })",
      "commitSceneEntityRemoval(plan, { resetHistory: true })",
      "authoritativePersistence: true",
    ]);
  });

  it("runs cheap live-scene admission on every cache hit while caching only profile attestation", () => {
    const cachedBranch = sourceBetween(
      "const cached = args.cache.get(args.record.id);",
      "const pending = args.pending.get(args.record.id);",
    );
    expectInOrder(cachedBranch, [
      "assertStudioBg3dModelPlacementAdmission({",
      "if (!cached.admittedProfiles.has(policy.profile))",
      "admitStoredBg3dModelForRendering(args.record.id",
      "cached.admittedProfiles.add(policy.profile)",
    ]);
    expect(cachedBranch.match(/assertStudioBg3dModelPlacementAdmission/gu)).toHaveLength(1);
  });

  it("calculates a queued add from the authoritative live ref rather than render closures", () => {
    const ensure = sourceBetween(
      "async function ensureModelRootCached(",
      "async function addCustomModelToScene(",
    );
    expectInOrder(ensure, [
      "const live = physicsRuntimeSourceRef.current",
      "calculateStudioBg3dPlacedModelBytes(",
      "live.customModels",
      "document: live.document",
    ]);
    expect(ensure).not.toContain("calculateStudioBg3dPlacedModelBytes(\n      customModels");
  });

  it("preflights detachment before IndexedDB delete and advances one snapshot before React state", () => {
    const handler = sourceBetween(
      "async function handleDeleteModelFromLibrary(",
      "const handlePanelTabChange",
    );
    const commit = sourceBetween(
      "const commitSceneEntityRemoval = (",
      "const removeSceneEntities = (",
    );
    expectInOrder(handler, [
      "preflightAndDeleteStudioBg3dPersistedModel({",
      "snapshot: physicsRuntimeSourceRef.current",
      "deletePersistedModel: (storageModelId) =>",
      "deleteStoredBg3dModel(storageModelId, { signal: lease.signal })",
      "commitSceneEntityRemoval(plan, { resetHistory: true })",
      "attachmentByStorageModelIdRef.current.delete(id)",
      "modelRootCacheRef.current.delete(id)",
      "authoritativePersistence: true",
    ]);
    expect(handler).not.toContain("removeSceneEntities(removedInstanceIds)");
    expectInOrder(commit, [
      "physicsRuntimeSourceRef.current = {",
      "setPrimitives(next.primitives)",
      "setCustomModels(next.customModels)",
      "setSceneBaseDocument(next.document)",
    ]);
    expect(commit).toContain("historyRef.current = [createStudioBg3dHistorySnapshot(next)]");
  });

  it("waits for a prior destructive lane and replays its durable journal before hydration", () => {
    const restoration = sourceBetween(
      "await studioBg3dModalOperationCoordinator.waitForSceneMutationLane()",
      "}, [open, initialDataUrl, initialScene, modelRenderer]);",
    );
    expectInOrder(restoration, [
      "await studioBg3dModalOperationCoordinator.waitForSceneMutationLane()",
      "resolveBg3dModelHash(attachment.hash",
      "const record = resolution.record",
      "if (resolution.deletionReceipt)",
      "planStudioBg3dDeletedAttachmentReconciliation({",
      "hydrateStudioBg3dDocumentToRuntime({",
      "document: restoredDocument",
    ]);
  });

  it("hands undo and redo camera compositions to a replacement projection controller", () => {
    const undoRedo = sourceBetween("const doUndo = () => {", "const addPrimitive = (");
    expect(undoRedo.match(/applyOrDeferStudioBg3dHistoryCamera\(/gu)).toHaveLength(2);
    expect(undoRedo.match(/pendingInitialCameraRef/gu)).toHaveLength(2);
    expect(undoRedo.match(/snap\.document\.camera/gu)).toHaveLength(2);
    expect(undoRedo.match(/physicsRuntimeSourceRef\.current =/gu)).toHaveLength(2);
  });
});
