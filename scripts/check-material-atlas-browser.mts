import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";

import { chromium, expect } from "@playwright/test";

import { hasExportedHttpsUrlUnderPath } from "./lib/exported-url-provenance";

// Tests the actual production bundle with production global security headers.
// Existing unrelated /api routes deliberately return a 503 fixture: this new
// route must remain usable without a backend. No production data is written.
const root = process.cwd();
const dist = path.join(root, "dist");
const artifacts = path.join(root, "artifacts/material-atlas");
await mkdir(artifacts, { recursive: true });
const responsePolicy = JSON.parse(
  await readFile(path.join(root, "config/http-response-headers.json"), "utf8"),
) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
const headers = Object.fromEntries(
  responsePolicy.headers
    .filter((entry) => entry.source === "/(.*)")
    .flatMap((entry) => entry.headers.map((header) => [header.key, header.value])),
);
const mime: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".wasm": "application/wasm", ".ico": "image/x-icon" };
assert(existsSync(path.join(dist, "index.html")), "Run pnpm build first");
const server = createServer((request, response) => {
  void (async () => {
    const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    if (pathname.startsWith("/api/")) { response.writeHead(503, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "explicit-browser-fixture-backend-unavailable" })); return; }
    const candidate = path.resolve(dist, `.${pathname}`);
    if (!candidate.startsWith(dist + path.sep)) { response.writeHead(400); response.end(); return; }
    const file = path.extname(pathname) ? candidate : path.join(dist, "index.html");
    try { const body = await readFile(file); response.writeHead(200, { ...headers, "content-type": mime[path.extname(file)] ?? "application/octet-stream" }); response.end(body); }
    catch { response.writeHead(404); response.end("Not found"); }
  })().catch(() => { response.writeHead(500); response.end("Browser harness error"); });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const origin = `http://127.0.0.1:${address.port}`;
const browser = await chromium.launch({ headless: true });
const results: Record<string, unknown>[] = [];
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 960 }, locale: "ko-KR", timezoneId: "Asia/Seoul", acceptDownloads: true, serviceWorkers: "block", reducedMotion: "reduce" });
    await context.addInitScript({ content: 'Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async function () { throw new Error("intentional clipboard-denied fixture"); } } });' });
    const page = await context.newPage();
    const errors: string[] = [];
    const providerRequests: string[] = [];
    const noteTransmissions: string[] = [];
    page.on("pageerror", (error) => { errors.push(error.message); console.error("PAGEERROR", error.message); });
    page.on("request", (request) => {
      const host = new URL(request.url()).hostname;
      if (["api.polyhaven.com", "ambientcg.com", "cdn.polyhaven.com", "acg-media.struffelproductions.com"].includes(host)) providerRequests.push(request.url());
      if ((request.postData() ?? "").includes("MATERIAL-PRIVATE-NOTE")) noteTransmissions.push(request.url());
    });
    await page.goto(`${origin}/insights/resources`, { waitUntil: "domcontentloaded" });
    await page.getByRole("link", { name: "무료 배경·소품 소재 도감 열기" }).click();
    await expect(page.getByRole("heading", { name: "무료 배경·소품 소재 도감", exact: true })).toBeVisible();
    await expect(page.locator('[aria-label="소재 검색 결과"] img')).toHaveCount(0);
    assert.equal(providerRequests.length, 0, "No provider request before preview opt-in");
    await page.getByLabel("검색어", { exact: true }).fill("벽돌");
    await expect(page.getByRole("button", { name: /소재 담기/ }).first()).toBeVisible();
    await page.getByRole("button", { name: /소재 담기/ }).first().click();
    await page.getByRole("button", { name: /소재 담기/ }).nth(1).click();
    await expect(page.getByRole("button", { name: /목록에서 해제/ })).toHaveCount(2);
    await page.locator("#material-note").fill("MATERIAL-PRIVATE-NOTE: 3컷 벽돌 배경");
    await page.getByRole("button", { name: "소재 링크 복사", exact: true }).click();
    const shared = await page.getByLabel("메모를 제외한 소재 공유 링크").inputValue();
    assert(!shared.includes("PRIVATE"));
    const jsonDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "보드 JSON 내보내기", exact: true }).click();
    const backup = await jsonDownload;
    const backupPath = path.join(artifacts, `board-${width}.json`);
    await backup.saveAs(backupPath);
    const board = JSON.parse(await readFile(backupPath, "utf8")) as { selectedIds: string[]; note: string };
    assert.equal(board.selectedIds.length, 2); assert(board.note.includes("MATERIAL-PRIVATE-NOTE"));
    const mdDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "출처 포함 명세서 내보내기", exact: true }).click();
    const specification = await mdDownload;
    const mdPath = path.join(artifacts, `specification-${width}.md`);
    await specification.saveAs(mdPath);
    const markdown = await readFile(mdPath, "utf8");
    assert(hasExportedHttpsUrlUnderPath(markdown, "https://polyhaven.com", "/a/") && markdown.includes("CC0 1.0"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("#material-note")).toHaveValue("");
    await expect(page.getByRole("button", { name: /목록에서 해제/ })).toHaveCount(2);
    await page.getByLabel("소재 보드 JSON 불러오기", { exact: true }).setInputFiles(backupPath);
    await expect(page.locator("#material-note")).toHaveValue(board.note);
    await page.getByLabel("소재 보드 JSON 불러오기", { exact: true }).setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("{invalid") });
    await expect(page.locator("#material-board [role=alert]")).toBeVisible();
    await expect(page.locator("#material-note")).toHaveValue(board.note);
    await expect(page.getByRole("button", { name: /목록에서 해제/ })).toHaveCount(2);
    await page.getByRole("button", { name: /골목 배경의 세 가지 질감/ }).click();
    await expect(page.getByRole("button", { name: "가이드 필터 해제" })).toBeVisible();
    await page.getByRole("button", { name: "검색 조건 초기화", exact: true }).click();
    await page.getByLabel("검색어", { exact: true }).fill("constructor");
    await expect(page.getByRole("heading", { name: "조건에 맞는 소재가 없습니다" })).toBeVisible();
    await page.getByRole("button", { name: "검색 조건 초기화", exact: true }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert(overflow <= 1, `Horizontal overflow at ${width}: ${overflow}`);
    await page.getByRole("heading", { name: "무료 배경·소품 소재 도감", exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, `atlas-${width}.png`) });
    assert.equal(providerRequests.length, 0, "Search, notes, selection and export must not fetch providers");
    assert.equal(noteTransmissions.length, 0, "Notes must not be posted");
    let livePreview = false;
    if (width === 1440) {
      await page.getByRole("checkbox", { name: "제공처 미리보기 이미지 불러오기" }).check();
      const image = page.locator('[aria-label="소재 검색 결과"] img').first();
      await image.scrollIntoViewIfNeeded();
      await expect.poll(() => image.evaluate((element) => element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0), { timeout: 20000 }).toBe(true);
      livePreview = true;
      await page.screenshot({ path: path.join(artifacts, "atlas-live-preview.png") });
    }
    assert.deepEqual(errors, [], `Browser exceptions at ${width}`);
    results.push({ width, flow: "passed", horizontalOverflow: overflow, providerRequestsBeforeOptIn: 0, noteTransmissions: 0, actualProviderPreviewLoaded: livePreview, pageErrors: errors });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
  await writeFile(path.join(artifacts, "browser-report.json"), JSON.stringify({ testedAt: new Date().toISOString(), bundle: "production dist", backend: "explicit 503 fixture", securityHeaders: "provider-neutral global headers", results }, null, 2));
} catch (cause) {
  const page = browser.contexts()[0]?.pages()[0];
  if (page) { await page.screenshot({ path: path.join(artifacts, "failure.png"), fullPage: true }); await writeFile(path.join(artifacts, "failure.html"), await page.content()); console.error("Note state", await page.locator("#material-note").inputValue().catch(() => "missing")); }
  throw cause;
} finally { await browser.close(); await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
