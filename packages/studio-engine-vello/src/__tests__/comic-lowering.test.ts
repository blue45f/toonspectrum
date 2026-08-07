import {
  comicGraphIRSchema,
  lowerComicPageToScene,
  polylineToPath,
  sceneIRSchema,
  validateComicGraph,
} from "@toonspectrum/studio-project-model";
import { beforeAll, describe, expect, it } from "vitest";

import { loadVelloNode } from "../node";
import { renderSceneToPixels } from "../render";

import type {
  ColorIR,
  ComicPageIR,
  SceneIR,
  SceneNodeIR,
} from "@toonspectrum/studio-project-model";

function rect(x: number, y: number, w: number, h: number) {
  return polylineToPath(
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    true,
  );
}

const RED: ColorIR = { r: 1, g: 0, b: 0, a: 1 };

/**
 * 96x96 page, two cuts: cut-a masks its content (focus rays overshoot the
 * panel bounds on purpose), cut-b does not. Panels are declared out of
 * reading order to prove the lowering re-orders them.
 */
function parityGraph(effectSeed = 7) {
  return comicGraphIRSchema.parse({
    version: 1,
    pages: [
      {
        id: "page-1",
        widthPx: 96,
        heightPx: 96,
        panels: [
          {
            id: "cut-b",
            shape: rect(60, 8, 28, 80),
            folderId: "fb",
            masksContent: false,
            readingOrder: 1,
          },
          {
            id: "cut-a",
            shape: rect(8, 8, 44, 80),
            folderId: "fa",
            masksContent: true,
            readingOrder: 0,
          },
        ],
        balloons: [
          {
            id: "b1",
            panelId: "cut-a",
            shape: rect(14, 14, 20, 12),
            textNodeId: "txt-1",
            readingOrder: 0,
          },
        ],
        tones: [
          {
            id: "t1",
            panelId: "cut-b",
            region: rect(64, 40, 16, 16),
            lpi: 60,
            angleDeg: 45,
            density: 0.5,
          },
        ],
        effectLines: [
          {
            id: "fx-focus",
            panelId: "cut-a",
            kind: "focus",
            center: [30, 48],
            strokeCount: 60,
            seed: effectSeed,
          },
        ],
      },
    ],
  });
}

function parityPage(effectSeed = 7): ComicPageIR {
  const graph = parityGraph(effectSeed);
  expect(validateComicGraph(graph)).toEqual([]);
  const page = graph.pages[0];
  if (!page) throw new Error("fixture page missing");
  return page;
}

function pixelAt(pixels: Uint8Array, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 4;
  return [...pixels.slice(offset, offset + 4)];
}

/** Black-ink pixel count (r < 128 excludes the red background and white fills). */
function countInk(pixels: Uint8Array): number {
  let count = 0;
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if ((pixels[offset] ?? 255) < 128) count += 1;
  }
  return count;
}

function effectNodesOf(scene: SceneIR): SceneNodeIR[] {
  const group = scene.nodes[0];
  if (group?.kind !== "group") throw new Error("expected panel group");
  return group.children.filter((node) => node.id.startsWith("effect:fx-focus:"));
}

describe("lowerComicPageToScene", () => {
  it("lowers panels in reading order with masksContent-driven group clips", () => {
    const page = parityPage();
    const { scene } = lowerComicPageToScene(page);
    // Schema-valid by contract.
    expect(sceneIRSchema.parse(scene)).toEqual(scene);
    expect(scene.width).toBe(96);
    expect(scene.height).toBe(96);
    // Reading order 0,1 — not the declaration order (cut-b was declared first).
    expect(scene.nodes.map((node) => node.id)).toEqual(["panel:cut-a", "panel:cut-b"]);
    const [cutA, cutB] = scene.nodes;
    if (cutA?.kind !== "group" || cutB?.kind !== "group") {
      throw new Error("expected panel groups");
    }
    const panelA = page.panels.find((panel) => panel.id === "cut-a");
    expect(cutA.clip).toEqual(panelA?.shape);
    expect(cutB.clip).toBeNull();
    // v1 panel content: white bg fill + 2px black border, balloons on top.
    expect(cutA.children.map((node) => node.id)).toContain("panel:cut-a:bg");
    expect(cutA.children.map((node) => node.id)).toContain("panel:cut-a:border");
    expect(cutA.children.map((node) => node.id)).toContain("balloon:b1:fill");
    expect(cutB.children.map((node) => node.id)).toContain("tone:t1");
  });

  it("reports text-lane and screentone gaps as warnings (no silent loss)", () => {
    const { warnings } = lowerComicPageToScene(parityPage());
    const joined = warnings.join("\n");
    expect(joined).toContain("balloon b1");
    expect(joined).toContain("text node txt-1");
    expect(joined).toContain("tone t1");
    expect(joined).toContain("스크린톤");
  });

  it("generates effect lines deterministically from the seed", () => {
    const first = lowerComicPageToScene(parityPage(7));
    const second = lowerComicPageToScene(parityPage(7));
    expect(second.scene).toEqual(first.scene);
    const firstEffects = effectNodesOf(first.scene);
    expect(firstEffects).toHaveLength(60);
    const otherSeed = lowerComicPageToScene(parityPage(8));
    expect(effectNodesOf(otherSeed.scene)).toHaveLength(60);
    expect(effectNodesOf(otherSeed.scene)).not.toEqual(firstEffects);
  });
});

describe("comic panel clip render parity (wasm)", () => {
  beforeAll(async () => {
    await loadVelloNode();
  });

  it("clips cut content at the panel boundary equivalently on vello and canvaskit", async () => {
    const page = parityPage();
    const { scene } = lowerComicPageToScene(page, { background: RED });
    const velloPixels = renderSceneToPixels(scene);
    const { loadCanvasKitNode } = await import("@toonspectrum/studio-engine-skia/node");
    const { renderSceneToPixels: renderWithSkia } = await import(
      "@toonspectrum/studio-engine-skia"
    );
    const ck = await loadCanvasKitNode();
    const skiaPixels = renderWithSkia(ck, scene);

    // Pixels outside the masked cut stay pure background: the gap column
    // between the cuts (x=55) and the margins beyond cut-a's edges would all
    // be crossed by focus rays if the clip were ignored.
    const outsideProbes: Array<[number, number]> = [[4, 48], [30, 4], [30, 92]];
    for (let y = 12; y <= 84; y += 4) outsideProbes.push([55, y]);
    for (const pixels of [velloPixels, skiaPixels]) {
      for (const [x, y] of outsideProbes) {
        const [r, g, b] = pixelAt(pixels, 96, x, y);
        expect(r).toBeGreaterThanOrEqual(240);
        expect(g).toBeLessThanOrEqual(15);
        expect(b).toBeLessThanOrEqual(15);
      }
    }
    // Cut interior is white panel fill (not the red background) on both engines.
    for (const pixels of [velloPixels, skiaPixels]) {
      const [, g, b] = pixelAt(pixels, 96, 30, 48);
      expect(g).toBeGreaterThanOrEqual(240);
      expect(b).toBeGreaterThanOrEqual(240);
    }

    // Sensitivity guard: with the clip stripped the very same scene inks the
    // gap column, so the background assertions above really test clipping.
    const unclipped: SceneIR = {
      ...scene,
      nodes: scene.nodes.map((node) =>
        node.kind === "group" ? { ...node, clip: null } : node,
      ),
    };
    const unclippedPixels = renderSceneToPixels(unclipped);
    let gapInk = 0;
    for (let y = 8; y <= 88; y += 1) {
      const [r] = pixelAt(unclippedPixels, 96, 55, y);
      if ((r ?? 255) < 128) gapInk += 1;
    }
    expect(gapInk).toBeGreaterThan(0);

    // Black-ink coverage must agree within 10% between the two engines.
    const velloInk = countInk(velloPixels);
    const skiaInk = countInk(skiaPixels);
    expect(velloInk).toBeGreaterThan(200);
    expect(Math.abs(velloInk - skiaInk) / Math.max(velloInk, skiaInk)).toBeLessThan(0.1);
  });
});
