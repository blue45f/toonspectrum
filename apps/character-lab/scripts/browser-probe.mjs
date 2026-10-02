#!/usr/bin/env node
// character-lab 브라우저 프로브(실 브라우저 게이트). CHARACTER_LAB_BROWSER_PROBE=1일 때만 실행한다.
//
// 하는 일: 빌드 산출물(dist/)을 `vite preview`로 띄우고(또는 --url로 받은 주소를 열고) Playwright Chromium으로
//   1) 셸 마운트(슬롯 15·인스펙터 탭 9)
//   2) 백엔드 명시 선택(WebGPU·WebGL2 각각): ready 또는 [코드]+사유가 보이는 failed(무음 대체 금지, WebGL2 자동 생성 없음)
//   3) ready 엔진에서 투명 PNG 저장(lit 패스)을 PBR·툰 두 셰이딩으로 받아 직접 디코드해 검사 — 모서리 알파 0, 투명 픽셀 RGB 0,
//      캐릭터 면적 ≥ 1.5 % (PBR이 완전 투명이면 여기서 실패한다)
//   4) 슬롯 카드 클릭 = history 1단계, 실행 취소 = 1단계 되돌림
// 을 실행해 JSON 리포트로 쓴다. 이 컨테이너 같은 소프트웨어 렌더러(SwiftShader)에서는 `--software`를 주며, 리포트에
// softwareRenderer true가 기록되고 **성능·실 GPU 렌더 증거가 아니다**(README §4의 실기기 검증과 별개).
//
// 종료 코드: 0 = 통과(또는 게이트 꺼짐으로 건너뜀), 1 = 단계 실패, 2 = 브라우저/playwright 없음(구조적 skip).
//
// 사용 예(앱 디렉터리 또는 저장소 루트에서):
//   pnpm --filter @toonstudio/character-lab build
//   CHARACTER_LAB_BROWSER_PROBE=1 node apps/character-lab/scripts/browser-probe.mjs
//   CHARACTER_LAB_BROWSER_PROBE=1 node apps/character-lab/scripts/browser-probe.mjs --software --backends webgl2 --out /tmp/cl-probe.json --shots /tmp/cl-shots
//   CHARACTER_LAB_BROWSER_PROBE=1 node apps/character-lab/scripts/browser-probe.mjs --url http://localhost:4176/   # 이미 떠 있는 dev/preview 서버
// 옵션: --software(Linux SwiftShader 플래그) --backends webgpu,webgl2 --require-ready webgl2,... --out <json> --shots <dir> --url <주소> --timeout-sec <초>
// 환경 변수: CHARACTER_LAB_CHROMIUM_PATH(Chrome for Testing 등 실행 파일 경로).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inflateSync } from "node:zlib";

const labRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 캐릭터가 차지해야 하는 최소 불투명 면적 비율(전신 캡처 기준 보수적 하한). */
const MIN_COVERAGE = 0.015;

function log(message) {
  console.log(`[character-lab-probe] ${message}`);
}

function parseArgs(argv) {
  const options = { software: false, backends: ["webgpu", "webgl2"], requireReady: [], out: null, shots: null, url: null, timeoutSec: 180 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[(i += 1)];
    if (arg === "--software") options.software = true;
    else if (arg === "--backends") options.backends = String(next()).split(",").filter(Boolean);
    else if (arg === "--require-ready") options.requireReady = String(next()).split(",").filter(Boolean);
    else if (arg === "--out") options.out = next();
    else if (arg === "--shots") options.shots = next();
    else if (arg === "--url") options.url = next();
    else if (arg === "--timeout-sec") options.timeoutSec = Number(next());
    else throw new Error(`알 수 없는 옵션: ${arg}`);
  }
  return options;
}

/** 8비트 RGBA·비인터레이스 PNG만 디코드한다(앱 자체 인코더 산출물 검사용). */
function decodePngRgba(buffer) {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (signature.some((byte, index) => buffer[index] !== byte)) throw new Error("PNG 시그니처가 아닙니다.");
  let offset = 8;
  let width = 0;
  let height = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[9] !== 6 || body[12] !== 0) throw new Error("8비트 RGBA 비인터레이스 PNG가 아닙니다.");
    } else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const value = raw[y * (stride + 1) + 1 + x];
      const left = x >= 4 ? pixels[y * stride + x - 4] : 0;
      const up = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= 4 ? pixels[(y - 1) * stride + x - 4] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? (left + up) >> 1 : paeth(left, up, upLeft);
      pixels[y * stride + x] = (value + predictor) & 255;
    }
  }
  return { width, height, pixels };
}

/** 투명 PNG 검사: 모서리 알파, 투명 픽셀의 RGB, 불투명 면적 비율. */
function analyzeAlpha(png) {
  const { width, height, pixels } = png;
  let opaque = 0;
  let transparentWithRgb = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 0) opaque += 1;
    else if (pixels[i] | pixels[i + 1] | pixels[i + 2]) transparentWithRgb += 1;
  }
  const corners = [0, (width - 1) * 4, (height - 1) * width * 4, ((height - 1) * width + width - 1) * 4].map((index) => pixels[index + 3]);
  return { width, height, coverage: opaque / (width * height), opaquePixels: opaque, transparentWithRgb, cornerAlphas: corners };
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

async function startPreview() {
  const distIndex = path.join(labRoot, "dist", "index.html");
  if (!existsSync(distIndex)) throw new Error("dist/가 없습니다. 먼저 `pnpm --filter @toonstudio/character-lab build`를 실행하세요.");
  const viteBin = path.join(labRoot, "node_modules", "vite", "bin", "vite.js");
  if (!existsSync(viteBin)) throw new Error("apps/character-lab/node_modules/vite를 찾지 못했습니다(pnpm install 필요).");
  const port = await freePort();
  const child = spawn(process.execPath, [viteBin, "preview", "--config", "vite.config.ts", "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
    cwd: labRoot,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const url = `http://127.0.0.1:${port}/`;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return { url, stop: () => child.kill("SIGTERM") };
    } catch {
      // 서버가 아직 안 떴다.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  child.kill("SIGTERM");
  throw new Error("vite preview가 30초 안에 응답하지 않았습니다.");
}

function chromiumArgs(options) {
  const args = ["--enable-unsafe-webgpu", "--ignore-gpu-blocklist"];
  if (options.software && process.platform === "linux") args.push("--no-sandbox", "--enable-features=Vulkan", "--use-angle=swiftshader", "--use-webgpu-adapter=swiftshader");
  return args;
}

async function main() {
  if (process.env.CHARACTER_LAB_BROWSER_PROBE !== "1") {
    log("CHARACTER_LAB_BROWSER_PROBE=1이 아니라 건너뜁니다(게이트 꺼짐).");
    return 0;
  }
  const options = parseArgs(process.argv.slice(2));
  let playwright;
  try {
    playwright = await import("playwright");
  } catch (error) {
    log(`playwright를 불러올 수 없다(${String(error?.message ?? error).split("\n")[0]}) — 구조적 skip`);
    return 2;
  }
  const executablePath = process.env.CHARACTER_LAB_CHROMIUM_PATH || undefined;
  let browser;
  try {
    browser = await playwright.chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}), args: chromiumArgs(options) });
  } catch (error) {
    log(`Chromium을 실행할 수 없다(${String(error?.message ?? error).split("\n")[0]}) — 구조적 skip. 힌트: npx playwright install chromium 또는 CHARACTER_LAB_CHROMIUM_PATH=/path/to/chrome`);
    return 2;
  }

  const server = options.url ? { url: options.url, stop: () => undefined } : await startPreview();
  const timeoutMs = options.timeoutSec * 1000;
  const steps = [];
  const consoleErrors = new Map();
  const pageErrors = [];
  const httpErrors = [];
  const report = { generatedAt: new Date().toISOString(), url: server.url, software: options.software, userAgent: "", steps, consoleErrors: [], httpErrors, pageErrors };
  if (options.shots) mkdirSync(options.shots, { recursive: true });

  const record = (name, status, detail) => {
    steps.push({ name, status, detail });
    log(`${status === "pass" ? "ok  " : status === "fail" ? "FAIL" : "skip"} ${name}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
  };
  const step = async (name, run) => {
    try {
      const outcome = await run();
      if (outcome?.skip) record(name, "skip", outcome.skip);
      else if (outcome?.fail) record(name, "fail", outcome.fail);
      else record(name, "pass", outcome?.detail);
    } catch (error) {
      record(name, "fail", String(error?.message ?? error).split("\n")[0]);
    }
  };

  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(timeoutMs);
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text().replace(/\[\d\d:\d\d:\d\d\]/gu, "").slice(0, 200);
    consoleErrors.set(text, (consoleErrors.get(text) ?? 0) + 1);
  });
  page.on("pageerror", (error) => pageErrors.push(String(error.message).slice(0, 300)));
  page.on("response", (response) => {
    if (response.status() >= 400) httpErrors.push(`${response.status()} ${response.url()}`);
  });
  report.userAgent = await browser.version();

  const statusText = async () => ((await page.locator('[role="status"]').first().textContent()) ?? "").trim();
  const waitStatus = async (pattern) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const text = await statusText();
      if (pattern.test(text)) return text;
      await page.waitForTimeout(500);
    }
    return `TIMEOUT: ${await statusText()}`;
  };
  const historyDepth = async () => {
    const text = (await page.locator(".cl-topbar-group .cl-muted").first().textContent()) ?? "";
    const match = /깊이\s+(\d+)/u.exec(text);
    return match ? Number(match[1]) : Number.NaN;
  };
  const settleThumbnails = async () => {
    for (let i = 0; i < options.timeoutSec; i += 1) {
      if (i > 2 && (await page.locator(".cl-slot-thumb--pending").count()) === 0) return;
      await page.waitForTimeout(1000);
    }
  };
  const exportPng = async () => {
    await page.getByRole("tab", { name: "내보내기" }).click();
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: timeoutMs }), page.getByRole("button", { name: "투명 PNG 저장" }).click()]);
    const file = await download.path();
    return { fileName: download.suggestedFilename(), analysis: analyzeAlpha(decodePngRgba(readFileSync(file))) };
  };

  try {
    await page.goto(server.url, { waitUntil: "load" });
    await step("셸 마운트: 슬롯 15칸·인스펙터 탭 9개·엔진 미선택 안내", async () => {
      await page.waitForSelector("h1");
      const slotTabs = await page.locator(".cl-slot-tab").count();
      const inspectorTabs = (await page.locator('[role="tablist"][aria-label="인스펙터"] [role="tab"]').count()) || (await page.getByRole("tablist", { name: "인스펙터" }).getByRole("tab").count());
      const status = await statusText();
      if (slotTabs !== 15 || inspectorTabs !== 9) return { fail: `슬롯 탭 ${slotTabs}(15 기대)·인스펙터 탭 ${inspectorTabs}(9 기대)` };
      if (!/엔진 미선택/u.test(status)) return { fail: `초기 상태가 '엔진 미선택'이 아님: ${status.slice(0, 80)}` };
      return { detail: `슬롯 ${slotTabs}·탭 ${inspectorTabs}` };
    });
    if (options.shots) await page.screenshot({ path: path.join(options.shots, "1-shell.png") });

    await step("인스펙터 9탭 순회: 패널이 마운트되고 '미조립' 안내·빈 패널이 없다", async () => {
      const tablist = page.getByRole("tablist", { name: "인스펙터" });
      const names = await tablist.getByRole("tab").allTextContents();
      const problems = [];
      for (const name of names) {
        await tablist.getByRole("tab", { name, exact: true }).click();
        await page.waitForTimeout(300);
        const text = (await page.locator(".cl-inspector-body").textContent()) ?? "";
        if (text.trim().length === 0) problems.push(`${name}: 빈 패널`);
        if (/미조립/u.test(text)) problems.push(`${name}: 미조립`);
      }
      if (pageErrors.length > 0) problems.push(`pageerror ${pageErrors.length}건`);
      return problems.length > 0 ? { fail: problems.join("; ") } : { detail: names.join("·") };
    });

    await step("제작 패키지 탭: public/assets/characters/index.json 목록을 실제로 fetch해 2종 이상 표시", async () => {
      await page.getByRole("tablist", { name: "인스펙터" }).getByRole("tab", { name: "제작 패키지", exact: true }).click();
      if ((await page.locator(".cl-package-item").count()) === 0) await page.getByRole("button", { name: "목록 새로고침" }).click();
      await page.locator(".cl-package-item").first().waitFor();
      const ids = await page.locator(".cl-package-item").evaluateAll((items) => items.map((item) => item.getAttribute("data-character-id")));
      const failure = await page.locator(".cl-package-failure").allTextContents();
      if (failure.length > 0) return { fail: failure.join(" | ").slice(0, 200) };
      return ids.length >= 2 ? { detail: ids.join(", ") } : { fail: `패키지 ${ids.length}종(2종 이상 기대): ${ids.join(", ")}` };
    });

    await step("레시피 저장 → 실행 취소 → 파일 불러오기 왕복: 저장 파일이 유효하고 불러오면 선택이 복원된다(history 1단계, 실패 배너 없음)", async () => {
      const waitDepth = (expected) =>
        page.waitForFunction((value) => /깊이\s+(\d+)/u.exec(document.querySelector(".cl-topbar-group .cl-muted")?.textContent ?? "")?.[1] === String(value), expected, { timeout: 15000 });
      const base = await historyDepth();
      const card = page.locator('.cl-slot-card:not([aria-pressed="true"]):not(:disabled)').first();
      const presetId = await card.getAttribute("data-preset-id");
      await card.click();
      await waitDepth(base + 1);
      await page.getByRole("tablist", { name: "인스펙터" }).getByRole("tab", { name: "내보내기", exact: true }).click();
      const [download] = await Promise.all([page.waitForEvent("download", { timeout: timeoutMs }), page.getByRole("button", { name: "레시피 저장" }).click()]);
      const file = await download.path();
      const recipe = JSON.parse(readFileSync(file, "utf8"));
      if (typeof recipe.version !== "number" || recipe.slots === undefined) return { fail: `저장 파일이 레시피 모양이 아님: ${Object.keys(recipe).slice(0, 6).join(",")}` };
      await page.getByLabel("히스토리", { exact: true }).getByRole("button", { name: "실행 취소" }).click();
      await waitDepth(base);
      if ((await page.locator(`[data-preset-id="${presetId}"]`).getAttribute("aria-pressed")) === "true") return { fail: `실행 취소 뒤에도 ${presetId}가 선택돼 있음` };
      await page.locator('.cl-export-panel input[type="file"]').setInputFiles(file);
      await waitDepth(base + 1);
      if ((await page.locator(`[data-preset-id="${presetId}"]`).getAttribute("aria-pressed")) !== "true") return { fail: `불러온 뒤 ${presetId} 선택이 복원되지 않음` };
      const banner = await page.locator(".cl-banner-item").allTextContents();
      if (banner.length > 0) return { fail: `불러오기 뒤 실패 배너: ${banner.join(" | ").slice(0, 160)}` };
      return { detail: `${download.suggestedFilename()} (version ${recipe.version}), ${presetId} 선택 → 취소 → 불러오기로 복원, history ${base}→${base + 1}→${base}→${base + 1}` };
    });

    for (const backend of options.backends) {
      const label = backend === "webgpu" ? "WebGPU" : "WebGL2";
      let outcome = "unknown";
      await step(`${label} 명시 선택: ready 또는 사유가 보이는 failed(자동 대체 없음)`, async () => {
        await page.getByRole("button", { name: label, exact: true }).click();
        const text = await waitStatus(/활성 엔진|실패|\[[a-z0-9-]+\]|lost/u);
        if (text.startsWith("TIMEOUT")) return { fail: text.slice(0, 160) };
        outcome = /활성 엔진/u.test(text) ? "ready" : "failed";
        const banner = (await page.locator(".cl-banner-item").allTextContents()).join(" ");
        const otherBackend = backend === "webgpu" ? /backend webgl2/u : /backend webgpu/u;
        if (otherBackend.test(text)) return { fail: `요청하지 않은 백엔드가 활성화됨: ${text.slice(0, 120)}` };
        if (outcome === "failed" && !/\[[a-z0-9-]+\]/u.test(`${text} ${banner}`)) return { fail: `실패 사유 코드가 화면에 없음: ${text.slice(0, 120)}` };
        if (options.requireReady.includes(backend) && outcome !== "ready") return { fail: `ready가 필요하지만 ${outcome}: ${text.slice(0, 160)}` };
        return { detail: `${outcome} — ${text.slice(0, 200)}` };
      });
      if (options.shots) await page.screenshot({ path: path.join(options.shots, `2-${backend}-select.png`) });
      if (outcome !== "ready") {
        record(`${label} 이후 단계(썸네일·PNG·history)`, "skip", `엔진이 ready가 아니다(${outcome})`);
        continue;
      }
      await step(`${label} 썸네일: pending이 모두 끝나고 failed 0`, async () => {
        await settleThumbnails();
        const failed = await page.locator(".cl-slot-thumb--failed").count();
        const done = await page.locator("canvas.cl-slot-thumb").count();
        if (failed > 0) return { fail: `실패한 썸네일 ${failed}개` };
        if (done === 0) return { fail: "그려진 썸네일이 없음" };
        return { detail: `완료 ${done}` };
      });
      for (const mode of ["pbr", "toon"]) {
        const modeLabel = mode === "pbr" ? "PBR" : "툰";
        await step(`${label} ${modeLabel} lit 투명 PNG: 모서리 알파 0·투명 RGB 0·면적 ≥ ${MIN_COVERAGE * 100}%`, async () => {
          const toggle = page.getByRole("button", { name: /PBR 셰이딩|툰 셰이딩/u });
          const current = (await toggle.textContent())?.includes("툰") ? "toon" : "pbr";
          if (current !== mode) {
            await toggle.click();
            await page.waitForTimeout(1500);
          }
          const { fileName, analysis } = await exportPng();
          if (options.shots) await page.screenshot({ path: path.join(options.shots, `3-${backend}-${mode}.png`) });
          const problems = [];
          if (analysis.cornerAlphas.some((alpha) => alpha !== 0)) problems.push(`모서리 알파 ${analysis.cornerAlphas.join(",")}`);
          if (analysis.transparentWithRgb > 0) problems.push(`알파 0인데 RGB≠0 픽셀 ${analysis.transparentWithRgb}`);
          if (analysis.coverage < MIN_COVERAGE) problems.push(`불투명 면적 ${(analysis.coverage * 100).toFixed(2)}% (완전 투명 캐릭터)`);
          if (problems.length > 0) return { fail: `${fileName}: ${problems.join("; ")}` };
          return { detail: `${fileName} ${analysis.width}×${analysis.height} 면적 ${(analysis.coverage * 100).toFixed(1)}%` };
        });
      }
      await step(`${label} 슬롯 카드 클릭 = history 1단계, 실행 취소 = 1단계 되돌림`, async () => {
        const before = await historyDepth();
        const card = page.locator('.cl-slot-card:not([aria-pressed="true"]):not(:disabled)').first();
        await card.click();
        await page.waitForTimeout(500);
        const after = await historyDepth();
        await page.getByLabel("히스토리", { exact: true }).getByRole("button", { name: "실행 취소" }).click();
        await page.waitForTimeout(500);
        const undone = await historyDepth();
        if (after !== before + 1) return { fail: `카드 클릭 뒤 깊이 ${before}→${after}(+1 기대)` };
        if (undone !== before) return { fail: `실행 취소 뒤 깊이 ${undone}(${before} 기대)` };
        return { detail: `깊이 ${before}→${after}→${undone}` };
      });
    }
    await step("페이지 오류(pageerror) 없음", async () => (pageErrors.length > 0 ? { fail: pageErrors.slice(0, 3).join(" | ") } : { detail: "0건" }));
  } finally {
    report.consoleErrors = [...consoleErrors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([message, count]) => ({ count, message }));
    await browser.close();
    server.stop();
  }

  const failed = steps.filter((entry) => entry.status === "fail").length;
  report.summary = { pass: steps.filter((entry) => entry.status === "pass").length, fail: failed, skip: steps.filter((entry) => entry.status === "skip").length };
  if (options.out) {
    mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
    writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);
    log(`리포트: ${options.out}`);
  }
  if (httpErrors.length > 0) log(`HTTP 4xx/5xx: ${[...new Set(httpErrors)].slice(0, 5).join(" | ")}`);
  if (report.consoleErrors.length > 0) log(`console.error 상위: ${report.consoleErrors.slice(0, 3).map((entry) => `${entry.count}× ${entry.message}`).join(" | ")}`);
  log(`요약: 통과 ${report.summary.pass} · 실패 ${report.summary.fail} · 건너뜀 ${report.summary.skip}`);
  return failed > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
