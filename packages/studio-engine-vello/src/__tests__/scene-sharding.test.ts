import {
  UnsupportedSceneFeatureError,
  createEmptyScene,
  createSceneFragmentCache,
  polylineToPath,
  shardSceneByGrid,
  solidPaint,
} from "@toonspectrum/studio-project-model";
import { beforeAll, describe, expect, it } from "vitest";

import { loadVelloNode } from "../node";
import { renderSceneToPixels } from "../render";
import { renderShardedScene, renderSceneToPixelsWithFragments } from "../scene-sharding";

import type { SceneIR, ShardGridOptions } from "@toonspectrum/studio-project-model";

/**
 * Cross-render proof for V12 §3.4–3.5: the full-scene render and the
 * shard-composed render must be byte-identical (δ = 0, not "close"), and the
 * fragment-cached boundary must not change a single pixel either. These tests
 * are the measured evidence behind the disjoint-blit design — integer
 * translation invariance of vello_cpu is *asserted here*, never assumed.
 */

beforeAll(async () => {
  await loadVelloNode();
});

function expectIdenticalPixels(actual: Uint8Array, expected: Uint8Array): void {
  expect(actual.length).toBe(expected.length);
  // Buffer.equals is a memcmp — δ 0 across every RGBA byte.
  expect(Buffer.from(actual).equals(Buffer.from(expected))).toBe(true);
}

function createLcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** Seeded stroke soup crossing every cell boundary (mini large-scene). */
function randomStrokeScene(pathCount: number, size: number, seed: number): SceneIR {
  const rand = createLcg(seed);
  const scene = createEmptyScene(size, size);
  for (let index = 0; index < pathCount; index += 1) {
    const points: Array<[number, number]> = [];
    const originX = rand() * size;
    const originY = rand() * size;
    for (let p = 0; p < 8; p += 1) {
      points.push([
        originX + (p / 7 - 0.5) * size * 0.6,
        originY + Math.sin(p * 1.3 + index) * size * 0.1,
      ]);
    }
    scene.nodes.push({
      id: `rs-${index}`,
      kind: "stroke-path",
      path: polylineToPath(points),
      paint: solidPaint(rand(), rand(), rand()),
      strokeWidth: 0.5 + rand() * 6,
      cap: "round",
      join: "round",
      miterLimit: 4,
      opacity: 0.4 + rand() * 0.6,
      blend: "src-over",
    });
  }
  return scene;
}

/** Blend modes, gradients (incl. sweep), nested clipped group — all straddling cells. */
function mixedFeatureScene(): SceneIR {
  const scene = createEmptyScene(96, 96);
  const square = (x: number, y: number, size: number): ReturnType<typeof polylineToPath> =>
    polylineToPath(
      [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
      ],
      true,
    );
  scene.nodes.push({
    id: "linear-wash",
    kind: "fill-path",
    path: square(8, 8, 80),
    paint: {
      kind: "linear-gradient",
      from: [8, 8],
      to: [88, 88],
      stops: [
        { offset: 0, color: { r: 1, g: 0.2, b: 0.1, a: 1 } },
        { offset: 1, color: { r: 0.1, g: 0.3, b: 1, a: 1 } },
      ],
    },
    opacity: 1,
    blend: "src-over",
    fillRule: "nonzero",
  });
  scene.nodes.push({
    id: "multiply-straddler",
    kind: "fill-path",
    path: square(30, 30, 36),
    paint: solidPaint(0.9, 0.8, 0.2, 0.85),
    opacity: 0.9,
    blend: "multiply",
    fillRule: "nonzero",
  });
  scene.nodes.push({
    id: "screen-stroke",
    kind: "stroke-path",
    path: polylineToPath([
      [4, 48],
      [92, 48],
    ]),
    paint: solidPaint(0.2, 0.9, 0.5),
    strokeWidth: 10,
    cap: "square",
    join: "miter",
    miterLimit: 4,
    opacity: 1,
    blend: "screen",
  });
  scene.nodes.push({
    id: "sweep-disc",
    kind: "fill-path",
    path: square(40, 4, 40),
    paint: {
      kind: "sweep-gradient",
      center: [60, 24],
      startAngleDeg: 0,
      endAngleDeg: 360,
      stops: [
        { offset: 0, color: { r: 1, g: 0, b: 0, a: 1 } },
        { offset: 0.5, color: { r: 0, g: 0, b: 1, a: 1 } },
        { offset: 1, color: { r: 1, g: 0, b: 0, a: 1 } },
      ],
    },
    opacity: 0.8,
    blend: "darken",
    fillRule: "nonzero",
  });
  scene.nodes.push({
    id: "clipped-group",
    kind: "group",
    opacity: 0.7,
    blend: "src-over",
    clip: square(20, 52, 60),
    children: [
      {
        id: "clipped-radial",
        kind: "fill-path",
        path: square(10, 44, 80),
        paint: {
          kind: "radial-gradient",
          center: [50, 78],
          radius: 40,
          stops: [
            { offset: 0, color: { r: 1, g: 1, b: 1, a: 1 } },
            { offset: 1, color: { r: 0.3, g: 0, b: 0.6, a: 1 } },
          ],
        },
        opacity: 1,
        blend: "src-over",
        fillRule: "evenodd",
      },
      {
        id: "clipped-lighten-stroke",
        kind: "stroke-path",
        path: polylineToPath([
          [24, 88],
          [88, 60],
        ]),
        paint: solidPaint(0.9, 0.9, 0.1),
        strokeWidth: 6,
        cap: "round",
        join: "round",
        miterLimit: 4,
        opacity: 1,
        blend: "lighten",
      },
    ],
  });
  return scene;
}

function expectShardParity(scene: SceneIR, grid: ShardGridOptions): void {
  const full = renderSceneToPixels(scene);
  const plan = shardSceneByGrid(scene, grid);
  const sharded = renderShardedScene(plan);
  expectIdenticalPixels(sharded.pixels, full);
  expect(sharded.timings).toHaveLength(grid.cols * grid.rows);
}

describe("renderShardedScene — shard composition is pixel-identical (δ 0)", () => {
  it("matches the single render on the mixed-feature scene (blends, gradients, clip)", () => {
    expectShardParity(mixedFeatureScene(), { cols: 2, rows: 2 });
  });

  it("matches the single render across grid shapes on a seeded stroke soup", () => {
    const scene = randomStrokeScene(300, 128, 0xc0ffee);
    expectShardParity(scene, { cols: 1, rows: 2 });
    expectShardParity(scene, { cols: 2, rows: 2 });
    expectShardParity(scene, { cols: 4, rows: 1 });
    expectShardParity(scene, { cols: 3, rows: 3 }); // uneven 128/3 cells
  });

  it("keeps a single boundary-straddling stroke identical across all four cells", () => {
    const scene = createEmptyScene(64, 64);
    scene.nodes.push({
      id: "cross",
      kind: "stroke-path",
      path: polylineToPath([
        [6, 6],
        [58, 58],
      ]),
      paint: solidPaint(0.1, 0.1, 0.9, 0.7),
      strokeWidth: 9,
      cap: "round",
      join: "round",
      miterLimit: 4,
      opacity: 1,
      blend: "src-over",
    });
    const plan = shardSceneByGrid(scene, { cols: 2, rows: 2 });
    for (const shard of plan.shards) {
      expect(shard.nodeIds).toEqual(["cross"]);
    }
    expectShardParity(scene, { cols: 2, rows: 2 });
  });

  it("renders empty cells as pure background, still byte-identical", () => {
    const scene = createEmptyScene(40, 40);
    scene.background = { r: 0.25, g: 0.5, b: 0.75, a: 1 };
    scene.nodes.push({
      id: "corner",
      kind: "fill-path",
      path: polylineToPath(
        [
          [2, 2],
          [10, 2],
          [10, 10],
          [2, 10],
        ],
        true,
      ),
      paint: solidPaint(1, 0, 0),
      opacity: 1,
      blend: "src-over",
      fillRule: "nonzero",
    });
    const plan = shardSceneByGrid(scene, { cols: 2, rows: 2 });
    const emptyShards = plan.shards.filter((shard) => shard.nodeIds.length === 0);
    expect(emptyShards.length).toBeGreaterThan(0);
    expectShardParity(scene, { cols: 2, rows: 2 });
  });
});

describe("renderSceneToPixelsWithFragments — recording reuse without pixel drift", () => {
  it("is byte-identical to the standard boundary, cold and warm", () => {
    const scene = mixedFeatureScene();
    const cache = createSceneFragmentCache();
    const reference = renderSceneToPixels(scene);
    const cold = renderSceneToPixelsWithFragments(scene, cache);
    expectIdenticalPixels(cold, reference);
    const warm = renderSceneToPixelsWithFragments(scene, cache);
    expectIdenticalPixels(warm, reference);
    expect(cache.metrics()).toMatchObject({
      identityHits: scene.nodes.length,
      misses: scene.nodes.length,
    });
  });

  it("re-encodes only the changed fragment when one stroke moves (§3.5 contract)", () => {
    const scene = mixedFeatureScene();
    const cache = createSceneFragmentCache();
    renderSceneToPixelsWithFragments(scene, cache);
    const edited: SceneIR = {
      ...scene,
      nodes: scene.nodes.map((node) =>
        node.id === "screen-stroke" && node.kind === "stroke-path"
          ? { ...node, strokeWidth: 14 }
          : node,
      ),
    };
    const pixels = renderSceneToPixelsWithFragments(edited, cache);
    expectIdenticalPixels(pixels, renderSceneToPixels(edited));
    // Unchanged subtrees stayed identity hits; exactly one new recording.
    expect(cache.metrics()).toMatchObject({
      identityHits: scene.nodes.length - 1,
      misses: scene.nodes.length + 1,
    });
  });

  it("maps unsupported features (text) to UnsupportedSceneFeatureError, same as the standard lane", () => {
    const scene = createEmptyScene(16, 16);
    scene.nodes.push({
      id: "caption",
      kind: "text",
      x: 2,
      y: 10,
      text: "hi",
      fontSizePx: 8,
      color: { r: 0, g: 0, b: 0, a: 1 },
      fontFamily: "sans-serif",
      opacity: 1,
      blend: "src-over",
    });
    const cache = createSceneFragmentCache();
    expect(() => renderSceneToPixelsWithFragments(scene, cache)).toThrow(
      UnsupportedSceneFeatureError,
    );
  });
});
