import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import Module from "manifold-3d";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { BufferAttribute, BufferGeometry } from "three";
import { WebIO } from "@gltf-transform/core";
import { createStudioManifoldMeshProvider, createStudioManifoldRuntime } from "../../studio-manifold-mesh-provider";
import { evaluateCompoundSolid, COMPOUND_SOLID_LIMITS } from "./specialist-solid-compound";
import { extractStaticGeometry, geometryDocument } from "./specialist-geometry";
import { createCompoundFixture, compoundFixtureVolume } from "./specialist-compound-fixtures";
import type { ManifoldToplevel } from "manifold-3d";

let module: ManifoldToplevel;
beforeAll(async () => {
  const wasmBinary = await readFile(fileURLToPath(import.meta.resolve("manifold-3d/manifold.wasm")));
  module = await Module({ wasmBinary });
  module.setup();
});
const providerFactory = () => createStudioManifoldMeshProvider({ runtimeLoader: () => createStudioManifoldRuntime(module) });

describe("real compound Manifold Boolean", () => {
  it.each([["union", 14], ["subtract", 6], ["intersect", 6]] as const)(
    "%s removes source overlap before the final operation", async (operation, volume) => {
      const left = createCompoundFixture({ offsets: [0, 1], split: true });
      const right = createCompoundFixture({ offsets: [1.5] });
      const io = new WebIO();
      const before = [await io.writeBinary(left), await io.writeBinary(right)];
      const result = await evaluateCompoundSolid(left, right, operation, providerFactory);
      expect(result.report.output.topology.volume).toBeCloseTo(volume, 4);
      expect(result.report.sourceParts.left.map((part) => part.primitives)).toEqual([6, 6]);
      expect(result.report.steps.map((step) => step.phase)).toEqual(["left-union", "result"]);
      const geometry = new BufferGeometry().setAttribute("position", new BufferAttribute(result.mesh.positions, 3))
        .setIndex(new BufferAttribute(result.mesh.triangleIndices, 1));
      try {
        const reopened = await io.readBinary(await io.writeBinary(geometryDocument(geometry, "result")));
        expect(compoundFixtureVolume(reopened)).toBeCloseTo(volume, 4);
      } finally { geometry.dispose(); }
      expect(await io.writeBinary(left)).toEqual(before[0]);
      expect(await io.writeBinary(right)).toEqual(before[1]);
    },
  );
  it("composes both operands, including disjoint shared-mesh instances", async () => {
    const result = await evaluateCompoundSolid(
      createCompoundFixture({ offsets: [0, 4] }),
      createCompoundFixture({ offsets: [0.5, 4.5], split: true }),
      "intersect", providerFactory);
    expect(result.report.output.topology.volume).toBeCloseTo(12, 4);
    expect(result.report.steps.map((s) => s.phase)).toEqual(["left-union", "right-union", "result"]);
  });
  it("bakes mirrored nonuniform parent transforms with correct winding", async () => {
    const result = await evaluateCompoundSolid(
      createCompoundFixture({ offsets: [0, 1], transformed: true, split: true }),
      createCompoundFixture({ offsets: [1.5], transformed: true }), "subtract", providerFactory);
    expect(result.report.output.topology.volume).toBeCloseTo(12, 3);
  });
  it("rejects an open mesh and releases the provider and all created WASM handles", async () => {
    const runtime = createStudioManifoldRuntime(module);
    const created = vi.spyOn(runtime, "createManifold");
    const deleted = vi.spyOn(runtime, "deleteManifold");
    const destroyed = vi.spyOn(runtime, "destroy");
    await expect(evaluateCompoundSolid(createCompoundFixture({ offsets: [0, 1], open: true }),
      createCompoundFixture({ offsets: [1.5] }), "union", () => createStudioManifoldMeshProvider({ runtimeLoader: () => runtime })))
      .rejects.toThrow();
    const handles = created.mock.results.filter((r) => r.type === "return").map((r) => r.value);
    expect(deleted.mock.calls.map(([handle]) => handle)).toEqual(expect.arrayContaining(handles));
    expect(destroyed).toHaveBeenCalledOnce();
  });
  it("rejects too many mesh nodes before constructing a WASM provider", async () => {
    const factory = vi.fn(providerFactory);
    await expect(evaluateCompoundSolid(createCompoundFixture({ offsets: Array.from({ length: COMPOUND_SOLID_LIMITS.meshNodesPerSource + 1 }, (_, i) => i * 3) }),
      createCompoundFixture({ offsets: [0] }), "union", factory)).rejects.toMatchObject({ code: "budget" });
    expect(factory).not.toHaveBeenCalled();
  });
  it("does not silently run a single-primitive BVH preview on a compound model", async () => {
    await expect(extractStaticGeometry(createCompoundFixture({ offsets: [0, 1] }), true))
      .rejects.toMatchObject({ code: "unsupported", message: expect.stringContaining("Manifold solid") });
  });
  it("releases every native handle after balanced multi-level composition succeeds", async () => {
    const runtime = createStudioManifoldRuntime(module);
    const created = vi.spyOn(runtime, "createManifold");
    const boolean = vi.spyOn(runtime, "boolean");
    const deleted = vi.spyOn(runtime, "deleteManifold");
    const destroyed = vi.spyOn(runtime, "destroy");
    const result = await evaluateCompoundSolid(
      createCompoundFixture({ offsets: [0, 4, 8, 12] }),
      createCompoundFixture({ offsets: [0.5, 4.5, 8.5] }),
      "union", () => createStudioManifoldMeshProvider({ runtimeLoader: () => runtime }));
    expect(result.report.output.topology.volume).toBeCloseTo(38, 4);
    expect(result.report.steps).toHaveLength(6);
    expect(result.report.workUnits).toBeGreaterThan(0);
    const handles = [...created.mock.results, ...boolean.mock.results]
      .filter((r) => r.type === "return").map((r) => r.value);
    expect(handles).toHaveLength(18);
    expect(new Set(deleted.mock.calls.map(([handle]) => handle))).toEqual(new Set(handles));
    expect(deleted).toHaveBeenCalledTimes(18);
    expect(destroyed).toHaveBeenCalledOnce();
  });
  it("does not reinterpret a negative-scale input as negative solid volume", async () => {
    const source = createCompoundFixture({ offsets: [0], split: true });
    source.getRoot().listScenes()[0]!.listChildren()[0]!.setScale([-1, 1, 1]);
    const result = await evaluateCompoundSolid(source, createCompoundFixture({ offsets: [0.5] }), "union", providerFactory);
    expect(result.report.output.topology.volume).toBeCloseTo(10, 4);
  });
  it("executes the advertised 32-node source limit with the real solid kernel", async () => {
    const result = await evaluateCompoundSolid(
      createCompoundFixture({ offsets: Array.from({ length: 32 }, (_, i) => i * 4) }),
      createCompoundFixture({ offsets: [0.5] }), "union", providerFactory);
    expect(result.report.sourceParts.left).toHaveLength(32);
    expect(result.report.steps).toHaveLength(32);
    expect(result.report.output.topology.volume).toBeCloseTo(258, 3);
  });
  it("reports an empty intersection rather than emitting an invalid GLB", async () => {
    await expect(evaluateCompoundSolid(createCompoundFixture({ offsets: [0, 1] }),
      createCompoundFixture({ offsets: [10] }), "intersect", providerFactory))
      .rejects.toMatchObject({ code: "runtime", message: "Boolean result is empty." });
  });
});
