#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const result = { apiBase: "http://127.0.0.1:8001", waitSeconds: 900, force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--kit") result.kit = argv[++index];
    else if (value === "--output") result.output = argv[++index];
    else if (value === "--api-base") result.apiBase = argv[++index];
    else if (value === "--wait-seconds") result.waitSeconds = Number(argv[++index]);
    else if (value === "--force") result.force = true;
    else if (value === "--help" || value === "-h") result.help = true;
    else throw new Error(`지원하지 않는 옵션입니다: ${value}`);
  }
  return result;
}

function usage() {
  return [
    "ToonStudio music kit → ACE-Step local generator",
    "",
    "pnpm music:local -- --kit ./toonstudio-music-kit.json --output ./toonstudio-music.mp3",
    "",
    "Options: --api-base http://127.0.0.1:8001 --wait-seconds 900 --force",
  ].join("\n");
}
function validateLocalApi(value) {
  const url = new URL(value);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    throw new Error("로컬 ACE-Step 주소만 사용할 수 있습니다.");
  }
  if (url.protocol !== "http:") throw new Error("로컬 HTTP 주소를 확인해 주세요.");
  return url.origin;
}

async function assertOutputAvailable(path, force) {
  if (force) return;
  try {
    await access(path, constants.F_OK);
    throw new Error(`출력 파일이 이미 있습니다: ${path} (--force로 덮어쓰기)`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function postJson(base, path, body, timeoutMs = 60_000) {
  const response = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path} ${response.status}: ${text.slice(0, 500)}`);
  const value = JSON.parse(text);
  if (value?.error) throw new Error(`${path}: ${JSON.stringify(value.error)}`);
  return value;
}
function validateKit(value) {
  if (!value || value.schemaVersion !== 1 || value.product !== "ToonStudio") {
    throw new Error("ToonStudio 생성 키트 JSON이 아닙니다.");
  }
  const request = value.localAceStep?.request;
  if (!request || typeof request.prompt !== "string" || !request.prompt.trim()) {
    throw new Error("생성 키트에 ACE-Step 프롬프트가 없습니다.");
  }
  if (!Number.isFinite(request.audio_duration) || request.audio_duration < 5 || request.audio_duration > 600) {
    throw new Error("생성 길이는 5~600초 범위여야 합니다.");
  }
  if (!Number.isInteger(request.bpm) || request.bpm < 40 || request.bpm > 240) {
    throw new Error("BPM 범위를 확인해 주세요.");
  }
  if (typeof request.instrumental !== "boolean") throw new Error("보컬 설정을 확인해 주세요.");
  return value;
}

function seedFor(prompt) {
  return Number.parseInt(createHash("sha256").update(prompt).digest("hex").slice(0, 8), 16) & 0x7fffffff;
}

async function waitForResult(base, taskId, maxSeconds) {
  const started = Date.now();
  let lastMarker = "";
  while ((Date.now() - started) / 1000 < maxSeconds) {
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 3000));
    const response = await postJson(base, "/query_result", { task_id_list: [taskId] });
    const item = response?.data?.[0];
    const raw = item?.result ?? "[]";
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    const entry = Array.isArray(parsed) ? (parsed[0] ?? {}) : {};
    const marker = `${entry.stage ?? "working"}:${Math.round(Number(entry.progress ?? 0) * 100)}`;
    if (marker !== lastMarker) {
      console.log(marker);
      lastMarker = marker;
    }
    if (item?.status === 1) return entry;
    if (![0, null, undefined].includes(item?.status)) {
      throw new Error(`ACE-Step 작업 실패: ${JSON.stringify(item).slice(0, 1000)}`);
    }
  }
  throw new Error(`ACE-Step 생성이 ${maxSeconds}초 안에 끝나지 않았습니다. 같은 요청을 자동 재시도하지 않습니다.`);
}

function isExpectedAudio(bytes, extension) {
  if (extension === ".mp3") {
    return bytes.length > 10 && (
      (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
      || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    );
  }
  return bytes.length > 44
    && bytes.subarray(0, 4).toString() === "82,73,70,70"
    && bytes.subarray(8, 12).toString() === "87,65,86,69";
}

async function downloadResult(base, fileValue) {
  const url = new URL(fileValue, `${base}/`);
  if (url.origin !== base) throw new Error("ACE-Step 결과 주소가 로컬 API 범위를 벗어났습니다.");
  const response = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!response.ok) throw new Error(`결과 다운로드 실패: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > 50_000_000) throw new Error("생성 결과가 50MB 제한을 초과했습니다.");
  return bytes;
}
async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.kit || !args.output) throw new Error(`${usage()}\n\n--kit과 --output이 필요합니다.`);
  if (!Number.isFinite(args.waitSeconds) || args.waitSeconds < 30 || args.waitSeconds > 3600) {
    throw new Error("--wait-seconds는 30~3600 범위여야 합니다.");
  }

  const apiBase = validateLocalApi(args.apiBase);
  const kitPath = resolve(args.kit);
  const outputPath = resolve(args.output);
  const extension = extname(outputPath).toLowerCase();
  if (![".mp3", ".wav"].includes(extension)) throw new Error("출력 확장자는 .mp3 또는 .wav만 지원합니다.");
  await assertOutputAvailable(outputPath, args.force);
  const kit = validateKit(JSON.parse(await readFile(kitPath, "utf8")));
  const request = kit.localAceStep.request;
  const seed = seedFor(request.prompt);

  const payload = {
    prompt: request.prompt,
    lyrics: request.instrumental ? "" : kit.brief?.lyrics ?? "",
    thinking: false,
    model: "acestep-v15-turbo",
    bpm: request.bpm,
    key_scale: "",
    time_signature: "4",
    use_cot_caption: false,
    use_cot_language: false,
    vocal_language: request.instrumental ? "unknown" : kit.brief?.lyricsLanguage ?? "unknown",
    audio_duration: request.audio_duration,
    batch_size: 1,
    use_random_seed: false,
    seed,
    inference_steps: 8,
    guidance_scale: 1,
    audio_format: extension.slice(1),
    task_type: "text2music",
    use_format: false,
  };

  const health = await fetch(`${apiBase}/health`, { signal: AbortSignal.timeout(10_000) });
  if (!health.ok) throw new Error(`ACE-Step 상태 확인 실패: ${health.status}`);
  console.log(`ACE-Step 요청 시작 · ${request.audio_duration}초 · ${request.bpm} BPM · seed ${seed}`);
  const submitted = await postJson(apiBase, "/release_task", payload);
  const taskId = submitted?.data?.task_id;
  if (typeof taskId !== "string" || !taskId) throw new Error("ACE-Step 작업 ID를 받지 못했습니다.");
  const result = await waitForResult(apiBase, taskId, args.waitSeconds);
  if (typeof result.file !== "string" || !result.file) throw new Error("ACE-Step 결과 파일 주소가 없습니다.");
  const bytes = await downloadResult(apiBase, result.file);
  if (!isExpectedAudio(bytes, extension)) {
    throw new Error(`ACE-Step 결과 형식과 출력 확장자(${extension})가 일치하지 않습니다.`);
  }

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, bytes);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const sidecarPath = outputPath.replace(/\.(?:mp3|wav)$/iu, ".json");
  await writeFile(sidecarPath, `${JSON.stringify({
    schemaVersion: 1,
    product: "ToonStudio",
    generatedAt: new Date().toISOString(),
    provider: "ace-step-local",
    model: "acestep-v15-turbo",
    sourceKit: kitPath,
    output: outputPath,
    sha256: digest,
    seed,
    taskId,
    request: payload,
    providerReviewDate: kit.providerReviewDate,
  }, null, 2)}\n`, "utf8");
  console.log(`완료: ${outputPath}`);
  console.log(`SHA-256: ${digest}`);
  console.log(`제작 정보: ${sidecarPath}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
