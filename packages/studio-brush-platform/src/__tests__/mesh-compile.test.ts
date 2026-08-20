import {
  brushProgramIRSchema,
  canonicalJson,
  fnv1a64Hex,
  pathBounds,
} from "@toonspectrum/studio-project-model";
import { describe, expect, it } from "vitest";

import {
  BrushCompileError,
  BrushProviderRequiredError,
  compileMeshBrush,
  compileVectorBrush,
} from "../compile";
import {
  InkMeshError,
  INK_MESH_DELTA_PROTOCOL,
  applyInkStrokeMeshDelta,
  createEmptyInkStrokeMeshReplica,
  loadInkMeshGenerator,
  type InkStrokeMesh,
} from "../ink-mesh";

import type { ModeledSampleIR, StrokeIR } from "@toonspectrum/studio-project-model";

const meshProgram = brushProgramIRSchema.parse({
  id: "v19-ink-mesh-pen",
  name: "V19 Ink Mesh Pen",
  geometry: { kind: "google-ink-mesh" },
  sizeDynamics: [{ input: "pressure", curve: [0, 1], min: 0.3, max: 1 }],
});

/** Deterministic swooping stroke with full pressure/tilt/orientation channels. */
function meshSamples(count = 64): ModeledSampleIR[] {
  return Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    return {
      x: 10 + 220 * t + 8 * Math.sin(t * Math.PI * 5),
      y: 60 + 34 * Math.sin(t * Math.PI * 2),
      tMs: index * 7,
      pressure: 0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * Math.PI * 3)),
      velocity: 1,
      altitudeDeg: 90 - 40 * t,
      azimuthDeg: (t * 300) % 360,
    };
  });
}

function stroke(samples = meshSamples()): StrokeIR {
  return {
    id: "mesh-stroke-1",
    brushPresetId: meshProgram.id,
    seed: 3,
    color: { r: 0.05, g: 0.05, b: 0.1, a: 1 },
    baseSizePx: 10,
    samples,
  };
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

describe("vector-mesh lane dispatch", () => {
  it("compiles a google-ink-mesh program without throwing (PoC gate removed)", () => {
    const compiled = compileMeshBrush(meshProgram);
    expect(compiled.program).toBe(meshProgram);
    expect(compiled.brushParams(10)).toEqual({
      size: 10,
      pressureToSize: { minMultiplier: 0.3, maxMultiplier: 1 },
    });
  });

  it("accepts the explicit vector-mesh output target (IR round-trips it)", () => {
    const explicit = brushProgramIRSchema.parse({
      id: "mesh-explicit",
      name: "mesh-explicit",
      geometry: { kind: "google-ink-mesh" },
      output: { target: "vector-mesh", bake: "editable-proxy" },
    });
    expect(brushProgramIRSchema.parse(explicit)).toEqual(explicit);
    expect(compileMeshBrush(explicit).program.output.target).toBe("vector-mesh");
    // The default lane is untouched by the union extension.
    expect(
      brushProgramIRSchema.parse({ id: "d", name: "d" }).output.target,
    ).toBe("vector-path");
  });

  it("rejects non-mesh geometry and raster-tiles targets", () => {
    expect(() =>
      compileMeshBrush(brushProgramIRSchema.parse({ id: "pf", name: "pf" })),
    ).toThrow(BrushCompileError);
    expect(() =>
      compileMeshBrush(
        brushProgramIRSchema.parse({
          id: "wet",
          name: "wet",
          geometry: { kind: "google-ink-mesh" },
          output: { target: "raster-tiles", bake: "flatten" },
        }),
      ),
    ).toThrow(BrushCompileError);
  });

  it("keeps compileVectorBrush a pure outline compiler (mesh redirects, no gate text)", () => {
    expect(() => compileVectorBrush(meshProgram)).toThrow(/compileMeshBrush/);
    expect(() => compileVectorBrush(meshProgram)).not.toThrow(/PoC gate/);
    expect(() =>
      compileVectorBrush(
        brushProgramIRSchema.parse({
          id: "mesh-target",
          name: "mesh-target",
          output: { target: "vector-mesh", bake: "editable-proxy" },
        }),
      ),
    ).toThrow(BrushCompileError);
  });
});

describe("vector-mesh lane provider requirement (fail closed)", () => {
  it.each([null, undefined] as const)(
    "createSession/bake with %s generator throw the typed provider-required error",
    (generator) => {
      const compiled = compileMeshBrush(meshProgram);
      for (const run of [
        () => compiled.createSession(generator, 10),
        () => compiled.bake(generator, stroke()),
      ]) {
        let caught: unknown;
        try {
          run();
        } catch (error) {
          caught = error;
        }
        expect(caught).toBeInstanceOf(BrushProviderRequiredError);
        expect(caught).toBeInstanceOf(BrushCompileError);
        expect((caught as BrushProviderRequiredError).providerId).toBe(
          "google-ink-mesh",
        );
        expect((caught as BrushProviderRequiredError).name).toBe(
          "BrushProviderRequiredError",
        );
      }
    },
  );
});

describe("vector-mesh lane sessions (real ink WASM)", () => {
  it("emits incremental deltas across appends that reassemble byte-exactly", async () => {
    const generator = await loadInkMeshGenerator();
    const compiled = compileMeshBrush(meshProgram);
    const session = compiled.createSession(generator, 10);
    let replica = createEmptyInkStrokeMeshReplica();
    const samples = meshSamples();
    try {
      for (let offset = 0; offset < samples.length; offset += 9) {
        const delta = session.append(samples.slice(offset, offset + 9));
        expect(delta.protocol).toBe(INK_MESH_DELTA_PROTOCOL);
        expect(delta.baseRevision).toBe(replica.revision);
        expect(delta.revision).toBe(replica.revision + 1);
        replica = applyInkStrokeMeshDelta(replica, delta);
        expectExactMesh(replica, session.snapshot());
      }
      const final = session.finish();
      replica = applyInkStrokeMeshDelta(replica, final);
      expect(replica.finished).toBe(true);
      expect(replica.vertexCount).toBeGreaterThan(0);
      expect(replica.triangleCount).toBeGreaterThan(0);
      expectExactMesh(replica, session.snapshot());
    } finally {
      session.dispose();
    }
  });

  it("enforces revision validation on the delta stream", async () => {
    const generator = await loadInkMeshGenerator();
    const compiled = compileMeshBrush(meshProgram);
    const session = compiled.createSession(generator, 10);
    try {
      const first = session.append(meshSamples(24));
      let replica = applyInkStrokeMeshDelta(
        createEmptyInkStrokeMeshReplica(),
        first,
      );
      // Replaying the consumed revision (or skipping ahead) must throw loudly.
      expect(() => applyInkStrokeMeshDelta(replica, first)).toThrow(InkMeshError);
      const stale = createEmptyInkStrokeMeshReplica();
      const second = session.append(
        meshSamples(48).slice(24).map((sample) => ({ ...sample, tMs: sample.tMs + 200 })),
      );
      expect(() => applyInkStrokeMeshDelta(stale, second)).toThrow(InkMeshError);
      replica = applyInkStrokeMeshDelta(replica, second);
      expect(replica.revision).toBe(2);
    } finally {
      session.dispose();
    }
  });

  it("bakes a deterministic editable fill-path proxy from the final mesh", async () => {
    const generator = await loadInkMeshGenerator();
    const compiled = compileMeshBrush(meshProgram);
    const node = compiled.bake(generator, stroke());
    if (node.kind !== "fill-path") throw new Error("expected fill-path bake");
    expect(node.fillRule).toBe("nonzero");
    expect(node.path.verbs.at(-1)?.v).toBe("Z");
    const bounds = pathBounds(node.path);
    expect(bounds).not.toBeNull();
    expect((bounds?.maxX ?? 0) - (bounds?.minX ?? 0)).toBeGreaterThan(150);
    const a = fnv1a64Hex(canonicalJson(node));
    const b = fnv1a64Hex(canonicalJson(compiled.bake(generator, stroke())));
    expect(a).toBe(b);
  });

  it("bake matches the mesh an incremental session would produce for the same samples", async () => {
    const generator = await loadInkMeshGenerator();
    const compiled = compileMeshBrush(meshProgram);
    const samples = meshSamples(40);
    const session = compiled.createSession(generator, 10);
    try {
      for (let offset = 0; offset < samples.length; offset += 7) {
        session.append(samples.slice(offset, offset + 7));
      }
      session.finish();
      const reference = generator.generateInkStrokeMesh(
        compiled.toInkInputPoints(samples),
        compiled.brushParams(10),
      );
      expectExactMesh(session.snapshot(), reference);
    } finally {
      session.dispose();
    }
  });
});

describe("vector-mesh lane fidelity surfacing", () => {
  it("converts ModeledSampleIR channels into the ink input contract", () => {
    const compiled = compileMeshBrush(meshProgram);
    const [flat, tilted, wrapped] = compiled.toInkInputPoints([
      { x: 1, y: 2, tMs: 0, pressure: 0.5, velocity: 1, altitudeDeg: 90, azimuthDeg: 0 },
      { x: 3, y: 4, tMs: 8, pressure: 1, velocity: 1, altitudeDeg: 0, azimuthDeg: 180 },
      { x: 5, y: 6, tMs: 16, pressure: 0, velocity: 1, altitudeDeg: 45, azimuthDeg: 360 },
    ]);
    expect(flat?.tiltRad).toBeCloseTo(0);
    expect(flat?.orientationRad).toBeCloseTo(0);
    expect(tilted?.tiltRad).toBeCloseTo(Math.PI / 2);
    expect(tilted?.orientationRad).toBeCloseTo(Math.PI);
    expect(wrapped?.tiltRad).toBeCloseTo(Math.PI / 4);
    expect(wrapped?.orientationRad).toBeCloseTo(0);
  });

  it("disables pressureToSize when the program has no pressure size dynamic", () => {
    const compiled = compileMeshBrush(
      brushProgramIRSchema.parse({
        id: "no-dyn",
        name: "no-dyn",
        geometry: { kind: "google-ink-mesh" },
      }),
    );
    expect(compiled.brushParams(8)).toEqual({ size: 8, pressureToSize: null });
  });

  it("surfaces every dimension that cannot reach the mesh engine", () => {
    const compiled = compileMeshBrush(
      brushProgramIRSchema.parse({
        id: "lossy",
        name: "lossy",
        geometry: { kind: "google-ink-mesh" },
        sizeDynamics: [
          { input: "velocity", curve: [0, 1], min: 0, max: 1 },
          { input: "pressure", curve: [0, 0.9, 1], min: 0.2, max: 1 },
          { input: "pressure", curve: [0, 1], min: 0.5, max: 1 },
        ],
        flowDynamics: [{ input: "pressure", curve: [0, 1], min: 0, max: 1 }],
        tip: { kind: "stamp", hardness: 0.5, spacingPct: 10, angleJitterDeg: 12 },
      }),
    );
    expect(compiled.warnings).toEqual(
      [
        "flowDynamics[0].input=pressure: ink mesh has no flow/opacity dynamic; this dimension cannot reach the mesh",
        "sizeDynamics[0].input=velocity: ink pressureToSize only reads pressure; this dimension cannot reach the mesh",
        "sizeDynamics[2]: additional pressure mapping (ink takes one pressureToSize response)",
        "sizeDynamics pressure curve is non-linear; ink pressureToSize keeps only the endpoint multipliers",
        "stabilizer: the mesh lane consumes pre-modeled input (ink stroke modeler); the JS stabilizer is not applied",
        "tip.angleJitterDeg: ink mesh has no jitter dimension",
        "tip.hardness: ink mesh has no hardness falloff dimension",
        "tip.kind=stamp: ink mesh has no stamp/image tip textures; the parametric round tip is used",
      ].sort(),
    );
    // The first pressure mapping still reaches the engine via its endpoints.
    expect(compiled.brushParams(8).pressureToSize).toEqual({
      minMultiplier: 0.2,
      maxMultiplier: 1,
    });
  });

  it("a linear pressure curve compiles without a flattening warning", () => {
    const compiled = compileMeshBrush(
      brushProgramIRSchema.parse({
        id: "linear",
        name: "linear",
        geometry: { kind: "google-ink-mesh" },
        stabilizer: { kind: "none", strength: 0, predictionMs: 0 },
        sizeDynamics: [{ input: "pressure", curve: [0, 0.5, 1], min: 0.3, max: 1 }],
      }),
    );
    expect(compiled.warnings).toEqual([]);
  });
});
