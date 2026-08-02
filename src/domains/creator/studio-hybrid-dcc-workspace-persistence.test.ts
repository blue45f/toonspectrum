import { describe, expect, it } from "vitest";

import {
  canonicalStudioCommandJson,
  serializeStudioCommandJournal,
} from "./studio-command-journal";
import { studioEditableMeshStats } from "./studio-editable-half-edge-mesh";
import {
  createStudioHybridDccWorkspace,
  workspaceAddArtistInk,
  workspaceAddUnitCube,
  workspaceClothStep,
  workspaceCollabJoin,
  workspaceCommitActiveObjectTransform,
  workspaceDeleteActive,
  workspaceDuplicateActive,
  workspaceEnsureShots,
  workspaceExportActiveMesh,
  workspaceExtrudeActive,
  workspaceRedo,
  workspaceRetargetFromBvhExtras,
  workspaceSampleIdleClip,
  workspaceSelectAsset,
  workspaceSetAssetVisibility,
  workspaceStepSpring,
  workspaceUndo,
  workspaceUvUnwrapActive,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";
import {
  createStudioHybridDccWorkspacePersistence,
  createStudioHybridDccWorkspacePersistenceFromFileSystem,
  decodeStudioHybridDccWorkspacePersistenceEnvelope,
  encodeStudioHybridDccWorkspacePersistenceEnvelope,
  resolveStudioHybridDccWorkspacePersistenceScope,
  StudioHybridDccWorkspacePersistenceError,
  type StudioHybridDccWorkspacePersistenceScope,
} from "./studio-hybrid-dcc-workspace-persistence";
import { createStudioOpfsMemoryFileSystem } from "./studio-opfs-filesystem";

import type { StudioOpfsRecoveryJournalAdapter } from "./studio-opfs-recovery-journal";

class FakeWorkspaceOpfsAdapter implements StudioOpfsRecoveryJournalAdapter {
  readonly kind = "fake-opfs" as const;
  readonly files = new Map<string, Uint8Array>();
  quota: number | null = null;
  failNextHeadWrite = false;

  async read(path: string): Promise<Uint8Array | null> {
    const value = this.files.get(path);
    return value ? new Uint8Array(value) : null;
  }

  async writeAtomic(path: string, bytes: Uint8Array): Promise<void> {
    if (this.failNextHeadWrite && /\/head-[ab]\.bin$/u.test(path)) {
      this.failNextHeadWrite = false;
      throw new Error("simulated crash before head commit");
    }
    this.files.set(path, new Uint8Array(bytes));
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  async list(prefix: string): Promise<readonly string[]> {
    return [...this.files.keys()]
      .filter((path) => path.startsWith(prefix))
      .sort((left, right) => left.localeCompare(right));
  }

  async size(path: string): Promise<number | null> {
    return this.files.get(path)?.byteLength ?? null;
  }

  async estimateQuota(): Promise<{ readonly usage: number; readonly quota: number } | null> {
    if (this.quota === null) return null;
    const usage = [...this.files.values()]
      .reduce((total, bytes) => total + bytes.byteLength, 0);
    return { usage, quota: this.quota };
  }

  async withExclusiveLock<T>(
    _name: string,
    signal: AbortSignal | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    if (signal?.aborted) {
      const error = new Error("aborted");
      error.name = "AbortError";
      throw error;
    }
    return operation();
  }

  corruptLatestPayloadChunk(): void {
    const path = [...this.files.keys()]
      .filter((candidate) => /\/cp-\d+-e\d+-c\d+\.bin$/u.test(candidate))
      .sort((left, right) => left.localeCompare(right))
      .at(-1);
    if (!path) throw new Error("checkpoint payload chunk not found");
    const bytes = new Uint8Array(this.files.get(path)!);
    bytes[Math.floor(bytes.byteLength / 2)]! ^= 0xff;
    this.files.set(path, bytes);
  }
}

class FifoWorkspaceOpfsAdapter extends FakeWorkspaceOpfsAdapter {
  #lockTail: Promise<void> = Promise.resolve();

  override withExclusiveLock<T>(
    _name: string,
    signal: AbortSignal | undefined,
    operation: () => Promise<T>,
  ): Promise<T> {
    const result = this.#lockTail.then(async () => {
      if (signal?.aborted) {
        const error = new Error("aborted");
        error.name = "AbortError";
        throw error;
      }
      return operation();
    });
    this.#lockTail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

const SCOPE: StudioHybridDccWorkspacePersistenceScope = {
  userId: "사용자-42",
  workId: "작품-3D-세트",
};

function deterministicClock(start = 10_000) {
  let value = start;
  return () => {
    value += 1;
    return value;
  };
}

function buildFullWorkspace(): StudioHybridDccWorkspace {
  let workspace = createStudioHybridDccWorkspace("persist-roundtrip");
  workspace = workspaceAddUnitCube(workspace, "hero-prop");
  workspace = workspaceExtrudeActive(workspace, 0.25);
  workspace = workspaceCommitActiveObjectTransform(workspace, {
    revision: 1,
    position: [3.25, -0.5, 7],
    rotationEulerRad: [0.1, 0.2, -0.3],
    scale: [1.25, 0.8, 2],
  });
  workspace = workspaceEnsureShots(workspace, 3);
  workspace = workspaceAddArtistInk(workspace, "shot-2");
  workspace = workspaceUvUnwrapActive(workspace, "box");
  workspace = workspaceRetargetFromBvhExtras(workspace, [
    "hips",
    "spine",
    "head",
    "leftUpperArm",
    "rightUpperArm",
  ]);
  workspace = workspaceExportActiveMesh(workspace, "obj");
  workspace = workspaceStepSpring(workspace);
  workspace = workspaceClothStep(workspace);
  workspace = workspaceSampleIdleClip(workspace, 0.375);
  workspace = workspaceCollabJoin(workspace, "peer-a", "민지");
  workspace = {
    ...workspace,
    lastImportReport: {
      revision: 1,
      parser: "test-import",
      sourceHash: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      warnings: ["material extension retained as evidence"],
    },
  };
  const mesh = workspace.session.state.geometry.records["hero-prop"]!.mesh;
  const stats = studioEditableMeshStats(mesh);
  workspace = {
    ...workspace,
    lastOcct: {
      ok: true,
      bodyKind: "solid",
      mesh,
      faceCount: stats.faceCount,
      triangleCount: stats.faceCount * 2,
      vertexCount: stats.vertexCount,
      volumeApprox: 1,
      topology: {
        source: "tessellated-triangle-mesh",
        boundaryEdgeCount: 0,
        nonManifoldEdgeCount: 0,
        orientationConflictEdgeCount: 0,
        degenerateTriangleCount: 0,
        consistentOrientation: true,
        watertight: true,
        closedSolid: true,
        signedVolume: 1,
      },
      massProperties: {
        source: "occt-brep",
        density: 1,
        densityUnit: "mass/model-unit^3",
        mass: 1,
        volume: 1,
        volumeSource: "occt-brep",
        surfaceArea: 6,
        surfaceAreaSource: "occt-brep",
        centroid: { x: 0.5, y: 0.5, z: 0.5 },
        centroidSource: "occt-brep",
        inertia: { xx: 1, yy: 1, zz: 1, xy: 0, xz: 0, yz: 0 },
        inertiaSource: "occt-brep",
        approximate: false,
      },
      backend: "opencascade-wasm",
      operation: "BRepPrimAPI_MakeBox",
      loadPath: "browser",
    },
    lastDynatopo: {
      facesBefore: 6,
      facesAfter: 24,
      boundaryEdges: 0,
      mode: "refine",
    },
    lastRetopo: {
      facesBefore: 24,
      facesAfter: 8,
      targetFaces: 8,
      meanError: 0.0125,
    },
  };
  // Preserve a non-empty redo stack as part of cold-start authoring fidelity.
  return workspaceUndo(workspace);
}

function createStore(adapter: FakeWorkspaceOpfsAdapter, scope = SCOPE) {
  return createStudioHybridDccWorkspacePersistence({
    adapter,
    scope,
    now: deterministicClock(),
    randomToken: (() => {
      let sequence = 0;
      return () => `workspace-token-${++sequence}`;
    })(),
  });
}

function expectPersistenceError(
  code: InstanceType<typeof StudioHybridDccWorkspacePersistenceError>["code"],
) {
  return expect.objectContaining({
    name: "StudioHybridDccWorkspacePersistenceError",
    code,
  });
}

describe("Hybrid DCC workspace OPFS persistence", () => {
  it("round-trips document, command history, bridge, typed UVs, CAD evidence and aux state", async () => {
    const adapter = new FakeWorkspaceOpfsAdapter();
    const before = buildFullWorkspace();
    const beforeJournal = serializeStudioCommandJournal(before.session.journal);
    const expectedAfterRedoHash = before.session.redoStack.at(-1)?.stateHash;
    const store = createStore(adapter);

    const receipt = await store.save(before);
    const restored = await store.load();

    expect(receipt.scopeKey).toBe(resolveStudioHybridDccWorkspacePersistenceScope(SCOPE).scopeKey);
    expect(receipt.documentStateHash).toBe(before.session.state.stateHash);
    expect(restored.status).toBe("restored");
    if (restored.status !== "restored") return;
    expect(restored.workspace.session.state.stateHash).toBe(before.session.state.stateHash);
    expect(restored.workspace.session.state.geometry.records["hero-prop"]!.revision).toBe(
      before.session.state.geometry.records["hero-prop"]!.revision,
    );
    expect(serializeStudioCommandJournal(restored.workspace.session.journal)).toBe(beforeJournal);
    expect(restored.workspace.session.undoStack).toEqual(before.session.undoStack);
    expect(restored.workspace.session.redoStack).toEqual(before.session.redoStack);
    expect(restored.workspace.session.undoGroupStack).toEqual(before.session.undoGroupStack);
    expect(restored.workspace.session.redoGroupStack).toEqual(before.session.redoGroupStack);
    expect(restored.workspace.bridge).toEqual(before.bridge);
    expect(restored.workspace.lastImportReport).toEqual(before.lastImportReport);
    expect(restored.workspace.lastUvMap?.uvs).toBeInstanceOf(Float32Array);
    expect(Array.from(restored.workspace.lastUvMap?.uvs ?? [])).toEqual(
      Array.from(before.lastUvMap?.uvs ?? []),
    );
    expect(restored.workspace.lastOcct).toEqual(before.lastOcct);
    expect(restored.workspace.lastRetarget).toEqual(before.lastRetarget);
    expect(restored.workspace.lastExport).toEqual(before.lastExport);
    expect(restored.workspace.lastSpring).toEqual(before.lastSpring);
    expect(restored.workspace.lastDynatopo).toEqual(before.lastDynatopo);
    expect(restored.workspace.lastRetopo).toEqual(before.lastRetopo);
    expect(restored.workspace.bom).toEqual(before.bom);
    expect(restored.workspace.collab).toEqual(before.collab);
    expect(restored.workspace.clothStep).toBe(before.clothStep);
    expect(restored.workspace.animSampleTime).toBe(before.animSampleTime);
    expect(workspaceRedo(restored.workspace).session.state.stateHash).toBe(
      expectedAfterRedoHash,
    );
  });

  it("isolates arbitrary Unicode user/work scopes into stable path-safe OPFS document IDs", async () => {
    const adapter = new FakeWorkspaceOpfsAdapter();
    const firstScope = { userId: " 김 민지 ", workId: "작품 A/1" };
    const secondScope = { userId: "김 민지", workId: "작품 B/1" };
    const firstIdentity = resolveStudioHybridDccWorkspacePersistenceScope(firstScope);
    const repeatedIdentity = resolveStudioHybridDccWorkspacePersistenceScope({
      userId: "김 민지",
      workId: "작품 A/1",
    });
    const secondIdentity = resolveStudioHybridDccWorkspacePersistenceScope(secondScope);

    expect(firstIdentity).toEqual(repeatedIdentity);
    expect(firstIdentity.scopeKey).not.toBe(secondIdentity.scopeKey);
    expect(firstIdentity.storageDocumentId).toMatch(/^dccw-[0-9a-f]{48}$/u);

    await createStore(adapter, firstScope).save(buildFullWorkspace());
    expect((await createStore(adapter, secondScope).load()).status).toBe("empty");
    expect((await createStore(adapter, firstScope).load()).status).toBe("restored");
  });

  it("preserves visibility plus duplicate/delete authority and its undo snapshot", async () => {
    const adapter = new FakeWorkspaceOpfsAdapter();
    let before = createStudioHybridDccWorkspace("persist-scene-ops");
    before = workspaceAddUnitCube(before, "source");
    before = workspaceDuplicateActive(before, "source-copy");
    before = workspaceSetAssetVisibility(before, "source", false);
    before = workspaceDeleteActive(before);
    const deletedStateHash = before.session.state.stateHash;
    const restoreCopyStateHash = before.session.undoStack.at(-1)?.stateHash;
    const sourceBridgeObject = before.bridge.set.objects.find((object) => object.id === "source");
    expect(sourceBridgeObject?.visible).toBe(false);
    expect(before.session.state.geometry.records["source-copy"]).toBeUndefined();

    const store = createStore(adapter);
    await store.save(before);
    const loaded = await store.load();

    expect(loaded.status).toBe("restored");
    if (loaded.status !== "restored") return;
    expect(loaded.workspace.session.state.stateHash).toBe(deletedStateHash);
    expect(loaded.workspace.activeAssetId).toBeNull();
    expect(loaded.workspace.bridge.set.objects.find((object) => object.id === "source")?.visible)
      .toBe(false);
    expect(loaded.workspace.session.state.geometry.records["source-copy"]).toBeUndefined();
    expect(loaded.workspace.session.undoStack.at(-1)?.stateHash).toBe(restoreCopyStateHash);

    const undone = workspaceUndo(loaded.workspace);
    expect(undone.session.state.stateHash).toBe(restoreCopyStateHash);
    expect(undone.session.state.geometry.records["source-copy"]).toBeDefined();
    // Selection remains explicit and can be restored after the delete undo.
    expect(workspaceSelectAsset(undone, "source-copy").activeAssetId).toBe("source-copy");
  });

  it("keeps the previous committed workspace when a crash occurs before the next head commit", async () => {
    const adapter = new FakeWorkspaceOpfsAdapter();
    const store = createStore(adapter);
    const first = buildFullWorkspace();
    await store.save(first);
    const second = workspaceCommitActiveObjectTransform(workspaceRedo(first), {
      revision: 1,
      position: [99, 1, 2],
      rotationEulerRad: [0, 0, 0],
      scale: [1, 1, 1],
    });

    adapter.failNextHeadWrite = true;
    await expect(store.save(second)).rejects.toMatchObject(expectPersistenceError("STORAGE_FAILED"));

    const recovered = await store.load();
    expect(recovered.status).toBe("restored");
    if (recovered.status === "restored") {
      expect(recovered.workspace.session.state.stateHash).toBe(first.session.state.stateHash);
    }
  });

  it("serializes overlapping saves so the newest workspace remains recoverable", async () => {
    const adapter = new FifoWorkspaceOpfsAdapter();
    const store = createStore(adapter);
    const older = workspaceAddUnitCube(
      createStudioHybridDccWorkspace("persist-concurrent-save"),
      "asset-old",
    );
    const newer = workspaceAddUnitCube(older, "asset-new");

    const [olderReceipt, newerReceipt] = await Promise.all([
      store.save(older),
      store.save(newer),
    ]);
    const loaded = await store.load();

    expect([olderReceipt.sequence, newerReceipt.sequence]).toEqual([1, 2]);
    expect(loaded.status).toBe("restored");
    if (loaded.status !== "restored") return;
    expect(loaded.workspace.session.state.stateHash).toBe(newer.session.state.stateHash);
    expect(Object.keys(loaded.workspace.session.state.geometry.records).sort()).toEqual([
      "asset-new",
      "asset-old",
    ]);
  });

  it("serializes overlapping save and clear mutations in invocation order", async () => {
    const adapter = new FifoWorkspaceOpfsAdapter();
    const store = createStore(adapter);
    const workspace = workspaceAddUnitCube(
      createStudioHybridDccWorkspace("persist-concurrent-clear"),
      "asset-before-clear",
    );

    const [saveReceipt, clearReceipt] = await Promise.all([
      store.save(workspace),
      store.clear(),
    ]);
    const loaded = await store.load();

    expect([saveReceipt.sequence, clearReceipt.sequence]).toEqual([1, 2]);
    expect(loaded.status).toBe("cleared");
  });

  it("fails closed on corrupted OPFS payload bytes instead of opening an empty workspace", async () => {
    const adapter = new FakeWorkspaceOpfsAdapter();
    const store = createStore(adapter);
    await store.save(buildFullWorkspace());
    adapter.corruptLatestPayloadChunk();

    await expect(store.load()).rejects.toMatchObject(expectPersistenceError("CORRUPT_PAYLOAD"));
  });

  it("writes an atomic tombstone for clear and no longer exposes the prior workspace", async () => {
    const adapter = new FakeWorkspaceOpfsAdapter();
    const store = createStore(adapter);
    await store.save(buildFullWorkspace());

    const receipt = await store.clear();
    const loaded = await store.load();

    expect(receipt.documentStateHash).toBeNull();
    expect(receipt.physicalCleanupComplete).toBe(true);
    expect(loaded.status).toBe("cleared");
    if (loaded.status === "cleared") expect(loaded.clearedAt).toBe(receipt.savedAt);
  });

  it("rejects quota exhaustion without publishing a workspace", async () => {
    const adapter = new FakeWorkspaceOpfsAdapter();
    adapter.quota = 1;
    const store = createStore(adapter);

    await expect(store.save(buildFullWorkspace())).rejects.toMatchObject(
      expectPersistenceError("QUOTA_EXCEEDED"),
    );
    expect((await store.load()).status).toBe("empty");
  });

  it("rejects memory fallback and missing native OPFS durability", () => {
    const memory = createStudioOpfsMemoryFileSystem();
    expect(() => createStudioHybridDccWorkspacePersistenceFromFileSystem({
      fileSystem: memory,
      lockManager: {
        request: async (_name, _options, operation) => operation(),
      },
      scope: SCOPE,
    })).toThrow(expectPersistenceError("OPFS_UNAVAILABLE"));
    expect(() => createStudioHybridDccWorkspacePersistence({
      adapter: null,
      scope: SCOPE,
    })).toThrow(expectPersistenceError("OPFS_UNAVAILABLE"));
  });
});

describe("Hybrid DCC workspace persistence envelope", () => {
  it("rejects legacy versions, scope mismatch, checksum tampering and oversized payloads", () => {
    const workspace = buildFullWorkspace();
    const encoded = encodeStudioHybridDccWorkspacePersistenceEnvelope({
      workspace,
      scope: SCOPE,
      savedAt: 42,
    });
    const parsed = JSON.parse(new TextDecoder().decode(encoded.bytes)) as Record<string, unknown>;

    const legacy = { ...parsed, version: 0 };
    const legacyBytes = new TextEncoder().encode(canonicalStudioCommandJson(legacy));
    expect(() => decodeStudioHybridDccWorkspacePersistenceEnvelope({
      bytes: legacyBytes,
      scope: SCOPE,
    })).toThrow(expectPersistenceError("UNSUPPORTED_VERSION"));

    expect(() => decodeStudioHybridDccWorkspacePersistenceEnvelope({
      bytes: encoded.bytes,
      scope: { userId: SCOPE.userId, workId: "다른 작품" },
    })).toThrow(expectPersistenceError("SCOPE_MISMATCH"));

    const payload = structuredClone(parsed.payload) as {
      aux: { clothStep: number };
    };
    payload.aux.clothStep += 1;
    const tamperedBytes = new TextEncoder().encode(canonicalStudioCommandJson({
      ...parsed,
      payload,
    }));
    expect(() => decodeStudioHybridDccWorkspacePersistenceEnvelope({
      bytes: tamperedBytes,
      scope: SCOPE,
    })).toThrow(expectPersistenceError("INTEGRITY_FAILED"));

    const oversized = {
      ...workspace,
      lastImportReport: { text: "x".repeat(10_000) },
    };
    expect(() => encodeStudioHybridDccWorkspacePersistenceEnvelope({
      workspace: oversized,
      scope: SCOPE,
      savedAt: 42,
      maxPayloadBytes: 4 * 1024,
    })).toThrow(expectPersistenceError("PAYLOAD_TOO_LARGE"));
  });
});
