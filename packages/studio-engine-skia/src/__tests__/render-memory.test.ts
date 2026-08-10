import { beforeAll, describe, expect, it } from "vitest";

import { loadCanvasKitNode } from "../node/index";
import { renderSceneToPixels, renderSceneToPng } from "../render";

import type { ColorIR, SceneIR, SceneNodeIR } from "@toonspectrum/studio-project-model";
import type { CanvasKit } from "canvaskit-wasm";

/**
 * Regression gate for the 2026-08-08 soak failure: MakeSurface CPU surfaces
 * malloc their pixel buffer on the JS side (surface.Te), and delete() alone
 * leaked width*height*4 bytes per render until CanvasKit exhausted its heap
 * at soak cycle 32,735 (RSS 223.7MB → 1,851.8MB). Only dispose() frees the
 * buffer. The emscripten heap only grows once free headroom is exhausted, so
 * the loop count is sized dynamically: leaking one 64KiB surface per render
 * for (heapBytes + 64MiB) worth of renders must force the heap to grow no
 * matter how much headroom the initial heap shipped with, while a leak-free
 * adapter reuses the freed block and the heap stays flat.
 */

const SIZE = 128;
const SURFACE_BYTES = SIZE * SIZE * 4;
const WARMUP = 50;
const HEAP_GROWTH_BOUND_BYTES = 8 * 1024 * 1024;

const BACKGROUND: ColorIR = { r: 1, g: 1, b: 1, a: 1 };

function strokeNode(id: string, phase: number): SceneNodeIR {
  const verbs: Array<{ v: "M"; x: number; y: number } | { v: "L"; x: number; y: number }> = [];
  for (let index = 0; index < 24; index += 1) {
    const t = index / 23;
    const x = 8 + t * 112;
    const y = 64 + Math.sin(phase + t * Math.PI * 2) * 40;
    verbs.push(index === 0 ? { v: "M", x, y } : { v: "L", x, y });
  }
  return {
    id,
    kind: "stroke-path",
    path: { verbs },
    paint: { kind: "solid", color: { r: 0.1, g: 0.1, b: 0.15, a: 1 } },
    strokeWidth: 3,
    cap: "round",
    join: "round",
    miterLimit: 4,
    opacity: 1,
    blend: "src-over",
  };
}

function makeScene(): SceneIR {
  return {
    version: 11,
    width: SIZE,
    height: SIZE,
    background: BACKGROUND,
    nodes: [strokeNode("a", 0.2), strokeNode("b", 1.4)],
  };
}

function heapBytes(ck: CanvasKit): number {
  const heap = (ck as unknown as { HEAPU8?: Uint8Array }).HEAPU8;
  if (!heap) throw new Error("CanvasKit instance does not expose HEAPU8");
  return heap.buffer.byteLength;
}

function leakForcingLoopCount(ck: CanvasKit): number {
  return Math.ceil((heapBytes(ck) + 64 * 1024 * 1024) / SURFACE_BYTES);
}

describe("canvaskit surface memory hygiene", () => {
  let ck: CanvasKit;

  beforeAll(async () => {
    ck = await loadCanvasKitNode();
  });

  it("keeps the wasm heap flat across repeated pixel renders", () => {
    const scene = makeScene();
    for (let index = 0; index < WARMUP; index += 1) {
      renderSceneToPixels(ck, scene);
    }
    const before = heapBytes(ck);
    const loops = leakForcingLoopCount(ck);
    for (let index = 0; index < loops; index += 1) {
      renderSceneToPixels(ck, scene);
    }
    const growth = heapBytes(ck) - before;
    expect(growth).toBeLessThan(HEAP_GROWTH_BOUND_BYTES);
  });

  it("keeps the wasm heap flat across repeated png exports", () => {
    const scene = makeScene();
    for (let index = 0; index < WARMUP; index += 1) {
      renderSceneToPng(ck, scene);
    }
    const before = heapBytes(ck);
    const loops = leakForcingLoopCount(ck);
    for (let index = 0; index < loops; index += 1) {
      renderSceneToPng(ck, scene);
    }
    const growth = heapBytes(ck) - before;
    expect(growth).toBeLessThan(HEAP_GROWTH_BOUND_BYTES);
  });
});
