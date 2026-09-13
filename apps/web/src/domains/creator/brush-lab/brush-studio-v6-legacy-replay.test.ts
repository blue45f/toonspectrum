import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createBrushStudioV6Program } from "./brush-studio-v6-engine";
import { createBrushStudioV6MaterialStroke, brushStudioV6MaterialMarksToSvg } from "./brush-studio-v6-material-engine";

// Captured from unmodified main 21c3f91f9 before topology/cache integration.
const BASELINE = {
  "clean-ink": "7dcae8997643673853a6ce3f386bf596ff150c18bf679db1186b7849801aba10",
  "manga-gpen": "3415ae35c55252da35adda527398fba92d1384b43792be73aeec31b956284a94",
  "natural-calligraphy": "7060c0387276fd64f46e7f730181250d92aa8917b9ed6c8b800c7679c3f0339d",
  "velvet-graphite": "ca5920fd66e08a149d6882c0f11c5a83d381946fbaf14b71bb198c92a0f42f95",
  "eroding-charcoal": "a9b648c6ef055393b8ab37b3408da4855cd9554f95d68c63da30caf80f41f6cc",
  "alcohol-bloom": "380c19800d7fcbedc65359d1b4f05b3a3630a11f1164d6c845cbe366666bd5a7",
  "mineral-bloom": "ef8d2f8561c009ddbe4b9c548dcc00b72783ec1a174205695c7463360c89cfc3",
  "chroma-sumi": "43485b939caf684486e06114fef561988e2e9db2849dad8f86288a78b410b2f4",
  "wax-resist": "1cd349fbcc3a48fd0b7fdaff7cea407b140ae89340006c53e7528c4fb3c62923",
  "oil-hair-mixer": "c867d1a4c5c03ec2154174482205e451f4c401d65a80607e40127c47a3a443f0",
  "impasto-knife": "bb4950bd3f505da4faf84589f5b2f4f45a779f331bece9bdc4cfbf7a7c5ba0fb",
  "dripping-neon": "e689d12053420bc78e1d0bf0da577e6e70b1e9ec6c1d9cccd24d6b84e1aefb9d",
  "dendritic-copper": "aefbe967c0a8a29e2d25a2315a9c134474400bbec67e392d315ae3b901c0305b",
  "holographic-stitch": "c431e8f0e319e5e5b3f2cad3d75160e462c3b961fae4f1ee9203e2602ca3cec6",
  "moss-flow": "583141e5706e47e8c1c8b91cb4d37c213249eee86edb7047d859a306c9dfcf2f",
  "document-halftone": "9b542386d25cac97e577f5585b21533eef3f6c050a6912a1b1382ab7084d1278",
  "kaleido-swarm": "640ceddfb1138ed6a162321f696cdbfb67659305427f3df3978e072a094948e5"
};
describe("pre-topology V6 replay receipts", () => {
  it.each(Object.entries(BASELINE))("preserves %s SVG byte-for-byte", (id, expected) => {
    const stroke = createBrushStudioV6MaterialStroke(createBrushStudioV6Program(id));
    const points = Array.from({ length: 61 }, (_, i) => ({
      x: 30 + i * 3, y: 60 + Math.sin(i / 9) * 22,
      pressure: 0.15 + 0.8 * Math.sin(Math.PI * i / 60), tilt: 0.3, twist: i * 2,
    }));
    const svg = brushStudioV6MaterialMarksToSvg(points.flatMap((point) => stroke.push(point)));
    expect(createHash("sha256").update(svg).digest("hex")).toBe(expected);
  });
});
