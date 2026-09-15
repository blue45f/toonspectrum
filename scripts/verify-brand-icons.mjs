import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { inflateSync } from "node:zlib";

const root = fileURLToPath(new URL("../", import.meta.url));
const publicRoot = resolve(root, "apps/web/public");
const revision = "ink-panel-v1";
const pngSizes = new Map([
  ["favicon-32.png", 32], ["favicon-96.png", 96],
  ["apple-touch-icon.png", 180], ["icon-192.png", 192],
  ["icon-512.png", 512], ["icon-maskable-192.png", 192],
  ["icon-maskable-512.png", 512],
]);
const read = (name) => readFileSync(resolve(publicRoot, name));

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Decode our compact 8-bit indexed PNGs without installing native libraries. */
export function decodeBrandPng(bytes, size) {
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  let offset = 8;
  let palette;
  let alpha = Buffer.alloc(256, 255);
  let header;
  let ended = false;
  const data = [];
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const end = offset + 12 + length;
    assert.ok(end <= bytes.length, "Truncated PNG chunk");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 8, end - 4);
    assert.equal(crc32(bytes.subarray(offset + 4, end - 4)), bytes.readUInt32BE(end - 4), `CRC: ${type}`);
    if (offset === 8) assert.equal(type, "IHDR");
    if (type === "IHDR") header = chunk;
    if (type === "PLTE") palette = chunk;
    if (type === "tRNS") alpha = chunk;
    if (type === "IDAT") data.push(chunk);
    offset = end;
    if (type === "IEND") { ended = true; break; }
  }
  assert.ok(ended && offset === bytes.length, "PNG must end at IEND");
  assert.ok(header && palette && data.length > 0, "PNG requires image data and palette");
  assert.equal(header.readUInt32BE(0), size);
  assert.equal(header.readUInt32BE(4), size);
  assert.deepEqual([...header.subarray(8)], [8, 3, 0, 0, 0]);
  const raw = inflateSync(Buffer.concat(data), { maxOutputLength: (size + 1) * size });
  assert.equal(raw.length, (size + 1) * size);
  const indices = Buffer.alloc(size * size);
  const rgba = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const filter = raw[y * (size + 1)];
    assert.ok(filter <= 4, "Invalid PNG filter");
    for (let x = 0; x < size; x += 1) {
      const i = y * size + x;
      const a = x > 0 ? indices[i - 1] : 0;
      const b = y > 0 ? indices[i - size] : 0;
      const c = x > 0 && y > 0 ? indices[i - size - 1] : 0;
      const p = a + b - c;
      const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const paeth = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth][filter];
      indices[i] = (raw[y * (size + 1) + x + 1] + predictor) & 255;
      const color = indices[i];
      assert.ok(color * 3 + 2 < palette.length, "Invalid palette index");
      rgba.set(palette.subarray(color * 3, color * 3 + 3), i * 4);
      rgba[i * 4 + 3] = alpha[color] ?? 255;
    }
  }
  return rgba;
}

export const brandIconChecks = [];
for (const [name, size] of pngSizes) {
  brandIconChecks.push([`${name}: valid, correctly sized, bounded PNG`, () => {
    const bytes = read(name);
    assert.ok(bytes.length < 12_000, "Oversized brand PNG");
    const rgba = decodeBrandPng(bytes, size);
    let paper = 0, accent = 0;
    for (let i = 0; i < rgba.length; i += 4) {
      if (rgba[i] > 220 && rgba[i + 1] > 210 && rgba[i + 2] > 195 && rgba[i + 3] === 255) paper += 1;
      if (rgba[i] > 220 && rgba[i + 1] > 90 && rgba[i + 1] < 150 && rgba[i + 2] < 100) accent += 1;
    }
    assert.ok(paper > size * size * 0.025, "Missing paper nib");
    assert.ok(accent > size * size * 0.1, "Missing persimmon panel");
  }]);
}
for (const [name, size] of pngSizes) {
  if (!name.includes("maskable") && name !== "apple-touch-icon.png") continue;
  brandIconChecks.push([`${name}: opaque with artwork inside the circular mask-safe zone`, () => {
    const rgba = decodeBrandPng(read(name), size);
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      assert.equal(rgba[i + 3], 255, "Install icon must be opaque");
      if (Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2) > size * 0.4) {
        assert.ok(Math.abs(rgba[i] - 26) <= 2 && Math.abs(rgba[i + 1] - 20) <= 2 && Math.abs(rgba[i + 2] - 16) <= 2, "Artwork outside the safe circle");
      }
    }
  }]);
}
for (const name of ["favicon.svg", "icon-maskable.svg", "safari-pinned-tab.svg"]) {
  brandIconChecks.push([`${name}: small, self-contained, static vector`, () => {
    const svg = read(name).toString("utf8");
    assert.ok(Buffer.byteLength(svg) < 2048);
    assert.match(svg, /viewBox="0 0 64 64"/u);
    assert.doesNotMatch(svg, /<(?:image|script|style|filter|animate|foreignObject)\b|(?:href|onload)=|data:|ToonSpectrum/iu);
    assert.match(svg, /<path\b/u);
    if (name !== "safari-pinned-tab.svg") assert.match(svg, /ToonStudio/u);
    else assert.doesNotMatch(svg, /<rect\b|#fa7946|#f3eee5/u);
  }]);
}
brandIconChecks.push(["ICO: 16/32/48 frames with independently decoded image data", () => {
  const ico = read("favicon.ico");
  assert.deepEqual([...ico.subarray(0, 6)], [0, 0, 1, 0, 3, 0]);
  let expectedOffset = 54;
  for (const [i, size] of [16, 32, 48].entries()) {
    const start = 6 + i * 16;
    assert.equal(ico[start], size);
    assert.equal(ico[start + 1], size);
    assert.equal(ico.readUInt16LE(start + 4), 1);
    assert.equal(ico.readUInt16LE(start + 6), 32);
    const length = ico.readUInt32LE(start + 8);
    const offset = ico.readUInt32LE(start + 12);
    assert.equal(offset, expectedOffset);
    const frame = ico.subarray(offset, offset + length);
    decodeBrandPng(frame, size);
    if (size === 32) assert.deepEqual(frame, read("favicon-32.png"));
    expectedOffset += length;
  }
  assert.equal(expectedOffset, ico.length);
}]);
brandIconChecks.push(["HTML: versioned static icon links and SVG after fallbacks", () => {
  const html = readFileSync(resolve(root, "apps/web/index.html"), "utf8");
  const links = [...html.matchAll(/<link\b[^>]*>/gu)].map(([tag]) => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/gu)].map(([, key, value]) => [key, value])));
  const icons = links.filter((link) => ["icon", "mask-icon", "apple-touch-icon"].includes(link.rel));
  assert.equal(icons.length, 6);
  for (const icon of icons) {
    const url = new URL(icon.href, "https://www.toonstudio.cloud");
    assert.equal(url.origin, "https://www.toonstudio.cloud");
    assert.equal(url.searchParams.get("v"), revision);
    assert.ok(read(url.pathname.slice(1)).length > 0);
  }
  assert.equal(icons.filter((icon) => icon.rel === "icon").at(-1)?.type, "image/svg+xml");
  assert.equal(icons.find((icon) => icon.rel === "apple-touch-icon")?.sizes, "180x180");
  assert.equal(links.find((link) => link.rel === "manifest")?.href, `/manifest.webmanifest?v=${revision}`);
}]);
brandIconChecks.push(["Manifest: matching revision, real dimensions, separate any/maskable roles", () => {
  const manifest = JSON.parse(read("manifest.webmanifest").toString("utf8"));
  assert.equal(manifest.id, "/");
  assert.equal(manifest.start_url, "/studio");
  assert.equal(manifest.icons.length, 5);
  for (const icon of manifest.icons) {
    const url = new URL(icon.src, "https://www.toonstudio.cloud");
    const name = url.pathname.slice(1);
    assert.equal(url.origin, "https://www.toonstudio.cloud");
    assert.equal(url.searchParams.get("v"), revision);
    assert.equal(icon.purpose, name.includes("maskable") ? "maskable" : "any");
    if (icon.type === "image/png") {
      const size = pngSizes.get(name);
      assert.ok(size);
      assert.equal(icon.sizes, `${size}x${size}`);
      decodeBrandPng(read(name), size);
    } else {
      assert.equal(name, "favicon.svg");
      assert.equal(icon.sizes, "any");
      assert.equal(icon.type, "image/svg+xml");
    }
  }
}]);

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  for (const [name, check] of brandIconChecks) { check(); console.log(`PASS ${name}`); }
  console.log(`${brandIconChecks.length} brand icon checks passed.`);
}
