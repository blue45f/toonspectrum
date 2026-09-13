/** Dependency-free safety contract. Run with Node 24; Node 22 needs --experimental-strip-types. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  STUDIO_GENERATED_BG_SCENES_V3 as scenes,
  STUDIO_GENERATED_2D_PACK_V3_INFO as info,
} from "../apps/web/src/domains/creator/studio-generated-2d-wave-3.ts";

assert.equal(scenes.length, 8);
assert.equal(info.externalResourceCount, 0);
assert.equal(info.style, "illustrated-vector");
assert.equal(new Set(scenes.map((scene) => scene.id)).size, 8);
assert.equal(new Set(scenes.map((scene) => scene.label)).size, 8);
const hashes = new Set();
for (const scene of scenes) {
  assert.equal(scene.width, 1280);
  assert.equal(scene.height, 720);
  assert.match(scene.id, /^gen2d-bg-wave3-[a-z-]+$/u);
  assert.equal(typeof scene.svg, "string");
  const svg = scene.svg;
  assert.match(svg, /^<svg\b/u);
  assert.ok(svg.endsWith("</svg>"));
  assert.ok(svg.includes('viewBox="0 0 1280 720"'));
  assert.ok(Buffer.byteLength(svg) < 32_000);
  assert.doesNotMatch(svg, /<(?:script|foreignObject|image|text|animate)\b|\b(?:href|onload|onclick)\s*=|NaN|Infinity/iu);
  const ids = [...svg.matchAll(/\bid="([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${scene.id}: duplicate SVG identifiers`);
  for (const match of svg.matchAll(/url\(#([^\)]+)\)/gu)) {
    assert.ok(ids.includes(match[1]), `${scene.id}: unresolved SVG reference ${match[1]}`);
  }
  hashes.add(createHash("sha256").update(svg).digest("hex"));
}
assert.equal(hashes.size, 8, "Environment markup must not be duplicated");
console.log("PASS: 8 vector environments; unique identities/content, bounded self-contained SVG and resolved local references.");
