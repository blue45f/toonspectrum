#!/usr/bin/env node
// brush-lab 브라우저 프로브(실 브라우저 게이트). BRUSH_LAB_BROWSER_PROBE=1일 때만 실행한다.
//
// 하는 일: Vite dev 서버로 scripts/browser-probe.html(+ browser-probe-page.mjs)을 띄우고 Playwright Chromium
// (--enable-unsafe-webgpu, Linux는 --use-webgpu-adapter=swiftshader)으로 연 뒤
//   1) 모든 WGSL 모듈의 getCompilationInfo 메시지와 compute·instanced 런타임의 파이프라인 생성 검증
//   2) (프리셋 × fixture)마다 cpu-reference 대비 패리티(δ48 퍼지 불일치율 ≤ 0.5 %, ΔE p99 < 1.0)와 같은 레인 재실행 결정성
// 을 측정해 JSON 리포트로 쓴다. 소프트웨어 렌더러(SwiftShader)면 리포트에 softwareRenderer true를 기록하며
// 이 결과는 성능 증거가 아니다(승격 단계의 실 GPU 리포트와 별개).
//
// 종료 코드: 0 = 통과(또는 게이트 꺼짐으로 건너뜀), 1 = WGSL 컴파일·패리티·결정성 실패, 2 = 브라우저/WebGPU 미지원(구조적 skip).
//
// 사용 예:
//   BRUSH_LAB_BROWSER_PROBE=1 node scripts/browser-probe.mjs
//   BRUSH_LAB_BROWSER_PROBE=1 node scripts/browser-probe.mjs --lanes webgpu-compute,webgpu-instanced --presets pencil-hb,airbrush --fixtures zigzag,curve --size 128
//   BRUSH_LAB_BROWSER_PROBE=1 node scripts/browser-probe.mjs --set full --out /tmp/report.json
//   --dump <dir>: 케이스마다 CPU 참조·대상 레인·ΔE 히트맵 PNG를 쓴다(시각 디버깅)
//   --wet-scenes: 습식 장면 패리티(CPU 장면의 시작 상태를 GPU 습식 풀에 올려 1·60프레임 뒤 채널별 max|Δ|·상대 L2·질량·활성 타일 집합을 대조, 명세 §9.1)
//   --skip-parity: 프리셋×fixture 패리티를 건너뛴다(--wet-scenes·--sequences만 실행할 때)
//   --synthetic "preset,preset": 합성 지그재그(zigzagStroke(size, 600 ms), 빈 문서, --size·--seed)로 CPU renderStroke 해시(습식 스냅샷 기준값)와 대상 레인 픽셀을 대조
//   --stroke-state "preset:fixture,...": 실제 획 도중 습식 상태(코어 12·확장 23채널) 패리티 — 같은 입력을 CPU Surface와 GPU 런타임에 프레임 단위로 먹여 체크포인트(프레임 10·30·60·마지막)마다 대조
//   --limits-check: 큰 습식 풀 용량(2048²·6000타일)의 requiredLimits 요청·실제 장치 한도·검증 오류 없음, 어댑터 한도 초과 시 fail-visible 확인
//   --timing-check: 획 3개(프레임 수가 다름)를 이어 그리고 영수증 gpuTimeMs가 획마다 자기 값인지(timestamp-query가 있을 때) --lanes 각각에서 확인
//   --wet-preset-scenes: 실제 프리셋 습식 파라미터·프리셋 종이로 돌리는 습식 장면(프레임 1·20·60)
//   --sequences "a:fixture>b:fixture,...": 같은 레인 인스턴스에서 획을 이어 그린 다획 지속 레이어 패리티(예: watercolor-wet:curve>pencil-hb:line)
//   --reports <dir>: 케이스마다 인증 리포트(brushCertificationReportSchema, 정규 JSON)를 `<presetId>-<laneId>-<YYYYMMDD>.json`으로 쓴다
//                    (docs/drafts/evidence-brush-lab-README.md의 증빙 형식. 같은 이름이 있으면 -2, -3 접미를 붙이고 덮어쓰지 않는다)
// 환경 변수: BRUSH_LAB_CHROMIUM_PATH(Chrome for Testing 등 실행 파일 경로), BRUSH_LAB_PROBE_OUT(리포트 경로).
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 후보 레인 패리티 기준(스펙 §20: δ48 ≤ 0.5 %, ΔE p99 < 1.0). */
const FUZZY_MAX_PCT = 0.5;
const DELTA_E_P99_MAX = 1.0;

/** cpu-reference 패리티 기준(δ48·ΔE p99)을 적용하는 후보 레인. */
const PARITY_LANES = new Set(["webgpu-compute", "wasm-gpu-hybrid", "wasm-cpu"]);

/** 매체·침착 모델을 고루 덮는 스모크 프리셋. */
const SMOKE_PRESETS = [
  "pencil-hb",
  "ink-g-pen",
  "ink-brush-pen",
  "charcoal",
  "crayon",
  "watercolor-wet",
  "oil-impasto",
  "airbrush",
  "spray-splatter",
  "hatch-pen",
  "screentone-halftone",
  "texture-canvas-stamp",
  "smudge-blend",
  "eraser-soft",
  "fx-fur-grass",
];

function parseArgs(argv) {
  const opts = { lanes: ["webgpu-compute"], presets: null, fixtures: ["zigzag"], size: 128, seed: 7, set: "smoke", out: null, compileOnly: false, dump: null, reports: null, wetScenes: false, wetPresetScenes: false, sequences: null, skipParity: false, synthetic: null, strokeState: null, strokeCheckpoints: [10, 30, 60], strokeNoPaper: false, strokeRoundTip: false, limitsCheck: false, timingCheck: false, dabSweep: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--lanes") opts.lanes = String(next()).split(",").filter(Boolean);
    else if (a === "--presets") opts.presets = String(next()).split(",").filter(Boolean);
    else if (a === "--fixtures") opts.fixtures = String(next()).split(",").filter(Boolean);
    else if (a === "--size") opts.size = Number(next());
    else if (a === "--seed") opts.seed = Number(next());
    else if (a === "--set") opts.set = String(next());
    else if (a === "--out") opts.out = String(next());
    else if (a === "--compile-only") opts.compileOnly = true;
    else if (a === "--dump") opts.dump = String(next());
    else if (a === "--reports") opts.reports = String(next());
    else if (a === "--wet-scenes") opts.wetScenes = true;
    else if (a === "--wet-preset-scenes") opts.wetPresetScenes = true;
    else if (a === "--skip-parity") opts.skipParity = true;
    else if (a === "--synthetic") opts.synthetic = String(next());
    else if (a === "--stroke-state") opts.strokeState = String(next());
    else if (a === "--stroke-checkpoints") opts.strokeCheckpoints = String(next()).split(",").map(Number);
    else if (a === "--stroke-no-paper") opts.strokeNoPaper = true;
    else if (a === "--stroke-round-tip") opts.strokeRoundTip = true;
    else if (a === "--dab-sweep") opts.dabSweep = true;
    else if (a === "--limits-check") opts.limitsCheck = true;
    else if (a === "--timing-check") opts.timingCheck = true;
    else if (a === "--sequences") opts.sequences = String(next());
    else throw new Error(`알 수 없는 인자: ${a}`);
  }
  return opts;
}

function log(message) {
  process.stderr.write(`[browser-probe] ${message}\n`);
}

async function loadPlaywright() {
  try {
    return await import("playwright");
  } catch (error) {
    log(`playwright를 불러올 수 없다(${String(error?.message ?? error).split("\n")[0]}) — 구조적 skip`);
    return null;
  }
}

async function startServer() {
  const { createServer } = await import("vite");
  const server = await createServer({
    root: labRoot,
    configFile: false,
    logLevel: "error",
    // 프로브 도중 소스가 바뀌어도(다른 작업자·에디터) 페이지가 HMR 전체 새로고침으로 날아가지 않게 watch·HMR을 끈다.
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  await server.listen();
  const address = server.httpServer?.address();
  if (!address || typeof address === "string") throw new Error("Vite 서버 주소를 얻지 못했다");
  return { server, url: `http://127.0.0.1:${address.port}/scripts/browser-probe.html` };
}

/**
 * Playwright가 기대하는 브라우저 리비전과 설치된 리비전이 다를 때(예: 컨테이너에 chromium-1194만 있고 Playwright는 1234를 기대) 쓰는 대체 탐색.
 * `PLAYWRIGHT_BROWSERS_PATH`(없으면 `~/.cache/ms-playwright`) 아래 `chromium-<rev>/chrome-linux/chrome`(또는 chrome-linux64) 중 리비전이 가장 높은 것을 돌려준다.
 * 일부러 정확히 맞는 리비전만 쓰려면 BRUSH_LAB_CHROMIUM_PATH를 지정한다(그러면 이 탐색은 건너뛴다).
 */
function findInstalledChromium() {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), ".cache", "ms-playwright");
  if (!existsSync(root)) return null;
  const found = [];
  for (const name of readdirSync(root)) {
    const m = /^chromium-(\d+)$/.exec(name);
    if (!m) continue;
    for (const sub of ["chrome-linux", "chrome-linux64", "chrome-mac", "chrome-win"]) {
      const exe = path.join(root, name, sub, process.platform === "win32" ? "chrome.exe" : "chrome");
      if (existsSync(exe)) found.push({ revision: Number(m[1]), exe });
    }
  }
  found.sort((a, b) => b.revision - a.revision);
  return found[0]?.exe ?? null;
}

/** 증빙 리포트를 쓴다. 같은 이름이 있으면 덮어쓰지 않고 `-2`, `-3` 접미를 붙인다(증빙 README 파일명 규약). */
function writeEvidenceReport(dir, report) {
  mkdirSync(dir, { recursive: true });
  const base = report.fileName.replace(/\.json$/, "");
  let name = `${base}.json`;
  for (let n = 2; existsSync(path.join(dir, name)); n += 1) name = `${base}-${n}.json`;
  writeFileSync(path.join(dir, name), report.text);
  return name;
}

function chromiumArgs() {
  const args = ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"];
  if (process.platform === "linux") {
    args.push("--enable-features=Vulkan", "--use-angle=swiftshader", "--use-webgpu-adapter=swiftshader");
  }
  return args;
}

function buildSpecs(opts) {
  const presets = opts.presets ?? (opts.set === "full" ? null : SMOKE_PRESETS);
  return { presets, fixtures: opts.fixtures, lanes: opts.lanes, size: opts.size, seed: opts.seed, report: opts.reports !== null };
}

/** 습식 장면 패리티 기준(명세 §9.1: 단일 서브스텝 1e-5, 60프레임 궤적 5e-4·상대 L2 1e-3, 질량 장부 상대 1e-4). */
const WET_SCENE_LIMITS = { early: { maxAbs: 1e-5 }, trajectory: { maxAbs: 5e-4, relL2: 1e-3 }, massRel: 1e-4 };

/** 습식 장면 목록(명세 §9.2): CPU 장면 헬퍼의 시작 상태를 그대로 쓴다. 프레임 1은 서브스텝 수만큼(수채 기본 2) 전진한 상태다. */
const WET_SCENES = [
  { id: "edge-watercolor", scene: "edge", medium: "watercolor", frames: [1, 60] },
  { id: "edge-sumi-fiber", scene: "edge", medium: "sumi", paper: "fiber", fiberAngle: 0.6, frames: [1, 60] },
  { id: "edge-gouache", scene: "edge", medium: "gouache", frames: [1, 60] },
  { id: "film-watercolor-fiber-x", scene: "film", medium: "watercolor", fiberAngle: 0, frames: [1, 60] },
  { id: "film-sumi-fiber-y", scene: "film", medium: "sumi", fiberAngle: Math.PI / 2, frames: [1, 60] },
  { id: "granulation-watercolor", scene: "granulation", medium: "watercolor", overrides: { granulation: 0.5 }, frames: [1, 60] },
];

/** 실제 프리셋의 습식 파라미터·프리셋 종이로 돌리는 장면(`--wet-scenes preset`): 매체 기본값이 아니라 프리셋 값에서만 드러나는 경로를 점검한다. */
const WET_PRESET_SCENES = ["watercolor-wet", "watercolor-dry", "sumi-ink-wet", "gouache"].map((preset) => ({
  id: `edge-preset-${preset}`,
  scene: "edge",
  medium: "watercolor",
  preset,
  paper: "preset",
  frames: [1, 20, 60],
}));

function judgeWetScene(result) {
  const reasons = [];
  if (!result.ok) return [`실행 오류: ${result.error}`];
  if (result.uncaptured?.length) reasons.push(`uncapturederror ${result.uncaptured.length}건: ${result.uncaptured[0]}`);
  for (const c of result.checkpoints) {
    const limit = c.frame <= 1 ? WET_SCENE_LIMITS.early : WET_SCENE_LIMITS.trajectory;
    if (c.worstMaxAbs > limit.maxAbs) reasons.push(`프레임 ${c.frame}: max|Δ| ${c.worstMaxAbs} > ${limit.maxAbs}`);
    if (limit.relL2 !== undefined && c.worstRelL2 > limit.relL2) reasons.push(`프레임 ${c.frame}: 상대 L2 ${c.worstRelL2} > ${limit.relL2}`);
    if (c.mass.waterRel > WET_SCENE_LIMITS.massRel) reasons.push(`프레임 ${c.frame}: 물 질량 상대 오차 ${c.mass.waterRel} > ${WET_SCENE_LIMITS.massRel}`);
    if (c.mass.pigmentRel > WET_SCENE_LIMITS.massRel) reasons.push(`프레임 ${c.frame}: 안료 질량 상대 오차 ${c.mass.pigmentRel} > ${WET_SCENE_LIMITS.massRel}`);
    if (c.liveMismatch > 0) reasons.push(`프레임 ${c.frame}: 활성 타일 집합 불일치 ${c.liveMismatch}개(CPU ${c.liveCpu}·GPU ${c.liveGpu})`);
  }
  return reasons;
}

/** 명세 §9.3·`raster/wet-presets*.snapshot.test.ts`의 CPU 습식 프리셋 픽셀 해시(zigzagStroke(size, 600 ms), seed 1, 빈 문서). */
const WET_SPEC_HASHES = {
  "watercolor-wet@256": "e2eeedfaad6bccd9",
  "watercolor-wet@512": "21d19d4a9bb0d714",
  "watercolor-dry@256": "b6d335e0fe02b6c1",
  "sumi-ink-wet@256": "24da89b5d863913d",
  "gouache@256": "70fcf8e9c1dedaec",
  "oil-impasto@256": "1d1437eb6d4ebc42",
  "oil-impasto@512": "b4f8ae7943dbd81f",
};

/** 다획 시퀀스 문자열 "a:fixture>b:fixture,c:fixture" → [[{preset,fixtureId}...]...]. */
function parseSequences(text) {
  return text
    .split(",")
    .filter(Boolean)
    .map((seq) =>
      seq.split(">").map((step) => {
        const [preset, fixtureId] = step.split(":");
        if (!preset || !fixtureId) throw new Error(`시퀀스 단계는 preset:fixture 형식이다: ${step}`);
        return { preset, fixtureId };
      }),
    );
}

function judgeSequence(laneId, result) {
  const reasons = [];
  if (!result.ok) return [`실행 오류: ${result.error}`];
  if (result.uncaptured?.length) reasons.push(`uncapturederror ${result.uncaptured.length}건: ${result.uncaptured[0]}`);
  if (!result.deterministic) reasons.push("같은 레인 재실행 픽셀 해시가 다르다(결정성 실패)");
  if (PARITY_LANES.has(laneId)) {
    if (result.fuzzyMismatchPct > FUZZY_MAX_PCT) reasons.push(`δ48 불일치율 ${result.fuzzyMismatchPct}% > ${FUZZY_MAX_PCT}%`);
    if (result.deltaE.p99 >= DELTA_E_P99_MAX) reasons.push(`ΔE p99 ${result.deltaE.p99} ≥ ${DELTA_E_P99_MAX}`);
  }
  return reasons;
}

/** 케이스마다 새 컨텍스트·페이지로 `window.__brushLabProbe[fn](spec)`을 실행한다(GPU 프로세스가 죽어도 다음 케이스를 계속한다). */
async function runProbeFnInFreshPage(browser, url, fn, spec) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(url, { timeout: 120_000 });
    await page.waitForFunction(() => window.__brushLabProbeReady === true, undefined, { timeout: 60_000 });
    return await page.evaluate(([name, one]) => window.__brushLabProbe[name](one), [fn, spec]);
  } catch (error) {
    return { ok: false, error: `브라우저 페이지 오류: ${String(error?.message ?? error).split("\n")[0].slice(0, 300)}`, errorCode: "page-crashed", uncaptured: [] };
  } finally {
    await context.close();
  }
}

async function runCaseInFreshPage(browser, url, spec, dumpDir) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(url, { timeout: 120_000 });
    await page.waitForFunction(() => window.__brushLabProbeReady === true, undefined, { timeout: 60_000 });
    const [result] = await page.evaluate((one) => window.__brushLabProbe.parity([one]), spec);
    if (dumpDir) {
      const pair = await page.evaluate((one) => window.__brushLabProbe.renderPair(one), spec);
      mkdirSync(dumpDir, { recursive: true });
      for (const [kind, dataUrl] of Object.entries(pair)) {
        const file = path.join(dumpDir, `${spec.laneId}-${spec.preset}-${spec.fixtureId}-${kind}.png`);
        writeFileSync(file, Buffer.from(dataUrl.split(",")[1], "base64"));
      }
    }
    return result;
  } catch (error) {
    return {
      laneId: spec.laneId,
      preset: spec.preset,
      fixture: spec.fixtureId,
      size: spec.size,
      seed: spec.seed,
      ok: false,
      error: `브라우저 페이지 오류: ${String(error?.message ?? error).split("\n")[0].slice(0, 300)}`,
      errorCode: "page-crashed",
      uncaptured: [],
    };
  } finally {
    await context.close();
  }
}

/**
 * 레인이 설계상 지원하지 않는 프로그램(`not-implemented` — 예: 렌더 인스턴싱의 습식·smudge, wasm-cpu의 임파스토)은 실패가 아니라
 * "미지원(unsupported)"으로 기록한다. fail-visible 계약대로 명시적으로 거부했다는 뜻이며 패리티 판정 대상이 아니다.
 */
function isUnsupported(result) {
  return !result.ok && result.errorCode === "not-implemented";
}

function judge(laneId, result) {
  const reasons = [];
  if (isUnsupported(result)) return reasons;
  if (!result.ok) {
    reasons.push(`실행 오류: ${result.error}`);
    return reasons;
  }
  if (result.uncaptured?.length) reasons.push(`uncapturederror ${result.uncaptured.length}건: ${result.uncaptured[0]}`);
  if (!result.deterministic) reasons.push("같은 레인 재실행 픽셀 해시가 다르다(결정성 실패)");
  // 패리티 기준은 후보 레인(compute·하이브리드·wasm)에만 적용한다(비교 레인은 f16·다른 알고리즘이라 수치만 기록).
  if (laneId === "wasm-gpu-hybrid" && result.hashEqualToGpuCompute === false) {
    reasons.push("webgpu-compute와 픽셀 해시가 다르다(하이브리드는 비닝만 다르므로 같아야 한다)");
  }
  if (PARITY_LANES.has(laneId)) {
    if (result.fuzzyMismatchPct > FUZZY_MAX_PCT) reasons.push(`δ48 불일치율 ${result.fuzzyMismatchPct}% > ${FUZZY_MAX_PCT}%`);
    if (result.deltaE.p99 >= DELTA_E_P99_MAX) reasons.push(`ΔE p99 ${result.deltaE.p99} ≥ ${DELTA_E_P99_MAX}`);
  }
  return reasons;
}

async function main() {
  if (process.env.BRUSH_LAB_BROWSER_PROBE !== "1") {
    log("BRUSH_LAB_BROWSER_PROBE=1이 아니라 건너뜀(게이트 꺼짐). 실행: BRUSH_LAB_BROWSER_PROBE=1 node scripts/browser-probe.mjs");
    return 0;
  }
  const opts = parseArgs(process.argv.slice(2));
  const playwright = await loadPlaywright();
  if (!playwright) return 2;

  const launch = (executablePath) => playwright.chromium.launch({ headless: true, executablePath, args: chromiumArgs() });
  let browser;
  const explicitPath = process.env.BRUSH_LAB_CHROMIUM_PATH || undefined;
  try {
    browser = await launch(explicitPath);
  } catch (error) {
    const reason = String(error?.message ?? error).split("\n")[0];
    const fallback = explicitPath ? null : findInstalledChromium();
    if (fallback) {
      log(`기본 Chromium을 실행할 수 없다(${reason}) — 설치된 대체 리비전 사용: ${fallback}`);
      try {
        browser = await launch(fallback);
      } catch (retryError) {
        log(`대체 Chromium도 실행할 수 없다(${String(retryError?.message ?? retryError).split("\n")[0]}) — 구조적 skip`);
        return 2;
      }
    } else {
      log(`Chromium을 실행할 수 없다(${reason}) — 구조적 skip`);
      log("힌트: npx playwright install chromium 또는 BRUSH_LAB_CHROMIUM_PATH=/path/to/chrome");
      return 2;
    }
  }

  const { server, url } = await startServer();
  let exitCode = 0;
  try {
    const page = await browser.newPage();
    page.on("pageerror", (error) => log(`pageerror: ${error.message}`));
    page.on("console", (msg) => {
      if (msg.type() === "error") log(`console.error: ${msg.text().slice(0, 300)}`);
    });
    await page.goto(url, { timeout: 120_000 });
    await page.waitForFunction(() => window.__brushLabProbeReady === true, undefined, { timeout: 60_000 });

    const environment = await page.evaluate(() => window.__brushLabProbe.environment());
    log(`브라우저: ${environment.userAgent}`);
    if (environment.status !== "supported") {
      log(`WebGPU 미지원(${environment.reasons.join(", ")}) — 구조적 skip`);
      return 2;
    }
    log(`어댑터: ${environment.adapter?.vendor ?? "?"}/${environment.adapter?.architecture ?? "?"} softwareRenderer=${environment.softwareRenderer}`);

    const compile = await page.evaluate(() => window.__brushLabProbe.compile());
    const compileErrors = [];
    for (const m of compile.modules) {
      for (const msg of m.messages) {
        if (msg.type === "error") compileErrors.push(`${m.label}:${msg.line}:${msg.col} ${msg.message}`);
      }
    }
    for (const p of compile.pipelines) {
      if (!p.ok) compileErrors.push(`pipeline ${p.name}: ${p.error}`);
    }
    for (const e of compile.uncaptured ?? []) compileErrors.push(`uncapturederror: ${e}`);
    const warnings = compile.modules.flatMap((m) => m.messages.filter((x) => x.type !== "error").map((x) => `${m.label}:${x.line} ${x.type} ${x.message}`));
    log(`WGSL 컴파일: 모듈 ${compile.modules.length}개, 오류 ${compileErrors.length}, 경고·정보 ${warnings.length}`);
    for (const e of compileErrors) log(`  오류 ${e}`);
    for (const w of warnings.slice(0, 20)) log(`  ${w}`);
    if (compileErrors.length > 0) exitCode = 1;

    let results = [];
    if (!opts.compileOnly && !opts.skipParity && compileErrors.length === 0) {
      const spec = buildSpecs(opts);
      let presetIds = spec.presets;
      if (!presetIds) presetIds = await page.evaluate(() => window.__brushLabProbe.presetIds);
      const cases = [];
      for (const laneId of spec.lanes) {
        for (const preset of presetIds) {
          for (const fixtureId of spec.fixtures) cases.push({ laneId, preset, fixtureId, size: spec.size, seed: spec.seed, report: spec.report });
        }
      }
      log(`패리티 ${cases.length}건 실행(캔버스 ${spec.size}², 소프트웨어 렌더러면 느리다)`);
      for (const c of cases) {
        // 케이스마다 새 컨텍스트·페이지: GPU 프로세스가 죽어도(소프트웨어 렌더러 OOM 등) 다음 케이스는 계속한다.
        const r = await runCaseInFreshPage(browser, url, c, opts.dump);
        if (r.report && opts.reports) {
          const written = writeEvidenceReport(opts.reports, r.report);
          r.reportFile = written;
          r.reportVerdict = r.report.verdict;
        }
        delete r.report;
        r.failures = judge(c.laneId, r);
        results.push(r);
        const unsupported = isUnsupported(r);
        r.unsupported = unsupported;
        const tag = unsupported ? "skip" : r.failures.length === 0 ? "ok  " : "FAIL";
        const metric = unsupported ? `미지원(설계상 명시 거부): ${r.error}` : r.ok ? `δ48 ${r.fuzzyMismatchPct}% ΔE p99 ${r.deltaE.p99} IoU ${r.iou} byte max ${r.byteDiff?.max ?? "?"} (≠0 ${r.byteDiff?.nonzeroPct ?? "?"}%, >1 ${r.byteDiff?.gt1Pct ?? "?"}%) hash=${r.hashEqualToCpu ? "same" : "diff"} det=${r.deterministic}` : `오류 ${r.error}`;
        log(`${tag} ${c.laneId} ${c.preset} ${c.fixtureId}: ${metric}`);
        if (r.failures.length > 0) exitCode = 1;
      }
    }

    const wetScenes = [];
    if ((opts.wetScenes || opts.wetPresetScenes) && compileErrors.length === 0) {
      const sceneList = [...(opts.wetScenes ? WET_SCENES : []), ...(opts.wetPresetScenes ? WET_PRESET_SCENES : [])];
      log(`습식 장면 패리티 ${sceneList.length}건 실행`);
      for (const scene of sceneList) {
        const r = await runProbeFnInFreshPage(browser, url, "wetScene", scene);
        r.id = scene.id;
        r.failures = judgeWetScene(r);
        wetScenes.push(r);
        if (r.failures.length > 0) exitCode = 1;
        const cps = (r.checkpoints ?? []).map((c) => `f${c.frame}: max|Δ| ${c.worstMaxAbs} L2 ${c.worstRelL2} 물 ${c.mass.waterRel} 안료 ${c.mass.pigmentRel} 활성 ${c.liveCpu}/${c.liveGpu} (CPU 상태 이동 max ${c.cpuMovedMaxAbs})`).join(" | ");
        log(`${r.failures.length === 0 ? "ok  " : "FAIL"} wet-scene ${scene.id}: ${r.ok ? cps : `오류 ${r.error}`}`);
        for (const reason of r.failures) log(`  - ${reason}`);
      }
    }

    const sequences = [];
    if (opts.sequences && compileErrors.length === 0) {
      const lists = parseSequences(opts.sequences);
      log(`다획 시퀀스 ${lists.length * opts.lanes.length}건 실행(캔버스 ${opts.size}²)`);
      for (const laneId of opts.lanes) {
        for (const steps of lists) {
          const r = await runProbeFnInFreshPage(browser, url, "sequence", { laneId, steps, size: opts.size, seed: opts.seed });
          r.laneId = laneId;
          r.failures = judgeSequence(laneId, r);
          sequences.push(r);
          if (r.failures.length > 0) exitCode = 1;
          const label = steps.map((x) => `${x.preset}:${x.fixtureId}`).join(">");
          const metric = r.ok ? `δ48 ${r.fuzzyMismatchPct}% ΔE p99 ${r.deltaE.p99} IoU ${r.iou} byteDiff max ${r.byteDiff.max} linear ${r.linearMaxAbs} det=${r.deterministic}` : `오류 ${r.error}`;
          log(`${r.failures.length === 0 ? "ok  " : "FAIL"} sequence ${laneId} ${label}: ${metric}`);
          for (const reason of r.failures) log(`  - ${reason}`);
        }
      }
    }

    const timingResults = [];
    if (opts.timingCheck && compileErrors.length === 0) {
      log(`타이밍 영수증 점검 ${opts.lanes.length}건 실행(캔버스 ${opts.size}²)`);
      for (const laneId of opts.lanes) {
        const r = await runProbeFnInFreshPage(browser, url, "timing", { laneId, size: opts.size, seed: opts.seed });
        r.laneId = laneId;
        r.failures = [];
        if (!r.ok) r.failures.push(`실행 오류: ${r.error}`);
        else {
          if (r.uncaptured?.length) r.failures.push(`uncapturederror ${r.uncaptured.length}건: ${r.uncaptured[0]}`);
          const hasTs = r.strokes.every((s) => s.timingSource === "timestamp-query");
          if (hasTs) {
            if (r.strokes.some((s) => s.gpuTimeMs === null)) r.failures.push("timestamp-query인데 어떤 획의 gpuTimeMs가 null이다(측정 유실)");
            else if (!(r.strokes[1].gpuTimeMs < r.strokes[0].gpuTimeMs && r.strokes[1].gpuTimeMs < r.strokes[2].gpuTimeMs)) r.failures.push("1프레임 획의 gpuTimeMs가 긴 획보다 작지 않다(직전 획의 값이 섞였을 수 있다)");
          }
        }
        timingResults.push(r);
        if (r.failures.length > 0) exitCode = 1;
        log(`${r.failures.length === 0 ? "ok  " : "FAIL"} timing ${laneId}: ${r.ok ? r.strokes.map((s) => `${s.frames}프레임 ${s.gpuTimeMs}ms(${s.timingSource})`).join(" | ") : `오류 ${r.error}`}`);
        for (const reason of r.failures) log(`  - ${reason}`);
      }
    }

    let dabSweepResult = null;
    if (opts.dabSweep && compileErrors.length === 0) {
      log("단일 dab 커버리지 스윕 실행(shapeExp·각도·반경)");
      const r = await runProbeFnInFreshPage(browser, url, "dabSweep", {});
      dabSweepResult = r;
      if (!r.ok) {
        log(`FAIL dab-sweep: 오류 ${r.error}`);
        exitCode = 1;
      } else {
        for (const c of r.cases) log(`  shapeExp ${c.shapeExp} angle ${c.angle} r ${c.rx}×${c.ry}: max|Δalpha| ${c.maxAlphaAbs} @(${c.x},${c.y}) CPU ${c.cpuAlpha} GPU ${c.gpuAlpha}`);
      }
    }

    let limitsResult = null;
    if (opts.limitsCheck && compileErrors.length === 0) {
      log("장치 한도 점검 실행(2048² 캔버스·습식 6000타일)");
      const r = await runProbeFnInFreshPage(browser, url, "limits", { size: 2048, wetCapacityTiles: 6000 });
      r.failures = [];
      if (!r.ok) r.failures.push(`실행 오류: ${r.error}`);
      else {
        if (r.uncaptured?.length) r.failures.push(`uncapturederror ${r.uncaptured.length}건: ${r.uncaptured[0]}`);
        if ((r.deviceLimits?.maxStorageBufferBindingSize ?? 0) < r.need.maxStorageBufferBindingSize) r.failures.push(`장치 storage 바인딩 한도 ${r.deviceLimits?.maxStorageBufferBindingSize} < 필요 ${r.need.maxStorageBufferBindingSize}`);
        if (!(r.inkedPixels > 0)) r.failures.push("획 뒤 이미지에 잉크가 없다(무음 실패 의심)");
      }
      limitsResult = r;
      if (r.failures.length > 0) exitCode = 1;
      log(`${r.failures.length === 0 ? "ok  " : "FAIL"} limits-check: 어댑터 ${JSON.stringify(r.adapterLimits)} 필요 ${JSON.stringify(r.need)} 장치 ${JSON.stringify(r.deviceLimits)} 잉크 픽셀 ${r.inkedPixels} uncaptured ${r.uncaptured?.length ?? "?"} 전 타일(${r.fullCapacityTiles}) init → ${r.fullCapacityResult}`);
      for (const reason of r.failures) log(`  - ${reason}`);
    }

    const strokeStates = [];
    if (opts.strokeState && compileErrors.length === 0) {
      const items = opts.strokeState.split(",").filter(Boolean).map((item) => {
        const [preset, fixtureId] = item.split(":");
        if (!preset || !fixtureId) throw new Error(`--stroke-state 항목은 preset:fixture 형식이다: ${item}`);
        return { preset, fixtureId };
      });
      log(`획 도중 습식 상태 패리티 ${items.length}건 실행(캔버스 ${opts.size}²)`);
      for (const item of items) {
        const r = await runProbeFnInFreshPage(browser, url, "strokeState", { ...item, size: opts.size, seed: opts.seed, checkpoints: opts.strokeCheckpoints, noPaper: opts.strokeNoPaper, roundTip: opts.strokeRoundTip });
        r.preset = item.preset;
        r.fixture = item.fixtureId;
        r.failures = r.ok ? [] : [`실행 오류: ${r.error}`];
        if (r.ok && r.uncaptured?.length) r.failures.push(`uncapturederror ${r.uncaptured.length}건: ${r.uncaptured[0]}`);
        strokeStates.push(r);
        if (r.failures.length > 0) exitCode = 1;
        const cps = (r.checkpoints ?? [])
          .map((c) => `f${c.frame}(dab ${c.dabsSoFar}): max|Δ| ${c.worstMaxAbs} L2 ${c.worstRelL2} 물 ${c.mass.waterRel} 안료 ${c.mass.pigmentRel} 활성 ${c.liveCpu}/${c.liveGpu}(불일치 ${c.liveMismatch})`)
          .join(" | ");
        log(`${r.failures.length === 0 ? "ok  " : "FAIL"} stroke-state ${item.preset}:${item.fixtureId}: ${r.ok ? cps : `오류 ${r.error}`}`);
        if (r.ok) {
          log(`  dab 배치 대조: CPU 총 ${r.checkpoints[r.checkpoints.length - 1]?.dabsSoFar} / GPU 총 ${r.gpuDabs}, 개수 불일치 프레임 ${r.batchDiff.countMismatch}, 값 불일치 ${r.batchDiff.valueMismatch}(최대 ${r.batchDiff.maxAbs})`);
          const last = r.checkpoints[r.checkpoints.length - 1];
          if (last) log(`  마지막 체크포인트 채널 그룹별 max|Δ|: ${Object.entries(last.groups).map(([k, g]) => `${k} ${g.maxAbs}(>1e-3 ${g.over1e3Pct}%, >1e-2 ${g.over1e2Pct}%)`).join(", ")}`);
        }
      }
    }

    const synthetic = [];
    if (opts.synthetic && compileErrors.length === 0) {
      const presets = opts.synthetic.split(",").filter(Boolean);
      log(`합성 지그재그 ${presets.length * opts.lanes.length}건 실행(캔버스 ${opts.size}², seed ${opts.seed})`);
      for (const laneId of opts.lanes) {
        for (const preset of presets) {
          const r = await runProbeFnInFreshPage(browser, url, "synthetic", { laneId, preset, size: opts.size, seed: opts.seed });
          r.preset = preset;
          const expected = opts.seed === 1 ? WET_SPEC_HASHES[`${preset}@${opts.size}`] : undefined;
          r.expectedCpuHash = expected ?? null;
          r.failures = judgeSequence(laneId, r);
          if (r.ok && expected && r.cpuHash !== expected) r.failures.push(`CPU 해시 ${r.cpuHash} ≠ 명세 기준값 ${expected}(CPU 참조가 바뀌었다)`);
          synthetic.push(r);
          if (r.failures.length > 0) exitCode = 1;
          const metric = r.ok
            ? `CPU ${r.cpuHash}${expected ? (r.cpuHash === expected ? "(명세 일치)" : `(명세 ${expected} 불일치)`) : ""} δ48 ${r.fuzzyMismatchPct}% ΔE p99 ${r.deltaE.p99} max ${r.deltaE.max} IoU ${r.iou} byte max ${r.byteDiff.max} premul ${r.byteDiff.premulMax} det=${r.deterministic}`
            : `오류 ${r.error}`;
          log(`${r.failures.length === 0 ? "ok  " : "FAIL"} synthetic ${laneId} ${preset}@${opts.size}: ${metric}`);
          for (const reason of r.failures) log(`  - ${reason}`);
        }
      }
    }

    const report = {
      schema: "brush-lab-browser-probe/1",
      generatedAt: new Date().toISOString(),
      environment,
      thresholds: { fuzzyMismatchPctMax: FUZZY_MAX_PCT, deltaEp99Max: DELTA_E_P99_MAX },
      compile: { modules: compile.modules, pipelines: compile.pipelines, errors: compileErrors },
      cases: results,
      wetScenes,
      sequences,
      synthetic,
      strokeStates,
      limitsCheck: limitsResult,
      dabSweep: dabSweepResult,
      timing: timingResults,
      summary: {
        cases: results.length,
        failed: results.filter((r) => r.failures.length > 0).length,
        unsupported: results.filter((r) => r.unsupported).length,
        wetScenes: wetScenes.length,
        wetScenesFailed: wetScenes.filter((r) => r.failures.length > 0).length,
        sequences: sequences.length,
        sequencesFailed: sequences.filter((r) => r.failures.length > 0).length,
        synthetic: synthetic.length,
        syntheticFailed: synthetic.filter((r) => r.failures.length > 0).length,
        note: environment.softwareRenderer ? "소프트웨어 렌더러(SwiftShader) 결과다. 성능 증거로 쓰지 않는다." : "실 GPU 어댑터 결과.",
      },
    };
    const outPath = opts.out ?? process.env.BRUSH_LAB_PROBE_OUT ?? path.join(os.tmpdir(), "brush-lab-browser-probe.json");
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    log(`리포트: ${outPath} (실패 ${report.summary.failed}/${report.summary.cases}, 미지원 ${report.summary.unsupported})`);
  } finally {
    await browser.close();
    await server.close();
  }
  return exitCode;
}

// vite/playwright가 열어 둔 핸들이 남아도 종료 코드로 바로 끝낸다.
main().then(
  (code) => process.exit(code),
  (error) => {
    process.stderr.write(`[browser-probe] 예기치 못한 오류: ${error?.stack ?? error}\n`);
    process.exit(1);
  },
);
