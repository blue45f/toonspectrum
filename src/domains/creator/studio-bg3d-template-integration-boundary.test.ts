import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const editorSource = readFileSync(
  new URL("./StudioBackground3D.tsx", import.meta.url),
  "utf8",
);

function sourceBetween(startMarker: string, endMarker: string): string {
  const start = editorSource.indexOf(startMarker);
  const end = editorSource.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return editorSource.slice(start, end);
}

describe("Studio BG3D user-template integration boundary", () => {
  it("saves only a lossless canonical runtime adapter document", () => {
    const save = sourceBetween(
      "const handleSaveSceneAsTemplate = async () =>",
      "const handleDeleteTemplate = async",
    );

    expect(save).toContain("adaptStudioBg3dRuntimeToDocument({");
    expect(save).toContain("adapted.diagnostics.length > 0");
    expect(save).toContain("adapted.omittedDiagnosticCount > 0");
    expect(save).toContain("adapted.counts.droppedPrimitives > 0");
    expect(save).toContain("adapted.counts.droppedCustomModels > 0");
    expect(save).toContain("document: adapted.document");
    expect(save).not.toContain("commercialUse: true");
    expect(save).not.toContain("modelId:");
  });

  it("resolves every attachment by hash and commits hydrated placements only after all checks", () => {
    const apply = sourceBetween(
      "async function applyUserTemplate(",
      "async function handleUploadModelFiles(",
    );
    const mutationStart = apply.indexOf("runSceneMutation(");
    const instantiate = apply.indexOf("instantiateBg3dTemplateDocument(");
    const hashLookup = apply.indexOf("getStoredBg3dModelByHash(attachment.hash)");
    const exactMatch = apply.indexOf("attachmentMatchesRecord(attachment, record)");
    const admission = apply.indexOf("await admitAndCacheModel({");
    const stagedBinding = apply.indexOf("attachmentByStorageModelId: nextAttachmentByStorageId");
    const hydration = apply.indexOf("hydrateStudioBg3dDocumentToRuntime({");
    const sceneCommit = apply.indexOf("setPrimitives(nextPrimitives)");

    expect(mutationStart).toBeGreaterThanOrEqual(0);
    expect(instantiate).toBeGreaterThan(mutationStart);
    expect(hashLookup).toBeGreaterThan(instantiate);
    expect(exactMatch).toBeGreaterThan(hashLookup);
    expect(admission).toBeGreaterThan(exactMatch);
    expect(stagedBinding).toBeGreaterThan(admission);
    expect(hydration).toBeGreaterThan(stagedBinding);
    expect(sceneCommit).toBeGreaterThan(hydration);
    expect(apply).toContain("throw new Error(\"template-attachment-missing\")");
    expect(apply).toContain("hydrated.diagnostics.length > 0");
    expect(apply).toContain("if (!committed)");
    expect(apply).toContain("ownedEntry.dispose()");
  });

  it("cleans only cache entries created by this queued template and never live scene entries", () => {
    const cacheAdmission = sourceBetween(
      "async function admitAndCacheModel(",
      "function disposeModelCache(",
    );
    const apply = sourceBetween(
      "async function applyUserTemplate(",
      "async function handleUploadModelFiles(",
    );

    expect(cacheAdmission).toContain("readonly onCacheEntryCreated?:");
    expect(cacheAdmission.indexOf("args.cache.set(args.record.id, entry)")).toBeLessThan(
      cacheAdmission.indexOf("args.onCacheEntryCreated?.(args.record.id, entry)"),
    );
    expect(apply).not.toContain("cacheIdsBefore");
    expect(apply).toContain("const templateOwnedCacheEntries = new Map<string, ModelRootCacheEntry>()");
    expect(apply).toContain("onCacheEntryCreated: (storageId, cacheEntry) =>");
    expect(apply).toContain("physicsRuntimeSourceRef.current.customModels.map((model) => model.modelId)");
    expect(apply).toContain("if (liveStorageIds.has(storageId)) continue;");
    expect(apply).toContain("if (modelRootCacheRef.current.get(storageId) !== ownedEntry) continue;");
    expect(apply).toContain("if (!committed) cleanupUncommittedTemplateCache();");
  });

  it("does not let a slow upload cleanup dispose cache committed by an earlier scene mutation", () => {
    const upload = sourceBetween(
      "async function handleUploadModelFiles(",
      "async function handleDeleteModelFromLibrary(",
    );

    expect(upload).not.toContain("cacheIdsBefore");
    expect(upload).not.toContain("for (const [id, entry] of modelRootCacheRef.current)");
    expect(upload).toContain("const uploadOwnedCacheEntries = new Map<string, ModelRootCacheEntry>()");
    expect(upload).toContain("onCacheEntryCreated: (storageId, cacheEntry) =>");
    expect(upload).toContain("physicsRuntimeSourceRef.current.customModels.map((model) => model.modelId)");
    expect(upload).toContain("if (liveStorageIds.has(storageId)) continue;");
    expect(upload).toContain("if (modelRootCacheRef.current.get(storageId) !== ownedEntry) continue;");
    expect(upload).toContain("if (!uploadCommitted) cleanupUncommittedUploadCache();");
  });

  it("fences every user-dismiss path while persistent model deletion is active", () => {
    const deletion = sourceBetween(
      "async function handleDeleteModelFromLibrary(",
      "const handlePanelTabChange",
    );
    const dismiss = sourceBetween(
      "function requestUserClose()",
      "async function handleSaveToLibrary()",
    );

    expect(deletion.indexOf("destructiveMutationGuardRef.current.begin()")).toBeLessThan(
      deletion.indexOf("preflightAndDeleteStudioBg3dPersistedModel({"),
    );
    expect(deletion.indexOf("deleteStoredBg3dModel(storageModelId, { signal: lease.signal })")).toBeLessThan(
      deletion.indexOf("destructiveMutationGuardRef.current.finish(destructiveLease)"),
    );
    expect(dismiss).toContain("if (destructiveMutationGuardRef.current.blocksClose) return;");
    expect(editorSource).toContain("aria-disabled={deletingModelId !== null || undefined}");
  });
});
