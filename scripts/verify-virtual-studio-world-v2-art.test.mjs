import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { after, before, test } from "node:test";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Image, encodePng } from "image-js";
import { verifyVirtualStudioWorldV2Art } from "./verify-virtual-studio-world-v2-art.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const directions = ["down", "up", "left", "right"];
let temporary, base;
const json = async (root, name) => JSON.parse(await readFile(join(root, name), "utf8"));
const saveJson = (root, name, value) => writeFile(join(root, name), JSON.stringify(value));

function sheet(direction, duplicate = false) {
  const data = new Uint8Array(1254 * 1254 * 4), frames = [];
  for (let index = 0; index < 4; index++) {
    const phase = duplicate ? 0 : index;
    const x = 100 + index * 10, y = 80 + index;
    const width = 30 + direction * 5 + phase, height = 350 + phase * 7;
    const color = [80 + direction * 30, 60 + phase * 20, 120, 255];
    const crop = Buffer.alloc(width * height * 4);
    for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) {
      const offset = (((Math.floor(index / 2) * 627) + y + row) * 1254 + index % 2 * 627 + x + column) * 4;
      data.set(color, offset); crop.set(color, (row * width + column) * 4);
    }
    frames.push({ bounds: [x, y, x + width, y + height], headBounds: [x, y, x + width, 320], hash: hash(crop) });
  }
  const bytes = Buffer.from(encodePng(new Image(1254, 1254, { colorModel: "RGBA", data })));
  return { bytes, record: { bytes: bytes.length, sha256: hash(bytes), frames } };
}
async function replaceWalk(root, direction, bytes, frames) {
  const prefix = "characters/pixel-maker";
  await writeFile(join(root, prefix, `walk-${direction}.png`), bytes);
  const manifest = await json(root, `${prefix}/manifest.json`);
  manifest.directions[direction] = { ...manifest.directions[direction], bytes: bytes.length, sha256: hash(bytes), ...(frames ? { frames } : {}) };
  await saveJson(root, `${prefix}/manifest.json`, manifest);
}
async function fixture(t) {
  const path = await mkdtemp(join(temporary, "case-"));
  await cp(base, path, { recursive: true });
  t.after(() => rm(path, { recursive: true, force: true }));
  return path;
}

before(async () => {
  temporary = await mkdtemp(join(tmpdir(), "virtual-studio-world-v2-art-")); base = join(temporary, "base");
  await mkdir(join(base, "tiles"), { recursive: true }); await mkdir(join(base, "characters/pixel-maker"), { recursive: true });
  const assets = [];
  for (const [index, name] of ["limestone", "grass"].entries()) {
    const bytes = Buffer.from(encodePng(new Image(1254, 1254, { colorModel: "RGB", data: new Uint8Array(1254 * 1254 * 3).fill(80 + index * 20) })));
    const file = `tiles/${name}-native.png`; await writeFile(join(base, file), bytes);
    assets.push({ file, source: `exec-${index + 1}-abcd.png`, width: 1254, height: 1254, bytes: bytes.length, sha256: hash(bytes), alpha: false,
      repeatMode: "mirrored-gid", straightRepeatApproved: false, prompt: "Fixture only: one native ground texture with preserved bytes." });
  }
  await saveJson(base, "manifest.json", { version: 1, generator: "image_gen.imagegen", requestedModel: "ImageGen 2.5", reportedModel: null, sourcePreservation: "fixture source bytes", assets });
  const manifest = { version: 1, status: "migration", sourcePreservation: "byte-identical-copy", width: 1254, height: 1254, frameWidth: 627, frameHeight: 627, columns: 2, rows: 2, alphaBoundsThreshold: 32, frameOrder: "row-major", directions: {} };
  for (const [index, direction] of directions.entries()) {
    const result = sheet(index); manifest.directions[direction] = result.record;
    await writeFile(join(base, "characters/pixel-maker", `walk-${direction}.png`), result.bytes);
  }
  await saveJson(base, "characters/pixel-maker/manifest.json", manifest);
  await saveJson(base, "characters/pixel-maker/prompts.json", { images: directions.map((direction, index) => ({
    direction, file: `walk-${direction}.png`, source: `exec-${index + 3}-abcd.png`, tool: "image_gen.imagegen", modelVersion: "unreported-by-tool",
    requestedModel: "ImageGen 2.5", mode: "edit", referencedImage: "exec-reference.png", prompt: "Fixture only: four distinct transparent walking poses, no quality certification.",
  })) });
});
after(async () => { if (temporary) await rm(temporary, { recursive: true, force: true }); });

test("정상 원본 기록과 16개 실제 cell 내용을 읽되 모델/작화 품질 인증으로 보고하지 않는다", async () => {
  const result = await verifyVirtualStudioWorldV2Art({ packRoot: base });
  assert.equal(result.files, 6); assert.equal(result.frameCount, 16); assert.equal(result.modelVersion, "unreported-by-tool");
  assert.match(result.limits, /인증하지 않습니다/u);
  assert.equal(result.directions.length, 4);
});

test("manifest 상대 경로로 팩 밖 파일을 읽으려 하면 거부한다", async (t) => {
  const root = await fixture(t), manifest = await json(root, "manifest.json");
  manifest.assets[0].file = "../outside.png"; await saveJson(root, "manifest.json", manifest);
  await assert.rejects(verifyVirtualStudioWorldV2Art({ packRoot: root }), /안전하지 않은 파일 경로/u);
});

test("허용된 이름의 심볼릭 링크도 팩 밖 원본을 가리키면 거부한다", async (t) => {
  const root = await fixture(t), file = join(root, "tiles/limestone-native.png");
  await rm(file); await symlink(join(base, "tiles/limestone-native.png"), file);
  await assert.rejects(verifyVirtualStudioWorldV2Art({ packRoot: root }), /심볼릭 링크/u);
});

test("원본 한 바이트라도 변하면 SHA 기록과 비교해 거부한다", async (t) => {
  const root = await fixture(t), file = join(root, "tiles/grass-native.png"), bytes = await readFile(file);
  bytes[bytes.length - 1] ^= 1; await writeFile(file, bytes);
  await assert.rejects(verifyVirtualStudioWorldV2Art({ packRoot: root }), /bytes\/SHA256/u);
});

test("hash를 갱신해도 축소 재인코딩된 PNG는 원본 치수에서 거부한다", async (t) => {
  const root = await fixture(t), bytes = Buffer.from(encodePng(new Image(4, 4, { colorModel: "RGBA" })));
  await replaceWalk(root, "down", bytes);
  await assert.rejects(verifyVirtualStudioWorldV2Art({ packRoot: root }), /1254×1254/u);
});

test("같은 치수의 불투명 RGB 걷기 이미지는 RGBA 계약에서 거부한다", async (t) => {
  const root = await fixture(t), bytes = Buffer.from(encodePng(new Image(1254, 1254, { colorModel: "RGB" })));
  await replaceWalk(root, "down", bytes);
  await assert.rejects(verifyVirtualStudioWorldV2Art({ packRoot: root }), /RGBA PNG/u);
});

test("cell 배치나 alpha 경계 메타데이터를 바꾸면 실제 픽셀과 대조해 거부한다", async (t) => {
  const root = await fixture(t), file = "characters/pixel-maker/manifest.json", manifest = await json(root, file);
  manifest.directions.down.frames[0].bounds[0] = 0; await saveJson(root, file, manifest);
  await assert.rejects(verifyVirtualStudioWorldV2Art({ packRoot: root }), /실제 alpha 경계/u);
  manifest.frameWidth = 626; await saveJson(root, file, manifest);
  await assert.rejects(verifyVirtualStudioWorldV2Art({ packRoot: root }), /627×627/u);
});

test("요청한 모델 버전을 도구가 확정 보고한 것처럼 변경하면 거부한다", async (t) => {
  const root = await fixture(t), file = "characters/pixel-maker/prompts.json", prompts = await json(root, file);
  prompts.images[0].modelVersion = "ImageGen 2.5"; await saveJson(root, file, prompts);
  await assert.rejects(verifyVirtualStudioWorldV2Art({ packRoot: root }), /미보고 모델 provenance/u);
});

test("PNG와 metadata hash가 모두 맞아도 같은 프레임을 다른 위치에 복제한 sheet는 거부한다", async (t) => {
  const root = await fixture(t), duplicate = sheet(0, true);
  await replaceWalk(root, "down", duplicate.bytes, duplicate.record.frames);
  await assert.rejects(verifyVirtualStudioWorldV2Art({ packRoot: root }), /동일 프레임 내용/u);
});
