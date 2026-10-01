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
  const opts = { lanes: ["webgpu-compute"], presets: null, fixtures: ["zigzag"], size: 128, seed: 7, set: "smoke", out: null, compileOnly: false, dump: null, reports: null };
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

async function runCaseInFreshPage(browser, url, spec, dumpDir) {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto(url);
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
    await page.goto(url);
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
    if (!opts.compileOnly && compileErrors.length === 0) {
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
        const metric = unsupported ? `미지원(설계상 명시 거부): ${r.error}` : r.ok ? `δ48 ${r.fuzzyMismatchPct}% ΔE p99 ${r.deltaE.p99} IoU ${r.iou} hash=${r.hashEqualToCpu ? "same" : "diff"} det=${r.deterministic}` : `오류 ${r.error}`;
        log(`${tag} ${c.laneId} ${c.preset} ${c.fixtureId}: ${metric}`);
        if (r.failures.length > 0) exitCode = 1;
      }
    }

    const report = {
      schema: "brush-lab-browser-probe/1",
      generatedAt: new Date().toISOString(),
      environment,
      thresholds: { fuzzyMismatchPctMax: FUZZY_MAX_PCT, deltaEp99Max: DELTA_E_P99_MAX },
      compile: { modules: compile.modules, pipelines: compile.pipelines, errors: compileErrors },
      cases: results,
      summary: {
        cases: results.length,
        failed: results.filter((r) => r.failures.length > 0).length,
        unsupported: results.filter((r) => r.unsupported).length,
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
