#!/usr/bin/env node
/**
 * 가상 스튜디오 캠퍼스 바닥 아틀라스 생성기.
 *
 * experience-v8 terrain(1254×1254, 4×4 셀)을 셀마다 잘라 128px로 줄인 뒤 512×512 WebP 한 장으로 합친다.
 * 원본 313.5px 셀을 캠퍼스 64px 타일로 밉맵 없이 0.2배 축소하면 걷는 동안 바닥이 반짝이므로(모아레),
 * 미리 좋은 필터(lanczos3)로 줄인 128px 셀을 0.5배로만 표시한다.
 * 셀 경계의 이웃 재질·둥근 모서리가 섞이지 않게 각 셀을 안쪽으로 조금 잘라낸다.
 *
 * 사용: node apps/web/scripts/build-virtual-studio-campus-atlas.mjs
 * 출력: apps/web/public/assets/virtual-studio/campus-v1/<style>/floor-atlas.webp (6종)
 */
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const SOURCE_DIR = join(ROOT, "apps/web/public/assets/virtual-studio/experience-v8");
const OUTPUT_DIR = join(ROOT, "apps/web/public/assets/virtual-studio/campus-v1");
const STYLES = ["sky-island", "webtoon", "pastel", "retro", "ink", "neon"];
const SOURCE_SIZE = 1254;
const GRID = 4;
const CELL = 128;
const INSET = 3;
const MAX_BYTES = 150 * 1024;

/** sharp는 워크스페이스 직접 의존성이 아니므로 pnpm 저장소에서 찾는다. */
async function loadSharp() {
  const store = join(ROOT, "node_modules/.pnpm");
  const folder = readdirSync(store).filter((name) => /^sharp@\d/u.test(name)).sort().at(-1);
  if (!folder) throw new Error("sharp 패키지를 node_modules/.pnpm에서 찾지 못했습니다.");
  const entry = join(store, folder, "node_modules/sharp/dist/index.mjs");
  const module = await import(pathToFileURL(entry).href);
  return module.default;
}

function sourceFile(style) {
  return join(SOURCE_DIR, style === "sky-island" ? "terrain.png" : `terrain-${style}.png`);
}

async function buildStyle(sharp, style) {
  const input = sourceFile(style);
  if (!existsSync(input)) throw new Error(`원본이 없습니다: ${input}`);
  const meta = await sharp(input).metadata();
  if (meta.width !== SOURCE_SIZE || meta.height !== SOURCE_SIZE) throw new Error(`${style} 원본 크기가 ${SOURCE_SIZE}이 아닙니다.`);
  const cells = [];
  for (let index = 0; index < GRID * GRID; index += 1) {
    const column = index % GRID, row = Math.floor(index / GRID);
    const left = Math.round(column * SOURCE_SIZE / GRID) + INSET;
    const top = Math.round(row * SOURCE_SIZE / GRID) + INSET;
    const right = Math.round((column + 1) * SOURCE_SIZE / GRID) - INSET;
    const bottom = Math.round((row + 1) * SOURCE_SIZE / GRID) - INSET;
    const buffer = await sharp(input)
      .extract({ left, top, width: right - left, height: bottom - top })
      .resize(CELL, CELL, { kernel: "lanczos3", fit: "fill" })
      .removeAlpha()
      .png()
      .toBuffer();
    cells.push({ input: buffer, left: column * CELL, top: row * CELL });
  }
  const folder = join(OUTPUT_DIR, style);
  mkdirSync(folder, { recursive: true });
  const output = join(folder, "floor-atlas.webp");
  await sharp({ create: { width: CELL * GRID, height: CELL * GRID, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite(cells)
    .webp({ quality: 90, effort: 6 })
    .toFile(output);
  const bytes = statSync(output).size;
  if (bytes > MAX_BYTES) throw new Error(`${style} 아틀라스가 ${MAX_BYTES}바이트를 넘습니다: ${bytes}`);
  return { style, bytes };
}

const sharp = await loadSharp();
for (const style of STYLES) {
  const { bytes } = await buildStyle(sharp, style);
  console.log(`${style}: ${(bytes / 1024).toFixed(1)}KB`);
}
