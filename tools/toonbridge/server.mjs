#!/usr/bin/env node

import { spawn } from "node:child_process";
import { once } from "node:events";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join, resolve, sep } from "node:path";
import { createServer } from "node:http";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

import { buildCommandPlan } from "./command-plans.mjs";
import { hashFileStream } from "./file-integrity.mjs";
import { operationById, probeAllTools, probeTool, toolById } from "./catalog.mjs";

const PROTOCOL = "toonstudio.production-toolchain";
const VERSION = 2;
const SERVICE_VERSION = "0.1.0";
const HOST = process.env.TOONBRIDGE_HOST?.trim() || "127.0.0.1";
const PORT = Number(process.env.TOONBRIDGE_PORT || 49631);
const TOKEN = process.env.TOONBRIDGE_TOKEN?.trim() || "";
const ROOT = resolve(process.env.TOONBRIDGE_DATA_DIR?.trim() || join(homedir(), ".toonspectrum", "toonbridge-v2"));
const MAX_JSON_BYTES = 64 * 1024;
const MAX_FILE_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_OUTPUT_FILE_BYTES = MAX_FILE_BYTES;
const MAX_OUTPUT_TOTAL_BYTES = 4 * 1024 * 1024 * 1024;
const MAX_RETAINED_JOBS = 128;
const MAX_ACTIVE_JOBS = Math.max(1, Math.min(8, Number(process.env.TOONBRIDGE_MAX_ACTIVE_JOBS || 2)));
const MAX_LOG_BYTES = 8 * 1024 * 1024;
const MAX_CAPTURE_BYTES = 64 * 1024 * 1024;

const ALLOWED_ORIGINS = new Set(
  (process.env.TOONBRIDGE_ALLOWED_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => new URL(entry).origin),
);

if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535) {
  throw new Error("TOONBRIDGE_PORT must be an integer between 1024 and 65535");
}
if (!/^[A-Za-z0-9._~-]{32,256}$/u.test(TOKEN)) {
  throw new Error("TOONBRIDGE_TOKEN must contain 32-256 URL-safe characters");
}
if (HOST !== "127.0.0.1" && HOST !== "::1" && HOST !== "localhost") {
  throw new Error("ToonBridge may bind only to the local loopback interface");
}
if (ALLOWED_ORIGINS.size === 0) throw new Error("At least one exact allowed origin is required");

mkdirSync(ROOT, { recursive: true, mode: 0o700 });
const jobs = new Map();

function safeEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function plainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function safeName(value, fallback = "input.bin") {
  const raw = String(value || fallback);
  let decoded;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const name = basename(decoded).normalize("NFKC").replace(/[^\p{L}\p{N}._ -]+/gu, "_").slice(0, 180);
  return name && name !== "." && name !== ".." ? name : fallback;
}

function assertInside(root, candidate) {
  const absoluteRoot = resolve(root);
  const absoluteCandidate = resolve(candidate);
  if (absoluteCandidate !== absoluteRoot && !absoluteCandidate.startsWith(`${absoluteRoot}${sep}`)) {
    throw new Error("PATH_ESCAPE_REJECTED");
  }
  return absoluteCandidate;
}

function corsHeaders(origin) {
  const headers = {
    "access-control-allow-methods": "GET,POST,PUT,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-toonbridge-version,x-toonbridge-filename",
    "access-control-max-age": "600",
    "cache-control": "no-store",
    vary: "Origin",
    "x-content-type-options": "nosniff",
  };
  if (ALLOWED_ORIGINS.has(origin)) headers["access-control-allow-origin"] = origin;
  return headers;
}

function sendJson(response, origin, status, payload) {
  response.writeHead(status, { ...corsHeaders(origin), "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function sendError(response, origin, status, code, message) {
  sendJson(response, origin, status, { code, message });
}

function authenticate(request, origin) {
  if (!ALLOWED_ORIGINS.has(origin)) throw Object.assign(new Error("Origin is not allowed"), { status: 403, code: "ORIGIN_REJECTED" });
  if (request.headers["x-toonbridge-version"] !== "2") {
    throw Object.assign(new Error("Protocol version 2 is required"), { status: 409, code: "VERSION_MISMATCH" });
  }
  const authorization = request.headers.authorization || "";
  if (!authorization.startsWith("Bearer ") || !safeEqual(authorization.slice(7), TOKEN)) {
    throw Object.assign(new Error("Authentication failed"), { status: 401, code: "AUTH_FAILED" });
  }
}

async function readJson(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > MAX_JSON_BYTES) throw Object.assign(new Error("JSON body is too large"), { status: 413, code: "BODY_TOO_LARGE" });
    chunks.push(chunk);
  }
  if (total === 0) return {};
  const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!plainObject(value)) throw Object.assign(new Error("JSON body must be an object"), { status: 400, code: "INVALID_JSON" });
  return value;
}

function isoNow() {
  return new Date().toISOString();
}

function remoteJobId() {
  return `job_${randomUUID().replaceAll("-", "")}`;
}

function jobDirectory(id) {
  return assertInside(ROOT, join(ROOT, id));
}

function manifestPath(record) {
  return join(record.directory, "manifest.json");
}

function publicJob(record) {
  return JSON.parse(JSON.stringify(record.job));
}

function persist(record) {
  const path = manifestPath(record);
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(record.job, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, path);
}

function touch(record, patch) {
  record.job = {
    ...record.job,
    ...patch,
    updatedAt: isoNow(),
  };
  persist(record);
  return publicJob(record);
}

function validateOptions(value) {
  if (!plainObject(value)) throw Object.assign(new Error("Job options must be a JSON object"), { status: 400, code: "INVALID_OPTIONS" });
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized) > MAX_JSON_BYTES) {
    throw Object.assign(new Error("Job options are too large"), { status: 413, code: "OPTIONS_TOO_LARGE" });
  }
  return JSON.parse(serialized);
}

function validateInputs(value) {
  if (!Array.isArray(value) || value.length > 16) {
    throw Object.assign(new Error("A job may declare at most 16 inputs"), { status: 400, code: "INVALID_INPUTS" });
  }
  const ids = new Set();
  return value.map((entry) => {
    if (!plainObject(entry) || !/^[a-z0-9][a-z0-9_-]{0,79}$/u.test(entry.id || "")) {
      throw Object.assign(new Error("Invalid input descriptor"), { status: 400, code: "INVALID_INPUTS" });
    }
    if (ids.has(entry.id)) throw Object.assign(new Error("Duplicate input id"), { status: 400, code: "INVALID_INPUTS" });
    ids.add(entry.id);
    const bytes = Number(entry.bytes);
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > MAX_FILE_BYTES) {
      throw Object.assign(new Error("Invalid input size"), { status: 400, code: "INVALID_INPUTS" });
    }
    const digest = entry.sha256 === null || entry.sha256 === undefined ? null : String(entry.sha256);
    if (digest !== null && !/^sha256:[0-9a-f]{64}$/u.test(digest)) {
      throw Object.assign(new Error("Invalid input digest"), { status: 400, code: "INVALID_INPUTS" });
    }
    return {
      id: entry.id,
      name: safeName(entry.name, `${entry.id}.bin`),
      mime: String(entry.mime || "application/octet-stream").slice(0, 160),
      bytes,
      sha256: digest,
      uploaded: false,
    };
  });
}

function validateNewJob(value) {
  const tool = toolById(String(value.toolId || ""));
  const operation = operationById(String(value.toolId || ""), String(value.operationId || ""));
  if (!tool || !operation) throw Object.assign(new Error("Unknown tool or operation"), { status: 404, code: "UNKNOWN_TOOL" });
  if (tool.deployment !== "local-toonbridge" || !operation.executable) {
    throw Object.assign(new Error("This operation cannot run in ToonBridge"), { status: 409, code: "TOOL_NOT_EXECUTABLE" });
  }
  if (["manual-adapter", "research-only"].includes(tool.maturity)) {
    throw Object.assign(new Error("This adapter is not executable"), { status: 409, code: "TOOL_NOT_EXECUTABLE" });
  }
  const profile = String(value.profile || "open");
  if (!["open", "community-gpl", "research-nc"].includes(profile)) {
    throw Object.assign(new Error("Unknown license profile"), { status: 400, code: "INVALID_PROFILE" });
  }
  if (tool.licenseClass === "noncommercial" && profile !== "research-nc") {
    throw Object.assign(new Error("Noncommercial tools require the Research NC profile"), { status: 403, code: "LICENSE_REJECTED" });
  }
  const id = remoteJobId();
  const timestamp = isoNow();
  return {
    schemaVersion: 1,
    id,
    remoteId: id,
    projectId: typeof value.projectId === "string" && value.projectId.trim() ? value.projectId.trim().slice(0, 160) : null,
    profile,
    toolId: tool.id,
    operationId: operation.id,
    status: "preparing",
    createdAt: timestamp,
    updatedAt: timestamp,
    progress: { value: 0, phase: "입력 파일 준비" },
    inputs: validateInputs(value.inputs || []),
    outputs: [],
    options: validateOptions(value.options || {}),
    failure: null,
    receipt: null,
  };
}

function createRecord(job) {
  const directory = jobDirectory(job.id);
  mkdirSync(join(directory, "inputs"), { recursive: true, mode: 0o700 });
  mkdirSync(join(directory, "outputs"), { recursive: true, mode: 0o700 });
  mkdirSync(join(directory, "logs"), { recursive: true, mode: 0o700 });
  const inputPaths = new Map(job.inputs.map((input) => [
    input.id,
    assertInside(directory, join(directory, "inputs", `${input.id}-${safeName(input.name)}`)),
  ]));
  const record = {
    job,
    directory,
    inputPaths,
    child: null,
    cancelRequested: false,
    startedAt: null,
    commandDigest: null,
    probe: null,
  };
  jobs.set(job.id, record);
  persist(record);
  return record;
}

function recoverJobs() {
  for (const entry of readdirSync(ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith("job_")) continue;
    const directory = jobDirectory(entry.name);
    const path = join(directory, "manifest.json");
    if (!existsSync(path)) continue;
    try {
      const job = JSON.parse(readFileSync(path, "utf8"));
      if (!job || job.id !== entry.name || job.schemaVersion !== 1) continue;
      if (["preparing", "queued", "running"].includes(job.status)) {
        job.status = "failed";
        job.failure = { code: "SERVICE_RESTARTED", message: "로컬 실행기가 재시작되어 작업이 중단되었습니다.", retryable: true };
        job.progress = { ...job.progress, phase: "실행기 재시작으로 중단" };
        job.updatedAt = isoNow();
      }
      const inputPaths = new Map((job.inputs || []).map((input) => [
        input.id,
        assertInside(directory, join(directory, "inputs", `${input.id}-${safeName(input.name)}`)),
      ]));
      const record = { job, directory, inputPaths, child: null, cancelRequested: false, startedAt: null, commandDigest: null, probe: null };
      jobs.set(job.id, record);
      persist(record);
    } catch {
      // A corrupt manifest is ignored, never converted into an empty successful job.
    }
  }
}

recoverJobs();

async function uploadInput(request, record, inputId) {
  if (record.job.status !== "preparing" && record.job.status !== "queued") {
    throw Object.assign(new Error("Inputs cannot be changed after execution starts"), { status: 409, code: "JOB_ALREADY_STARTED" });
  }
  const descriptor = record.job.inputs.find((input) => input.id === inputId);
  const target = record.inputPaths.get(inputId);
  if (!descriptor || !target) throw Object.assign(new Error("Unknown input slot"), { status: 404, code: "INPUT_NOT_FOUND" });
  const contentLength = request.headers["content-length"] ? Number(request.headers["content-length"]) : null;
  if (contentLength !== null && contentLength !== descriptor.bytes) {
    throw Object.assign(new Error("Upload size does not match the job descriptor"), { status: 409, code: "INPUT_SIZE_MISMATCH" });
  }
  const temporary = `${target}.upload-${randomUUID()}`;
  const hash = createHash("sha256");
  let total = 0;
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      total += chunk.length;
      if (total > descriptor.bytes || total > MAX_FILE_BYTES) {
        callback(Object.assign(new Error("Uploaded input is too large"), { status: 413, code: "INPUT_TOO_LARGE" }));
        return;
      }
      hash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await pipeline(request, limiter, createWriteStream(temporary, { mode: 0o600, flags: "wx" }));
    if (total !== descriptor.bytes) throw Object.assign(new Error("Upload ended before the declared size"), { status: 409, code: "INPUT_SIZE_MISMATCH" });
    const digest = `sha256:${hash.digest("hex")}`;
    if (descriptor.sha256 && descriptor.sha256 !== digest) {
      throw Object.assign(new Error("Uploaded input digest does not match"), { status: 409, code: "INPUT_HASH_MISMATCH" });
    }
    renameSync(temporary, target);
    const inputs = record.job.inputs.map((input) => input.id === inputId
      ? { ...input, sha256: digest, uploaded: true }
      : input);
    const ready = inputs.every((input) => input.uploaded);
    return touch(record, {
      inputs,
      status: ready ? "queued" : "preparing",
      progress: { value: ready ? 0.05 : 0, phase: ready ? "실행 대기" : "입력 파일 준비" },
    });
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}


function patternExpression(name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`^${escaped.replaceAll("%04d", "[0-9]{4}").replaceAll("####", "[0-9]{4}")}$`, "u");
}

function resolvedOutputFiles(record, outputSpec) {
  const directory = dirname(outputSpec.localPath);
  const name = basename(outputSpec.localPath);
  if (!name.includes("%04d") && !name.includes("####")) {
    return existsSync(outputSpec.localPath) ? [outputSpec.localPath] : [];
  }
  const expression = patternExpression(name);
  return readdirSync(directory)
    .filter((entry) => expression.test(entry))
    .sort()
    .map((entry) => assertInside(record.directory, join(directory, entry)));
}

async function collectOutputs(record, plan) {
  const entries = [];
  let totalBytes = 0;
  for (const outputSpec of plan.outputs) {
    const paths = resolvedOutputFiles(record, outputSpec);
    if (paths.length > 32 - entries.length) {
      throw new Error("OUTPUT_COUNT_EXCEEDED");
    }
    for (const [index, path] of paths.entries()) {
      const result = await hashFileStream(path, {
        maxBytes: MAX_OUTPUT_FILE_BYTES,
        tooLargeCode: "OUTPUT_TOO_LARGE",
      });
      totalBytes += result.bytes;
      if (totalBytes > MAX_OUTPUT_TOTAL_BYTES) {
        throw Object.assign(new Error("OUTPUT_TOTAL_TOO_LARGE"), {
          code: "OUTPUT_TOTAL_TOO_LARGE",
        });
      }
      entries.push({
        id: paths.length === 1 ? outputSpec.id : `${outputSpec.id}_${String(index + 1).padStart(4, "0")}`,
        name: basename(path),
        mime: outputSpec.mime,
        bytes: result.bytes,
        sha256: result.digest,
        href: `/v2/jobs/${encodeURIComponent(record.job.id)}/outputs/${encodeURIComponent(paths.length === 1 ? outputSpec.id : `${outputSpec.id}_${String(index + 1).padStart(4, "0")}`)}`,
        localPath: path,
      });
    }
  }
  if (entries.length === 0) throw new Error("OUTPUT_MISSING");
  if (entries.length > 32) throw new Error("OUTPUT_COUNT_EXCEEDED");
  record.outputPaths = new Map(entries.map((entry) => [entry.id, entry.localPath]));
  return entries.map((entry) => ({
    id: entry.id,
    name: entry.name,
    mime: entry.mime,
    bytes: entry.bytes,
    sha256: entry.sha256,
    href: entry.href,
  }));
}

function sanitizedCommandDigest(record, plan) {
  const payload = JSON.stringify({
    toolId: record.job.toolId,
    operationId: record.job.operationId,
    binary: basename(plan.binary),
    args: plan.args.map((value) => value.replaceAll(record.directory, "$JOB")),
  });
  return sha256(payload);
}

function processEnvironment(record) {
  const runtime = assertInside(record.directory, join(record.directory, "runtime"));
  const home = assertInside(runtime, join(runtime, "home"));
  const temporary = assertInside(runtime, join(runtime, "tmp"));
  const config = assertInside(runtime, join(runtime, "config"));
  const cache = assertInside(runtime, join(runtime, "cache"));
  const data = assertInside(runtime, join(runtime, "data"));
  const state = assertInside(runtime, join(runtime, "state"));
  const blenderConfig = assertInside(config, join(config, "blender"));
  const blenderScripts = assertInside(data, join(data, "blender-scripts"));
  const blenderData = assertInside(data, join(data, "blender-data"));
  const qgisConfig = assertInside(config, join(config, "qgis"));
  const inkscapeProfile = assertInside(config, join(config, "inkscape"));
  for (const directory of [
    home,
    temporary,
    config,
    cache,
    data,
    state,
    blenderConfig,
    blenderScripts,
    blenderData,
    qgisConfig,
    inkscapeProfile,
  ]) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  return {
    PATH: process.env.PATH || "",
    HOME: home,
    TMPDIR: temporary,
    TMP: temporary,
    TEMP: temporary,
    XDG_CONFIG_HOME: config,
    XDG_CACHE_HOME: cache,
    XDG_DATA_HOME: data,
    XDG_STATE_HOME: state,
    BLENDER_USER_CONFIG: blenderConfig,
    BLENDER_USER_SCRIPTS: blenderScripts,
    BLENDER_USER_DATAFILES: blenderData,
    QGIS_CUSTOM_CONFIG_PATH: qgisConfig,
    INKSCAPE_PROFILE_DIR: inkscapeProfile,
    PYTHONNOUSERSITE: "1",
    LANG: process.env.LANG || "C.UTF-8",
    LC_ALL: process.env.LC_ALL || "C.UTF-8",
    TOONBRIDGE_JOB_DIR: record.directory,
    NO_COLOR: "1",
  };
}

async function finalizeSuccess(record, plan) {
  const outputs = await collectOutputs(record, plan);
  const tool = toolById(record.job.toolId);
  const finishedAt = isoNow();
  touch(record, {
    status: "completed",
    progress: { value: 1, phase: "완료" },
    outputs,
    failure: null,
    receipt: {
      toolId: tool.id,
      toolVersion: record.probe?.version || "version-unavailable",
      operationId: record.job.operationId,
      license: tool.license,
      source: tool.source,
      commandDigest: record.commandDigest,
      inputDigests: record.job.inputs.map((input) => input.sha256).filter(Boolean),
      outputDigests: outputs.map((entry) => entry.sha256),
      startedAt: record.startedAt,
      finishedAt,
    },
  });
}

function finalizeFailure(record, code, message, retryable = true) {
  if (record.job.status === "cancelled") return;
  touch(record, {
    status: "failed",
    progress: { ...record.job.progress, phase: "실패" },
    failure: { code, message: String(message).slice(0, 1_000), retryable },
    receipt: null,
  });
}

function writeBoundedLog(stream, chunk, state) {
  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const remaining = Math.max(0, MAX_LOG_BYTES - state.bytes);
  if (remaining > 0) stream.write(buffer.subarray(0, remaining));
  state.bytes += buffer.length;
}

function runRecord(record, plan) {
  record.startedAt = isoNow();
  record.commandDigest = sanitizedCommandDigest(record, plan);
  record.cancelRequested = false;
  record.timeoutTriggered = false;
  record.captureExceeded = false;
  record.captureBytes = 0;
  touch(record, { status: "running", progress: { value: 0.1, phase: "외부 도구 실행" }, failure: null, outputs: [] });
  const stdoutLog = createWriteStream(join(record.directory, "logs", "stdout.log"), { mode: 0o600 });
  const stderrLog = createWriteStream(join(record.directory, "logs", "stderr.log"), { mode: 0o600 });
  const captureSpec = plan.outputs.find((entry) => entry.captureStdout);
  const capture = captureSpec ? createWriteStream(captureSpec.localPath, { mode: 0o600 }) : null;
  const child = spawn(plan.binary, plan.args, {
    cwd: record.directory,
    env: processEnvironment(record),
    shell: false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  record.child = child;
  const stdoutState = { bytes: 0 };
  const stderrState = { bytes: 0 };
  child.stdout.on("data", (chunk) => {
    writeBoundedLog(stdoutLog, chunk, stdoutState);
    if (capture && !record.captureExceeded) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      record.captureBytes += buffer.length;
      if (record.captureBytes > MAX_CAPTURE_BYTES) {
        record.captureExceeded = true;
        child.kill("SIGTERM");
      } else {
        capture.write(buffer);
      }
    }
  });
  child.stderr.on("data", (chunk) => writeBoundedLog(stderrLog, chunk, stderrState));
  let settled = false;
  const timeout = setTimeout(() => {
    record.timeoutTriggered = true;
    child.kill("SIGTERM");
    setTimeout(() => child.kill("SIGKILL"), 2_000).unref();
  }, plan.timeoutMs);
  timeout.unref();

  const settle = async (code, signal, error = null) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    record.child = null;
    stdoutLog.end();
    stderrLog.end();
    if (capture) {
      capture.end();
      await once(capture, "finish").catch(() => undefined);
    }
    if (record.job.status === "cancelled" || record.cancelRequested) return;
    if (record.captureExceeded) {
      finalizeFailure(record, "OUTPUT_TOO_LARGE", "외부 도구의 텍스트 출력이 허용 크기를 넘었습니다.", false);
      return;
    }
    if (record.timeoutTriggered) {
      finalizeFailure(record, "PROCESS_TIMEOUT", "외부 도구가 제한 시간 안에 끝나지 않았습니다.", true);
      return;
    }
    if (error) {
      finalizeFailure(record, error.code === "ENOENT" ? "TOOL_MISSING" : "PROCESS_START_FAILED", "외부 도구를 시작하지 못했습니다.", true);
      return;
    }
    if (code !== 0) {
      finalizeFailure(record, "PROCESS_EXIT_FAILED", `외부 도구가 종료 코드 ${String(code)}${signal ? ` (${signal})` : ""}로 끝났습니다.`, true);
      return;
    }
    try {
      await finalizeSuccess(record, plan);
    } catch (cause) {
      const code = typeof cause?.code === "string"
        ? cause.code
        : cause instanceof Error
          ? cause.message
          : "OUTPUT_VALIDATION_FAILED";
      finalizeFailure(record, code, "외부 도구 결과를 검증하지 못했습니다.", true);
    }
  };
  child.once("error", (error) => void settle(null, null, error));
  child.once("close", (code, signal) => void settle(code, signal));
}

function startRecord(record) {
  const activeJobs = [...jobs.values()].filter((candidate) => candidate.child).length;
  if (activeJobs >= MAX_ACTIVE_JOBS) {
    throw Object.assign(new Error("Too many external jobs are already running"), { status: 429, code: "ACTIVE_JOB_LIMIT" });
  }
  if (record.job.status !== "queued") {
    throw Object.assign(new Error("Job is not ready to start"), { status: 409, code: "JOB_NOT_READY" });
  }
  if (!record.job.inputs.every((input) => input.uploaded && input.sha256)) {
    throw Object.assign(new Error("All declared inputs must be uploaded"), { status: 409, code: "INPUTS_INCOMPLETE" });
  }
  const tool = toolById(record.job.toolId);
  record.probe = probeTool(tool);
  if (record.probe.state !== "available" || !record.probe.executable) {
    finalizeFailure(record, "TOOL_MISSING", record.probe.reason, true);
    return publicJob(record);
  }
  const internalJob = {
    ...record.job,
    inputs: record.job.inputs.map((input) => ({ ...input, localPath: record.inputPaths.get(input.id) })),
  };
  let plan;
  try {
    plan = buildCommandPlan(internalJob, record.directory);
    for (const outputSpec of plan.outputs) assertInside(record.directory, outputSpec.localPath);
  } catch (cause) {
    finalizeFailure(record, cause instanceof Error ? cause.message : "ADAPTER_FAILED", "실행 계획을 안전하게 만들지 못했습니다.", false);
    return publicJob(record);
  }
  runRecord(record, plan);
  return publicJob(record);
}

function cancelRecord(record) {
  if (["completed", "cancelled"].includes(record.job.status)) return publicJob(record);
  record.cancelRequested = true;
  touch(record, {
    status: "cancelled",
    progress: { ...record.job.progress, phase: "사용자가 취소함" },
    failure: null,
    receipt: null,
  });
  if (record.child) {
    record.child.kill("SIGTERM");
    setTimeout(() => record.child?.kill("SIGKILL"), 2_000).unref();
  }
  return publicJob(record);
}

function trimRetainedJobs() {
  const removable = [...jobs.values()]
    .filter((record) => !record.child && ["completed", "failed", "cancelled"].includes(record.job.status))
    .sort((left, right) => Date.parse(left.job.updatedAt) - Date.parse(right.job.updatedAt));
  while (jobs.size > MAX_RETAINED_JOBS && removable.length > 0) {
    const record = removable.shift();
    jobs.delete(record.job.id);
    rmSync(record.directory, { recursive: true, force: true });
  }
}

function jobRecord(id) {
  const record = jobs.get(id);
  if (!record) throw Object.assign(new Error("Job not found"), { status: 404, code: "JOB_NOT_FOUND" });
  return record;
}

async function serveOutput(response, origin, record, outputId) {
  const metadata = record.job.outputs.find((entry) => entry.id === outputId);
  if (!metadata) throw Object.assign(new Error("Output not found"), { status: 404, code: "OUTPUT_NOT_FOUND" });
  const path = record.outputPaths?.get(outputId)
    ?? assertInside(record.directory, join(record.directory, "outputs", safeName(metadata.name)));
  if (!existsSync(path)) {
    throw Object.assign(new Error("Output file is missing"), { status: 410, code: "OUTPUT_MISSING" });
  }
  const verified = await hashFileStream(path, {
    maxBytes: MAX_OUTPUT_FILE_BYTES,
    tooLargeCode: "OUTPUT_TOO_LARGE",
  });
  if (verified.digest !== metadata.sha256 || verified.bytes !== metadata.bytes) {
    throw Object.assign(new Error("Output integrity check failed"), { status: 409, code: "OUTPUT_HASH_MISMATCH" });
  }
  response.writeHead(200, {
    ...corsHeaders(origin),
    "content-type": metadata.mime,
    "content-length": String(metadata.bytes),
    "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(metadata.name)}`,
  });
  createReadStream(path).pipe(response);
}

async function handleRequest(request, response) {
  const origin = String(request.headers.origin || "");
  if (request.method === "OPTIONS") {
    if (!ALLOWED_ORIGINS.has(origin)) {
      sendError(response, origin, 403, "ORIGIN_REJECTED", "Origin is not allowed");
      return;
    }
    response.writeHead(204, corsHeaders(origin));
    response.end();
    return;
  }

  authenticate(request, origin);
  const url = new URL(request.url || "/", "http://127.0.0.1");
  const pathname = url.pathname;

  if (request.method === "GET" && pathname === "/v2/status") {
    const activeJobs = [...jobs.values()].filter((record) => record.child).length;
    sendJson(response, origin, 200, {
      protocol: PROTOCOL,
      version: VERSION,
      serviceVersion: SERVICE_VERSION,
      activeJobs,
      retainedJobs: jobs.size,
    });
    return;
  }
  if (request.method === "GET" && pathname === "/v2/tools") {
    sendJson(response, origin, 200, probeAllTools());
    return;
  }
  if (request.method === "GET" && pathname === "/v2/jobs") {
    const values = [...jobs.values()]
      .map(publicJob)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt));
    sendJson(response, origin, 200, values);
    return;
  }

  if (request.method === "POST" && pathname === "/v2/jobs") {
    const record = createRecord(validateNewJob(await readJson(request)));
    trimRetainedJobs();
    sendJson(response, origin, 201, publicJob(record));
    return;
  }

  const inputMatch = pathname.match(/^\/v2\/jobs\/([a-z0-9_-]+)\/inputs\/([a-z0-9_-]+)$/u);
  if (request.method === "PUT" && inputMatch) {
    const [, id, inputId] = inputMatch;
    const result = await uploadInput(request, jobRecord(id), inputId);
    sendJson(response, origin, 200, result);
    return;
  }

  const startMatch = pathname.match(/^\/v2\/jobs\/([a-z0-9_-]+)\/start$/u);
  if (request.method === "POST" && startMatch) {
    await readJson(request);
    sendJson(response, origin, 200, startRecord(jobRecord(startMatch[1])));
    return;
  }

  const cancelMatch = pathname.match(/^\/v2\/jobs\/([a-z0-9_-]+)\/cancel$/u);
  if (request.method === "POST" && cancelMatch) {
    await readJson(request);
    sendJson(response, origin, 200, cancelRecord(jobRecord(cancelMatch[1])));
    return;
  }

  const outputMatch = pathname.match(/^\/v2\/jobs\/([a-z0-9_-]+)\/outputs\/([a-z0-9_-]+)$/u);
  if (request.method === "GET" && outputMatch) {
    await serveOutput(response, origin, jobRecord(outputMatch[1]), outputMatch[2]);
    return;
  }

  const jobMatch = pathname.match(/^\/v2\/jobs\/([a-z0-9_-]+)$/u);
  if (request.method === "GET" && jobMatch) {
    sendJson(response, origin, 200, publicJob(jobRecord(jobMatch[1])));
    return;
  }

  sendError(response, origin, 404, "NOT_FOUND", "Endpoint not found");
}

const server = createServer((request, response) => {
  void handleRequest(request, response).catch((cause) => {
    const origin = String(request.headers.origin || "");
    const status = Number.isInteger(cause?.status) ? cause.status : cause instanceof SyntaxError ? 400 : 500;
    const code = cause?.code || (cause instanceof SyntaxError ? "INVALID_JSON" : "INTERNAL_ERROR");
    const message = status >= 500 ? "로컬 실행기에서 요청을 처리하지 못했습니다." : String(cause?.message || "요청이 실패했습니다.");
    if (!response.headersSent) sendError(response, origin, status, code, message);
    else response.destroy();
  });
});

function shutdown(signal) {
  for (const record of jobs.values()) {
    if (record.child) {
      record.cancelRequested = true;
      record.child.kill("SIGTERM");
    }
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 3_000).unref();
  console.error(`ToonBridge stopping after ${signal}`);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

server.listen(PORT, HOST, () => {
  console.log(`ToonBridge v${SERVICE_VERSION} listening on http://${HOST}:${PORT}`);
  console.log(`Allowed origins: ${[...ALLOWED_ORIGINS].join(", ")}`);
  console.log(`Job directory: ${ROOT}`);
});
