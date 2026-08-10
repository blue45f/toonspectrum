import { describe, expect, it } from "vitest";

import { solidPaint } from "../ir/color";
import { canonicalJson, fnv1a64Hex } from "../ir/digest";
import { polylineToPath } from "../ir/path";
import { createEmptyScene, sceneIRSchema } from "../ir/scene";
import {
  composeShardPixels,
  createSceneFragmentCache,
  encodeSceneToRenderJson,
  extractShardRectPixels,
  sceneNodeFragmentDigest,
  shardNodeBounds,
  shardSceneByGrid,
} from "../ir/scene-sharding";

import type { SceneIR, SceneNodeIR } from "../ir/scene";
import type { ShardPixels } from "../ir/scene-sharding";

function fillSquare(id: string, x: number, y: number, size: number): SceneNodeIR {
  return {
    id,
    kind: "fill-path",
    path: polylineToPath(
      [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
      ],
      true,
    ),
    paint: solidPaint(1, 0, 0),
    opacity: 1,
    blend: "src-over",
    fillRule: "nonzero",
  };
}

function testScene(): SceneIR {
  const scene = createEmptyScene(100, 80);
  scene.nodes.push(fillSquare("inside-cell-0", 4, 4, 10));
  scene.nodes.push(fillSquare("straddler", 40, 30, 20));
  scene.nodes.push({
    id: "thick-stroke",
    kind: "stroke-path",
    path: polylineToPath([
      [10, 70],
      [30, 70],
    ]),
    paint: solidPaint(0, 0, 1),
    strokeWidth: 24,
    cap: "round",
    join: "round",
    miterLimit: 4,
    opacity: 1,
    blend: "src-over",
  });
  return scene;
}

describe("shardSceneByGrid (V12 §3.4 viewport-grid)", () => {
  it("is deterministic: identical scenes produce identical plans", () => {
    const planA = shardSceneByGrid(testScene(), { cols: 2, rows: 2 });
    const planB = shardSceneByGrid(testScene(), { cols: 2, rows: 2 });
    expect(planA).toEqual(planB);
    expect(fnv1a64Hex(canonicalJson(planA))).toBe(fnv1a64Hex(canonicalJson(planB)));
  });

  it("tiles the canvas exactly with disjoint integer cells, uneven sizes included", () => {
    // 100x80 into 3x3: columns 33/33/34, rows 26/27/27 — no gap, no overlap.
    const plan = shardSceneByGrid(testScene(), { cols: 3, rows: 3 });
    expect(plan.shards).toHaveLength(9);
    let area = 0;
    for (const shard of plan.shards) {
      expect(Number.isInteger(shard.rect.x)).toBe(true);
      expect(Number.isInteger(shard.rect.y)).toBe(true);
      expect(shard.rect.width).toBeGreaterThan(0);
      expect(shard.rect.height).toBeGreaterThan(0);
      // Shard scenes keep the source canvas + coordinate space (δ0 contract).
      expect(shard.scene.width).toBe(100);
      expect(shard.scene.height).toBe(80);
      area += shard.rect.width * shard.rect.height;
    }
    expect(area).toBe(100 * 80);
  });

  it("assigns an interior node to exactly one shard", () => {
    const plan = shardSceneByGrid(testScene(), { cols: 2, rows: 2 });
    const owners = plan.shards.filter((shard) => shard.nodeIds.includes("inside-cell-0"));
    expect(owners).toHaveLength(1);
    expect(owners[0]?.index).toBe(0);
  });

  it("assigns a boundary-straddling node to every intersecting shard by reference", () => {
    const scene = testScene();
    const plan = shardSceneByGrid(scene, { cols: 2, rows: 2 });
    // The 40..60 × 30..50 square crosses both the x=50 and y=40 cut lines.
    const owners = plan.shards.filter((shard) => shard.nodeIds.includes("straddler"));
    expect(owners.map((shard) => shard.index)).toEqual([0, 1, 2, 3]);
    for (const shard of owners) {
      const node = shard.scene.nodes.find((candidate) => candidate.id === "straddler");
      // Same object, same coordinate bytes — no translation, no copy (the
      // §3.5 fragment cache keeps identity-hitting through shard scenes).
      expect(node).toBe(scene.nodes[1]);
    }
  });

  it("inflates stroke bounds by cap/join-aware reach so fat strokes are never dropped", () => {
    const plan = shardSceneByGrid(testScene(), { cols: 2, rows: 2 });
    // Spine 10..30 × y=70, round cap/join, strokeWidth 24 → reach 12 (+2 AA):
    // bounds -4..44 × 56..84 stay inside the bottom-left cell.
    const owners = plan.shards.filter((shard) => shard.nodeIds.includes("thick-stroke"));
    expect(owners.map((shard) => shard.index)).toEqual([2]);
    const scene = testScene();
    const stroke = scene.nodes[2];
    expect(stroke?.kind).toBe("stroke-path");
    if (stroke?.kind !== "stroke-path") return;
    const round = shardNodeBounds(stroke);
    expect(round).toEqual({ minX: -4, minY: 56, maxX: 44, maxY: 84 });
    // The same spine with a miter join must widen by w/2·miterLimit = 48.
    const mitered = shardNodeBounds({ ...stroke, join: "miter" });
    expect(mitered).toEqual({ minX: -40, minY: 20, maxX: 80, maxY: 120 });
    // A square cap reaches w/2·√2 ≈ 16.97 diagonally.
    const squareCap = shardNodeBounds({ ...stroke, cap: "square" });
    expect(squareCap).not.toBe("global");
    if (squareCap === "global" || squareCap === null) return;
    expect(squareCap.minX).toBeCloseTo(10 - 12 * Math.SQRT2 - 2, 10);
  });

  it("treats text nodes as globally bounded (joins every shard, no guessed advance)", () => {
    const scene = createEmptyScene(64, 64);
    scene.nodes.push({
      id: "caption",
      kind: "text",
      x: 4,
      y: 12,
      text: "onomatopoeia",
      fontSizePx: 10,
      color: { r: 0, g: 0, b: 0, a: 1 },
      fontFamily: "sans-serif",
      opacity: 1,
      blend: "src-over",
    });
    expect(shardNodeBounds(scene.nodes[0] as SceneNodeIR)).toBe("global");
    const plan = shardSceneByGrid(scene, { cols: 2, rows: 2 });
    for (const shard of plan.shards) {
      expect(shard.nodeIds).toEqual(["caption"]);
    }
  });

  it("caps a clipped group at its clip bounds even when children are text", () => {
    const scene = createEmptyScene(100, 100);
    scene.nodes.push({
      id: "clipped-balloon",
      kind: "group",
      opacity: 1,
      blend: "src-over",
      clip: polylineToPath(
        [
          [10, 10],
          [30, 10],
          [30, 30],
          [10, 30],
        ],
        true,
      ),
      children: [
        {
          id: "balloon-text",
          kind: "text",
          x: 12,
          y: 20,
          text: "hi",
          fontSizePx: 8,
          color: { r: 0, g: 0, b: 0, a: 1 },
          fontFamily: "sans-serif",
          opacity: 1,
          blend: "src-over",
        },
      ],
    });
    const plan = shardSceneByGrid(scene, { cols: 2, rows: 2 });
    const owners = plan.shards.filter((shard) => shard.nodeIds.includes("clipped-balloon"));
    // Clip rect 10..30 × 10..30 (+2 AA) stays inside the top-left 50×50 cell.
    expect(owners.map((shard) => shard.index)).toEqual([0]);
    // The group travels into the shard scene as the same object reference.
    expect(owners[0]?.scene.nodes[0]).toBe(scene.nodes[0]);
  });

  it("does not mutate the input scene and keeps shard scenes schema-valid", () => {
    const scene = testScene();
    const before = canonicalJson(scene);
    const plan = shardSceneByGrid(scene, { cols: 2, rows: 2 });
    expect(canonicalJson(scene)).toBe(before);
    for (const shard of plan.shards) {
      expect(() => sceneIRSchema.parse(shard.scene)).not.toThrow();
    }
  });

  it("rejects invalid grids instead of degrading", () => {
    const scene = testScene();
    expect(() => shardSceneByGrid(scene, { cols: 0, rows: 2 })).toThrow(RangeError);
    expect(() => shardSceneByGrid(scene, { cols: 2, rows: 2.5 })).toThrow(RangeError);
    expect(() => shardSceneByGrid(scene, { cols: 101, rows: 1 })).toThrow(RangeError);
  });
});

describe("composeShardPixels", () => {
  function filledShard(
    x: number,
    y: number,
    width: number,
    height: number,
    value: number,
  ): ShardPixels {
    return {
      rect: { x, y, width, height },
      pixels: new Uint8Array(width * height * 4).fill(value),
    };
  }

  it("blits disjoint shard rows into the right canvas offsets", () => {
    const composed = composeShardPixels(
      [filledShard(0, 0, 2, 2, 10), filledShard(2, 0, 2, 2, 20), filledShard(0, 2, 4, 2, 30)],
      4,
      4,
    );
    // Row 0: two 10-pixels then two 20-pixels.
    expect([...composed.slice(0, 8)]).toEqual([10, 10, 10, 10, 10, 10, 10, 10]);
    expect([...composed.slice(8, 16)]).toEqual([20, 20, 20, 20, 20, 20, 20, 20]);
    // Row 2 belongs to the bottom shard.
    expect([...composed.slice(2 * 4 * 4, 2 * 4 * 4 + 4)]).toEqual([30, 30, 30, 30]);
  });

  it("extractShardRectPixels pulls the owned region out of a full-canvas render", () => {
    // 4x4 canvas whose pixel (x,y) has value y*4+x in every channel.
    const full = new Uint8Array(4 * 4 * 4);
    for (let index = 0; index < 16; index += 1) full.fill(index, index * 4, index * 4 + 4);
    const region = extractShardRectPixels(full, 4, 4, { x: 2, y: 1, width: 2, height: 2 });
    expect([...region]).toEqual([6, 6, 6, 6, 7, 7, 7, 7, 10, 10, 10, 10, 11, 11, 11, 11]);
    expect(() =>
      extractShardRectPixels(full, 4, 4, { x: 3, y: 3, width: 2, height: 2 }),
    ).toThrow(RangeError);
    expect(() =>
      extractShardRectPixels(new Uint8Array(3), 4, 4, { x: 0, y: 0, width: 1, height: 1 }),
    ).toThrow(RangeError);
  });

  it("rejects wrong buffer sizes, overlap and under-coverage (no quiet zero-fill)", () => {
    const good = [filledShard(0, 0, 2, 2, 1), filledShard(2, 0, 2, 2, 2), filledShard(0, 2, 4, 2, 3)];
    expect(() => composeShardPixels(good, 4, 4)).not.toThrow();
    const shortBuffer = { rect: { x: 0, y: 0, width: 2, height: 2 }, pixels: new Uint8Array(3) };
    expect(() => composeShardPixels([shortBuffer], 4, 4)).toThrow(RangeError);
    expect(() =>
      composeShardPixels([filledShard(0, 0, 4, 4, 1), filledShard(2, 2, 2, 2, 2)], 4, 4),
    ).toThrow(/overlap/);
    expect(() => composeShardPixels([filledShard(0, 0, 2, 4, 1)], 4, 4)).toThrow(/cover/);
    expect(() => composeShardPixels([filledShard(2, 2, 4, 4, 1)], 4, 4)).toThrow(/outside/);
  });
});

describe("scene fragment cache (V12 §3.5 RecordedSceneIR)", () => {
  it("keys fragments by content digest equal to the canonical-encoding fnv1a64", () => {
    const node = fillSquare("frag", 1, 1, 4);
    const cache = createSceneFragmentCache();
    const fragment = cache.encodeNode(node);
    expect(fragment.digest).toBe(sceneNodeFragmentDigest(node));
    expect(fragment.digest).toBe(fnv1a64Hex(fragment.json));
    expect(JSON.parse(fragment.json)).toEqual(node);
  });

  it("identity reuse skips re-encoding (identityHits) and returns the same recording", () => {
    const node = fillSquare("frag", 1, 1, 4);
    const cache = createSceneFragmentCache();
    const first = cache.encodeNode(node);
    const second = cache.encodeNode(node);
    expect(second).toBe(first);
    expect(cache.metrics()).toMatchObject({ identityHits: 1, digestHits: 0, misses: 1 });
  });

  it("structurally equal nodes under new identities dedupe via the digest tier", () => {
    const cache = createSceneFragmentCache();
    const first = cache.encodeNode(fillSquare("frag", 1, 1, 4));
    const second = cache.encodeNode(fillSquare("frag", 1, 1, 4));
    expect(second).toBe(first);
    expect(cache.metrics()).toMatchObject({ identityHits: 0, digestHits: 1, misses: 1 });
  });

  it("invalidates on content change: a different subtree is a miss with a new digest", () => {
    const cache = createSceneFragmentCache();
    const original = cache.encodeNode(fillSquare("frag", 1, 1, 4));
    const moved = cache.encodeNode(fillSquare("frag", 2, 1, 4));
    expect(moved.digest).not.toBe(original.digest);
    expect(cache.metrics()).toMatchObject({ misses: 2, identityHits: 0, digestHits: 0 });
  });

  it("evicts least-recently-used fragments beyond maxEntries", () => {
    const cache = createSceneFragmentCache({ maxEntries: 2 });
    const a = fillSquare("a", 0, 0, 1);
    cache.encodeNode(a);
    cache.encodeNode(fillSquare("b", 1, 0, 1));
    cache.encodeNode(fillSquare("c", 2, 0, 1));
    expect(cache.metrics()).toMatchObject({ entries: 2, evictions: 1 });
    // "a" was evicted — re-encoding it is a miss again (not an identity hit).
    cache.encodeNode(a);
    expect(cache.metrics()).toMatchObject({ misses: 4, identityHits: 0 });
  });

  it("encodeSceneToRenderJson is byte-equal to the canonical full-scene encoding", () => {
    const scene = testScene();
    const cache = createSceneFragmentCache();
    const assembled = encodeSceneToRenderJson(scene, cache);
    expect(assembled).toBe(canonicalJson(sceneIRSchema.parse(scene)));
    // Warm pass: every top-level subtree is an identity hit, output unchanged.
    const warm = encodeSceneToRenderJson(scene, cache);
    expect(warm).toBe(assembled);
    expect(cache.metrics()).toMatchObject({
      identityHits: scene.nodes.length,
      misses: scene.nodes.length,
    });
  });

  it("materializes schema defaults inside fragments (normalization parity)", () => {
    const bare = {
      id: "defaulted",
      kind: "fill-path",
      path: polylineToPath(
        [
          [0, 0],
          [4, 0],
          [4, 4],
        ],
        true,
      ),
      paint: solidPaint(0, 1, 0),
    } as unknown as SceneNodeIR;
    const cache = createSceneFragmentCache();
    const fragment = cache.encodeNode(bare);
    const parsed = JSON.parse(fragment.json) as Record<string, unknown>;
    expect(parsed.opacity).toBe(1);
    expect(parsed.blend).toBe("src-over");
    expect(parsed.fillRule).toBe("nonzero");
  });
});
