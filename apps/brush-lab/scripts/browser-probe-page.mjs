// 브라우저 프로브 페이지 쪽 코드. scripts/browser-probe.mjs가 Vite dev 서버로 이 모듈을 열고
// window.__brushLabProbe의 함수를 page.evaluate로 호출한다. 엔진·레인·벤치는 src/*.ts를 그대로 import한다
// (Vite가 변환). 이 파일은 실제 브라우저(Chromium + WebGPU/WebGL2)에서만 실행된다.
import { buildFixture } from "../src/bench/fixtures/stroke-fixtures.ts";
import { pixelHash } from "../src/bench/metrics/render-metrics.ts";
import { buildReport } from "../src/bench/report/build-report.ts";
import { reportFileName, serializeReport } from "../src/bench/report/serialize.ts";
import { compareLanes } from "../src/bench/runner/ab-compare.ts";
import { diffHeatmap } from "../src/bench/runner/diff-map.ts";
import { replayFrames } from "../src/bench/runner/replay.ts";
import { runFixture } from "../src/bench/runner/run-fixture.ts";
import { probeWebGpuAdapter, requestSumiDevice } from "../src/engine/gpu/device.ts";
import { SumiComputeRuntime } from "../src/engine/gpu/pipeline-compute.ts";
import { SumiInstancedRuntime } from "../src/engine/gpu/pipeline-instanced.ts";
import { BIN_COUNT_WGSL } from "../src/engine/gpu/wgsl/bin-count.wgsl.ts";
import { BIN_SCAN_WGSL } from "../src/engine/gpu/wgsl/bin-scan.wgsl.ts";
import { BIN_SCATTER_WGSL } from "../src/engine/gpu/wgsl/bin-scatter.wgsl.ts";
import { COMPOSITE_WGSL } from "../src/engine/gpu/wgsl/composite.wgsl.ts";
import { FINE_RASTER_WGSL } from "../src/engine/gpu/wgsl/fine-raster.wgsl.ts";
import { IMPASTO_WGSL } from "../src/engine/gpu/wgsl/impasto.wgsl.ts";
import { INSTANCED_BLIT_WGSL, INSTANCED_DAB_WGSL } from "../src/engine/gpu/wgsl/instanced-dab.wgsl.ts";
import { PRESENT_WGSL } from "../src/engine/gpu/wgsl/present.wgsl.ts";
import { WET_STEP_WGSL } from "../src/engine/gpu/wgsl/wet-step.wgsl.ts";
import { PRESET_IDS, presetById } from "../src/engine/presets/catalog.ts";
import { laneById } from "../src/lanes/registry.ts";

const clock = { now: () => performance.now() };

/** 장치 요청을 가로채 uncapturederror를 모은다(레인이 만든 장치의 검증 오류가 조용히 사라지지 않게). */
const gpuErrors = [];
if (typeof GPUAdapter !== "undefined") {
  const original = GPUAdapter.prototype.requestDevice;
  GPUAdapter.prototype.requestDevice = async function patchedRequestDevice(...args) {
    const device = await original.apply(this, args);
    device.addEventListener("uncapturederror", (event) => {
      gpuErrors.push(String(event.error?.message ?? event.error));
    });
    return device;
  };
}

function makeEnv(extra = {}) {
  return {
    gpu: navigator.gpu ?? null,
    createCanvas: (w, h) => {
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      return canvas;
    },
    clock,
    userAgent: navigator.userAgent,
    ...extra,
  };
}

async function environment() {
  const env = {
    userAgent: navigator.userAgent,
    hasNavigatorGpu: Boolean(navigator.gpu),
    webgl2: false,
    adapter: null,
    softwareRenderer: null,
    features: [],
    limits: {},
    status: "unavailable",
    reasons: [],
  };
  try {
    env.webgl2 = Boolean(document.createElement("canvas").getContext("webgl2"));
  } catch {
    env.webgl2 = false;
  }
  const probed = await probeWebGpuAdapter({ gpu: navigator.gpu ?? null });
  env.status = probed.result.status;
  env.reasons = probed.result.reasons;
  env.adapter = probed.result.adapterInfo;
  env.softwareRenderer = probed.result.softwareRenderer;
  env.features = probed.result.features;
  env.limits = probed.result.limits;
  return env;
}

const WGSL_MODULES = [
  ["bin-count", BIN_COUNT_WGSL],
  ["bin-scan", BIN_SCAN_WGSL],
  ["bin-scatter", BIN_SCATTER_WGSL],
  ["fine-raster", FINE_RASTER_WGSL],
  ["wet-step", WET_STEP_WGSL],
  ["impasto", IMPASTO_WGSL],
  ["composite", COMPOSITE_WGSL],
  ["present", PRESENT_WGSL],
  ["instanced-dab", INSTANCED_DAB_WGSL],
  ["instanced-blit", INSTANCED_BLIT_WGSL],
];

/** 모든 WGSL 모듈의 getCompilationInfo 메시지 + 두 런타임(compute·instanced)의 파이프라인 생성. */
async function compile() {
  const probed = await probeWebGpuAdapter({ gpu: navigator.gpu ?? null });
  if (probed.result.status !== "supported" || !probed.adapter) {
    return { supported: false, reasons: probed.result.reasons, modules: [], pipelines: [] };
  }
  const { device, features } = await requestSumiDevice(probed.adapter);
  const modules = [];
  for (const [label, code] of WGSL_MODULES) {
    const module = device.createShaderModule({ label, code });
    const info = await module.getCompilationInfo();
    modules.push({
      label,
      bytes: code.length,
      messages: info.messages.map((m) => ({ type: m.type, line: m.lineNum, col: m.linePos, message: m.message })),
    });
  }
  const pipelines = [];
  for (const [name, create] of [
    ["compute", () => SumiComputeRuntime.create(device, { width: 64, height: 64, seed: 1, features, clock })],
    ["instanced", () => SumiInstancedRuntime.create(device, { width: 64, height: 64, seed: 1, features, clock })],
  ]) {
    device.pushErrorScope("validation");
    try {
      const runtime = await create();
      runtime.dispose();
      const scoped = await device.popErrorScope();
      pipelines.push({ name, ok: !scoped, error: scoped ? scoped.message : null });
    } catch (error) {
      await device.popErrorScope();
      pipelines.push({ name, ok: false, error: String(error?.message ?? error), code: error?.code ?? null });
    }
  }
  device.destroy();
  return { supported: true, reasons: [], modules, pipelines, uncaptured: gpuErrors.slice() };
}

function round(v, digits = 4) {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}

/**
 * 레인 1개를 fixture에 돌린다. 지우개·smudge 계열은 빈 문서에서는 아무것도 보이지 않으므로(CPU 갤러리도 배경을 깐다)
 * 같은 레인 인스턴스에서 두꺼운 마커 획을 먼저 그려 문서 위에서 실행한다(두 획 모두 같은 결정적 입력).
 */
async function runLane(laneId, fixture, program, seed, env) {
  const needsBase = program.family === "smudge" || program.family === "eraser";
  if (!needsBase) {
    const lane = laneById(laneId).create();
    return runFixture({ lane, env, fixture, program, seed });
  }
  const base = { program: presetById("marker-alcohol"), fixture: buildFixture("line", { width: fixture.width, height: fixture.height }), seed: seed + 100 };
  const lane = laneById(laneId).create();
  const capability = await lane.probe(env);
  if (capability.status !== "supported") throw Object.assign(new Error(`lane ${laneId} unavailable: ${capability.reasons.join(",")}`), { code: capability.reasons[0] });
  const t0 = env.clock.now();
  try {
    await lane.init(env, { width: fixture.width, height: fixture.height, dpr: 1, tileSize: 16, seed });
    let receipt = null;
    let frames = [];
    for (const stroke of [base, { program, fixture, seed }]) {
      lane.beginStroke(stroke.program, stroke.seed);
      frames = [];
      for (const frame of replayFrames(stroke.fixture.samples, 1000 / 60, 1)) frames.push(lane.addSamples(frame));
      receipt = await lane.endStroke();
    }
    const image = await lane.readback();
    const linear = await lane.readbackLinear();
    return {
      laneId,
      engineVersion: lane.engineVersion,
      fixtureId: fixture.id,
      fixtureSeed: fixture.seed,
      presetId: program.id,
      seed,
      canvas: { width: fixture.width, height: fixture.height, dpr: 1 },
      frameMs: 1000 / 60,
      sampleCount: fixture.samples.length,
      image,
      linear,
      receipt,
      frames,
      capability,
      elapsedMs: env.clock.now() - t0,
    };
  } finally {
    lane.dispose();
  }
}

/** 케이스 1개: CPU 참조 vs 대상 레인(+ 같은 레인 재실행 결정성). */
async function parityCase(spec, env) {
  const { laneId, preset, fixtureId, size, seed } = spec;
  const out = { laneId, preset, fixture: fixtureId, size, seed, ok: false, error: null, errorCode: null };
  try {
    const program = presetById(preset);
    const fixture = buildFixture(fixtureId, { width: size, height: size });
    const errorsBefore = gpuErrors.length;
    const cpu = await runLane("cpu-reference", fixture, program, seed, env);
    const a = await runLane(laneId, fixture, program, seed, env);
    const b = await runLane(laneId, fixture, program, seed, env);
    const cmp = compareLanes(cpu, a, program, fixture);
    out.ok = true;
    out.fuzzyMismatchPct = round(cmp.fuzzyMismatchPct);
    out.deltaE = { mean: round(cmp.deltaE.mean), p99: round(cmp.deltaE.p99), max: round(cmp.deltaE.max) };
    out.iou = round(cmp.iou);
    out.hashEqualToCpu = cmp.hashEqual;
    out.deterministic = pixelHash(a.image) === pixelHash(b.image);
    out.cpuHash = cmp.hashA;
    out.laneHash = cmp.hashB;
    out.dabCount = a.receipt.dabCount;
    out.submitCount = a.receipt.submitCount;
    out.overflowDabs = a.receipt.overflowDabs;
    out.poolTilesUsed = a.receipt.poolTilesUsed;
    out.timingSource = a.receipt.timingSource;
    out.gpuTimeMs = a.receipt.gpuTimeMs;
    out.elapsedMs = round(a.elapsedMs, 1);
    out.cpuElapsedMs = round(cpu.elapsedMs, 1);
    if (cpu.linear && a.linear) {
      let maxAbs = 0;
      const n = Math.min(cpu.linear.length, a.linear.length);
      for (let i = 0; i < n; i += 1) {
        const d = Math.abs(cpu.linear[i] - a.linear[i]);
        if (d > maxAbs) maxAbs = d;
      }
      out.linearMaxAbs = round(maxAbs, 6);
    }
    // 인증 리포트(증빙 JSON): 같은 실행(cpu·a·b)에서 정규 직렬화 텍스트까지 만든다. 파일 쓰기는 Node 쪽(--reports)이 한다.
    if (spec.report) {
      const descriptor = laneById(laneId);
      const report = await buildReport({
        lane: { id: descriptor.id, kind: descriptor.kind, status: descriptor.status, engineVersion: a.engineVersion },
        fixture,
        program,
        out: a.image,
        linear: a.linear,
        receipt: a.receipt,
        env,
        clock,
        reference: { laneId: "cpu-reference", image: cpu.image, linear: cpu.linear },
        rerun: b.image,
        frames: a.frames,
        capability: a.capability,
        seed,
        frameMs: a.frameMs,
        elapsedMs: a.elapsedMs,
      });
      out.report = { fileName: reportFileName(report), text: serializeReport(report), verdict: report.verdict };
    }
    // 하이브리드는 비닝만 wasm이 하고 래스터는 같은 GPU 파이프라인이므로 webgpu-compute와 픽셀이 같아야 한다.
    if (laneId === "wasm-gpu-hybrid") {
      const reference = await runLane("webgpu-compute", fixture, program, seed, env);
      out.hashEqualToGpuCompute = pixelHash(reference.image) === pixelHash(a.image);
    }
    out.uncaptured = gpuErrors.slice(errorsBefore);
  } catch (error) {
    out.error = String(error?.message ?? error).slice(0, 600);
    out.errorCode = error?.code ?? null;
    out.uncaptured = gpuErrors.slice();
  }
  return out;
}

async function parity(specs) {
  const env = makeEnv();
  const results = [];
  for (const spec of specs) {
    results.push(await parityCase(spec, env));
  }
  return results;
}

/** 단독 실행(임의 스크립트 조각 없이 파라미터만): 레인 1개를 fixture에 돌려 해시·영수증만 돌려준다. */
async function runOnly(spec) {
  const env = makeEnv();
  const program = presetById(spec.preset);
  const fixture = buildFixture(spec.fixtureId, { width: spec.size, height: spec.size });
  const run = await runLane(spec.laneId, fixture, program, spec.seed, env);
  return { hash: pixelHash(run.image), receipt: run.receipt, elapsedMs: round(run.elapsedMs, 1) };
}

function toDataUrl(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  ctx.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
  return canvas.toDataURL("image/png");
}

/** 디버깅용: CPU 참조·대상 레인·ΔE 히트맵을 PNG data URL로 돌려준다(--dump 옵션이 파일로 쓴다). */
async function renderPair(spec) {
  const env = makeEnv();
  const program = presetById(spec.preset);
  const fixture = buildFixture(spec.fixtureId, { width: spec.size, height: spec.size });
  const cpu = await runLane("cpu-reference", fixture, program, spec.seed, env);
  const lane = await runLane(spec.laneId, fixture, program, spec.seed, env);
  return { cpu: toDataUrl(cpu.image), lane: toDataUrl(lane.image), diff: toDataUrl(diffHeatmap(cpu.image, lane.image)) };
}

window.__brushLabProbe = {
  renderPair, environment, compile, parity, runOnly, gpuErrors, presetIds: [...PRESET_IDS] };
window.__brushLabProbeReady = true;
