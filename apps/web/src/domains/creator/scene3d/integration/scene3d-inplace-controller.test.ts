import { describe, expect, it, vi } from "vitest";
import {
  createScene3dInplaceController,
  digestScene3dBytes,
} from "./scene3d-inplace-controller";
import type {
  Scene3dInplaceSelection,
  Scene3dInplacePrepared,
  Scene3dInplaceDependencies,
} from "./scene3d-inplace-controller";
import type {
  SpecialistArtifact,
  SpecialistResult,
} from "../specialists/specialist-contract";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { resolve, promise };
}
async function fixture() {
  const source = new Uint8Array(32).fill(1);
  const output = new Uint8Array(32).fill(2);
  let state: Scene3dInplaceSelection = {
    entityId: "model-one",
    label: "Source",
    sourceSha256: await digestScene3dBytes(source),
    sourceByteLength: source.length,
    revisionKey: "revision-1",
    runtimeOwner: {},
    sourceOwner: {},
  };
  const commit = vi.fn(() => {
    state = { ...state, revisionKey: "revision-2" };
  });
  const rollback = vi.fn(async () => {});
  const prepare = vi.fn<Scene3dInplaceDependencies["prepare"]>(
    async (): Promise<Scene3dInplacePrepared> => ({ commit, rollback }),
  );
  const readSource = vi.fn(async () => source.slice().buffer);
  const readSelection = vi.fn(() => state);
  const bridge = createScene3dInplaceController({
    readSelection,
    readSource,
    prepare,
  });
  const input = await bridge.captureSelection();
  const artifact: SpecialistArtifact = {
    name: "compress.glb",
    mime: "model/gltf-binary",
    bytes: output,
    sha256: await digestScene3dBytes(output),
  };
  const result: SpecialistResult = {
    version: 1,
    sourceSha256: state.sourceSha256,
    operation: "compress",
    before: {
      triangles: 1,
      vertices: 3,
      nodes: 1,
      animations: 0,
      animationKeys: 0,
      tangentPrimitives: 0,
    },
    artifacts: [artifact],
    warnings: [],
    provenance: {},
  };
  return {
    bridge,
    input,
    result,
    artifact,
    source,
    prepare,
    readSource,
    readSelection,
    commit,
    rollback,
    state: () => state,
    change: (patch: Partial<Scene3dInplaceSelection>) => {
      state = { ...state, ...patch };
    },
  };
}
describe("scene-owned derivative transaction", () => {
  it("coalesces duplicate applies and commits exactly once", async () => {
    const f = await fixture();
    const a = f.bridge.apply(f.input, f.result, f.artifact);
    const b = f.bridge.apply(f.input, f.result, f.artifact);
    expect(a).toBe(b);
    const receipt = await a;
    expect(receipt).toMatchObject({
      status: "applied",
      entityId: "model-one",
      sourceSha256: f.input.sourceSha256,
      derivativeSha256: f.artifact.sha256,
    });
    expect(f.commit).toHaveBeenCalledOnce();
    expect(f.rollback).not.toHaveBeenCalled();
    await expect(
      f.bridge.apply(f.input, f.result, f.artifact),
    ).resolves.toEqual(receipt);
    expect(f.commit).toHaveBeenCalledOnce();
  });
  it.each([
    "revisionKey",
    "entityId",
    "runtimeOwner",
    "sourceOwner",
    "sourceSha256",
  ] as const)("rejects stale %s before persistence", async (field) => {
    const f = await fixture();
    f.change({ [field]: field.endsWith("Owner") ? {} : "changed" });
    await expect(
      f.bridge.apply(f.input, f.result, f.artifact),
    ).rejects.toMatchObject({ code: "stale" });
    expect(f.prepare).not.toHaveBeenCalled();
  });
  it("compensates a staged record if the scene changes while loading its renderer resources", async () => {
    const f = await fixture();
    f.prepare.mockImplementationOnce(async () => {
      f.change({ revisionKey: "edited" });
      return { commit: f.commit, rollback: f.rollback };
    });
    await expect(
      f.bridge.apply(f.input, f.result, f.artifact),
    ).rejects.toMatchObject({ code: "stale" });
    expect(f.rollback).toHaveBeenCalledOnce();
    expect(f.commit).not.toHaveBeenCalled();
  });
  it("validates owned output bytes instead of trusting the worker-reported digest", async () => {
    const f = await fixture();
    f.artifact.bytes[0] = 9;
    await expect(
      f.bridge.apply(f.input, f.result, f.artifact),
    ).rejects.toMatchObject({ code: "invalid-result" });
    expect(f.prepare).not.toHaveBeenCalled();
  });
  it("snapshots artifact bytes before asynchronous digest/staging work", async () => {
    const f = await fixture();
    const call = f.bridge.apply(f.input, f.result, f.artifact);
    f.artifact.bytes.fill(9);
    await call;
    const staged = f.prepare.mock.calls[0]?.[1] as
      | SpecialistArtifact
      | undefined;
    expect(staged?.bytes).toEqual(new Uint8Array(32).fill(2));
    expect(f.source).toEqual(new Uint8Array(32).fill(1));
  });
  it("rejects unsupported, foreign-source or substituted artifacts before persistence", async () => {
    const f = await fixture();
    await expect(
      f.bridge.apply(f.input, { ...f.result, operation: "csg" }, f.artifact),
    ).rejects.toMatchObject({ code: "unsupported" });
    await expect(
      f.bridge.apply(
        f.input,
        { ...f.result, sourceSha256: "other" },
        f.artifact,
      ),
    ).rejects.toMatchObject({ code: "unsupported" });
    await expect(
      f.bridge.apply({ ...f.input }, f.result, f.artifact),
    ).rejects.toMatchObject({ code: "stale" });
    await expect(
      f.bridge.apply(f.input, f.result, { ...f.artifact }),
    ).rejects.toMatchObject({ code: "unsupported" });
    expect(f.prepare).not.toHaveBeenCalled();
  });
  it("does not commit or leak a staged resource on cancellation", async () => {
    const f = await fixture();
    const controller = new AbortController();
    f.prepare.mockImplementationOnce(async () => {
      controller.abort();
      return { commit: f.commit, rollback: f.rollback };
    });
    await expect(
      f.bridge.apply(f.input, f.result, f.artifact, controller.signal),
    ).rejects.toMatchObject({ code: "cancelled" });
    expect(f.rollback).toHaveBeenCalledOnce();
    expect(f.commit).not.toHaveBeenCalled();
  });
  it("does not replace an active source binding while applying", async () => {
    const f = await fixture();
    const hold = deferred<Scene3dInplacePrepared>();
    f.prepare.mockReturnValueOnce(hold.promise);
    const call = f.bridge.apply(f.input, f.result, f.artifact);
    await expect(f.bridge.captureSelection()).rejects.toMatchObject({
      code: "busy",
    });
    hold.resolve({ commit: f.commit, rollback: f.rollback });
    await call;
  });
  it("compensates a failed mutation-lane commit and reports failed cleanup explicitly", async () => {
    const f = await fixture();
    f.commit.mockImplementationOnce(() => {
      throw new Error("commit failed");
    });
    await expect(f.bridge.apply(f.input, f.result, f.artifact)).rejects.toThrow(
      "commit failed",
    );
    expect(f.rollback).toHaveBeenCalledOnce();
    const g = await fixture();
    g.commit.mockImplementationOnce(() => {
      throw new Error("commit failed");
    });
    g.rollback.mockRejectedValueOnce(new Error("newer manifest"));
    await expect(
      g.bridge.apply(g.input, g.result, g.artifact),
    ).rejects.toMatchObject({ code: "persistence" });
  });
  it("rejects a changed source during source-byte loading", async () => {
    const f = await fixture();
    f.readSource.mockImplementationOnce(async () => {
      f.change({ revisionKey: "new" });
      return f.source.slice().buffer;
    });
    await expect(f.bridge.captureSelection()).rejects.toMatchObject({
      code: "stale",
    });
    await expect(
      f.bridge.apply(f.input, f.result, f.artifact),
    ).rejects.toMatchObject({ code: "stale" });
  });
  it("rejects corrupted stored bytes and oversized inputs before processing", async () => {
    const f = await fixture();
    f.readSource.mockResolvedValueOnce(new Uint8Array(32).fill(3).buffer);
    await expect(f.bridge.captureSelection()).rejects.toMatchObject({
      code: "invalid-result",
    });
    f.change({ sourceByteLength: 129 * 1024 * 1024 });
    f.readSource.mockClear();
    await expect(f.bridge.captureSelection()).rejects.toMatchObject({
      code: "unsupported",
    });
    expect(f.readSource).not.toHaveBeenCalled();
  });
});
