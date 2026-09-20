import { describe, expect, it, vi } from "vitest";
import { WebIO } from "@gltf-transform/core";
import { specialistOptionsSchema } from "./specialist-contract";
import { buildNavigationRoute, navigationBuildSettings, NAVIGATION_ROUTE_POINT_LIMIT } from "./specialist-navigation-path";
import type { NavigationOptions, NavigationPoint, NavigationQuery } from "./specialist-navigation-path";
import { createSpecialistFixture } from "./specialist-fixtures";
import { runScene3dSpecialist } from "./specialist-runtime";
import { sha256 } from "./specialist-gltf";

const options: NavigationOptions = { kind: "navigation", start: [-2, 0, -2], end: [2, 0, 2], cellSize: 0.2, agentRadius: 0.3, agentHeight: 1.8 };
function query(): NavigationQuery {
  return { findClosestPoint: vi.fn((point: NavigationPoint) => ({ success: true, point: { ...point } })),
    computePath: vi.fn((a: NavigationPoint, b: NavigationPoint) => ({ success: true, path: [{ ...a }, { ...b }] })) };
}

describe("navigation authoring contract", () => {
  it("keeps old requests valid and bounds new options", () => {
    expect(specialistOptionsSchema.parse(options)).toEqual(options);
    for (const change of [{ maxStepHeight: -1 }, { maxSlopeDegrees: 90 }, { maxSlopeDegrees: NaN },
      { waypoints: Array.from({ length: 9 }, () => [0, 0, 0]) }, { waypoints: [[0, Infinity, 0]] }])
      expect(specialistOptionsSchema.safeParse({ ...options, ...change }).success).toBe(false);
  });
  it("quantizes height/radius conservatively and validates vertical grid resolution", () => {
    expect(navigationBuildSettings({ ...options, maxStepHeight: 0.29, maxSlopeDegrees: 30 })).toMatchObject({ walkableHeight: 18, walkableRadius: 2, walkableClimb: 2, walkableSlopeAngle: 30 });
    expect(navigationBuildSettings(options).walkableClimb).toBe(3);
    expect(() => navigationBuildSettings({ ...options, cellSize: 2 })).toThrow("3 vertical cells");
    expect(() => navigationBuildSettings({ ...options, maxStepHeight: 2 })).toThrow("step lower than the agent");
  });
  it("visits stops in order, measures every leg, and coalesces duplicate stops", () => {
    const q = query();
    const result = buildNavigationRoute(q, { ...options, waypoints: [[2, 0, -2], [2, 0, -2], [-2, 0, 2]] });
    expect(result.segments).toHaveLength(4);
    expect(result.path).toHaveLength(4);
    expect(result.segments[1]!.lengthMeters).toBe(0);
    expect(result.lengthMeters).toBeCloseTo(8 + Math.sqrt(32), 8);
    expect(q.computePath).toHaveBeenCalledTimes(3);
  });
  it("rejects a waypoint projected onto a different floor before querying paths", () => {
    const q = query();
    q.findClosestPoint = (point) => ({ success: true, point: { ...point, y: 0 } });
    expect(() => buildNavigationRoute(q, { ...options, waypoints: [[0, 1, 0]] })).toThrow("stop 2");
    expect(q.computePath).not.toHaveBeenCalled();
  });
  it("rejects partial, non-finite and oversized paths and stationary requests", () => {
    const q = query();
    q.computePath = (a, b) => ({ success: true, path: [a, { ...b, x: b.x - 0.01 }] });
    expect(() => buildNavigationRoute(q, options)).toThrow("projection tolerance");
    q.computePath = (a, b) => ({ success: true, path: [a, { x: NaN, y: 0, z: 0 }, b] });
    expect(() => buildNavigationRoute(q, options)).toThrow("non-finite");
    q.computePath = (a, b) => ({ success: true, path: [a, ...Array.from({length: NAVIGATION_ROUTE_POINT_LIMIT}, (_, i) => ({ x: i, y: 0, z: 0 })), b] });
    expect(() => buildNavigationRoute(q, options)).toThrow("point budget");
    expect(() => buildNavigationRoute(query(), { ...options, end: options.start })).toThrow("distinct");
  });
});

async function run(source: Uint8Array<ArrayBuffer>, extra: Partial<NavigationOptions> = {}) {
  return runScene3dSpecialist({ version: 1, id: 7, source: source.buffer, options: { ...options, ...extra } });
}
describe("real Recast navigation authoring", () => {
  it("exports a multi-stop route, numeric receipt and highlighted standard GLB", async () => {
    const source = await createSpecialistFixture("floor"), original = source.slice();
    const result = await run(source, { waypoints: [[2, 0, -2], [-2, 0, 2]], maxStepHeight: 0.2, maxSlopeDegrees: 35 });
    expect(source).toEqual(original);
    expect(result.artifacts).toHaveLength(4);
    result.artifacts.forEach((artifact) => expect(artifact.sha256).toBe(sha256(artifact.bytes)));
    const receipt = JSON.parse(new TextDecoder().decode(result.artifacts[2]!.bytes));
    expect(receipt.stops).toHaveLength(4);
    expect(receipt.segments).toHaveLength(3);
    expect(receipt.lengthMeters).toBeCloseTo(8 + Math.sqrt(32), 3);
    expect(receipt.effectiveAgent.maximumStepMeters).toBeCloseTo(0.2);
    expect(receipt.buildSettings.walkableSlopeAngle).toBe(35);
    expect(receipt.sourceSha256).toBe(sha256(source));
    const io = new WebIO(), preview = await io.readBinary(result.artifacts[3]!.bytes);
    expect(preview.getRoot().listNodes().filter((node) => node.getName().startsWith("Stop "))).toHaveLength(4);
    expect(preview.getRoot().listMaterials().map((material) => material.getName())).toContain("Route highlight");
    const surface = await io.readBinary(result.artifacts[0]!.bytes);
    expect(surface.getRoot().listMeshes()).toHaveLength(1);
    expect(surface.getRoot().listNodes()).toHaveLength(1);
  });
  it("does not skip an unreachable waypoint just because the final endpoint is reachable", async () => {
    const io = new WebIO(), doc = await io.readBinary(await createSpecialistFixture("floor"));
    doc.getRoot().listScenes()[0]!.addChild(doc.createNode("Isolated floor").setMesh(doc.getRoot().listMeshes()[0]!).setTranslation([12, 0, 0]));
    const source = new Uint8Array(await io.writeBinary(doc));
    await expect(run(source)).resolves.toMatchObject({ operation: "navigation" });
    await expect(run(source, { waypoints: [[12, 0, 0]] })).rejects.toMatchObject({ code: "runtime" });
  });
  it("applies the requested slope to actual sloped geometry", async () => {
    const io = new WebIO(), doc = await io.readBinary(await createSpecialistFixture("floor"));
    const position = doc.getRoot().listMeshes()[0]!.listPrimitives()[0]!.getAttribute("POSITION")!;
    for (let i = 0; i < position.getCount(); i++) { const p = position.getElement(i, [0, 0, 0]); p[1] = p[0]! * 0.5; position.setElement(i, p); }
    const source = new Uint8Array(await io.writeBinary(doc));
    const endpoints = { start: [-2, -1, -2] as [number, number, number], end: [2, 1, 2] as [number, number, number] };
    await expect(run(source, { ...endpoints, cellSize: 0.05, maxSlopeDegrees: 40 })).resolves.toMatchObject({ operation: "navigation" });
    await expect(run(source, { ...endpoints, cellSize: 0.05, maxSlopeDegrees: 20 })).rejects.toMatchObject({ code: "runtime" });
  });
  it("preserves the requested floor at intermediate stops", async () => {
    await expect(run(await createSpecialistFixture("floor"), { waypoints: [[0, 1, 0]] })).rejects.toMatchObject({ code: "runtime", message: expect.stringContaining("stop 2") });
  });
});

it("applies maximum step height to a real two-level Recast surface", async () => {
  const io = new WebIO(), doc = await io.readBinary(await createSpecialistFixture("floor"));
  doc.getRoot().listNodes()[0]!.setScale([0.5, 1, 1]).setTranslation([-2.5, 0, 0]);
  doc.getRoot().listScenes()[0]!.addChild(doc.createNode("Raised floor").setMesh(doc.getRoot().listMeshes()[0]!).setScale([0.5, 1, 1]).setTranslation([2.5, 0.5, 0]));
  const source = new Uint8Array(await io.writeBinary(doc));
  const endpoints = { start: [-2, 0, 0] as [number, number, number], end: [2, 0.5, 0] as [number, number, number], cellSize: 0.1 };
  await expect(run(source, { ...endpoints, maxStepHeight: 0.6 })).resolves.toMatchObject({ operation: "navigation" });
  await expect(run(source, { ...endpoints, maxStepHeight: 0.2 })).rejects.toMatchObject({ code: "runtime" });
});
it("respects agent radius on an actual narrow walking surface", async () => {
  const io = new WebIO(), doc = await io.readBinary(await createSpecialistFixture("floor"));
  doc.getRoot().listNodes()[0]!.setScale([1, 1, 0.12]);
  const source = new Uint8Array(await io.writeBinary(doc));
  const endpoints = { start: [-2, 0, 0] as [number, number, number], end: [2, 0, 0] as [number, number, number], cellSize: 0.1 };
  await expect(run(source, { ...endpoints, agentRadius: 0.1 })).resolves.toMatchObject({ operation: "navigation" });
  await expect(run(source, { ...endpoints, agentRadius: 0.8 })).rejects.toMatchObject({ code: "runtime" });
});

it("keys reuse by ordered stops, agent settings and the new runtime revision", async () => {
  const { createSpecialistRecipeIdentity, SPECIALIST_RECIPE_RUNTIME_REVISION } = await import("./specialist-recipe-reuse");
  const source = new ArrayBuffer(32);
  const identity = async (change: Partial<NavigationOptions>, revision = SPECIALIST_RECIPE_RUNTIME_REVISION) => createSpecialistRecipeIdentity(
    { version: 1, id: 1, source, options: { ...options, ...change } },
    { digest: async (bytes) => sha256(bytes), revision },
  );
  const a = await identity({ waypoints: [[1, 0, 0], [0, 0, 1]] });
  expect(a.key).toBe((await identity({ waypoints: [[1, 0, 0], [0, 0, 1]] })).key);
  expect(a.key).not.toBe((await identity({ waypoints: [[0, 0, 1], [1, 0, 0]] })).key);
  expect((await identity({})).key).not.toBe((await identity({}, "scene3d-specialist-recipe-runtime-v1")).key);
  for (const change of [{ agentRadius: 0.5 }, { agentHeight: 2 }, { maxStepHeight: 0.2 }, { maxSlopeDegrees: 30 }]) {
    expect((await identity({})).key).not.toBe((await identity(change)).key);
  }
});
