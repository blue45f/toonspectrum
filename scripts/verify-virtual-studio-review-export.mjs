import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright";

const origin = new URL(process.env.STUDIO_QA_BASE_URL ?? "http://127.0.0.1:5253");
assert(["localhost", "127.0.0.1"].includes(origin.hostname) && !origin.username && !origin.password);
assert(origin.pathname === "/" && !origin.search && !origin.hash);
const run = promisify(execFile), cwd = await fs.realpath(process.cwd());
const { stdout } = await run("lsof", ["-nP", `-iTCP:${origin.port}`, "-sTCP:LISTEN", "-t"]);
let owned = false;
for (const pid of new Set(stdout.trim().split(/\s+/u))) {
  const owner = await run("lsof", ["-a", "-p", pid, "-d", "cwd", "-Fn"]);
  const directory = owner.stdout.split("\n").find((line) => line.startsWith("n"))?.slice(1);
  if (directory && await fs.realpath(directory) === cwd) owned = true;
}
assert(owned, "Export QA server must belong to this worktree");
const output = path.resolve(".qa/virtual-studio-review-export"); await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "ko-KR", acceptDownloads: true });
const errors = [], cases = [], requests = [], downloads = [], held = [];
let fixture, images, mode = "normal", previewReads = 0;
page.on("pageerror", (error) => errors.push(error.message));
page.on("download", (download) => downloads.push(download));
await page.route("**/*", async (route) => {
  const request = route.request(), url = new URL(request.url());
  if (url.hostname === "review-export-fixture.invalid") {
    assert.equal(request.headers().referer, undefined); assert.equal(request.headers().cookie, undefined);
    const index = url.pathname === "/1.png" ? 1 : 0;
    if (mode === "held") await new Promise((resolve) => held.push(resolve));
    const body = mode === "corrupt" ? Buffer.alloc(images[index].length) : images[index];
    return route.fulfill({ contentType: "image/png", headers: { "access-control-allow-origin": origin.origin }, body });
  }
  if (url.origin !== origin.origin) return route.abort();
  if (!url.pathname.startsWith("/api/")) return route.continue();
  requests.push(url.pathname);
  if (url.pathname.endsWith("/review-deliveries")) {
    assert.equal(request.method(), "GET");
    return route.fulfill({ json: { items: [], recipients: [], canPrepare: false, mode: "free" } });
  }
  assert(fixture); assert.equal(request.method(), "GET", "Export may not create approvals or mutate documents");
  if (mode === "revoked" && previewReads >= 1) return route.fulfill({ status: 403, json: { message: "Fixture access revoked after image acquisition" } });
  if (url.pathname.endsWith("/projects/graph")) return route.fulfill({ json: fixture.project });
  if (url.pathname.endsWith("/reviews/review")) return route.fulfill({ json: fixture.review });
  if (url.pathname.endsWith("/artifacts/artifact/revisions")) return route.fulfill({ json: [fixture.revision] });
  if (url.pathname.endsWith("/reviews/review/previews")) {
    previewReads++;
    for (const key of ["workId", "projectId", "artifactId", "revisionId", "rootGraphHash"]) assert.equal(url.searchParams.get(key), fixture.subject[key]);
    return route.fulfill({ json: { ok: true, subject: fixture.subject, nextCursor: null,
      previews: images.map((image, ordinal) => ({ ordinal, sha256: createHash("sha256").update(image).digest("hex"), byteLength: image.length,
        mediaType: "image/png", url: `https://review-export-fixture.invalid/${ordinal}.png?secret=temporary-read`, expiresAt: Date.now() + 25_000,
        mapping: { status: "unmapped", reason: "legacy-review" } })) } });
  }
  throw new Error(`Unexpected API path ${url.pathname}`);
});
const save = () => page.getByRole("button", { name: "승인 검수본 ZIP 저장", exact: true });
const release = () => { mode = "normal"; held.splice(0).forEach((resolve) => resolve()); };
async function load(width = 1280) {
  release(); previewReads = 0; requests.length = 0;
  await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
  await page.goto(`${origin.origin}/tools/browser-harnesses/virtual-studio-review-export.html`); await save().waitFor();
  fixture = JSON.parse(await page.locator("#fixture-data").textContent());
  images = (await page.evaluate(() => [0, 1].map((index) => {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
    const c = canvas.getContext("2d"); c.fillStyle = index ? "#f4ebdb" : "#dcedf2"; c.fillRect(0, 0, 640, 360);
    c.strokeStyle = "#314958"; c.lineWidth = 6; c.strokeRect(24, 24, 592, 312);
    c.beginPath(); c.moveTo(72, 246); c.bezierCurveTo(150, 60, 292, 326, 530, 94); c.stroke();
    c.fillStyle = "#314958"; c.font = "26px sans-serif"; c.fillText(`Pinned review page ${index + 1}`, 50, 65);
    return canvas.toDataURL("image/png").split(",")[1];
  }))).map((base64) => Buffer.from(base64, "base64"));
  fixture.revision.blobRefs = images.map((image, ordinal) => ({ ordinal, role: "preview", sha256: createHash("sha256").update(image).digest("hex") }));
  assert.equal(requests.length, 0, "No export reads before explicit click");
}
async function waitHeld() {
  for (let attempt = 0; held.length === 0 && attempt < 200; attempt++) await new Promise((resolve) => setTimeout(resolve, 20));
  assert(held.length, "Expected a delayed image response");
}
try {
  for (const width of [1280, 390]) {
    await load(width);
    const ready = page.waitForEvent("download"); await save().focus(); await page.keyboard.press("Enter");
    const download = await ready, archivePath = path.join(output, `approved-review-${width}.zip`); await download.saveAs(archivePath);
    const manifest = JSON.parse((await run("unzip", ["-p", archivePath, "manifest.json"])).stdout);
    assert.deepEqual(manifest.subject, fixture.subject); assert.equal(manifest.pages.length, 2);
    for (const [index, record] of manifest.pages.entries()) {
      const extracted = (await run("unzip", ["-p", archivePath, record.path], { encoding: "buffer" })).stdout;
      assert.deepEqual(extracted, images[index]); assert.equal(createHash("sha256").update(extracted).digest("hex"), record.sha256);
    }
    const text = JSON.stringify(manifest); assert(!/temporary-read|secret|review-export-fixture|assigneeIds|comments|approvedRevisionId/u.test(text));
    assert.equal(previewReads, 2); assert.equal(fixture.project.artifacts[0].headRevisionId, "latest");
    await page.getByText("브라우저에 승인된 검수본의 ZIP 다운로드를 요청했어요.", { exact: true }).waitFor();
    assert((await save().boundingBox()).height >= 44); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: path.join(output, `export-${width}.png`) });
    cases.push({ name: "explicit-original-bytes-real-worker-zip-final-authority", width, pages: 2, previewReads, sourceWrites: 0 });
  }
  for (const scenario of ["corrupt", "revoked"]) {
    await load(); const before = downloads.length; mode = scenario; await save().click();
    await page.getByText(scenario === "corrupt" ? "저장된 이미지의 내용이나 전체 목록을 확인하지 못했어요. 파일을 저장하지 않았습니다."
      : "현재 승인과 접근 권한을 확인하지 못했어요. 검토 기록을 새로 확인한 뒤 다시 시도해 주세요.", { exact: true }).waitFor();
    assert.equal(downloads.length, before); cases.push({ name: scenario, downloads: 0 });
  }
  for (const scenario of ["cancel", "actor-change"]) {
    await load(); const before = downloads.length; mode = "held"; await save().click(); await waitHeld();
    if (scenario === "cancel") await page.getByRole("button", { name: "취소", exact: true }).click();
    else await page.getByRole("button", { name: "예시 계정 전환", exact: true }).click();
    release(); await save().waitFor();
    await page.waitForFunction(() => !document.querySelector('[role="status"]')?.textContent?.includes("확인 중"));
    assert.equal(downloads.length, before); cases.push({ name: scenario, downloads: 0 });
  }
  assert.deepEqual(errors, []);
  const report = { cases, pageErrors: errors, downloads: downloads.length, scope: "Actual component/client/hash/archive-worker/browser download; synthetic approval and preview HTTP fixtures; no actual API, private object storage or production approval" };
  await fs.writeFile(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report));
} catch (error) { await page.screenshot({ path: path.join(output, "failure.png") }).catch(() => undefined); throw error; }
finally { release(); await browser.close(); }
