import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const origin = process.env.CHARACTER_TEST_ORIGIN ?? "http://127.0.0.1:5198";
const evidence = process.env.CHARACTER_TEST_EVIDENCE ?? "/private/tmp/character-browser-evidence";
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(120_000);
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  await page.goto(`${origin}/studio/character-convert`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "캐릭터 2D ↔ 3D", exact: true }).waitFor();
  await page.getByLabel("정면 원화 (필수)", { exact: false }).setInputFiles(path.join(root, "apps/web/public/assets/3d/characters/thumbnails/alicia.png"));
  await page.getByRole("button", { name: "원화 준비", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "준비 완료" }).waitFor();
  await page.getByRole("img", { name: "정면 AI 입력 원화" }).waitFor();
  const kitEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "AI 실행 키트 저장", exact: true }).click();
  const kit = await kitEvent; await kit.saveAs(path.join(evidence, "character-ai-kit.zip"));
  await page.screenshot({ path: path.join(evidence, "2d-input.png"), fullPage: true });
  await page.getByRole("button", { name: "3D 모델 → 2D / AI 일러스트", exact: true }).click();
  await page.getByLabel("캐릭터 GLB", { exact: true }).setInputFiles(path.join(root, "apps/web/public/assets/3d/atelier_camera.glb"));
  await page.getByLabel("정면·좌·후면·우 4방향 만들기", { exact: true }).check();
  await page.getByRole("button", { name: "로컬 렌더 만들기", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "준비 완료" }).waitFor();
  assert.equal(await page.locator('img[alt$="원본 재질"]').count(), 4);
  await page.getByRole("button", { name: "깊이 제어", exact: true }).click();
  assert.equal(await page.locator('img[alt$="깊이 제어"]').count(), 4);
  await page.screenshot({ path: path.join(evidence, "3d-depth-views.png"), fullPage: true });
  await page.getByRole("button", { name: "선화", exact: true }).click();
  assert.equal(await page.locator('img[alt$="선화"]').count(), 4);
  const imageKitEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "AI 실행 키트 저장", exact: true }).click();
  const imageKit = await imageKitEvent; await imageKit.saveAs(path.join(evidence, "render-ai-kit.zip"));
  await page.getByLabel("캐릭터 GLB", { exact: true }).setInputFiles({ name: "invalid.glb", mimeType: "model/gltf-binary", buffer: Buffer.from("invalid model") });
  await page.getByRole("button", { name: "로컬 렌더 만들기", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByRole("button", { name: "AI 실행 키트 저장", exact: true }).isDisabled(), true);
  assert.deepEqual(errors, []);
  await writeFile(path.join(evidence, "report.json"), JSON.stringify({ status: "passed", checked: ["route", "PNG preparation", "shape kit download", "GLB four-view WebGL render", "depth and lineart selection", "six-pass image kit", "invalid GLB rejected", "no uncaught browser errors"], inferenceExecuted: false }, null, 2));
  console.log("PASS: character conversion browser smoke, 8 checks; neural inference not executed.");
} catch (error) {
  await page.screenshot({ path: path.join(evidence, "failure.png"), fullPage: true }).catch(() => {});
  console.error("Browser page errors:", errors);
  throw error;
} finally {
  await browser.close();
}
