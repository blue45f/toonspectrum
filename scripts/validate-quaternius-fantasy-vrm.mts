import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { chromium } from "playwright";

import { QUATERNIUS_FANTASY_VRMS } from "../apps/web/src/domains/creator/vrm/quaternius-fantasy-catalog";

import type { QuaterniusFantasyRuntime } from "../apps/web/tools/browser-harnesses/quaternius-fantasy-vrm";

type ReviewWindow = Window & { __quaterniusFantasy?: QuaterniusFantasyRuntime };
const origin = process.argv[2] ?? "http://127.0.0.1:5229";
assert.match(origin, /^http:\/\/127\.0\.0\.1:\d+$/u);
const output = resolve("apps/web/public/assets/3d/characters/thumbnails/quaternius-fantasy-v1");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors: string[] = [];
const records: Record<string, unknown>[] = [];
try {
  const page = await browser.newPage({ viewport: { width: 768, height: 768 }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`${origin}/tools/browser-harnesses/quaternius-fantasy-vrm.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => (window as ReviewWindow).__quaterniusFantasy?.ready);
  for (const model of QUATERNIUS_FANTASY_VRMS) {
    const result = await page.evaluate(async (id) => {
      const runtime = (window as ReviewWindow).__quaterniusFantasy;
      if (!runtime) throw new Error("Candidate review harness unavailable");
      return runtime.review(id);
    }, model.id);
    assert.deepEqual(errors, []);
    assert.equal(result.humanBones, 52);
    assert.equal(result.expressions, 0);
    assert.equal(result.animations, 0);
    assert.ok(result.renderedTriangles > 0);
    const png = Buffer.from(result.pngBase64, "base64");
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [768, 768]);
    await writeFile(resolve(output, `${model.id}.png`), png);
    const source = await readFile(resolve("apps/web/public", model.url.slice(1)));
    const { pngBase64: _png, builtinPoses, ...receipt } = result;
    const poseReceipts = [];
    for (const pose of builtinPoses) {
      const { pngBase64, ...poseReceipt } = pose;
      const preview = `artifacts/studio-asset-expansion/previews/fantasy-v1/${model.id}-studio-${pose.poseId}.png`;
      await writeFile(resolve(preview), Buffer.from(pngBase64, "base64"));
      poseReceipts.push({ ...poseReceipt, preview });
    }
    assert.deepEqual(poseReceipts.map((pose) => pose.poseId), ["default", "wave", "sit", "run"]);
    records.push({ ...receipt, builtinPoses: poseReceipts, sha256: createHash("sha256").update(source).digest("hex"), thumbnailSha256: createHash("sha256").update(png).digest("hex") });
    process.stdout.write(`${model.id}: ${result.humanBones} bones; skin deltas ${JSON.stringify(result.deformation)}; ${result.gpu.renderer}\n`);
  }
  await writeFile(resolve("artifacts/studio-asset-expansion/fantasy-runtime-validation.json"), JSON.stringify({ version: 1, browser: browser.version(), status: "passed", entries: records, errors }, null, 2) + "\n");
} finally {
  await browser.close();
}
