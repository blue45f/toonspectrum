import { z } from "zod";

import { colorIRSchema } from "./color";
import { canonicalJson, fnv1a64Hex } from "./digest";
import { pathBounds } from "./path";
import { sceneNodeIRSchema } from "./scene";

import type { PathBounds } from "./path";
import type { SceneIR, SceneNodeIR } from "./scene";

/**
 * Vello Scene Sharding + Scene Fragment/Recording (V12 §3.4–3.5).
 *
 * §3.4: the document is never rewritten as one Scene per frame. This module
 * implements the `ViewportGridCell` shard key from the §3.4 key list as a pure
 * function over SceneIR: the canvas is cut into an exact integer-pixel grid;
 * every cell owns a disjoint pixel region and carries the subset of top-level
 * nodes whose conservative bounds can touch that region. Composition is a
 * region-disjoint blit — no software alpha math — proven pixel-identical to
 * the single render by the cross-render δ=0 tests in studio-engine-vello.
 *
 * Shard scenes deliberately keep the **source coordinate space** (canvas size
 * and node coordinates are untouched; only the node subset shrinks). The
 * measured reason: vello_cpu's f32 geometry/gradient math is *not* bit-stable
 * under integer translation — translating a shard to a local origin produced
 * 1–2 LSB drift at 1 f32 ULP (radial-distance and layer-alpha rounding) in
 * stacked-blend scenes. Identical coordinate bytes + node-subset exclusion is
 * drift-free by construction: an excluded node has zero coverage inside the
 * owned region (conservative bounds + AA margin), so it cannot change a pixel
 * there, and included nodes rasterize from byte-identical geometry.
 *
 * Grid sharding (not z-order run sharding) is the strategy because blit
 * composition sidesteps re-implementing the renderer's blend stack: a z-run
 * shard would need software src-over with the engine's exact rounding, and any
 * top-level multiply/screen node would poison the intermediate. A cell shard
 * instead renders *every* node that can touch its pixels over the same
 * background, so all blend modes keep their true backdrop.
 *
 * §3.5: unchanged subtrees (decorations, tips, icons, balloons) are kept as
 * recordings. Vello's own API does not expose recordings across our wasm
 * boundary, so the RecordedSceneIR compile cache here caches the *encoded
 * render form* of a node subtree keyed by content digest: a reused subtree
 * skips zod normalization + canonical JSON encoding entirely (identity tier)
 * or is deduplicated by digest (structural tier). `encodeSceneToRenderJson`
 * assembles a full render document from cached fragments and is guaranteed to
 * equal `canonicalJson(sceneIRSchema.parse(scene))` byte for byte.
 */

// ---------------------------------------------------------------------------
// §3.4 — viewport-grid scene sharding
// ---------------------------------------------------------------------------

export interface ShardGridOptions {
  /** Number of grid columns; positive integer. */
  cols: number;
  /** Number of grid rows; positive integer. */
  rows: number;
}

/** Integer-pixel cell rectangle in source-scene coordinates. */
export interface ShardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SceneShardIR {
  /** Row-major shard index (row * cols + col). */
  index: number;
  col: number;
  row: number;
  /** The disjoint pixel region this shard owns in the composed image. */
  rect: ShardRect;
  /** Top-level node ids of the source scene included in this shard. */
  nodeIds: string[];
  /**
   * Shard scene in the **source coordinate space**: same canvas size, same
   * background, and the included nodes as untouched references (coordinate
   * bytes identical to the source — see module header for why translation is
   * ruled out). Rendering it and extracting `rect` yields this shard's
   * contribution to the composed image.
   */
  scene: SceneIR;
}

export interface SceneShardingPlanIR {
  strategy: "viewport-grid";
  cols: number;
  rows: number;
  source: { width: number; height: number };
  /** Row-major, length cols × rows; cells tile the source canvas exactly. */
  shards: SceneShardIR[];
}

/**
 * Anti-aliasing safety margin (px) added around every conservative bound so a
 * node whose analytic coverage bleeds into the next pixel row is never dropped
 * from a neighboring cell (absolute rule: no quiet loss).
 */
const AA_MARGIN_PX = 2;

const SQRT2 = Math.SQRT2;

function inflate(bounds: PathBounds, amount: number): PathBounds {
  return {
    minX: bounds.minX - amount,
    minY: bounds.minY - amount,
    maxX: bounds.maxX + amount,
    maxY: bounds.maxY + amount,
  };
}

function unionBounds(a: PathBounds | null, b: PathBounds | null): PathBounds | null {
  if (a === null) return b;
  if (b === null) return a;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

/**
 * Conservative render bounds for shard assignment. `"global"` means the node's
 * extent cannot be bounded from the IR alone (text needs shaping; it would be
 * quiet loss to guess an advance width), so the node joins every shard —
 * over-inclusion costs speed, never pixels. `null` means provably empty.
 */
export function shardNodeBounds(node: SceneNodeIR): PathBounds | "global" | null {
  switch (node.kind) {
    case "fill-path": {
      const bounds = pathBounds(node.path);
      return bounds === null ? null : inflate(bounds, AA_MARGIN_PX);
    }
    case "stroke-path": {
      const bounds = pathBounds(node.path);
      if (bounds === null) return null;
      // Stroke geometry reaches beyond the spine bounds by:
      // - round/butt caps and round/bevel joins: ≤ strokeWidth/2 (offset
      //   points sit at w/2 from the spine; a bevel edge connects two such
      //   points, both within w/2 of the vertex),
      // - square caps: w/2·√2 (cap corner, diagonal),
      // - miter joins: up to w/2·miterLimit (the spike the limit permits).
      const capFactor = node.cap === "square" ? SQRT2 : 1;
      const joinFactor = node.join === "miter" ? Math.max(node.miterLimit, 1) : 1;
      const reach = (node.strokeWidth / 2) * Math.max(capFactor, joinFactor);
      return inflate(bounds, reach + AA_MARGIN_PX);
    }
    case "text":
      return "global";
    case "group": {
      let children: PathBounds | "global" | null = null;
      for (const child of node.children) {
        const childBounds = shardNodeBounds(child);
        if (childBounds === "global") {
          children = "global";
          break;
        }
        children = unionBounds(children, childBounds);
      }
      if (node.clip !== null) {
        // Content cannot paint outside the clip path (+AA edge), so the clip
        // bounds cap the subtree even when a child is unbounded text.
        const clipBounds = pathBounds(node.clip);
        if (clipBounds === null) return null;
        const clipped = inflate(clipBounds, AA_MARGIN_PX);
        if (children === "global" || children === null) {
          return children === null ? null : clipped;
        }
        const minX = Math.max(clipped.minX, children.minX);
        const minY = Math.max(clipped.minY, children.minY);
        const maxX = Math.min(clipped.maxX, children.maxX);
        const maxY = Math.min(clipped.maxY, children.maxY);
        if (minX > maxX || minY > maxY) return null;
        return { minX, minY, maxX, maxY };
      }
      return children;
    }
  }
}

function boundsIntersectRect(bounds: PathBounds, rect: ShardRect): boolean {
  return (
    bounds.maxX >= rect.x &&
    bounds.minX <= rect.x + rect.width &&
    bounds.maxY >= rect.y &&
    bounds.minY <= rect.y + rect.height
  );
}

function assertPositiveInt(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`${label} must be a positive integer, got ${value}`);
  }
}

/**
 * Deterministic viewport-grid sharding (§3.4 `ViewportGridCell` key): cuts the
 * canvas into `cols × rows` integer cells that tile it exactly (cell edge k is
 * ⌊k·size/n⌋, so uneven divisions never gap or overlap) and assigns every
 * top-level node to each cell its conservative bounds intersect. A node that
 * straddles a cell boundary therefore belongs to *every* intersecting shard —
 * each shard only owns its rect at composition, so the duplicate work never
 * duplicates pixels. Node order (z-order) is preserved inside every shard, and
 * node objects are shared by reference (coordinate bytes stay identical; the
 * §3.5 fragment cache also keeps hitting through them). The input scene is
 * never mutated.
 */
export function shardSceneByGrid(
  scene: SceneIR,
  options: ShardGridOptions,
): SceneShardingPlanIR {
  const { cols, rows } = options;
  assertPositiveInt(cols, "cols");
  assertPositiveInt(rows, "rows");
  if (cols > scene.width || rows > scene.height) {
    throw new RangeError(
      `grid ${cols}x${rows} exceeds scene ${scene.width}x${scene.height} — every cell must be at least 1px`,
    );
  }

  const nodeBounds = scene.nodes.map((node) => shardNodeBounds(node));

  const shards: SceneShardIR[] = [];
  for (let row = 0; row < rows; row += 1) {
    const y = Math.floor((row * scene.height) / rows);
    const height = Math.floor(((row + 1) * scene.height) / rows) - y;
    for (let col = 0; col < cols; col += 1) {
      const x = Math.floor((col * scene.width) / cols);
      const width = Math.floor(((col + 1) * scene.width) / cols) - x;
      const rect: ShardRect = { x, y, width, height };
      const nodeIds: string[] = [];
      const nodes: SceneNodeIR[] = [];
      scene.nodes.forEach((node, indexInScene) => {
        const bounds = nodeBounds[indexInScene] ?? null;
        if (bounds === null) return;
        if (bounds !== "global" && !boundsIntersectRect(bounds, rect)) return;
        nodeIds.push(node.id);
        nodes.push(node);
      });
      shards.push({
        index: row * cols + col,
        col,
        row,
        rect,
        nodeIds,
        scene: {
          version: scene.version,
          width: scene.width,
          height: scene.height,
          background: scene.background,
          nodes,
        },
      });
    }
  }

  return {
    strategy: "viewport-grid",
    cols,
    rows,
    source: { width: scene.width, height: scene.height },
    shards,
  };
}

/**
 * Extracts a shard's owned rect from its full-canvas render. Pure byte copy;
 * the result plugs straight into {@link composeShardPixels}.
 */
export function extractShardRectPixels(
  fullPixels: Uint8Array,
  canvasWidth: number,
  canvasHeight: number,
  rect: ShardRect,
): Uint8Array {
  assertPositiveInt(canvasWidth, "canvasWidth");
  assertPositiveInt(canvasHeight, "canvasHeight");
  if (fullPixels.length !== canvasWidth * canvasHeight * BYTES_PER_PIXEL) {
    throw new RangeError(
      `full render has ${fullPixels.length} bytes, expected ${canvasWidth * canvasHeight * BYTES_PER_PIXEL} for ${canvasWidth}x${canvasHeight}`,
    );
  }
  if (
    rect.x < 0 ||
    rect.y < 0 ||
    rect.width < 1 ||
    rect.height < 1 ||
    rect.x + rect.width > canvasWidth ||
    rect.y + rect.height > canvasHeight
  ) {
    throw new RangeError(
      `rect ${JSON.stringify(rect)} is outside the ${canvasWidth}x${canvasHeight} canvas`,
    );
  }
  const rowBytes = rect.width * BYTES_PER_PIXEL;
  const extracted = new Uint8Array(rect.width * rect.height * BYTES_PER_PIXEL);
  for (let rowIndex = 0; rowIndex < rect.height; rowIndex += 1) {
    const sourceStart = ((rect.y + rowIndex) * canvasWidth + rect.x) * BYTES_PER_PIXEL;
    extracted.set(fullPixels.subarray(sourceStart, sourceStart + rowBytes), rowIndex * rowBytes);
  }
  return extracted;
}

const BYTES_PER_PIXEL = 4;

export interface ShardPixels {
  rect: ShardRect;
  /** Straight RGBA8, rect.width × rect.height × 4 bytes. */
  pixels: Uint8Array;
}

/**
 * Region-disjoint blit composition: copies every shard's pixel rows into its
 * rect of the full canvas. Pure byte movement — no blending — so it cannot
 * introduce rounding drift. Rejects (never zero-fills) inputs whose rects do
 * not tile the canvas exactly: overlap, out-of-bounds and under-coverage are
 * all quiet-loss bugs, not fallbacks.
 */
export function composeShardPixels(
  shards: ReadonlyArray<ShardPixels>,
  width: number,
  height: number,
): Uint8Array {
  assertPositiveInt(width, "width");
  assertPositiveInt(height, "height");
  let coveredArea = 0;
  for (const [index, shard] of shards.entries()) {
    const { rect, pixels } = shard;
    if (
      rect.x < 0 ||
      rect.y < 0 ||
      rect.width < 1 ||
      rect.height < 1 ||
      rect.x + rect.width > width ||
      rect.y + rect.height > height
    ) {
      throw new RangeError(
        `shard ${index} rect ${JSON.stringify(rect)} is outside the ${width}x${height} canvas`,
      );
    }
    const expectedBytes = rect.width * rect.height * BYTES_PER_PIXEL;
    if (pixels.length !== expectedBytes) {
      throw new RangeError(
        `shard ${index} has ${pixels.length} bytes, expected ${expectedBytes} for ${rect.width}x${rect.height}`,
      );
    }
    coveredArea += rect.width * rect.height;
  }
  for (let a = 0; a < shards.length; a += 1) {
    const ra = shards[a]?.rect;
    if (ra === undefined) continue;
    for (let b = a + 1; b < shards.length; b += 1) {
      const rb = shards[b]?.rect;
      if (rb === undefined) continue;
      const overlap =
        ra.x < rb.x + rb.width &&
        rb.x < ra.x + ra.width &&
        ra.y < rb.y + rb.height &&
        rb.y < ra.y + ra.height;
      if (overlap) {
        throw new RangeError(`shard rects ${a} and ${b} overlap — composition must be disjoint`);
      }
    }
  }
  if (coveredArea !== width * height) {
    throw new RangeError(
      `shards cover ${coveredArea}px² of ${width * height}px² — under-coverage would quietly drop pixels`,
    );
  }
  const composed = new Uint8Array(width * height * BYTES_PER_PIXEL);
  for (const { rect, pixels } of shards) {
    const rowBytes = rect.width * BYTES_PER_PIXEL;
    for (let rowIndex = 0; rowIndex < rect.height; rowIndex += 1) {
      const sourceStart = rowIndex * rowBytes;
      const targetStart = ((rect.y + rowIndex) * width + rect.x) * BYTES_PER_PIXEL;
      composed.set(pixels.subarray(sourceStart, sourceStart + rowBytes), targetStart);
    }
  }
  return composed;
}

// ---------------------------------------------------------------------------
// §3.5 — Scene Fragment / RecordedSceneIR compile cache
// ---------------------------------------------------------------------------

export interface SceneNodeFragment {
  /** Content digest (fnv1a64 hex of the canonical encoding) — the cache key. */
  digest: string;
  /** Canonical render encoding of the zod-normalized subtree. */
  json: string;
}

export interface SceneFragmentCacheMetrics {
  /** Same subtree object reused — zod + encode + digest all skipped. */
  identityHits: number;
  /** Structurally equal subtree under a new identity — storage deduplicated. */
  digestHits: number;
  misses: number;
  evictions: number;
  entries: number;
}

export interface SceneFragmentCache {
  readonly maxEntries: number;
  /**
   * Returns the recording for a node subtree. Identity tier: a WeakMap from
   * the (immutable) node object resolves straight to a resident fragment.
   * Structural tier: a new object identity is normalized + encoded once, then
   * matched by content digest. Miss: the encoding is admitted with LRU
   * eviction. The returned fragment is frozen — recordings are shared.
   */
  encodeNode(node: SceneNodeIR): SceneNodeFragment;
  metrics(): SceneFragmentCacheMetrics;
  /** Drops resident fragments; cumulative counters remain. */
  clear(): void;
}

export interface SceneFragmentCacheOptions {
  /** Maximum resident fragments before LRU eviction. Default 1024. */
  maxEntries?: number;
}

const DEFAULT_MAX_FRAGMENTS = 1024;

/** Digest key of a subtree's recording: fnv1a64 over its canonical encoding. */
export function sceneNodeFragmentDigest(node: SceneNodeIR): string {
  return fnv1a64Hex(canonicalJson(sceneNodeIRSchema.parse(node)));
}

export function createSceneFragmentCache(
  options: SceneFragmentCacheOptions = {},
): SceneFragmentCache {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_FRAGMENTS;
  assertPositiveInt(maxEntries, "maxEntries");

  // Map iteration order is insertion order; re-inserting on hit makes the
  // first key least-recently-used (same LRU idiom as the text shape cache).
  const fragmentsByDigest = new Map<string, SceneNodeFragment>();
  // Identity accelerator: node object → digest. WeakMap entries die with the
  // node objects, so an evicted digest simply falls through to re-encode.
  const digestByNode = new WeakMap<SceneNodeIR, string>();
  let identityHits = 0;
  let digestHits = 0;
  let misses = 0;
  let evictions = 0;

  const touch = (digest: string, fragment: SceneNodeFragment): void => {
    fragmentsByDigest.delete(digest);
    fragmentsByDigest.set(digest, fragment);
  };

  return {
    maxEntries,
    encodeNode(node: SceneNodeIR): SceneNodeFragment {
      const knownDigest = digestByNode.get(node);
      if (knownDigest !== undefined) {
        const resident = fragmentsByDigest.get(knownDigest);
        if (resident !== undefined) {
          identityHits += 1;
          touch(knownDigest, resident);
          return resident;
        }
      }
      const json = canonicalJson(sceneNodeIRSchema.parse(node));
      const digest = fnv1a64Hex(json);
      digestByNode.set(node, digest);
      const resident = fragmentsByDigest.get(digest);
      if (resident !== undefined) {
        digestHits += 1;
        touch(digest, resident);
        return resident;
      }
      misses += 1;
      const fragment = Object.freeze({ digest, json });
      fragmentsByDigest.set(digest, fragment);
      while (fragmentsByDigest.size > maxEntries) {
        const oldestKey = fragmentsByDigest.keys().next().value;
        if (oldestKey === undefined) break;
        fragmentsByDigest.delete(oldestKey);
        evictions += 1;
      }
      return fragment;
    },
    metrics(): SceneFragmentCacheMetrics {
      return {
        identityHits,
        digestHits,
        misses,
        evictions,
        entries: fragmentsByDigest.size,
      };
    },
    clear(): void {
      fragmentsByDigest.clear();
    },
  };
}

const sceneShellSchema = z.object({
  version: z.literal(11),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  background: colorIRSchema,
});

/**
 * Assembles the canonical render document from per-node recordings: byte-equal
 * to `canonicalJson(sceneIRSchema.parse(scene))` (asserted by tests), but
 * unchanged subtrees skip zod normalization and re-encoding via the fragment
 * cache. This is the §3.5 contract — one changed stroke re-encodes one
 * fragment, not the whole scene.
 */
export function encodeSceneToRenderJson(
  scene: SceneIR,
  cache: SceneFragmentCache,
): string {
  const shell = sceneShellSchema.parse({
    version: scene.version,
    width: scene.width,
    height: scene.height,
    background: scene.background,
  });
  const nodes = scene.nodes.map((node) => cache.encodeNode(node).json);
  // Keys in canonical (sorted) order: background, height, nodes, version, width.
  return (
    `{"background":${canonicalJson(shell.background)},` +
    `"height":${shell.height},` +
    `"nodes":[${nodes.join(",")}],` +
    `"version":${shell.version},` +
    `"width":${shell.width}}`
  );
}
