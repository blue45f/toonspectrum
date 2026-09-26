import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repo = fileURLToPath(new URL("../", import.meta.url));
const configured = process.env.STUDIO_QA_BASE_URL?.trim();
assert(configured, "STUDIO_QA_BASE_URL로 이 작업 공간의 로컬 서버를 지정하세요.");
const origin = new URL(configured);
assert(["http:", "https:"].includes(origin.protocol) && ["127.0.0.1", "localhost"].includes(origin.hostname), "로컬 HTTP 서버만 검증할 수 있습니다.");
assert(origin.pathname === "/" && !origin.search && !origin.hash && !origin.username && !origin.password, "서버 주소에는 경로나 인증 정보를 넣지 마세요.");
const port = origin.port || (origin.protocol === "https:" ? "443" : "80");
const owners = [...new Set(execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" }).trim().split(/\s+/u))];
const expected = await realpath(repo);
let owned = false;
for (const pid of owners) {
  const cwd = execFileSync("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"], { encoding: "utf8" }).split("\n").find((line) => line.startsWith("n"))?.slice(1);
  if (cwd && await realpath(cwd) === expected) owned = true;
}
assert(owned, "다른 작업 공간의 서버입니다. 이 저장소에서 별도 포트로 개발 서버를 실행하세요.");
const output = resolve(process.env.STUDIO_QA_OUTPUT || resolve(repo, ".qa/virtual-studio-tile-world"));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const results = [];
try {
  for (const renderer of ["canvas", "webgl"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${origin.origin}/tools/browser-harnesses/virtual-studio-tile-world.html?renderer=${renderer}`, { waitUntil: "domcontentloaded" });
    // Vite의 시간 쿼리가 다른 URL을 import하면 최상위 Game이 두 번 생기므로 실제 로드 URL을 재사용한다.
    const module = await page.evaluate(() => [...document.scripts].find((script) => script.src.includes("/virtual-studio-tile-world.ts"))?.src);
    assert(module, "검증 모듈 URL을 찾지 못했습니다.");
    const call = (method, args = []) => page.evaluate(async ({ module, method, args }) => (await import(module))[method](...args), { module, method, args });
    const waitState = async (predicate, message) => {
      const deadline = Date.now() + 30_000;
      while (Date.now() < deadline) {
        const snapshot = await call("state");
        assert.deepEqual(snapshot.errors, [], "타일 런타임 오류가 발생했습니다.");
        if (predicate(snapshot)) return snapshot;
        await page.waitForTimeout(100);
      }
      throw new Error(message);
    };
    const loaded = (state) => state.ready && state.chunks > 0 && state.pending === 0;
    const initial = await waitState(loaded, "첫 타일 로딩이 완료되지 않았습니다.");
    assert.equal(initial.renderer, renderer);
    assert.equal(initial.textures, 2);
    assert(initial.chunks < 48, "월드 전체 청크가 동시에 생성됐습니다.");
    assert.equal(await page.locator("canvas").count(), 1);
    await page.screenshot({ path: resolve(output, `${renderer}-desktop.png`) });
    await call("pan", [200, 200]);
    const far = await waitState((state) => loaded(state) && state.chunks < initial.chunks && state.worldView?.x === 0, "화면 밖 청크가 해제되지 않았습니다.");
    await page.setViewportSize({ width: 390, height: 844 });
    await waitState((state) => state.viewport.width === 390 && state.viewport.height === 844, "모바일 캔버스 크기가 적용되지 않았습니다.");
    await call("pan", [2048, 1536, 0.8]);
    const mobile = await waitState((state) => loaded(state) && Math.abs(state.worldView.width - 487.5) < 1 && Math.abs(state.worldView.height - 1055) < 1 && state.worldView.x > 1000, "모바일 카메라 범위가 적용되지 않았습니다.");
    await page.screenshot({ path: resolve(output, `${renderer}-mobile.png`) });
    await call("dispose");
    const disposed = await call("state");
    assert.equal(disposed.layers, 0);
    assert.equal(disposed.textureKeys.length, 0);
    await call("restart");
    const restarted = await waitState(loaded, "재시작 후 타일이 복구되지 않았습니다.");
    assert.equal(restarted.failures, 0);
    assert.equal(await page.locator("canvas").count(), 1);
    assert.deepEqual(errors, []);
    results.push({ renderer, initial, far, mobile, disposed, restarted, pageErrors: errors, canvasCount: 1 });
    await page.close();
    console.log(`PASS ${renderer}: 데스크톱·모바일·청크 해제·종료·재시작`);
  }
} finally {
  await browser.close();
  await writeFile(resolve(output, "report.json"), JSON.stringify({ server: origin.origin, worktree: expected, webglBackend: "headless Chromium SwiftShader", results }, null, 2));
}
