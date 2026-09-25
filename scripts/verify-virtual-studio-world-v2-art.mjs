import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { decodePng } from "image-js";

const DEFAULT_PACK = resolve(dirname(fileURLToPath(import.meta.url)), "../apps/web/public/assets/virtual-studio/world-v2");
const DIRECTIONS = ["down", "up", "left", "right"];
const NATIVE_SIZE = 1254;
const FRAME_SIZE = 627;
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const expect = (condition, message) => { if (!condition) throw new Error(message); };

async function packFile(root, file) {
  expect(typeof file === "string" && /^[a-z0-9][a-z0-9/_-]*\.(?:png|json)$/u.test(file)
    && !file.split("/").some((part) => part === "" || part === "." || part === ".."), "원본 팩 밖 또는 안전하지 않은 파일 경로입니다.");
  const path = await realpath(resolve(root, file));
  const within = relative(root, path);
  expect(within.split(/[\\/]/u)[0] !== ".." && !isAbsolute(within), "심볼릭 링크가 원본 팩 범위를 벗어납니다.");
  return readFile(path);
}
const json = async (root, file) => JSON.parse((await packFile(root, file)).toString("utf8"));

function png(bytes, record, label, alpha) {
  expect(Number.isSafeInteger(record?.bytes) && record.bytes > 0 && record.bytes <= 32 * 1024 * 1024
    && record.bytes === bytes.length && /^[a-f0-9]{64}$/u.test(record.sha256) && sha(bytes) === record.sha256,
  `${label}: 원본 bytes/SHA256이 기록과 다릅니다.`);
  expect(bytes.length >= 33 && bytes.subarray(0, 8).equals(SIGNATURE)
    && bytes.readUInt32BE(8) === 13 && bytes.toString("ascii", 12, 16) === "IHDR", `${label}: PNG 원본 헤더가 잘못되었습니다.`);
  expect(bytes.readUInt32BE(16) === NATIVE_SIZE && bytes.readUInt32BE(20) === NATIVE_SIZE,
    `${label}: 원본 1254×1254 해상도가 아닙니다.`);
  expect(bytes[24] === 8 && bytes[25] === (alpha ? 6 : 2) && bytes[26] === 0 && bytes[27] === 0 && bytes[28] === 0,
    `${label}: 원본 8bit ${alpha ? "RGBA" : "RGB"} PNG 유형이 아닙니다.`);
  const image = decodePng(bytes);
  expect(image.width === NATIVE_SIZE && image.height === NATIVE_SIZE && image.bitDepth === 8
    && image.channels === (alpha ? 4 : 3) && image.alpha === alpha, `${label}: 디코딩된 PNG 규격이 일치하지 않습니다.`);
  return image;
}

/** 원본 픽셀을 변경하지 않고 cell 내부의 alpha 경계와 내용만 읽는다. */
export function inspectNativeWalkFrames(image) {
  expect(image.width === NATIVE_SIZE && image.height === NATIVE_SIZE && image.channels === 4 && image.bitDepth === 8,
    "걷기 프레임은 1254×1254 RGBA 원본이어야 합니다.");
  return Array.from({ length: 4 }, (_, ordinal) => {
    const offsetX = ordinal % 2 * FRAME_SIZE, offsetY = Math.floor(ordinal / 2) * FRAME_SIZE;
    const bounds = [FRAME_SIZE, FRAME_SIZE, 0, 0], headBounds = [FRAME_SIZE, FRAME_SIZE, 0, 0];
    let transparent = false;
    for (let y = 0; y < FRAME_SIZE; y++) for (let x = 0; x < FRAME_SIZE; x++) {
      const alpha = image.data[((offsetY + y) * image.width + offsetX + x) * 4 + 3];
      if (alpha < 32) { transparent = true; continue; }
      bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x + 1); bounds[3] = Math.max(bounds[3], y + 1);
      if (y < 320) {
        headBounds[0] = Math.min(headBounds[0], x); headBounds[1] = Math.min(headBounds[1], y);
        headBounds[2] = Math.max(headBounds[2], x + 1); headBounds[3] = Math.max(headBounds[3], y + 1);
      }
    }
    expect(transparent && bounds[0] > 0 && bounds[1] > 0 && bounds[2] < FRAME_SIZE && bounds[3] < FRAME_SIZE
      && bounds[2] > bounds[0] && bounds[3] > bounds[1] && headBounds[2] > headBounds[0],
    `프레임 ${ordinal + 1}: 빈/불투명 배경 또는 627px cell 경계에 닿는 내용입니다.`);
    const width = bounds[2] - bounds[0], height = bounds[3] - bounds[1];
    const crop = Buffer.alloc(width * height * 4), visible = Buffer.alloc(crop.length), silhouette = Buffer.alloc(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const source = ((offsetY + bounds[1] + y) * image.width + offsetX + bounds[0] + x) * 4;
      const destination = (y * width + x) * 4;
      crop.set(image.data.subarray(source, source + 4), destination);
      if (image.data[source + 3] >= 32) {
        visible.set(image.data.subarray(source, source + 4), destination);
        silhouette[y * width + x] = 1;
      }
    }
    // 크기도 내용 identity에 포함한다. 투명 RGB 잡음과 단순 위치 이동은 새 자세의 증거가 아니다.
    const shape = `${width}x${height}:`;
    return { bounds, headBounds, hash: sha(crop), visibleHash: sha(Buffer.concat([Buffer.from(shape), visible])), alphaHash: sha(Buffer.concat([Buffer.from(shape), silhouette])) };
  });
}

export async function verifyVirtualStudioWorldV2Art({ packRoot = DEFAULT_PACK } = {}) {
  const root = await realpath(packRoot);
  const manifest = await json(root, "manifest.json");
  expect(manifest.version === 1 && manifest.generator === "image_gen.imagegen"
    && manifest.requestedModel === "ImageGen 2.5" && manifest.reportedModel === null,
  "생성 provenance는 요청 모델과 도구가 보고하지 않은 실제 모델을 구분해야 합니다.");
  expect(typeof manifest.sourcePreservation === "string" && manifest.sourcePreservation.trim().length > 0,
    "원본 보존 기록이 없습니다.");
  expect(Array.isArray(manifest.assets) && manifest.assets.length === 2, "원본 지면 타일 2개 기록이 필요합니다.");
  const files = new Set(), sourceIds = new Set();
  let totalBytes = 0;
  for (const record of manifest.assets) {
    expect(!files.has(record.file), "중복 지면 파일 경로입니다."); files.add(record.file);
    expect(record.width === NATIVE_SIZE && record.height === NATIVE_SIZE && record.alpha === false
      && record.repeatMode === "mirrored-gid" && record.straightRepeatApproved === false,
    "지면 원본 치수·알파·반전 반복 계약이 다릅니다.");
    expect(typeof record.prompt === "string" && record.prompt.trim().length >= 20
      && /^exec-[a-f0-9-]+\.png$/u.test(record.source), "지면 생성 프롬프트 또는 원본 식별자가 없습니다.");
    expect(!sourceIds.has(record.source), "생성 원본 식별자가 중복되었습니다."); sourceIds.add(record.source);
    const bytes = await packFile(root, record.file); png(bytes, record, record.file, false); totalBytes += bytes.length;
  }
  expect(files.has("tiles/limestone-native.png") && files.has("tiles/grass-native.png"), "정해진 원본 지면 타일 목록이 다릅니다.");

  const prefix = "characters/pixel-maker/";
  const walk = await json(root, `${prefix}manifest.json`), prompts = await json(root, `${prefix}prompts.json`);
  expect(walk.version === 1 && walk.status === "migration" && walk.sourcePreservation === "byte-identical-copy"
    && walk.width === NATIVE_SIZE && walk.height === NATIVE_SIZE && walk.frameWidth === FRAME_SIZE && walk.frameHeight === FRAME_SIZE
    && walk.columns === 2 && walk.rows === 2 && walk.frameOrder === "row-major" && walk.alphaBoundsThreshold === 32,
  "걷기 원본의 627×627 / 2×2 배치·보존 계약이 다릅니다.");
  expect(walk.directions && Object.keys(walk.directions).sort().join() === [...DIRECTIONS].sort().join(), "네 방향 걷기 기록이 모두 필요합니다.");
  expect(Array.isArray(prompts.images) && prompts.images.length === 4 && new Set(prompts.images.map((entry) => entry.direction)).size === 4,
    "네 방향 생성 프롬프트가 고유하게 필요합니다.");
  const fileHashes = new Set(), frameContent = new Set(), directionReports = [];
  for (const direction of DIRECTIONS) {
    const record = walk.directions[direction], prompt = prompts.images.find((entry) => entry.direction === direction);
    expect(prompt && prompt.file === `walk-${direction}.png` && prompt.tool === "image_gen.imagegen"
      && prompt.requestedModel === "ImageGen 2.5" && prompt.modelVersion === "unreported-by-tool"
      && prompt.mode === "edit" && typeof prompt.prompt === "string" && prompt.prompt.trim().length >= 20
      && typeof prompt.referencedImage === "string" && prompt.referencedImage.length > 0
      && /^exec-[a-f0-9-]+\.png$/u.test(prompt.source), `${direction}: 프롬프트·참조·미보고 모델 provenance가 일치하지 않습니다.`);
    expect(!sourceIds.has(prompt.source), `${direction}: 생성 원본 식별자가 중복되었습니다.`); sourceIds.add(prompt.source);
    const file = `${prefix}${prompt.file}`, bytes = await packFile(root, file);
    const image = png(bytes, record, direction, true); totalBytes += bytes.length;
    expect(!fileHashes.has(record.sha256), "서로 다른 방향의 원본 파일이 동일합니다."); fileHashes.add(record.sha256);
    expect(Array.isArray(record.frames) && record.frames.length === 4, `${direction}: 프레임 4개 기록이 필요합니다.`);
    const frames = inspectNativeWalkFrames(image);
    for (const [index, frame] of frames.entries()) {
      const saved = record.frames[index];
      expect(saved && JSON.stringify(saved.bounds) === JSON.stringify(frame.bounds)
        && JSON.stringify(saved.headBounds) === JSON.stringify(frame.headBounds) && saved.hash === frame.hash,
      `${direction}/${index + 1}: 실제 alpha 경계 또는 원본 RGBA 프레임 hash가 기록과 다릅니다.`);
      expect(!frameContent.has(frame.visibleHash), `${direction}/${index + 1}: 위치나 투명 RGB만 바뀐 동일 프레임 내용입니다.`);
      frameContent.add(frame.visibleHash);
    }
    directionReports.push({ direction, frames: frames.length, uniqueAlphaMasks: new Set(frames.map((frame) => frame.alphaHash)).size });
  }
  return { files: 6, bytes: totalBytes, frameCount: 16, directions: directionReports, modelVersion: "unreported-by-tool",
    limits: "파일·PNG·기록·동일 내용만 검사합니다. 관절 동작/방향/미학적 품질, 무변형 반복 품질, 모델 버전 또는 C2PA 서명의 진위를 인증하지 않습니다." };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = await verifyVirtualStudioWorldV2Art();
    console.log(`가상스튜디오 world-v2 원본 무결성 통과: ${result.files}파일 / ${result.frameCount}프레임 / ${result.bytes}bytes`);
    console.log(`실제 모델 버전: 도구 미보고. ${result.limits}`);
  } catch (error) {
    console.error(`가상스튜디오 world-v2 원본 검증 실패: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    console.error("원본을 재인코딩하지 말고 기록·파일 경로를 확인한 뒤 node scripts/verify-virtual-studio-world-v2-art.mjs를 다시 실행하세요.");
    process.exitCode = 1;
  }
}
