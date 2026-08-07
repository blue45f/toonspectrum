import { renderSceneToPixels as renderWithSkia } from "@toonspectrum/studio-engine-skia";
import { loadCanvasKitNode } from "@toonspectrum/studio-engine-skia/node";
import { renderSceneToPixels as renderWithVello } from "@toonspectrum/studio-engine-vello";
import { loadVelloNode } from "@toonspectrum/studio-engine-vello/node";
import { beforeAll, describe, expect, it } from "vitest";

import { parseSvgToScene } from "../../packages/studio-format-gateway/src/svg";

import type { SceneIR } from "@toonspectrum/studio-project-model";
import type { CanvasKit } from "canvaskit-wasm";

/**
 * V12 gate — SVG (vello_svg role) lane: SVG assets imported through the
 * FormatGateway must render equivalently on both verified engines
 * (CanvasKit and vello_cpu), deterministically, with clipPath imports
 * clipping identically. Ink coverage between engines must agree within 10%.
 */

const WHITE = { r: 1, g: 1, b: 1, a: 1 };

/** A speech-balloon decoration: ellipse body + Bézier tail (fill + stroke). */
const SPEECH_BALLOON_SVG = `
<svg width="128" height="128" viewBox="0 0 128 128">
  <ellipse cx="64" cy="52" rx="48" ry="32" fill="#dbe9ff" stroke="black" stroke-width="3"/>
  <path d="M52 78 Q54 92 42 102 Q62 96 68 82 Z" fill="#dbe9ff" stroke="black" stroke-width="3"/>
</svg>`;

/** A star icon: full path grammar workload with a viewBox scale (16 -> 128). */
const STAR_ICON_SVG = `
<svg width="128" height="128" viewBox="0 0 16 16">
  <path d="M8 1 L10 6 L15 6 L11 9 L12.5 14 L8 11 L3.5 14 L5 9 L1 6 L6 6 Z"
        fill="#ff8800" stroke="#663300" stroke-width="0.5"/>
</svg>`;

/** clipPath lane hookup: a full-canvas rect clipped to a centered circle. */
const CLIPPED_RECT_SVG = `
<svg width="96" height="96">
  <defs><clipPath id="c"><circle cx="48" cy="48" r="30"/></clipPath></defs>
  <rect width="96" height="96" fill="red" clip-path="url(#c)"/>
</svg>`;

/** Pixels whose RGB differs from the white background by more than 8/255. */
function inkCoverage(pixels: Uint8Array): number {
  let ink = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const r = pixels[index] ?? 255;
    const g = pixels[index + 1] ?? 255;
    const b = pixels[index + 2] ?? 255;
    if (Math.abs(r - 255) > 8 || Math.abs(g - 255) > 8 || Math.abs(b - 255) > 8) {
      ink += 1;
    }
  }
  return ink;
}

function pixelAt(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
): [number, number, number, number] {
  const base = (y * width + x) * 4;
  return [
    pixels[base] ?? 0,
    pixels[base + 1] ?? 0,
    pixels[base + 2] ?? 0,
    pixels[base + 3] ?? 0,
  ];
}

function importScene(svg: string): SceneIR {
  const { scene, unsupported } = parseSvgToScene(svg, { background: WHITE });
  // These workloads must import cleanly — anything surfaced here is a gate bug.
  expect(unsupported).toEqual([]);
  return scene;
}

let ck: CanvasKit;

beforeAll(async () => {
  [ck] = await Promise.all([loadCanvasKitNode(), loadVelloNode()]);
});

describe("SVG import cross-renderer gate (CanvasKit vs vello_cpu)", () => {
  const workloads: Array<{ name: string; svg: string }> = [
    { name: "speech-balloon", svg: SPEECH_BALLOON_SVG },
    { name: "star-icon", svg: STAR_ICON_SVG },
  ];

  it("ink coverage agrees within 10% between engines", () => {
    for (const { name, svg } of workloads) {
      const scene = importScene(svg);
      const skiaInk = inkCoverage(renderWithSkia(ck, scene));
      const velloInk = inkCoverage(renderWithVello(scene));
      expect(skiaInk, `${name}: skia render produced no ink`).toBeGreaterThan(0);
      expect(velloInk, `${name}: vello render produced no ink`).toBeGreaterThan(0);
      const relativeGap = Math.abs(skiaInk - velloInk) / Math.max(skiaInk, velloInk);
      expect(
        relativeGap,
        `${name}: ink coverage gap ${(relativeGap * 100).toFixed(2)}% (skia=${skiaInk}, vello=${velloInk})`,
      ).toBeLessThanOrEqual(0.1);
    }
  });

  it("renders are deterministic per engine (two passes, byte-equal)", () => {
    for (const { svg } of workloads) {
      const scene = importScene(svg);
      expect(
        Buffer.from(renderWithVello(scene)).equals(Buffer.from(renderWithVello(scene))),
      ).toBe(true);
      expect(
        Buffer.from(renderWithSkia(ck, scene)).equals(Buffer.from(renderWithSkia(ck, scene))),
      ).toBe(true);
    }
  });

  it("clipPath import clips to the shape: outside pixels stay background", () => {
    const scene = importScene(CLIPPED_RECT_SVG);
    for (const [engine, pixels] of [
      ["skia", renderWithSkia(ck, scene)],
      ["vello", renderWithVello(scene)],
    ] as const) {
      // Corners are well outside the r=30 circle — must be the background.
      for (const [x, y] of [
        [4, 4],
        [91, 4],
        [4, 91],
        [91, 91],
      ] as const) {
        const [r, g, b] = pixelAt(pixels, scene.width, x, y);
        expect([r, g, b], `${engine}: pixel (${x}, ${y}) escaped the clip`).toEqual([
          255, 255, 255,
        ]);
      }
      // The circle interior keeps the rect fill.
      const [r, g, b] = pixelAt(pixels, scene.width, 48, 48);
      expect(r, `${engine}: clip interior lost the fill`).toBeGreaterThan(200);
      expect(g).toBeLessThan(60);
      expect(b).toBeLessThan(60);
    }
    // And the clipped ink itself agrees across engines within 10%.
    const skiaInk = inkCoverage(renderWithSkia(ck, scene));
    const velloInk = inkCoverage(renderWithVello(scene));
    const relativeGap = Math.abs(skiaInk - velloInk) / Math.max(skiaInk, velloInk);
    expect(relativeGap, `clip ink gap (skia=${skiaInk}, vello=${velloInk})`).toBeLessThanOrEqual(
      0.1,
    );
  });
});
