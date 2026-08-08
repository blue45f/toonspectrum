
import { renderSceneToPixels } from "@toonspectrum/studio-engine-vello";
import { loadVelloNode } from "@toonspectrum/studio-engine-vello/node";
import { sceneIRSchema, type SceneIR } from "@toonspectrum/studio-project-model";
import { beforeAll, describe, expect, it } from "vitest";

import {
  inkMeshBoundaryLoops,
  loadInkMeshGenerator,
  type InkMeshGenerator,
  type InkMeshInputPoint,
} from "../../packages/studio-brush-platform/src/ink-mesh";

/**
 * ADR-0011 lane 3 / V12 §11.3 smoke: the google/ink stroke mesh, approximated
 * as PathIR boundary outlines, renders through the Vello editing-proxy lane.
 *
 * §11.3 explicitly forbids per-frame mesh->Vello tessellation in production
 * (the mesh body belongs to the ink render pass); this test exercises the
 * *editing proxy* role only — outline approximation feeding the same
 * SceneIR/Vello surface used by the Kurbo centerline lane — and asserts ink
 * coverage plus determinism, not visual parity.
 */

const SIZE = 128;

function strokePoints(): InkMeshInputPoint[] {
  const points: InkMeshInputPoint[] = [];
  const count = 120;
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    points.push({
      x: 12 + 104 * t,
      y: 64 + 28 * Math.sin(t * Math.PI * 2),
      tMs: t * 600,
      pressure: 0.25 + 0.5 * Math.sin(t * Math.PI),
    });
  }
  return points;
}

let generator: InkMeshGenerator;

beforeAll(async () => {
  [generator] = await Promise.all([loadInkMeshGenerator(), loadVelloNode()]);
});

describe("ink mesh -> PathIR outline -> vello smoke (V12 §11.3 editing proxy)", () => {
  it("renders the mesh outline with non-trivial deterministic ink coverage", () => {
    const mesh = generator.generateInkStrokeMesh(strokePoints(), { size: 8 });
    expect(mesh.triangleCount).toBeGreaterThan(0);

    const loops = inkMeshBoundaryLoops(mesh);
    expect(loops.length).toBeGreaterThan(0);

    const scene: SceneIR = sceneIRSchema.parse({
      version: 11,
      width: SIZE,
      height: SIZE,
      background: { r: 1, g: 1, b: 1, a: 1 },
      nodes: loops.map((loop, index) => ({
        id: `ink-mesh-outline-${index}`,
        kind: "fill-path",
        path: {
          verbs: [
            ...loop.map(([x, y], vertexIndex) =>
              vertexIndex === 0
                ? ({ v: "M", x, y } as const)
                : ({ v: "L", x, y } as const),
            ),
            { v: "Z" } as const,
          ],
        },
        paint: { kind: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
        fillRule: "nonzero",
        opacity: 1,
        blend: "src-over",
      })),
    });

    const pixels = renderSceneToPixels(scene);
    expect(pixels).toHaveLength(SIZE * SIZE * 4);

    let inked = 0;
    for (let i = 0; i < SIZE * SIZE; i += 1) {
      const r = pixels[i * 4] ?? 255;
      if (r < 128) inked += 1;
    }
    // The 8px-wide, ~104px-long wavy stroke must ink a meaningful area of
    // the 128x128 canvas (well above noise, well below full coverage).
    expect(inked).toBeGreaterThan(300);
    expect(inked).toBeLessThan((SIZE * SIZE) / 2);

    // Deterministic replay: same inputs, same bytes.
    const again = renderSceneToPixels(scene);
    expect(Buffer.from(again).equals(Buffer.from(pixels))).toBe(true);
  });
});
