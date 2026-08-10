import { readFileSync } from "node:fs";

import {
  applyInkStrokeMeshDelta,
  createEmptyInkStrokeMeshReplica,
  loadInkMeshGenerator,
  type InkMeshGenerator,
  type InkStrokeMesh,
  type InkStrokeMeshDelta,
  type InkStrokeMeshReplica,
} from "@toonspectrum/studio-brush-platform";
import { beforeAll, describe, expect, it, vi } from "vitest";

import {
  StudioInkMeshGpuBufferRuntime,
  StudioInkMeshLivePreviewRuntime,
  StudioInkMeshPreviewError,
  createStudioInkMeshReplacementDelta,
  expandStudioInkMeshPredictedSuffix,
  type StudioInkMeshGpuApplyReceipt,
  type StudioInkMeshPreparedResources,
  type StudioInkMeshPreviewSink,
  type StudioInkMeshStrokeLike,
} from "./studio-ink-mesh-live-preview";

import type { StudioLiveInkSurface } from "./studio-live-ink-overlay";

const SURFACE = {
  left: 0,
  top: 0,
  width: 640,
  height: 480,
  documentScale: 1,
  documentWidth: 640,
  flipX: false,
} as const;

function stroke(count: number, offset = 0): StudioInkMeshStrokeLike {
  const points: number[] = [];
  const pressures: number[] = [];
  const altitudeAngles: number[] = [];
  const azimuthAngles: number[] = [];
  const sampleTimeOffsets: number[] = [];
  const tiltXs: number[] = [];
  const tiltYs: number[] = [];
  const twists: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const t = index / Math.max(1, count - 1);
    points.push(20 + index * 2, 80 + Math.sin(t * Math.PI * 3) * 24 + offset);
    pressures.push(0.15 + t * 0.75);
    altitudeAngles.push(Math.PI / 2 - t * 0.8);
    azimuthAngles.push((0.2 + t * 4.5) % (Math.PI * 2));
    sampleTimeOffsets.push(index * 4);
    tiltXs.push(t * 35);
    tiltYs.push(t * 20);
    twists.push(t * 90);
  }
  return {
    id: "stroke-ink-mesh",
    kind: "freehand",
    mode: "pen",
    points,
    pressures,
    altitudeAngles,
    azimuthAngles,
    sampleTimeOffsets,
    tiltXs,
    tiltYs,
    twists,
    stroke: "#1b2430",
    strokeWidth: 11,
    opacity: 1,
    symmetry: { type: "none", centerX: 0, centerY: 0 },
    brushTip: { tiltEnabled: true, angleDeg: 24, roundness: 0.62 },
  };
}

function prefix(source: StudioInkMeshStrokeLike, count: number): StudioInkMeshStrokeLike {
  const slice = (values: readonly number[] | undefined) => values?.slice(0, count);
  return {
    ...source,
    points: source.points.slice(0, count * 2),
    pressures: slice(source.pressures),
    altitudeAngles: slice(source.altitudeAngles),
    azimuthAngles: slice(source.azimuthAngles),
    sampleTimeOffsets: slice(source.sampleTimeOffsets),
    tiltXs: slice(source.tiltXs),
    tiltYs: slice(source.tiltYs),
    twists: slice(source.twists),
  };
}

function appendPredicted(
  authority: StudioInkMeshStrokeLike,
  predicted: readonly { x: number; y: number; pressure: number }[],
): StudioInkMeshStrokeLike {
  const next = prefix(authority, authority.points.length / 2);
  for (const [localIndex, point] of predicted.entries()) {
    const index = next.points.length / 2;
    next.points.push(point.x, point.y);
    next.pressures?.push(point.pressure);
    next.altitudeAngles?.push(Math.PI / 3);
    next.azimuthAngles?.push(1 + localIndex * 0.1);
    next.sampleTimeOffsets?.push(index * 4);
    next.tiltXs?.push(20);
    next.tiltYs?.push(10);
    next.twists?.push(30);
  }
  return next;
}

function bytes(value: Float32Array | Uint32Array): Buffer {
  return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
}

function expectExactMesh(actual: InkStrokeMesh, expected: InkStrokeMesh): void {
  expect(actual.vertexCount).toBe(expected.vertexCount);
  expect(actual.triangleCount).toBe(expected.triangleCount);
  expect(bytes(actual.vertices).equals(bytes(expected.vertices))).toBe(true);
  expect(bytes(actual.texCoords).equals(bytes(expected.texCoords))).toBe(true);
  expect(bytes(actual.triangles).equals(bytes(expected.triangles))).toBe(true);
}

class RecordingSink implements StudioInkMeshPreviewSink {
  replica = createEmptyInkStrokeMeshReplica();
  readonly applications: Array<{
    delta: InkStrokeMeshDelta;
    drawFromTriangle: number;
    next: InkStrokeMeshReplica;
  }> = [];
  resetCount = 0;
  disposeCount = 0;
  surface: StudioLiveInkSurface | null = null;

  setColor(): boolean {
    return true;
  }

  apply(delta: InkStrokeMeshDelta, drawFromTriangle: number): StudioInkMeshGpuApplyReceipt {
    const next = applyInkStrokeMeshDelta(this.replica, delta);
    this.replica = next;
    this.applications.push({ delta, drawFromTriangle, next });
    return {
      status: "applied",
      revision: next.revision,
      writes: [],
      drawFirstIndex: drawFromTriangle * 3,
      drawIndexCount: (next.triangleCount - drawFromTriangle) * 3,
      geometryBytes:
        next.vertices.byteLength + next.texCoords.byteLength + next.triangles.byteLength,
      gpuReadbackCount: 0,
    };
  }

  setSurface(surface: StudioLiveInkSurface | null): void {
    this.surface = surface;
  }

  reset(): void {
    this.resetCount += 1;
    this.replica = createEmptyInkStrokeMeshReplica();
  }

  dispose(): void {
    this.disposeCount += 1;
  }
}

let generator: InkMeshGenerator;

beforeAll(async () => {
  generator = await loadInkMeshGenerator();
});

function runtimeHarness() {
  const sink = new RecordingSink();
  let released = 0;
  let lossListener: ((event: { epoch: number; reason: string }) => void) | null = null;
  const prepared: StudioInkMeshPreparedResources = {
    generator,
    sink,
    deviceEpoch: 7,
    release: () => {
      released += 1;
    },
  };
  const runtime = new StudioInkMeshLivePreviewRuntime({
    prepareResources: async () => prepared,
    subscribeDeviceLoss: (listener) => {
      lossListener = listener;
      return () => {
        lossListener = null;
      };
    },
  });
  runtime.attach({} as HTMLCanvasElement);
  runtime.setSurface(SURFACE);
  return {
    runtime,
    sink,
    prepared: runtime.prepare(),
    lose: () => lossListener?.({ epoch: 7, reason: "test-loss" }),
    released: () => released,
  };
}

describe("Studio Google Ink live product coordinator", () => {
  it("finishes byte-identically to the pinned single-shot mesh across product suffixes", async () => {
    const source = stroke(160);
    const harness = runtimeHarness();
    await harness.prepared;
    expect(harness.runtime.begin(prefix(source, 1), source.pressures?.slice(0, 1)).status)
      .toBe("started");
    for (const count of [8, 31, 73, 121, 160]) {
      const current = prefix(source, count);
      expect(harness.runtime.synchronizeAuthoritative(current, current.pressures).status)
        .toBe("synchronized");
    }
    const finish = harness.runtime.finish(source, source.pressures);
    expect(finish.status).toBe("finished");
    if (finish.status !== "finished") throw new Error("expected finish receipt");
    const reference = generator.generateInkStrokeMesh(
      source.points.reduce<import("@toonspectrum/studio-brush-platform").InkMeshInputPoint[]>(
        (points, _coordinate, flatIndex) => {
          if (flatIndex % 2 !== 0) return points;
          const index = flatIndex / 2;
          points.push({
            x: source.points[flatIndex]!,
            y: source.points[flatIndex + 1]!,
            tMs: source.sampleTimeOffsets![index]!,
            pressure: source.pressures![index]!,
            tiltRad: Math.PI / 2 - source.altitudeAngles![index]!,
            orientationRad: source.azimuthAngles![index]!,
          });
          return points;
        },
        [],
      ),
      {
        size: 11,
        pressureToSize: { minMultiplier: 0.3, maxMultiplier: 1.7 },
        rotationRad: 24 * Math.PI / 180,
        scale: { x: 0.62, y: 1 },
        tiltToRotation: { minOffsetRad: 0, maxOffsetRad: Math.PI / 2 },
      },
    );
    expectExactMesh(finish.finalMesh, reference);
    expect(finish.gpuReadbackCount).toBe(0);
    expect(harness.sink.resetCount).toBeGreaterThanOrEqual(2);
  });

  it("replaces predicted tails without advancing the authoritative session", async () => {
    const source = stroke(90);
    const authority = prefix(source, 40);
    const harness = runtimeHarness();
    await harness.prepared;
    harness.runtime.begin(prefix(source, 1));
    harness.runtime.synchronizeAuthoritative(authority);
    const firstPrediction = appendPredicted(authority, [
      { x: 101, y: 99, pressure: 0.55 },
      { x: 104, y: 102, pressure: 0.61 },
      { x: 108, y: 104, pressure: 0.68 },
    ]);
    const first = harness.runtime.previewPredicted(firstPrediction, 40);
    expect(first.status).toBe("rendered");
    if (first.status !== "rendered") throw new Error("expected prediction receipt");
    expect(first.predictedPointCount).toBe(3);
    expect(first.gpu.drawIndexCount).toBeGreaterThan(0);

    const secondPrediction = appendPredicted(authority, [
      { x: 100, y: 93, pressure: 0.45 },
      { x: 106, y: 90, pressure: 0.72 },
    ]);
    const second = harness.runtime.previewPredicted(secondPrediction, 40);
    expect(second.status).toBe("rendered");
    expect(harness.sink.applications.at(-1)?.delta.operation).toBe("update");

    const actual = prefix(source, 57);
    const synchronized = harness.runtime.synchronizeAuthoritative(actual);
    expect(synchronized.status).toBe("synchronized");
    if (synchronized.status !== "synchronized") throw new Error("expected sync receipt");
    expect(synchronized.authoritativePointCount).toBe(57);
    expect(synchronized.gpu.drawIndexCount).toBe(0);
    const finish = harness.runtime.finish(actual);
    expect(finish.status).toBe("finished");
    if (finish.status !== "finished") throw new Error("expected finish receipt");
    expect(finish.authoritativePointCount).toBe(57);
  });

  it("expands Studio's bounded origin/endpoint prediction draft without mutating authority", () => {
    const authority = stroke(40);
    const compact = appendPredicted(prefix(authority, 2), [
      { x: 101, y: 91, pressure: 0.52 },
      { x: 104, y: 89, pressure: 0.63 },
    ]);
    compact.points[2] = authority.points.at(-2)!;
    compact.points[3] = authority.points.at(-1)!;
    compact.pressures![1] = authority.pressures!.at(-1)!;
    compact.altitudeAngles![1] = authority.altitudeAngles!.at(-1)!;
    compact.azimuthAngles![1] = authority.azimuthAngles!.at(-1)!;
    compact.sampleTimeOffsets![1] = authority.sampleTimeOffsets!.at(-1)!;
    const originalAuthority = authority.points.slice();
    const expanded = expandStudioInkMeshPredictedSuffix(authority, compact, 2);
    expect(expanded.points.slice(0, authority.points.length)).toEqual(authority.points);
    expect(expanded.points.slice(authority.points.length)).toEqual(compact.points.slice(4));
    expect(expanded.pressures).toHaveLength(42);
    expect(authority.points).toEqual(originalAuthority);
  });

  it("rejects a predicted prefix mutation and keeps the verified fallback explicit", async () => {
    const source = stroke(30);
    const authority = prefix(source, 20);
    const harness = runtimeHarness();
    await harness.prepared;
    harness.runtime.begin(prefix(source, 1));
    harness.runtime.synchronizeAuthoritative(authority);
    const predicted = appendPredicted(authority, [{ x: 90, y: 90, pressure: 0.5 }]);
    predicted.points[4] = predicted.points[4]! + 1;
    const receipt = harness.runtime.previewPredicted(predicted, 20);
    expect(receipt).toMatchObject({
      status: "fallback",
      code: "predicted-prefix-mismatch",
      fallback: "canvas2d-perfect-freehand",
    });
    expect(harness.runtime.active).toBe(false);
  });

  it("rejects rewritten authoritative prefixes instead of corrupting retained buffers", async () => {
    const source = stroke(20);
    const harness = runtimeHarness();
    await harness.prepared;
    harness.runtime.begin(prefix(source, 12));
    const receipt = harness.runtime.synchronizeAuthoritative(prefix(source, 8));
    expect(receipt).toMatchObject({
      status: "fallback",
      code: "authoritative-prefix-rewritten",
    });
  });

  it("disposes active buffers and reports Perfect Freehand on matching fabric loss", async () => {
    const source = stroke(12);
    const harness = runtimeHarness();
    await harness.prepared;
    harness.runtime.begin(prefix(source, 8));
    harness.lose();
    expect(harness.runtime.active).toBe(false);
    expect(harness.runtime.lastFallback).toMatchObject({
      code: "device-lost",
      fallback: "canvas2d-perfect-freehand",
    });
    expect(harness.sink.resetCount).toBeGreaterThan(0);
    expect(harness.sink.disposeCount).toBe(1);
    expect(harness.released()).toBe(1);
  });

  it("fails closed on NaN and admission overflow without blocking the product fallback", async () => {
    const source = stroke(2);
    source.points[0] = Number.NaN;
    const harness = runtimeHarness();
    await harness.prepared;
    expect(harness.runtime.begin(source)).toMatchObject({
      status: "fallback",
      code: "invalid-input",
    });

    const oversized: InkStrokeMesh = {
      vertices: new Float32Array(524_289 * 2),
      texCoords: new Float32Array(524_289 * 2),
      triangles: new Uint32Array(),
      vertexCount: 524_289,
      triangleCount: 0,
    };
    expect(() =>
      createStudioInkMeshReplacementDelta(
        createEmptyInkStrokeMeshReplica(),
        oversized,
        1,
      ),
    ).toThrow(StudioInkMeshPreviewError);
  });
});

interface FakeBuffer {
  readonly label: string;
  readonly size: number;
  readonly destroy: ReturnType<typeof vi.fn>;
}

function gpuHarness() {
  const buffers: FakeBuffer[] = [];
  const writeBuffer = vi.fn();
  const submit = vi.fn();
  const drawIndexed = vi.fn();
  const pass = {
    setPipeline: vi.fn(),
    setBindGroup: vi.fn(),
    setVertexBuffer: vi.fn(),
    setIndexBuffer: vi.fn(),
    drawIndexed,
    end: vi.fn(),
  };
  const device = {
    limits: { maxBufferSize: 64 * 1024 * 1024 },
    queue: { writeBuffer, submit },
    createShaderModule: vi.fn(() => ({})),
    createRenderPipeline: vi.fn(() => ({ getBindGroupLayout: () => ({}) })),
    createBindGroup: vi.fn(() => ({})),
    createBuffer: vi.fn((descriptor: GPUBufferDescriptor) => {
      const buffer = {
        label: descriptor.label ?? "",
        size: descriptor.size,
        destroy: vi.fn(),
      } as unknown as FakeBuffer;
      buffers.push(buffer);
      return buffer;
    }),
    createCommandEncoder: vi.fn(() => ({
      beginRenderPass: () => pass,
      finish: () => ({}),
    })),
  } as unknown as GPUDevice;
  const context = {
    configure: vi.fn(),
    unconfigure: vi.fn(),
    getCurrentTexture: () => ({ createView: () => ({}) }),
  } as unknown as GPUCanvasContext;
  const canvas = {
    width: 1,
    height: 1,
    style: { visibility: "hidden" },
  } as unknown as HTMLCanvasElement;
  return { buffers, canvas, context, device, drawIndexed, pass, submit, writeBuffer };
}

function triangleMesh(extra = false): InkStrokeMesh {
  return extra
    ? {
        vertices: new Float32Array([0, 0, 10, 0, 0, 10, 10, 10]),
        texCoords: new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]),
        triangles: new Uint32Array([0, 1, 2, 1, 3, 2]),
        vertexCount: 4,
        triangleCount: 2,
      }
    : {
        vertices: new Float32Array([0, 0, 10, 0, 0, 10]),
        texCoords: new Float32Array([0, 0, 1, 0, 0, 1]),
        triangles: new Uint32Array([0, 1, 2]),
        vertexCount: 3,
        triangleCount: 1,
      };
}

describe("Studio Google Ink GPU retained buffers", () => {
  it("writes append tails at exact retained byte offsets and issues an indexed draw", () => {
    const gpu = gpuHarness();
    const runtime = new StudioInkMeshGpuBufferRuntime({
      canvas: gpu.canvas,
      context: gpu.context,
      device: gpu.device,
      format: "bgra8unorm",
    });
    runtime.setSurface(SURFACE);
    runtime.setColor("#102030", 1);
    gpu.writeBuffer.mockClear();

    const first = createStudioInkMeshReplacementDelta(
      createEmptyInkStrokeMeshReplica(),
      triangleMesh(false),
      3,
    );
    const firstReceipt = runtime.apply(first, 1);
    expect(firstReceipt.gpuReadbackCount).toBe(0);
    expect(firstReceipt.writes).toEqual([
      { kind: "positions", offsetBytes: 0, byteLength: 24, fullReplacement: true },
      { kind: "tex-coords", offsetBytes: 0, byteLength: 24, fullReplacement: true },
      { kind: "indices", offsetBytes: 0, byteLength: 12, fullReplacement: true },
    ]);

    const second = createStudioInkMeshReplacementDelta(
      runtime.replica,
      triangleMesh(true),
      4,
    );
    const secondReceipt = runtime.apply(second, 1);
    expect(secondReceipt.writes).toEqual([
      { kind: "positions", offsetBytes: 24, byteLength: 8, fullReplacement: false },
      { kind: "tex-coords", offsetBytes: 24, byteLength: 8, fullReplacement: false },
      { kind: "indices", offsetBytes: 12, byteLength: 12, fullReplacement: false },
    ]);
    expect(secondReceipt.drawFirstIndex).toBe(3);
    expect(secondReceipt.drawIndexCount).toBe(3);
    expect(gpu.drawIndexed).toHaveBeenLastCalledWith(3, 1, 3, 0, 0);
    expect(gpu.submit).toHaveBeenCalled();
  });

  it("rejects stale revisions before any queue mutation", () => {
    const gpu = gpuHarness();
    const runtime = new StudioInkMeshGpuBufferRuntime({
      canvas: gpu.canvas,
      context: gpu.context,
      device: gpu.device,
      format: "bgra8unorm",
    });
    runtime.setSurface(SURFACE);
    const delta = createStudioInkMeshReplacementDelta(
      createEmptyInkStrokeMeshReplica(),
      triangleMesh(false),
      3,
    );
    runtime.apply(delta, 1);
    gpu.writeBuffer.mockClear();
    expect(() => runtime.apply(delta, 1)).toThrow(/revision mismatch/u);
    expect(gpu.writeBuffer).not.toHaveBeenCalled();
  });

  it("destroys all stroke geometry buffers on reset and performs no readback API calls", () => {
    const gpu = gpuHarness();
    const runtime = new StudioInkMeshGpuBufferRuntime({
      canvas: gpu.canvas,
      context: gpu.context,
      device: gpu.device,
      format: "bgra8unorm",
    });
    runtime.setSurface(SURFACE);
    runtime.apply(
      createStudioInkMeshReplacementDelta(
        createEmptyInkStrokeMeshReplica(),
        triangleMesh(false),
        3,
      ),
      1,
    );
    const geometry = gpu.buffers.filter((buffer) =>
      /positions|texture coordinates|indices/u.test(buffer.label),
    );
    expect(geometry).toHaveLength(3);
    runtime.reset();
    for (const buffer of geometry) expect(buffer.destroy).toHaveBeenCalledOnce();
    expect(runtime.metrics().gpuReadbackCount).toBe(0);

    const source = readFileSync(
      new URL("./studio-ink-mesh-live-preview.ts", import.meta.url),
      "utf8",
    );
    expect(source).not.toMatch(/\.mapAsync\(|getMappedRange|copyBufferToBuffer/u);
  });
});
