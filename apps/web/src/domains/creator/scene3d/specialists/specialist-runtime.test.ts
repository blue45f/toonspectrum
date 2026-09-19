import { generateTangents } from "mikktspace";
import { MeshoptTangents } from "meshoptimizer";
import { describe, expect, it } from "vitest";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { WebIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { createSpecialistFixture } from "./specialist-fixtures";
import { runScene3dSpecialist } from "./specialist-runtime";
import { preflightSpecialistGlb, sha256 } from "./specialist-gltf";
import { parseSpecialistRequest } from "./specialist-contract";
import type { SpecialistOptions } from "./specialist-contract";

async function run(
  kind: Parameters<typeof createSpecialistFixture>[0],
  options: SpecialistOptions,
) {
  const source = await createSpecialistFixture(kind);
  const original = source.slice();
  const result = await runScene3dSpecialist({
    version: 1,
    id: 1,
    source: source.buffer,
    options,
  });
  expect(source).toEqual(original);
  expect(result.sourceSha256).toBe(sha256(source));
  for (const artifact of result.artifacts)
    expect(artifact.sha256).toBe(sha256(artifact.bytes));
  return result;
}
function glbJson(json: unknown): Uint8Array<ArrayBuffer> {
  const text = new TextEncoder().encode(JSON.stringify(json));
  const size = Math.ceil(text.length / 4) * 4;
  const bytes = new Uint8Array(20 + size);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, bytes.length, true);
  view.setUint32(12, size, true);
  view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20);
  bytes.set(text, 20);
  return bytes;
}
describe("real Scene3D specialist toolchain", () => {
  it("compresses a GLB readable by the existing pinned Three decoder", async () => {
    const result = await run("sphere", { kind: "compress" });
    const artifact = result.artifacts[0]!;
    const json = preflightSpecialistGlb(artifact.bytes);
    expect(json.extensionsUsed).toContain("EXT_meshopt_compression");
    await MeshoptDecoder.ready;
    const io = new WebIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
    expect(
      (await io.readBinary(artifact.bytes)).getRoot().listMeshes(),
    ).toHaveLength(1);
  });
  it("generates independent LODs with measured triangle reductions, not fake metadata", async () => {
    const result = await run("sphere", { kind: "lod", error: 0.03 });
    expect(result.artifacts).toHaveLength(3);
    expect(result.artifacts[0]!.stats!.triangles).toBe(result.before.triangles);
    expect(result.artifacts[1]!.stats!.triangles).toBeLessThan(
      result.before.triangles,
    );
    expect(result.artifacts[2]!.stats!.triangles).toBeLessThan(
      result.artifacts[1]!.stats!.triangles,
    );
  });
  it("generates actual Mikk-compatible tangent attributes", async () => {
    const result = await run("floor", { kind: "tangents" });
    expect(result.before.tangentPrimitives).toBe(0);
    expect(result.artifacts[0]!.stats!.tangentPrimitives).toBe(1);
  });
  it("removes redundant animation keys while retaining the clip", async () => {
    const result = await run("animated", { kind: "animation" });
    expect(result.artifacts[0]!.stats!.animations).toBe(1);
    expect(result.artifacts[0]!.stats!.animationKeys).toBeLessThan(
      result.before.animationKeys,
    );
  });
  it("does not simplify animated assets through the static LOD lane", async () => {
    await expect(run("animated", { kind: "lod", error: 0.01 })).rejects.toThrow(
      "Static meshes only",
    );
  });
  it.each(["union", "subtract", "intersect"] as const)(
    "evaluates real BVH %s and exports a parseable derived mesh",
    async (operation) => {
      const source = await createSpecialistFixture("cube");
      const secondary = await createSpecialistFixture("offset-cube");
      const result = await runScene3dSpecialist({
        version: 1,
        id: 3,
        source: source.buffer,
        secondary: secondary.buffer,
        options: { kind: "csg", operation, backend: "preview" },
      });
      expect(result.artifacts[0]!.stats!.triangles).toBeGreaterThan(0);
      expect(result.warnings.join(" ")).toContain("not a watertight");
      expect(result.warnings.join(" ")).toContain(sha256(secondary));
    },
  );
  it("constructs a real Recast navmesh and a full Detour path", async () => {
    const result = await run("floor", {
      kind: "navigation",
      start: [-2, 0, -2],
      end: [2, 0, 2],
      cellSize: 0.2,
      agentRadius: 0.3,
      agentHeight: 1.8,
    });
    expect(result.artifacts.map(({ name }) => name)).toEqual([
      "navmesh.glb",
      "navmesh.bin",
      "navigation-path.json",
    ]);
    const path = JSON.parse(
      new TextDecoder().decode(result.artifacts[2]!.bytes),
    ).path;
    expect(path.length).toBeGreaterThanOrEqual(2);
    expect(path.at(-1).x).toBeCloseTo(2, 1);
  });
  it("rejects invalid options, missing operands, unsupported extensions and resource URIs", () => {
    expect(() =>
      parseSpecialistRequest({
        version: 1,
        id: 1,
        source: new ArrayBuffer(20),
        options: { kind: "csg", operation: "union" },
      }),
    ).toThrow();
    for (const json of [
      { asset: { version: "2.0" }, extensionsUsed: ["VRMC_vrm"] },
      { asset: { version: "2.0" }, extensions: { VRM: {} } },
      {
        asset: { version: "2.0" },
        images: [{ uri: "https://example.org/private.png" }],
      },
      { asset: { version: "2.0" }, nodes: [{ children: [0] }] },
      {
        asset: { version: "2.0" },
        accessors: [{ count: 999999999, type: "VEC3" }],
      },
    ])
      expect(() => preflightSpecialistGlb(glbJson(json))).toThrow();
  });
});

it("compares generated tangent signs and directions against the original MikkTSpace WASM oracle", async () => {
  await MeshoptTangents.ready;
  for (const uv of [
    new Float32Array([0, 0, 1, 0, 0, 1]),
    new Float32Array([1, 0, 0, 0, 1, 1]),
  ]) {
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const reference = generateTangents(positions, normals, uv);
    const actual = MeshoptTangents.generateTangents(
      null,
      positions,
      3,
      normals,
      3,
      uv,
      2,
      ["Compatible"],
    );
    expect(actual.length).toBe(reference.length);
    for (let i = 0; i < actual.length; i++)
      expect(actual[i]).toBeCloseTo(reference[i]!, 5);
  }
});

it("solves a bounded IK chain and verifies the glTF pose reaches the requested target", async () => {
  const result = await run("rig", {
    kind: "ik",
    rootName: "upper-arm",
    tipName: "hand",
    target: [1, 1.2, 0.3],
    angleLimitDegrees: 150,
    tolerance: 0.005,
  });
  const receipt = JSON.parse(
    new TextDecoder().decode(result.artifacts[1]!.bytes),
  );
  expect(receipt.error).toBeLessThanOrEqual(0.005);
  expect(receipt.roundTripError).toBeLessThanOrEqual(0.005);
  expect(result.sourceNodeNames).toEqual(
    expect.arrayContaining(["upper-arm", "elbow", "hand"]),
  );
});
it("does not label unreachable IK goals as successful pose output", async () => {
  await expect(
    run("rig", {
      kind: "ik",
      rootName: "upper-arm",
      tipName: "hand",
      target: [100, 100, 0],
      angleLimitDegrees: 150,
      tolerance: 0.005,
    }),
  ).rejects.toMatchObject({
    code: "runtime",
    message:
      "The bounded IK solve did not reach the target. Adjust the target or joint limits.",
  });
});
it("provides actual source hierarchy without changing the source", async () => {
  const result = await run("rig", { kind: "inspect" });
  const report = JSON.parse(
    new TextDecoder().decode(result.artifacts[0]!.bytes),
  );
  expect(
    report.nodes.find((node: { name: string }) => node.name === "hand").parent,
  ).toBe("elbow");
});

it("rejects non-finite binary accessor data before producing derivatives", async () => {
  const io = new WebIO();
  const document = await io.readBinary(await createSpecialistFixture("cube"));
  const attribute = document
    .getRoot()
    .listMeshes()[0]!
    .listPrimitives()[0]!
    .getAttribute("POSITION")!;
  attribute.setElement(0, [Number.NaN, 0, 0]);
  const source = new Uint8Array(await io.writeBinary(document));
  await expect(
    runScene3dSpecialist({
      version: 1,
      id: 5,
      source: source.buffer,
      options: { kind: "compress" },
    }),
  ).rejects.toMatchObject({ code: "invalid-input" });
});

it.each(["start", "end"] as const)(
  "rejects a navigation %s that snaps to the wrong floor",
  async (key) => {
    await expect(
      run("floor", {
        kind: "navigation",
        start: key === "start" ? [-2, 1, -2] : [-2, 0, -2],
        end: key === "end" ? [2, 1, 2] : [2, 0, 2],
        cellSize: 0.2,
        agentRadius: 0.3,
        agentHeight: 1.8,
      }),
    ).rejects.toMatchObject({
      code: "runtime",
      message: expect.stringContaining("XYZ projection tolerance"),
    });
  },
);
