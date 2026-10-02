// 브라우저 프로브의 습식 보조 측정(페이지 쪽 코드). scripts/browser-probe-page.mjs가 import해 window.__brushLabProbe에 붙인다.
//
// 1) wetScene — 단일 서브스텝·궤적 패리티(습식 GPU 미러 명세 §9.2): CPU 참조 장면(`engine/testing/wet-scenes.ts`)의 시작 상태를 GPU 습식
//    풀에 올리고 같은 프레임 수만큼 전진해 코어·확장 풀 채널별 max|Δ|·상대 L2·질량 장부·활성 타일 집합을 CPU와 대조한다.
// 2) sequence — 다획 지속 레이어 패리티: 같은 레인 인스턴스에서 여러 획(수채→수채→건식, 수채→유화 …)을 이어 그린 최종 이미지·선형 값을
//    cpu-reference와 대조한다(획 끝에 굽지 않는 습식 층·표시 시점 합성·매체 전환 평탄화를 검증).
// 소프트웨어 렌더러(SwiftShader) 결과이며 성능·승격 증거가 아니다.
import { buildFixture } from "../src/bench/fixtures/stroke-fixtures.ts";
import { imageToLab } from "../src/bench/metrics/lab-math.ts";
import { coverageIoU, deltaEStatsImages, fuzzyMismatchPct, pixelHash } from "../src/bench/metrics/render-metrics.ts";
import { deltaE76 } from "../src/engine/core/color.ts";
import { fnv1a64 } from "../src/engine/core/hash.ts";
import { replayFrames } from "../src/bench/runner/replay.ts";
import { DAB_FLOATS, DabBatch } from "../src/engine/core/dab-layout.ts";
import { StrokePipeline } from "../src/engine/dynamics/stroke-pipeline.ts";
import { requiredBufferLimits } from "../src/engine/gpu/buffers.ts";
import { probeWebGpuAdapter, requestSumiDevice, SUMI_REQUIRED_LIMITS } from "../src/engine/gpu/device.ts";
import { SumiComputeRuntime } from "../src/engine/gpu/pipeline-compute.ts";
import { presetById } from "../src/engine/presets/catalog.ts";
import { paperFor, renderStroke, splitFrames, Surface } from "../src/engine/raster/reference-renderer.ts";
import { normalizeProgram } from "../src/engine/presets/program-schema.ts";
import { zigzagStroke } from "../src/engine/testing/synthetic-strokes.ts";
import { depositDisc, FILM_SCENE_SIZE, fillWaterFilm, filmDiffusionParams, newScene, stepFrames, uniformFiberPaper } from "../src/engine/testing/wet-scenes.ts";
import { generatePaper, DEFAULT_PAPER_SPEC } from "../src/engine/texture/paper-grain.ts";
import { wetMediumPreset } from "../src/engine/wet/params.ts";
import { laneById } from "../src/lanes/registry.ts";

const clock = { now: () => performance.now() };

function round(v, digits = 6) {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}

/** CPU 습식 상태 → GPU에 올릴 타일 목록(복사). 확장 풀이 없으면 0. */
function exportCpuState(state) {
  const out = [];
  for (const [tile, slot] of state.pool.entries()) {
    const core = new Float32Array(state.pool.view(slot));
    const eSlot = state.ext ? state.ext.slotOf(tile) : undefined;
    const ext = state.ext && eSlot !== undefined ? new Float32Array(state.ext.view(eSlot)) : new Float32Array(23 * 256);
    out.push({ tile, core, ext, live: state.active.has(tile) });
  }
  return out;
}

/** 채널 그룹: [이름, 풀, 시작 채널, 채널 수]. */
const GROUPS = [
  ["water(ws)", "core", 0, 1],
  ["velocity", "core", 1, 2],
  ["pigment(g)", "core", 3, 4],
  ["fixed(d)", "core", 8, 4],
  ["height", "core", 7, 1],
  ["lbm f0..f8", "ext", 0, 9],
  ["rho", "ext", 9, 1],
  ["capillary(s)", "ext", 10, 1],
  ["glue", "ext", 11, 1],
  ["cure", "ext", 12, 1],
  ["hard(D)", "ext", 13, 4],
  ["oil(color,wet,base)", "ext", 17, 5],
  ["wetBlur(B)", "ext", 22, 1],
];

function groupSlice(tile, pool, ch0, count) {
  const arr = pool === "core" ? tile.core : tile.ext;
  return arr.subarray(ch0 * 256, (ch0 + count) * 256);
}

/** CPU·GPU 상태 비교(타일 합집합, 없는 타일은 0). */
function compareStates(cpuTiles, gpuTiles) {
  const cpuBy = new Map(cpuTiles.map((t) => [t.tile, t]));
  const gpuBy = new Map(gpuTiles.map((t) => [t.tile, t]));
  const tiles = [...new Set([...cpuBy.keys(), ...gpuBy.keys()])].sort((a, b) => a - b);
  const zero = { tile: -1, core: new Float32Array(12 * 256), ext: new Float32Array(23 * 256), live: false };
  const groups = {};
  for (const [name, pool, ch0, count] of GROUPS) {
    let maxAbs = 0;
    let sumSq = 0;
    let refSq = 0;
    let over3 = 0;
    let over2 = 0;
    let total = 0;
    for (const t of tiles) {
      const a = groupSlice(cpuBy.get(t) ?? zero, pool, ch0, count);
      const b = groupSlice(gpuBy.get(t) ?? zero, pool, ch0, count);
      for (let i = 0; i < a.length; i += 1) {
        const d = Math.abs(a[i] - b[i]);
        if (d > maxAbs) maxAbs = d;
        if (d > 1e-3) over3 += 1;
        if (d > 1e-2) over2 += 1;
        sumSq += d * d;
        refSq += a[i] * a[i];
      }
      total += a.length;
    }
    // over1e3Pct·over1e2Pct: |Δ|가 1e-3·1e-2를 넘는 값의 비율(%) — 어긋남이 퍼져 있는지 몇 셀에 국한되는지.
    groups[name] = {
      maxAbs: round(maxAbs, 8),
      relL2: round(Math.sqrt(sumSq) / (Math.sqrt(refSq) + 1e-12), 8),
      over1e3Pct: round((over3 / Math.max(1, total)) * 100, 5),
      over1e2Pct: round((over2 / Math.max(1, total)) * 100, 5),
    };
  }
  // 질량 장부(물 = ws + ρ + s, 안료 = g + d + D).
  const mass = (list) => {
    let water = 0;
    let pigment = 0;
    for (const t of list) {
      for (let i = 0; i < 256; i += 1) {
        water += t.core[i] + t.ext[9 * 256 + i] + t.ext[10 * 256 + i];
        pigment += t.core[6 * 256 + i] + t.core[11 * 256 + i] + t.ext[16 * 256 + i];
      }
    }
    return { water, pigment };
  };
  const mc = mass(cpuTiles);
  const mg = mass(gpuTiles);
  const liveCpu = new Set(cpuTiles.filter((t) => t.live).map((t) => t.tile));
  const liveGpu = new Set(gpuTiles.filter((t) => t.live).map((t) => t.tile));
  let liveMismatch = 0;
  for (const t of liveCpu) if (!liveGpu.has(t)) liveMismatch += 1;
  for (const t of liveGpu) if (!liveCpu.has(t)) liveMismatch += 1;
  let worstAbs = 0;
  let worstRel = 0;
  for (const g of Object.values(groups)) {
    worstAbs = Math.max(worstAbs, g.maxAbs);
    worstRel = Math.max(worstRel, g.relL2);
  }
  return {
    groups,
    worstMaxAbs: worstAbs,
    worstRelL2: worstRel,
    mass: {
      cpuWater: round(mc.water, 6),
      gpuWater: round(mg.water, 6),
      waterRel: round(Math.abs(mc.water - mg.water) / (Math.abs(mc.water) + 1e-12), 8),
      cpuPigment: round(mc.pigment, 6),
      gpuPigment: round(mg.pigment, 6),
      pigmentRel: round(Math.abs(mc.pigment - mg.pigment) / (Math.abs(mc.pigment) + 1e-12), 8),
    },
    cpuTiles: cpuTiles.length,
    gpuTiles: gpuTiles.length,
    liveCpu: liveCpu.size,
    liveGpu: liveGpu.size,
    liveMismatch,
  };
}

/** 장면 정의: 시작 상태를 만든다. */
function buildScene(spec) {
  const kind = spec.scene;
  if (kind === "edge") {
    // paper: "fiber" = 균일 섬유 종이, "preset" = 프리셋 종이 스펙으로 만든 실제 종이(paperFor), 없으면 균일 등방 종이.
    const paper = spec.paper === "fiber" ? uniformFiberPaper(spec.fiberAngle ?? 0, 256) : spec.paper === "preset" ? paperFor(presetById(spec.preset).paper) : null;
    const scene = newScene(spec.size ?? 128, paper);
    const r = spec.radius ?? 12;
    depositDisc(scene, { x: scene.size / 2, y: scene.size / 2, rx: r, ry: r, wet: spec.water ?? 1.2, pigmentMass: spec.mass ?? 0.3 });
    return scene;
  }
  if (kind === "film") {
    const paper = spec.fiberAngle === undefined ? null : uniformFiberPaper(spec.fiberAngle, 256);
    const scene = newScene(FILM_SCENE_SIZE, paper);
    fillWaterFilm(scene, spec.film ?? 0.3);
    const r = spec.dropRadius ?? 2;
    depositDisc(scene, { x: FILM_SCENE_SIZE / 2, y: FILM_SCENE_SIZE / 2, rx: r, ry: r, wet: 0, pigmentMass: 1 });
    return scene;
  }
  if (kind === "granulation") {
    const paperSpec = { ...DEFAULT_PAPER_SPEC };
    const scene = newScene(spec.size ?? 128, generatePaper(paperSpec, 256));
    depositDisc(scene, { x: scene.size / 2, y: scene.size / 2, rx: spec.radius ?? 30, ry: spec.radius ?? 30, wet: 1.2, pigmentMass: spec.mass ?? 0.3 });
    return scene;
  }
  throw new Error(`알 수 없는 장면: ${kind}`);
}

/**
 * 습식 장면 패리티. spec: { scene, medium, overrides?, frames: [1, 60], size?, fiberAngle?, paper? ... }.
 * frames의 각 번호까지 CPU·GPU를 전진해 그 시점 상태를 비교한다.
 */
async function wetScene(spec) {
  const out = { scene: spec.scene, medium: spec.medium, ok: false, error: null, checkpoints: [] };
  let device = null;
  try {
    const probed = await probeWebGpuAdapter({ gpu: navigator.gpu ?? null });
    if (probed.result.status !== "supported" || !probed.adapter) throw new Error(`WebGPU 사용 불가: ${probed.result.reasons.join(",")}`);
    const requested = await requestSumiDevice(probed.adapter);
    device = requested.device;
    // preset: 프리셋의 습식 파라미터를 그대로 쓴다(매체 기본값이 아니라 실제 프리셋 값 — 획 안에서만 드러나는 파라미터 경로 점검).
    const base = spec.preset ? presetById(spec.preset).wet : wetMediumPreset(spec.medium, spec.overrides ?? {});
    // 물막 확산 장면은 침착·증발·흡수를 끈 순수 확산 파라미터를 쓴다(CPU 장면 헬퍼와 같다).
    const params = spec.scene === "film" ? filmDiffusionParams(base) : base;
    const scene = buildScene(spec);
    const size = scene.size;
    const tilesAcross = Math.ceil(size / 16);
    const runtime = await SumiComputeRuntime.create(device, {
      width: size,
      height: size,
      seed: 1,
      wetCapacityTiles: tilesAcross * tilesAcross,
      features: requested.features,
      clock,
    });
    const program = normalizeProgram({
      id: "wet-scene",
      name: "wet scene",
      family: "watercolor",
      description: "",
      deposition: { model: "wet-flow" },
      wet: params,
      paper: spec.preset ? presetById(spec.preset).paper : { enabled: scene.paper !== null },
    });
    runtime.beginStroke(program, 1);
    if (scene.paper) runtime.loadWetPaper(scene.paper);
    const initial = exportCpuState(scene.state);
    runtime.loadWetState(initial);
    let at = 0;
    for (const target of spec.frames) {
      const t0 = performance.now();
      stepFrames(scene, params, target - at);
      const cpuMs = performance.now() - t0;
      const t1 = performance.now();
      runtime.stepWetFrames(target - at);
      const gpuState = await runtime.readbackWetState();
      const gpuMs = performance.now() - t1;
      at = target;
      const cpuNow = exportCpuState(scene.state);
      const cmp = compareStates(cpuNow, gpuState.tiles);
      // 장면이 실제로 움직였는지(시작 상태 대비 CPU 변화량): 이 값이 작으면 위 오차는 의미가 약하다.
      const moved = compareStates(initial, cpuNow);
      // 경화 카운터(cure)는 프레임 수를 세는 정수라 이동량 최대를 지배하므로 뺀다.
      let movedMax = 0;
      for (const [name, g] of Object.entries(moved.groups)) if (name !== "cure") movedMax = Math.max(movedMax, g.maxAbs);
      out.checkpoints.push({ frame: target, cpuMs: round(cpuMs, 1), gpuMs: round(gpuMs, 1), cpuMovedMaxAbs: round(movedMax, 6), ...cmp });
    }
    out.ok = true;
    runtime.dispose();
  } catch (error) {
    out.error = String(error?.message ?? error).slice(0, 600);
    out.errorCode = error?.code ?? null;
  } finally {
    device?.destroy();
  }
  return out;
}

/**
 * 실제 획 도중 습식 상태 패리티: 같은 입력(fixture)을 CPU `Surface`와 GPU 런타임에 프레임 단위로 먹이고, 체크포인트 프레임마다
 * 습식 풀(코어 12 + 확장 23채널)을 대조한다. 합성 8비트 이미지가 아니라 상태 자체의 어긋남(문턱 분기 뒤집힘·누적 오차)을 직접 본다.
 * spec: { preset, fixtureId, size, seed, checkpoints: [프레임 번호...] } (마지막 체크포인트는 꼬리 프레임 뒤·endStroke 전).
 */
async function strokeState(spec) {
  const { preset, fixtureId, size, seed } = spec;
  const out = { preset, fixture: fixtureId, size, seed, ok: false, error: null, errorCode: null, checkpoints: [] };
  let device = null;
  try {
    const base = presetById(preset);
    // noPaper: 종이를 끄고(그레인 응답 1) 같은 획을 돌린다 — 래스터 그레인이 8비트 paperTex를 쓰는 데서 오는 어긋남을 분리하는 진단용.
    let program = spec.noPaper ? { ...base, paper: { ...base.paper, enabled: false } } : base;
    // roundTip: 팁을 둥근 팁(마스크 없음)으로 바꿔 같은 획을 돌린다 — 팁 마스크 샘플링에서 오는 어긋남을 분리하는 진단용.
    if (spec.roundTip) program = { ...program, tip: { ...program.tip, kind: "round" } };
    const fixture = buildFixture(fixtureId, { width: size, height: size });
    const frames = [...replayFrames(fixture.samples, 1000 / 60, 1)];
    const probed = await probeWebGpuAdapter({ gpu: navigator.gpu ?? null });
    if (probed.result.status !== "supported" || !probed.adapter) throw new Error(`WebGPU 사용 불가: ${probed.result.reasons.join(",")}`);
    const requested = await requestSumiDevice(probed.adapter);
    device = requested.device;
    const runtime = await SumiComputeRuntime.create(device, { width: size, height: size, seed, features: requested.features, clock });
    const surface = new Surface(size, size);
    surface.beginStroke(program, seed);
    const cpuPipe = new StrokePipeline(program, seed, undefined, surface.paperField());
    runtime.beginStroke(program, seed);
    const gpuPipe = new StrokePipeline(program, seed, undefined, program.paper.enabled ? paperFor(program.paper) : null);
    const total = frames.length + 1;
    const marks = new Set((spec.checkpoints ?? []).map((n) => Math.min(n, total)));
    marks.add(total);
    const dabsAt = [];
    const compareAt = async (frame) => {
      const cpuTiles = surface.wet ? exportCpuState(surface.wet) : [];
      const gpu = await runtime.readbackWetState();
      out.checkpoints.push({ frame, dabsSoFar: dabsAt.reduce((a, b) => a + b, 0), ...compareStates(cpuTiles, gpu.tiles) });
    };
    // CPU·GPU가 받는 dab 배치가 같은지(입력 파이프라인 결정성)도 함께 본다: 개수·값이 다르면 상태 차이는 래스터·물리가 아니라 입력 때문이다.
    const batchDiff = { countMismatch: 0, valueMismatch: 0, maxAbs: 0 };
    const gpuBatches = [];
    for (let i = 0; i < frames.length; i += 1) {
      const batch = cpuPipe.push(frames[i]);
      const gpuBatch = gpuPipe.push(frames[i]);
      dabsAt.push(batch.count);
      if (batch.count !== gpuBatch.count) batchDiff.countMismatch += 1;
      else {
        for (let k = 0; k < batch.count * DAB_FLOATS; k += 1) {
          const d = Math.abs(batch.data[k] - gpuBatch.data[k]);
          if (d > 0) batchDiff.valueMismatch += 1;
          if (d > batchDiff.maxAbs) batchDiff.maxAbs = d;
        }
      }
      surface.addDabs(batch);
      runtime.submitBatch(gpuBatch);
      gpuBatches.push(gpuBatch.count);
      if (marks.has(i + 1)) await compareAt(i + 1);
    }
    out.batchDiff = batchDiff;
    out.gpuDabs = gpuBatches.reduce((a, b) => a + b, 0);
    surface.addDabs(cpuPipe.finish());
    runtime.submitBatch(gpuPipe.finish());
    if (marks.has(total)) await compareAt(total);
    out.frames = total;
    out.ok = true;
    runtime.dispose();
  } catch (error) {
    out.error = String(error?.message ?? error).slice(0, 600);
    out.errorCode = error?.code ?? null;
  } finally {
    device?.destroy();
  }
  return out;
}

/**
 * 장치 한도 점검(실 장치 `requiredLimits` 요청): 큰 습식 풀 용량(2048²·wetCapacityTiles 6000 → 확장 풀 141 MB > 기본 128 MiB 바인딩)을
 * 레인이 어댑터 한도 범위에서 요청해 장치를 만들고, 그 장치로 실제 습식 획이 검증 오류 없이 그려지는지 본다. 같은 용량이 어댑터 한도를 넘으면
 * StrokeBudgetExceededError로 init이 실패해야 한다(무음 실패 없음).
 */
async function limitsCase(env, gpuErrors, spec) {
  const out = { ok: false, error: null, errorCode: null };
  try {
    const size = spec.size ?? 2048;
    const tiles = spec.wetCapacityTiles ?? 6000;
    const probed = await probeWebGpuAdapter({ gpu: navigator.gpu ?? null });
    if (probed.result.status !== "supported" || !probed.adapter) throw new Error(`WebGPU 사용 불가: ${probed.result.reasons.join(",")}`);
    const adapterLimits = probed.result.limits;
    out.adapterLimits = { maxStorageBufferBindingSize: adapterLimits.maxStorageBufferBindingSize, maxBufferSize: adapterLimits.maxBufferSize };
    const need = requiredBufferLimits({ width: size, height: size, wetCapacityTiles: tiles });
    out.need = need;
    // 1) 같은 식으로 장치를 요청해 실제 장치 한도가 요청을 반영하는지 읽는다.
    const probeDevice = await requestSumiDevice(probed.adapter, {
      requiredLimits: {
        ...SUMI_REQUIRED_LIMITS,
        maxStorageBufferBindingSize: Math.max(SUMI_REQUIRED_LIMITS.maxStorageBufferBindingSize ?? 0, need.maxStorageBufferBindingSize),
        maxBufferSize: Math.max(SUMI_REQUIRED_LIMITS.maxBufferSize ?? 0, need.maxBufferSize),
      },
    });
    out.deviceLimits = { maxStorageBufferBindingSize: probeDevice.device.limits.maxStorageBufferBindingSize, maxBufferSize: probeDevice.device.limits.maxBufferSize };
    probeDevice.device.destroy();
    // 2) 레인으로 큰 용량 init → 습식 획 1개 → 이미지에 잉크가 보이고 검증 오류가 없다.
    const errorsBefore = gpuErrors.length;
    const lane = laneById("webgpu-compute").create();
    await lane.init(env, { width: size, height: size, dpr: 1, tileSize: 16, seed: 1, wetCapacityTiles: tiles });
    try {
      lane.beginStroke(presetById("watercolor-wet"), 1);
      for (const frame of splitFrames(zigzagStroke(128, { durationMs: 200 }))) lane.addSamples(frame);
      const receipt = await lane.endStroke();
      const image = await lane.readback();
      let inked = 0;
      for (let i = 3; i < image.data.length; i += 4) if (image.data[i] > 0) inked += 1;
      out.inkedPixels = inked;
      out.dabCount = receipt.dabCount;
      out.poolTilesUsed = receipt.poolTilesUsed;
    } finally {
      lane.dispose();
    }
    out.uncaptured = gpuErrors.slice(errorsBefore);
    // 3) 2048²의 전 타일(16384) 용량: 어댑터 한도 안이면 장치를 요청해 만들고, 넘으면 StrokeBudgetExceededError로 init이 실패해야 한다(무음 실패 없음).
    out.fullCapacityTiles = 16384;
    try {
      const lane2 = laneById("webgpu-compute").create();
      await lane2.init(env, { width: 2048, height: 2048, dpr: 1, tileSize: 16, seed: 1, wetCapacityTiles: 16384 });
      lane2.dispose();
      out.fullCapacityResult = "created";
    } catch (error) {
      out.fullCapacityResult = `${error?.name ?? "Error"}:${error?.code ?? ""}`;
    }
    out.ok = true;
  } catch (error) {
    out.error = String(error?.message ?? error).slice(0, 600);
    out.errorCode = error?.code ?? null;
  }
  return out;
}

/**
 * 타이밍 영수증 점검: 같은 레인에서 길이가 다른 획 3개(프레임 수 6·1·6 정도)를 이어 그리고 영수증의 gpuTimeMs·timingSource를 읽는다.
 * timestamp-query가 있으면 획마다 자기 값이어야 하고(첫 획이 null이거나 직전 획의 값이 섞이면 안 된다), 짧은 획(1프레임)의 값은 긴 획보다 작아야 한다.
 */
async function timingCase(spec, env) {
  const { laneId, size, seed } = spec;
  const out = { laneId, size, ok: false, error: null, errorCode: null, strokes: [] };
  try {
    const lane = laneById(laneId).create();
    const capability = await lane.probe(env);
    if (capability.status !== "supported") throw Object.assign(new Error(`lane ${laneId} unavailable: ${capability.reasons.join(",")}`), { code: capability.reasons[0] });
    out.features = capability.features;
    await lane.init(env, { width: size, height: size, dpr: 1, tileSize: 16, seed });
    try {
      // 긴 획(curve) → 짧은 획(fast-flick) → 긴 획(curve). 프레임 수가 달라 직전 획의 값이 섞이면 드러난다.
      for (const [i, fixtureId] of ["curve", "fast-flick", "curve"].entries()) {
        const fixture = buildFixture(fixtureId, { width: size, height: size });
        lane.beginStroke(presetById("pencil-hb"), seed + i);
        let frames = 0;
        for (const frame of replayFrames(fixture.samples, 1000 / 60, 1)) {
          lane.addSamples(frame);
          frames += 1;
        }
        const receipt = await lane.endStroke();
        out.strokes.push({ fixture: fixtureId, frames, gpuTimeMs: receipt.gpuTimeMs === null ? null : round(receipt.gpuTimeMs, 3), timingSource: receipt.timingSource, submitCount: receipt.submitCount });
      }
    } finally {
      lane.dispose();
    }
    out.ok = true;
  } catch (error) {
    out.error = String(error?.message ?? error).slice(0, 600);
    out.errorCode = error?.code ?? null;
  }
  return out;
}

/**
 * 단일 dab 커버리지 스윕: 같은 dab 1개를 CPU `Surface`와 GPU 런타임에 올려 획 레이어(건식 스탬프, 종이 없음)의 선형 premultiplied 알파 차이를 잰다.
 * 래스터 쪽 shapeExp·각도·경도 같은 매개변수 경로의 f32/f64 어긋남을 상태 물리와 분리해서 본다.
 */
async function dabSweep(spec) {
  const out = { ok: false, error: null, errorCode: null, cases: [] };
  let device = null;
  try {
    const probed = await probeWebGpuAdapter({ gpu: navigator.gpu ?? null });
    if (probed.result.status !== "supported" || !probed.adapter) throw new Error(`WebGPU 사용 불가: ${probed.result.reasons.join(",")}`);
    const requested = await requestSumiDevice(probed.adapter);
    device = requested.device;
    const size = 64;
    const program = normalizeProgram({ id: "dab-sweep", name: "sweep", family: "pencil", description: "", deposition: { model: "dry-stamp" }, paper: { enabled: false } });
    for (const shapeExp of spec.shapeExps ?? [2, 3, 4]) {
      for (const angle of spec.angles ?? [0, 0.3, 1, 2.5]) {
        for (const [rx, ry] of spec.radii ?? [[8, 8], [10, 5]]) {
          const dab = { x: 32.3, y: 31.7, rx, ry, angle, hardness: 0.6, flow: 1, shapeExp, r: 0, g: 0, b: 0, a: 1, tipKind: "round", seed: 1, grain: 0, wet: 0, pigmentMass: 0.5, erase: false, smudge: false, dualTip: false, lockAlpha: false, impasto: false, deposition: "dry-stamp" };
          const batch = new DabBatch(1);
          batch.push(dab);
          const surface = new Surface(size, size);
          surface.beginStroke(program, 1);
          surface.addDabs(batch);
          surface.endStroke();
          const cpu = surface.toLinear();
          const runtime = await SumiComputeRuntime.create(device, { width: size, height: size, seed: 1, features: requested.features, clock });
          runtime.beginStroke(program, 1);
          runtime.submitBatch(batch);
          await runtime.endStroke();
          const gpu = await runtime.readbackLinear();
          runtime.dispose();
          let maxAbs = 0;
          let at = 0;
          for (let i = 3; i < cpu.length; i += 4) {
            const d = Math.abs(cpu[i] - gpu[i]);
            if (d > maxAbs) {
              maxAbs = d;
              at = i >> 2;
            }
          }
          out.cases.push({ shapeExp, angle, rx, ry, maxAlphaAbs: round(maxAbs, 8), x: at % size, y: Math.floor(at / size), cpuAlpha: cpu[at * 4 + 3], gpuAlpha: gpu[at * 4 + 3] });
        }
      }
    }
    out.ok = true;
  } catch (error) {
    out.error = String(error?.message ?? error).slice(0, 600);
    out.errorCode = error?.code ?? null;
  } finally {
    device?.destroy();
  }
  return out;
}

/** 8비트 채널 차이 통계: 전체 최대·0이 아닌 비율·1 초과 비율, 채널(RGBA)별 최대와 가장 크게 어긋난 픽셀의 위치·값. */
function byteDiff(a, b) {
  const n = Math.min(a.data.length, b.data.length);
  let max = 0;
  let nonzero = 0;
  let gt1 = 0;
  const channelMax = [0, 0, 0, 0];
  let worst = null;
  for (let i = 0; i < n; i += 1) {
    const d = Math.abs(a.data[i] - b.data[i]);
    if (d > 0) nonzero += 1;
    if (d > 1) gt1 += 1;
    const ch = i & 3;
    if (d > channelMax[ch]) channelMax[ch] = d;
    if (d > max) {
      max = d;
      const px = i >> 2;
      worst = { x: px % a.width, y: Math.floor(px / a.width), channel: ch, cpu: [...a.data.subarray(i - ch, i - ch + 4)], gpu: [...b.data.subarray(i - ch, i - ch + 4)] };
    }
  }
  // 알파 가중(premultiplied) 8비트 차이 최대: 거의 투명한 픽셀의 straight 색 불안정(알파 0 근처 rgb)을 걸러 낸 눈에 보이는 차이.
  let premulMax = 0;
  for (let i = 0; i + 3 < n; i += 4) {
    const ac = a.data[i + 3] / 255;
    const ag = b.data[i + 3] / 255;
    for (let c = 0; c < 3; c += 1) premulMax = Math.max(premulMax, Math.abs(a.data[i + c] * ac - b.data[i + c] * ag));
  }
  return { max, nonzeroPct: round((nonzero / n) * 100, 4), gt1Pct: round((gt1 / n) * 100, 6), channelMax, premulMax: round(premulMax, 3), worst };
}

/** 픽셀별 ΔE76(흰 배경 합성) 최대 위치와 양쪽 RGBA. */
function worstDeltaE(a, b) {
  const la = imageToLab(a);
  const lb = imageToLab(b);
  let best = -1;
  let at = 0;
  const n = a.width * a.height;
  for (let i = 0; i < n; i += 1) {
    const o = i * 3;
    const v = deltaE76([la[o], la[o + 1], la[o + 2]], [lb[o], lb[o + 1], lb[o + 2]]);
    if (v > best) {
      best = v;
      at = i;
    }
  }
  return { de: round(best, 4), x: at % a.width, y: Math.floor(at / a.width), cpu: [...a.data.subarray(at * 4, at * 4 + 4)], gpu: [...b.data.subarray(at * 4, at * 4 + 4)] };
}

/** 한 레인에서 획 목록을 이어 그리고 최종 이미지·선형 값을 읽는다. */
async function runSequence(laneId, steps, size, seed, env) {
  const lane = laneById(laneId).create();
  const capability = await lane.probe(env);
  if (capability.status !== "supported") throw Object.assign(new Error(`lane ${laneId} unavailable: ${capability.reasons.join(",")}`), { code: capability.reasons[0] });
  await lane.init(env, { width: size, height: size, dpr: 1, tileSize: 16, seed });
  try {
    let k = 0;
    for (const step of steps) {
      const program = presetById(step.preset);
      const fixture = buildFixture(step.fixtureId, { width: size, height: size });
      lane.beginStroke(program, seed + k);
      for (const frame of replayFrames(fixture.samples, 1000 / 60, 1)) lane.addSamples(frame);
      await lane.endStroke();
      k += 1;
    }
    return { image: await lane.readback(), linear: await lane.readbackLinear() };
  } finally {
    lane.dispose();
  }
}

/** 다획 지속 레이어 패리티. spec: { laneId, steps: [{ preset, fixtureId }], size, seed }. */
async function sequenceCase(spec, env) {
  const { laneId, steps, size, seed } = spec;
  const out = { laneId, sequence: steps.map((s) => `${s.preset}:${s.fixtureId}`).join(">"), size, seed, ok: false, error: null, errorCode: null };
  try {
    const cpu = await runSequence("cpu-reference", steps, size, seed, env);
    const a = await runSequence(laneId, steps, size, seed, env);
    const b = await runSequence(laneId, steps, size, seed, env);
    out.ok = true;
    out.fuzzyMismatchPct = round(fuzzyMismatchPct(cpu.image.data, a.image.data, size, size), 4);
    const de = deltaEStatsImages(cpu.image, a.image);
    out.deltaE = { mean: round(de.mean, 4), p99: round(de.p99, 4), max: round(de.max, 4) };
    out.iou = round(coverageIoU(cpu.image, a.image), 4);
    out.hashEqualToCpu = pixelHash(cpu.image) === pixelHash(a.image);
    out.deterministic = pixelHash(a.image) === pixelHash(b.image);
    out.byteDiff = byteDiff(cpu.image, a.image);
    if (cpu.linear && a.linear) {
      let maxAbs = 0;
      const n = Math.min(cpu.linear.length, a.linear.length);
      for (let i = 0; i < n; i += 1) maxAbs = Math.max(maxAbs, Math.abs(cpu.linear[i] - a.linear[i]));
      out.linearMaxAbs = round(maxAbs, 6);
    }
  } catch (error) {
    out.error = String(error?.message ?? error).slice(0, 600);
    out.errorCode = error?.code ?? null;
  }
  return out;
}

/**
 * 합성 지그재그 패리티(`zigzagStroke(size, 600 ms)`, 빈 문서): CPU `renderStroke`의 해시(습식 스냅샷 테스트·명세 §9.3 기준값과 같은 입력)와
 * 대상 레인의 픽셀을 대조한다. spec: { laneId, preset, size, seed }.
 */
async function syntheticCase(spec, env) {
  const { laneId, preset, size, seed } = spec;
  const out = { laneId, preset, size, seed, ok: false, error: null, errorCode: null };
  try {
    const program = presetById(preset);
    const samples = zigzagStroke(size, { durationMs: 600 });
    const cpu = renderStroke(program, samples, { width: size, height: size, seed });
    out.cpuHash = fnv1a64(new Uint8Array(cpu.image.data.buffer, cpu.image.data.byteOffset, cpu.image.data.byteLength));
    const runGpu = async () => {
      const lane = laneById(laneId).create();
      const capability = await lane.probe(env);
      if (capability.status !== "supported") throw Object.assign(new Error(`lane ${laneId} unavailable: ${capability.reasons.join(",")}`), { code: capability.reasons[0] });
      await lane.init(env, { width: size, height: size, dpr: 1, tileSize: 16, seed });
      try {
        lane.beginStroke(program, seed);
        for (const frame of splitFrames(samples)) lane.addSamples(frame);
        const receipt = await lane.endStroke();
        return { image: await lane.readback(), receipt };
      } finally {
        lane.dispose();
      }
    };
    const a = await runGpu();
    const b = await runGpu();
    out.ok = true;
    out.laneHash = pixelHash(a.image);
    out.cpuPixelHash = pixelHash(cpu.image);
    out.hashEqualToCpu = out.laneHash === out.cpuPixelHash;
    out.deterministic = pixelHash(a.image) === pixelHash(b.image);
    out.fuzzyMismatchPct = round(fuzzyMismatchPct(cpu.image.data, a.image.data, size, size), 4);
    const de = deltaEStatsImages(cpu.image, a.image);
    out.deltaE = { mean: round(de.mean, 4), p99: round(de.p99, 4), max: round(de.max, 4) };
    out.iou = round(coverageIoU(cpu.image, a.image), 4);
    out.byteDiff = byteDiff(cpu.image, a.image);
    out.worstDeltaE = worstDeltaE(cpu.image, a.image);
    out.dabCount = a.receipt.dabCount;
    out.submitCount = a.receipt.submitCount;
    out.poolTilesUsed = a.receipt.poolTilesUsed;
  } catch (error) {
    out.error = String(error?.message ?? error).slice(0, 600);
    out.errorCode = error?.code ?? null;
  }
  return out;
}

export { byteDiff, dabSweep, limitsCase, sequenceCase, strokeState, syntheticCase, timingCase, wetScene, worstDeltaE };
