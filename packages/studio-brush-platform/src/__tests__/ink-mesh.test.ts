import { readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

import {
  INK_MESH_COMMIT,
  InkMeshError,
  inkMeshBoundaryLoops,
  loadInkMeshGenerator,
  type InkMeshGenerator,
  type InkMeshInputPoint,
  type InkStrokeMesh,
} from "../ink-mesh";
import { loadInkStrokeModeler } from "../ink-modeler";

/**
 * ADR-0011 lane 3 / V12 §11.2 mesh-lane contracts + measured probe.
 *
 * Contract scope: loader idempotence, determinism, triangle validity
 * (positive area, in-range indices), pressure -> width response, boundary
 * loop extraction (the §11.3 editing-proxy surface), stroke-modeler lane
 * chaining, error mapping. The probe (INK_MESH_POC=1) records the measured
 * 240-point generation numbers into
 * tests/benchmarks/results/ink-mesh-attempt.json WITHOUT a verdict — gate
 * decisions belong to the blind lab (ADR-0009).
 */

const POC_ENABLED = process.env.INK_MESH_POC === "1";

// ---------------------------------------------------------------------------
// Deterministic synthetic strokes

/** Wavy 240-point stroke with a sine pressure ramp (seedless, closed-form). */
function wavyStroke(count = 240): InkMeshInputPoint[] {
  const points: InkMeshInputPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    points.push({
      x: 10 + 180 * t + 8 * Math.sin(t * Math.PI * 4),
      y: 50 + 30 * Math.sin(t * Math.PI * 2),
      tMs: t * 800,
      pressure: 0.2 + 0.6 * Math.sin(t * Math.PI),
    });
  }
  return points;
}

/** Straight horizontal stroke with constant pressure. */
function straightStroke(pressure: number, count = 64): InkMeshInputPoint[] {
  const points: InkMeshInputPoint[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    points.push({ x: 20 + 160 * t, y: 60, tMs: t * 400, pressure });
  }
  return points;
}

function triangleAreas(mesh: InkStrokeMesh): number[] {
  const areas: number[] = [];
  for (let i = 0; i < mesh.triangleCount; i += 1) {
    const a = mesh.triangles[i * 3] ?? 0;
    const b = mesh.triangles[i * 3 + 1] ?? 0;
    const c = mesh.triangles[i * 3 + 2] ?? 0;
    const ax = mesh.vertices[a * 2] ?? 0;
    const ay = mesh.vertices[a * 2 + 1] ?? 0;
    const bx = mesh.vertices[b * 2] ?? 0;
    const by = mesh.vertices[b * 2 + 1] ?? 0;
    const cx = mesh.vertices[c * 2] ?? 0;
    const cy = mesh.vertices[c * 2 + 1] ?? 0;
    areas.push(Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2);
  }
  return areas;
}

/**
 * Stroke width proxy for a straight horizontal stroke: full mesh bounding-box
 * height. (A mid-band scan is unreliable — the extruder simplifies constant
 * pressure straight runs down to end-cap vertices only.)
 */
function midbandWidth(mesh: InkStrokeMesh): number {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (let i = 0; i < mesh.vertexCount; i += 1) {
    const y = mesh.vertices[i * 2 + 1] ?? 0;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  return maxY - minY;
}

let generator: InkMeshGenerator;

beforeAll(async () => {
  generator = await loadInkMeshGenerator();
});

describe("ink-mesh wasm boundary (ADR-0011 lane 3, V12 §11.2)", () => {
  it("pins the upstream commit in the boundary contract", () => {
    expect(INK_MESH_COMMIT).toBe("1d0daba661f3035f42f3649b8e6a0061b47aa759");
  });

  it("loader is idempotent (same generator surface on repeat loads)", async () => {
    const again = await loadInkMeshGenerator();
    const a = again.generateInkStrokeMesh(straightStroke(0.5));
    const b = generator.generateInkStrokeMesh(straightStroke(0.5));
    expect(a.vertexCount).toBe(b.vertexCount);
    expect(a.triangleCount).toBe(b.triangleCount);
  });

  it("generates a non-empty triangle mesh for a 240-point stroke", () => {
    const mesh = generator.generateInkStrokeMesh(wavyStroke());
    expect(mesh.triangleCount).toBeGreaterThan(0);
    expect(mesh.vertexCount).toBeGreaterThan(2);
    expect(mesh.vertices).toHaveLength(mesh.vertexCount * 2);
    expect(mesh.texCoords).toHaveLength(mesh.vertexCount * 2);
    expect(mesh.triangles).toHaveLength(mesh.triangleCount * 3);
  });

  it("is deterministic: identical inputs produce byte-identical meshes", () => {
    const a = generator.generateInkStrokeMesh(wavyStroke());
    const b = generator.generateInkStrokeMesh(wavyStroke());
    expect(Array.from(a.vertices)).toEqual(Array.from(b.vertices));
    expect(Array.from(a.triangles)).toEqual(Array.from(b.triangles));
    expect(Array.from(a.texCoords)).toEqual(Array.from(b.texCoords));
  });

  it("produces valid triangles: indices in range, strictly positive area", () => {
    const mesh = generator.generateInkStrokeMesh(wavyStroke());
    for (const index of mesh.triangles) {
      expect(index).toBeLessThan(mesh.vertexCount);
    }
    const areas = triangleAreas(mesh);
    expect(areas.length).toBe(mesh.triangleCount);
    for (const area of areas) {
      expect(area).toBeGreaterThan(0);
    }
    // The mesh covers a sane amount of the stroke: total area is at least
    // the stroke length (~190px) times a fraction of the brush size.
    const total = areas.reduce((sum, area) => sum + area, 0);
    expect(total).toBeGreaterThan(190 * 2);
  });

  it("responds to pressure: heavier pressure widens the stroke", () => {
    const light = generator.generateInkStrokeMesh(straightStroke(0.1), {
      size: 10,
    });
    const heavy = generator.generateInkStrokeMesh(straightStroke(0.9), {
      size: 10,
    });
    const lightWidth = midbandWidth(light);
    const heavyWidth = midbandWidth(heavy);
    expect(lightWidth).toBeGreaterThan(0);
    // Default pressureToSize multiplier range is [0.3, 1.5]: 0.9 pressure
    // must be visibly wider than 0.1 pressure (well beyond float noise).
    expect(heavyWidth).toBeGreaterThan(lightWidth * 1.5);
    // Disabling pressure response collapses the difference.
    const flat = generator.generateInkStrokeMesh(straightStroke(0.9), {
      size: 10,
      pressureToSize: null,
    });
    expect(midbandWidth(flat)).toBeCloseTo(
      midbandWidth(
        generator.generateInkStrokeMesh(straightStroke(0.1), {
          size: 10,
          pressureToSize: null,
        }),
      ),
      3,
    );
  });

  it("extracts closed boundary loops (§11.3 editing-proxy surface)", () => {
    const mesh = generator.generateInkStrokeMesh(wavyStroke());
    const loops = inkMeshBoundaryLoops(mesh);
    expect(loops.length).toBeGreaterThan(0);
    const outline = loops[0];
    expect(outline).toBeDefined();
    expect(outline?.length).toBeGreaterThanOrEqual(3);
    // Every loop vertex is a finite coordinate inside the stroke's bounds.
    for (const loop of loops) {
      for (const [x, y] of loop) {
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        expect(x).toBeGreaterThan(-20);
        expect(x).toBeLessThan(220);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(120);
      }
    }
  });

  it("chains from the ink-modeler lane output without re-smoothing errors", async () => {
    const modeler = await loadInkStrokeModeler();
    const raw = Array.from({ length: 24 }, (_, i) => ({
      x: 12 + i * 6,
      y: 40 + Math.sin(i / 3) * 10,
      tMs: i * 8,
      pressure: 0.5,
    }));
    const modeled = modeler.modelStroke(raw);
    expect(modeled.length).toBeGreaterThan(0);
    const mesh = generator.generateInkStrokeMesh(
      modeled.map((point) => ({
        x: point.x,
        y: point.y,
        tMs: point.tMs,
        pressure: point.pressure,
      })),
    );
    expect(mesh.triangleCount).toBeGreaterThan(0);
    for (const area of triangleAreas(mesh)) {
      expect(area).toBeGreaterThan(0);
    }
  });

  it("maps invalid input to InkMeshError with the absl status code", () => {
    expect(() => generator.generateInkStrokeMesh([])).toThrow(InkMeshError);
    expect(() =>
      generator.generateInkStrokeMesh([
        { x: 0, y: 0, tMs: 10, pressure: 0.5 },
        { x: 1, y: 1, tMs: 5, pressure: 0.5 },
      ]),
    ).toThrow(/non-decreasing tMs/);
    expect(() =>
      generator.generateInkStrokeMesh(straightStroke(0.5), { size: -1 }),
    ).toThrow(InkMeshError);
  });
});

// ---------------------------------------------------------------------------
// Measured probe (INK_MESH_POC=1): records numbers, no verdict.

describe.runIf(POC_ENABLED)("ink-mesh measured probe", () => {
  it("records 240-point mesh generation numbers", () => {
    const stroke = wavyStroke(240);
    // Warmup, then timed runs.
    generator.generateInkStrokeMesh(stroke);
    const runs = 50;
    const durationsMs: number[] = [];
    let mesh = generator.generateInkStrokeMesh(stroke);
    for (let i = 0; i < runs; i += 1) {
      const start = performance.now();
      mesh = generator.generateInkStrokeMesh(stroke);
      durationsMs.push(performance.now() - start);
    }
    durationsMs.sort((a, b) => a - b);
    const p50 = durationsMs[Math.floor(runs * 0.5)] ?? 0;
    const p95 = durationsMs[Math.floor(runs * 0.95)] ?? 0;
    const wasmBytes = statSync(
      fileURLToPath(new URL("../ink-mesh/ink_mesh.wasm", import.meta.url)),
    ).size;
    const outPath = fileURLToPath(
      new URL(
        "../../../../tests/benchmarks/results/ink-mesh-attempt.json",
        import.meta.url,
      ),
    );
    // Preserve the hand-recorded buildAttempt block (session-time facts that
    // the test cannot re-measure); regenerate only the runtime section.
    let existing: Record<string, unknown> = {};
    try {
      existing = JSON.parse(readFileSync(outPath, "utf8")) as Record<
        string,
        unknown
      >;
    } catch {
      // First run: no existing file.
    }
    const report = {
      ...existing,
      measuredRuntime: {
        generatedAtUtc: new Date().toISOString(),
        harness:
          "packages/studio-brush-platform/src/__tests__/ink-mesh.test.ts (INK_MESH_POC=1)",
        upstreamCommit: INK_MESH_COMMIT,
        wasmBytes,
        stroke: { points: 240, spanPx: 180, durationMs: 800 },
        mesh: {
          vertexCount: mesh.vertexCount,
          triangleCount: mesh.triangleCount,
        },
        generationMs: { p50, p95, runs },
      },
    };
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    expect(mesh.triangleCount).toBeGreaterThan(0);
  });
});
