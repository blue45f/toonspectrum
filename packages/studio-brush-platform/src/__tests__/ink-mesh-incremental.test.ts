import { describe, expect, it } from "vitest";

import {
  INK_MESH_DELTA_PROTOCOL,
  InkMeshError,
  applyInkStrokeMeshDelta,
  createEmptyInkStrokeMeshReplica,
  loadInkMeshGenerator,
  type InkMeshInputPoint,
  type InkStrokeMesh,
  type InkStrokeMeshDelta,
} from "../ink-mesh";

function fidelityStroke(count = 240): InkMeshInputPoint[] {
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    return {
      x: 12 + 360 * t + 11 * Math.sin(t * Math.PI * 8),
      y: 90 + 52 * Math.sin(t * Math.PI * 3),
      tMs: t * 1_600,
      pressure: 0.15 + 0.75 * (0.5 + 0.5 * Math.sin(t * Math.PI * 2.5)),
      tiltRad: 0.1 + t * 1.1,
      orientationRad: 0.2 + t * 5.5,
    };
  });
}

function bytes(array: Float32Array | Uint32Array): Buffer {
  return Buffer.from(array.buffer, array.byteOffset, array.byteLength);
}

function expectExactMesh(actual: InkStrokeMesh, expected: InkStrokeMesh): void {
  expect(actual.vertexCount).toBe(expected.vertexCount);
  expect(actual.triangleCount).toBe(expected.triangleCount);
  expect(bytes(actual.vertices).equals(bytes(expected.vertices))).toBe(true);
  expect(bytes(actual.texCoords).equals(bytes(expected.texCoords))).toBe(true);
  expect(bytes(actual.triangles).equals(bytes(expected.triangles))).toBe(true);
}

describe("google/ink InProgressStroke mesh delta v1", () => {
  it("reassembles every append/update revision into the exact WASM snapshot", async () => {
    const generator = await loadInkMeshGenerator();
    const session = generator.createInProgressStroke({
      size: 12,
      scale: { x: 0.55, y: 1.1 },
      tiltToRotation: { minOffsetRad: -0.2, maxOffsetRad: 0.35 },
    });
    let replica = createEmptyInkStrokeMeshReplica();
    const points = fidelityStroke();
    try {
      for (let offset = 0; offset < points.length; offset += 8) {
        const delta = session.append(points.slice(offset, offset + 8));
        expect(delta.protocol).toBe(INK_MESH_DELTA_PROTOCOL);
        expect(delta.baseRevision).toBe(replica.revision);
        replica = applyInkStrokeMeshDelta(replica, delta);
        expectExactMesh(replica, session.snapshot());
      }
      replica = applyInkStrokeMeshDelta(replica, session.finish());
      expect(replica.finished).toBe(true);
      expectExactMesh(replica, session.snapshot());
    } finally {
      session.dispose();
    }
  });

  it("is byte-exact with single-shot final geometry across input partitions", async () => {
    const generator = await loadInkMeshGenerator();
    const points = fidelityStroke(160);
    const params = {
      size: 9,
      epsilon: 0.08,
      scale: { x: 0.6, y: 1.25 },
      tiltToRotation: { minOffsetRad: -0.15, maxOffsetRad: 0.45 },
    } as const;
    const reference = generator.generateInkStrokeMesh(points, params);
    for (const chunkSize of [1, 7, 31, 160]) {
      const session = generator.createInProgressStroke(params);
      try {
        for (let offset = 0; offset < points.length; offset += chunkSize) {
          session.append(points.slice(offset, offset + chunkSize));
        }
        session.finish();
        expectExactMesh(session.snapshot(), reference);
      } finally {
        session.dispose();
      }
    }
  });

  it("emits deterministic operations and byte-identical replacement tails", async () => {
    const generator = await loadInkMeshGenerator();
    const points = fidelityStroke(128);
    const capture = (): InkStrokeMeshDelta[] => {
      const session = generator.createInProgressStroke();
      const deltas: InkStrokeMeshDelta[] = [];
      try {
        for (let offset = 0; offset < points.length; offset += 5) {
          deltas.push(session.append(points.slice(offset, offset + 5)));
        }
        deltas.push(session.finish());
        return deltas;
      } finally {
        session.dispose();
      }
    };
    const first = capture();
    const second = capture();
    expect(second).toHaveLength(first.length);
    first.forEach((delta, index) => {
      const again = second[index] as InkStrokeMeshDelta;
      expect({ ...again, vertices: [], texCoords: [], triangles: [] }).toEqual({
        ...delta,
        vertices: [],
        texCoords: [],
        triangles: [],
      });
      expect(bytes(again.vertices).equals(bytes(delta.vertices))).toBe(true);
      expect(bytes(again.texCoords).equals(bytes(delta.texCoords))).toBe(true);
      expect(bytes(again.triangles).equals(bytes(delta.triangles))).toBe(true);
    });
    expect(first.some((delta) => delta.operation === "append")).toBe(true);
    expect(first.some((delta) => delta.operation === "update")).toBe(true);
  });

  it("preserves pressure and tilt through upstream BrushBehavior", async () => {
    const generator = await loadInkMeshGenerator();
    const stroke = (tiltRad: number, pressure: number): InkMeshInputPoint[] =>
      Array.from({ length: 64 }, (_, index) => ({
        x: 20 + index * 2,
        y: 60,
        tMs: index * 5,
        pressure,
        tiltRad,
        orientationRad: 0.2,
      }));
    const params = {
      size: 20,
      scale: { x: 0.25, y: 1 },
      tiltToRotation: { minOffsetRad: 0, maxOffsetRad: Math.PI / 2 },
    } as const;
    const upright = generator.generateInkStrokeMesh(stroke(0, 0.5), params);
    const flat = generator.generateInkStrokeMesh(stroke(Math.PI / 2, 0.5), params);
    const light = generator.generateInkStrokeMesh(stroke(0, 0.1), params);
    const heavy = generator.generateInkStrokeMesh(stroke(0, 0.9), params);
    const height = (mesh: InkStrokeMesh): number => {
      const ys = Array.from({ length: mesh.vertexCount }, (_, index) =>
        mesh.vertices[index * 2 + 1] ?? 0,
      );
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(height(upright)).toBeGreaterThan(height(flat) * 2);
    expect(height(heavy)).toBeGreaterThan(height(light) * 2);

    const session = generator.createInProgressStroke(params);
    try {
      session.append(stroke(Math.PI / 2, 0.5));
      session.finish();
      expectExactMesh(session.snapshot(), flat);
    } finally {
      session.dispose();
    }
  });

  it("uses the single-shot reference only when that backend is selected explicitly", async () => {
    const generator = await loadInkMeshGenerator();
    const points = fidelityStroke(96);
    const reference = generator.generateInkStrokeMesh(points);
    const session = generator.createInProgressStroke(undefined, {
      backend: "single-shot-reference",
    });
    try {
      for (let offset = 0; offset < points.length; offset += 12) {
        session.append(points.slice(offset, offset + 12));
      }
      session.finish();
      expect(session.backend).toBe("single-shot-reference");
      expect(session.metrics().backend).toBe("single-shot-reference");
      expectExactMesh(session.snapshot(), reference);
    } finally {
      session.dispose();
    }
  });

  it("rejects the removed forceSingleShotFallback option instead of silently changing lanes", async () => {
    const generator = await loadInkMeshGenerator();
    expect(() => generator.createInProgressStroke(undefined, {
      forceSingleShotFallback: true,
    } as never)).toThrow(/unsupported ink-mesh session option: forceSingleShotFallback/);
  });

  it("reduces live payload versus full-snapshot transfer and performs no GPU readback", async () => {
    const generator = await loadInkMeshGenerator();
    const session = generator.createInProgressStroke();
    const points = fidelityStroke(960);
    try {
      for (let offset = 0; offset < points.length; offset += 8) {
        session.append(points.slice(offset, offset + 8));
      }
      session.finish();
      const metrics = session.metrics();
      expect(metrics.deltaPayloadBytes).toBeLessThan(
        metrics.fullSnapshotEquivalentBytes * 0.25,
      );
      expect(metrics.peakTrackedVectorBytes).toBeGreaterThan(0);
      expect(metrics.peakWasmHeapBytes).toBeGreaterThan(0);
      expect(metrics.gpuReadbackCount).toBe(0);
    } finally {
      session.dispose();
    }
  });

  it("resets the retained handle and restarts protocol revision zero", async () => {
    const generator = await loadInkMeshGenerator();
    const session = generator.createInProgressStroke();
    const first = fidelityStroke(40);
    const second = fidelityStroke(72).map((point) => ({ ...point, x: point.x + 50 }));
    try {
      expect(session.append(first).baseRevision).toBe(0);
      session.finish();
      session.reset({ size: 14 });
      const initial = session.append(second.slice(0, 12));
      expect(initial.baseRevision).toBe(0);
      expect(initial.revision).toBe(1);
      session.append(second.slice(12));
      session.finish();
      expectExactMesh(
        session.snapshot(),
        generator.generateInkStrokeMesh(second, { size: 14 }),
      );
    } finally {
      session.dispose();
    }
  });

  it("cancels and disposes handles idempotently and rejects later use", async () => {
    const generator = await loadInkMeshGenerator();
    const cancelled = generator.createInProgressStroke();
    cancelled.append(fidelityStroke(8));
    cancelled.cancel();
    cancelled.cancel();
    expect(cancelled.state).toBe("cancelled");
    expect(() => cancelled.append(fidelityStroke(2))).toThrow(/state cancelled/);
    expect(() => cancelled.snapshot()).toThrow(/state cancelled/);

    const disposed = generator.createInProgressStroke();
    disposed.dispose();
    disposed.dispose();
    expect(disposed.state).toBe("disposed");
    expect(() => disposed.reset()).toThrow(/state disposed/);
  });

  it("rejects NaN, infinity, float overflow, and optional-channel drift", async () => {
    const generator = await loadInkMeshGenerator();
    const invalid: InkMeshInputPoint[] = [
      { x: Number.NaN, y: 0, tMs: 0, pressure: 0.5 },
      { x: Number.POSITIVE_INFINITY, y: 0, tMs: 0, pressure: 0.5 },
      { x: 4e38, y: 0, tMs: 0, pressure: 0.5 },
      { x: 0, y: 0, tMs: 0, pressure: Number.NaN },
      { x: 0, y: 0, tMs: 0, pressure: 1.1 },
      { x: 0, y: 0, tMs: 0, pressure: 0.5, tiltRad: Math.PI },
      { x: 0, y: 0, tMs: 0, pressure: 0.5, orientationRad: Math.PI * 2 },
    ];
    for (const point of invalid) {
      expect(() => generator.generateInkStrokeMesh([point])).toThrow(InkMeshError);
    }
    expect(() =>
      generator.generateInkStrokeMesh([
        { x: 0, y: 0, tMs: 0, pressure: 0.5, tiltRad: 0.2 },
        { x: 1, y: 1, tMs: 1, pressure: 0.5 },
      ]),
    ).toThrow(/presence must be consistent/);
  });

  it("rejects cross-batch time reversal without corrupting the live session", async () => {
    const generator = await loadInkMeshGenerator();
    const session = generator.createInProgressStroke();
    try {
      session.append([
        { x: 0, y: 0, tMs: 10, pressure: 0.5 },
        { x: 1, y: 1, tMs: 20, pressure: 0.5 },
      ]);
      expect(() =>
        session.append([{ x: 2, y: 2, tMs: 19, pressure: 0.5 }]),
      ).toThrow(/non-decreasing/);
      session.append([{ x: 2, y: 2, tMs: 21, pressure: 0.5 }]);
      session.finish();
      expect(session.snapshot().triangleCount).toBeGreaterThan(0);
    } finally {
      session.dispose();
    }
  });

  it("enforces per-append resource limits before allocating the WASM payload", async () => {
    const generator = await loadInkMeshGenerator();
    const session = generator.createInProgressStroke();
    try {
      const point = { x: 0, y: 0, tMs: 0, pressure: 0.5 } as const;
      expect(() => session.append(new Array(65_537).fill(point))).toThrow(
        /exceeds 65536 points/,
      );
      expect(session.metrics().inputPayloadBytes).toBe(0);
    } finally {
      session.dispose();
    }
  });

  it("rejects stale, malformed, and out-of-range consumer deltas", () => {
    const empty = createEmptyInkStrokeMeshReplica();
    const base: InkStrokeMeshDelta = {
      protocol: INK_MESH_DELTA_PROTOCOL,
      baseRevision: 1,
      revision: 2,
      operation: "append",
      retainedVertexCount: 0,
      retainedTriangleCount: 0,
      vertices: new Float32Array([0, 0, 1, 0, 0, 1]),
      texCoords: new Float32Array(6),
      triangles: new Uint32Array([0, 1, 9]),
      vertexCount: 3,
      triangleCount: 1,
      inputCount: 1,
      finished: false,
      payloadBytes: 60,
    };
    expect(() => applyInkStrokeMeshDelta(empty, base)).toThrow(/revision mismatch/);
    expect(() =>
      applyInkStrokeMeshDelta(empty, { ...base, baseRevision: 0, revision: 1 }),
    ).toThrow(/out of range/);
    expect(() =>
      applyInkStrokeMeshDelta(empty, {
        ...base,
        baseRevision: 0,
        revision: 1,
        triangles: new Uint32Array([0, 1, 2]),
        texCoords: new Float32Array(4),
      }),
    ).toThrow(/counts are inconsistent/);
  });
});
