import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  collectStudioBg3dSurfaceSelectionSubtreeIds,
  collectStudioBg3dSurfaceTargetPathIds,
  resolveStudioBg3dSurfaceSnap,
  type ResolveStudioBg3dSurfaceSnapInput,
} from "./studio-bg3d-surface-snap";

const BASE: ResolveStudioBg3dSurfaceSnapInput = {
  selectedIds: ["subject"],
  selectionId: "subject",
  selectionSubtreeIds: ["subject", "subject-child"],
  locked: false,
  localPosition: [2, 4, 1],
  rotation: [0.1, -0.2, 0.3],
  worldBounds: { min: [1, 2, 3], max: [5, 8, 7] },
  hit: {
    targetPathIds: ["table-top", "table"],
    point: [10, 20, 30],
    normal: [0, 2, 0],
  },
  surfaceOffset: 1,
};

function expectFailure(
  input: ResolveStudioBg3dSurfaceSnapInput,
  reason: Exclude<ReturnType<typeof resolveStudioBg3dSurfaceSnap>, { ok: true }>["reason"],
): void {
  expect(resolveStudioBg3dSurfaceSnap(input)).toEqual({ ok: false, reason });
}

describe("Studio BG3D surface snap", () => {
  it("builds the exact runtime subtree and leaf-first target ancestry", () => {
    const parentById = new Map<string, string | null>([
      ["subject", null],
      ["subject-child", "subject"],
      ["subject-grandchild", "subject-child"],
      ["table", null],
      ["table-top", "table"],
    ]);
    const childrenByParent = new Map<string, readonly string[]>([
      ["subject", ["subject-child"]],
      ["subject-child", ["subject-grandchild"]],
      ["table", ["table-top"]],
    ]);

    expect(collectStudioBg3dSurfaceSelectionSubtreeIds("subject", childrenByParent)).toEqual([
      "subject",
      "subject-child",
      "subject-grandchild",
    ]);
    expect(collectStudioBg3dSurfaceTargetPathIds("table-top", parentById)).toEqual([
      "table-top",
      "table",
    ]);
  });

  it("fails closed on stale hierarchy links and cycles", () => {
    expect(collectStudioBg3dSurfaceTargetPathIds("missing", new Map())).toBeNull();
    expect(collectStudioBg3dSurfaceTargetPathIds("a", new Map([
      ["a", "b"],
      ["b", "a"],
    ]))).toBeNull();
    expect(collectStudioBg3dSurfaceSelectionSubtreeIds("a", new Map([
      ["a", ["b"]],
      ["b", ["a"]],
    ]))).toBeNull();
  });

  it("moves the world-bounds bottom centre to the offset hit and preserves rotation", () => {
    const result = resolveStudioBg3dSurfaceSnap(BASE);
    expect(result).toEqual({
      ok: true,
      localPosition: [9, 23, 26],
      worldPosition: [9, 23, 26],
      worldDelta: [7, 19, 25],
      sourceBottomCenter: [3, 2, 5],
      targetPoint: [10, 21, 30],
      rotation: [0.1, -0.2, 0.3],
    });
    expect(Object.isFrozen(result)).toBe(true);
    if (result.ok) {
      expect(Object.isFrozen(result.localPosition)).toBe(true);
      expect(Object.isFrozen(result.rotation)).toBe(true);
    }
  });

  it("uses measured rotated/scaled world bounds and converts through an invertible parent", () => {
    const parent = new THREE.Object3D();
    parent.position.set(8, -3, 5);
    parent.rotation.set(0.2, -0.4, Math.PI / 3);
    parent.scale.set(2, 3, 0.5);

    const subject = new THREE.Object3D();
    subject.position.set(1.5, -2, 4);
    subject.rotation.set(0.45, -0.25, 0.15);
    subject.scale.set(1.5, 0.75, 2);
    parent.add(subject);
    parent.updateMatrixWorld(true);

    const worldBounds = new THREE.Box3(
      new THREE.Vector3(-1, -2, -0.5),
      new THREE.Vector3(1, 2, 0.5),
    ).applyMatrix4(subject.matrixWorld);
    const bottomCenter = new THREE.Vector3(
      (worldBounds.min.x + worldBounds.max.x) / 2,
      worldBounds.min.y,
      (worldBounds.min.z + worldBounds.max.z) / 2,
    );
    const hitPoint = new THREE.Vector3(20, 7, -4);
    const beforeWorldPosition = subject.getWorldPosition(new THREE.Vector3());
    const expectedWorldPosition = beforeWorldPosition.clone().add(
      hitPoint.clone().sub(bottomCenter),
    );

    const result = resolveStudioBg3dSurfaceSnap({
      ...BASE,
      localPosition: subject.position.toArray(),
      rotation: subject.rotation.toArray().slice(0, 3) as [number, number, number],
      worldBounds: {
        min: worldBounds.min.toArray(),
        max: worldBounds.max.toArray(),
      },
      parentWorldMatrix: [...parent.matrixWorld.elements],
      hit: {
        targetPathIds: ["platform-mesh", "platform"],
        point: hitPoint.toArray(),
        normal: [0, 1, 0],
      },
      surfaceOffset: 0,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.worldPosition[0]).toBeCloseTo(expectedWorldPosition.x, 9);
    expect(result.worldPosition[1]).toBeCloseTo(expectedWorldPosition.y, 9);
    expect(result.worldPosition[2]).toBeCloseTo(expectedWorldPosition.z, 9);
    const roundTrippedWorld = new THREE.Vector3(...result.localPosition).applyMatrix4(parent.matrixWorld);
    expect(roundTrippedWorld.x).toBeCloseTo(expectedWorldPosition.x, 9);
    expect(roundTrippedWorld.y).toBeCloseTo(expectedWorldPosition.y, 9);
    expect(roundTrippedWorld.z).toBeCloseTo(expectedWorldPosition.z, 9);
    expect(result.rotation).toEqual(subject.rotation.toArray().slice(0, 3));
  });

  it("excludes hits owned by the selected object or any selected descendant identifier", () => {
    expectFailure({
      ...BASE,
      hit: { ...BASE.hit, targetPathIds: ["subject", "scene"] },
    }, "self-hit");
    expectFailure({
      ...BASE,
      hit: { ...BASE.hit, targetPathIds: ["mesh-leaf", "subject-child", "subject"] },
    }, "self-hit");
    expect(resolveStudioBg3dSurfaceSnap({
      ...BASE,
      hit: { ...BASE.hit, targetPathIds: ["external-child", "external-root"] },
    }).ok).toBe(true);
  });

  it("enforces the single-selection and unlocked v1 admission boundary", () => {
    expectFailure({ ...BASE, selectedIds: [] }, "selection-count");
    expectFailure({ ...BASE, selectedIds: ["subject", "other"] }, "selection-count");
    expectFailure({ ...BASE, selectedIds: ["other"] }, "selection-mismatch");
    expectFailure({ ...BASE, locked: true }, "locked");
  });

  it("rejects malformed identifier policies instead of weakening self-hit exclusion", () => {
    expectFailure({ ...BASE, selectionSubtreeIds: ["subject-child"] }, "invalid-input");
    expectFailure({ ...BASE, selectionSubtreeIds: ["subject", "subject"] }, "invalid-input");
    expectFailure({
      ...BASE,
      hit: { ...BASE.hit, targetPathIds: [] },
    }, "invalid-input");
    expectFailure({
      ...BASE,
      hit: { ...BASE.hit, targetPathIds: ["__proto__"] },
    }, "invalid-input");
  });

  it("fails closed for malformed/non-finite bounds and hits", () => {
    expectFailure({
      ...BASE,
      worldBounds: { min: [2, 0, 0], max: [1, 1, 1] },
    }, "invalid-bounds");
    expectFailure({
      ...BASE,
      worldBounds: { min: [0, 0, 0], max: [1, Number.NaN, 1] },
    }, "invalid-bounds");
    expectFailure({
      ...BASE,
      hit: { ...BASE.hit, point: [0, Number.POSITIVE_INFINITY, 0] },
    }, "invalid-hit");
    expectFailure({
      ...BASE,
      hit: { ...BASE.hit, normal: [0, 0, 0] },
    }, "invalid-hit");
    expectFailure({ ...BASE, surfaceOffset: Number.NaN }, "invalid-hit");
    expectFailure({ ...BASE, localPosition: [0, Number.NaN, 0] }, "invalid-input");
  });

  it("rejects singular, projective, and non-finite parent transforms", () => {
    const singular = new THREE.Matrix4().makeScale(1, 0, 1).elements;
    expectFailure({ ...BASE, parentWorldMatrix: [...singular] }, "invalid-parent-transform");
    const projective = new THREE.Matrix4().elements.slice();
    projective[3] = 0.5;
    expectFailure({ ...BASE, parentWorldMatrix: projective }, "invalid-parent-transform");
    const nonFinite = new THREE.Matrix4().elements.slice();
    nonFinite[10] = Number.NaN;
    expectFailure({ ...BASE, parentWorldMatrix: nonFinite }, "invalid-parent-transform");
  });

  it("does not publish a patch that would leave the canonical world-coordinate budget", () => {
    expectFailure({
      ...BASE,
      localPosition: [9_999, 0, 0],
      worldBounds: { min: [9_997, 0, 0], max: [9_999, 2, 2] },
      hit: {
        targetPathIds: ["far-platform"],
        point: [10_000, 0, 0],
        normal: [0, 1, 0],
      },
      surfaceOffset: 0,
    }, "result-out-of-bounds");
  });
});
