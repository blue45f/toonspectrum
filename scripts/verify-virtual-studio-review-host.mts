/** Actual local Studio Host/auth/source/collaboration; synthetic capture producer HTTP. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { canonicalJson } from "@toonspectrum/studio-project-model";
import pg from "pg";
import { chromium } from "playwright";

import { hashPassword } from "../apps/api/src/server/password";
import { createEmptyStudioAiImageReferenceDocument } from "../apps/web/src/domains/creator/ai/studio-ai-image-reference-roles";
import { createEmptyStudioAiProvenanceDocument } from "../apps/web/src/domains/creator/ai/studio-ai-provenance";
import { createEmptyStudioCharacterBible } from "../apps/web/src/domains/creator/studio-character-bible";
import { createEmptyStudioCommentsDocument } from "../apps/web/src/domains/creator/studio-comments";
import { createEmptyStudioPublicationAnalyticsDocument } from "../apps/web/src/domains/creator/studio-publication-analytics";
import { DEFAULT_STUDIO_PUBLISH_COMPLIANCE } from "../apps/web/src/domains/creator/studio-publish-compliance";
import { DEFAULT_STUDIO_PUBLISH_PACKAGE_SETTINGS } from "../apps/web/src/domains/creator/studio-publish-package";
import { createDefaultStudioReferenceBoardDocument } from "../apps/web/src/domains/creator/studio-reference-board";
import { createEmptyStudioReleaseSchedule } from "../apps/web/src/domains/creator/studio-release-schedule";
import { buildStudioSavePayload } from "../apps/web/src/domains/creator/studio-save-payload";
import { createEmptyStudioWriterRoomDocument } from "../apps/web/src/domains/creator/studio-writer-room";

import { withStudioReviewHostQaRuntime } from "./studio-review-host-qa-runtime.mjs";

await withStudioReviewHostQaRuntime(process.env, async ({ origin, databaseTarget }: {
  origin: URL; databaseTarget: { databaseUrl: string };
}) => {
const pool = new pg.Pool({ connectionString: databaseTarget.databaseUrl, max: 1 });
const output = path.resolve(process.env.STUDIO_QA_OUTPUT ?? ".qa/virtual-studio-review-host");
await mkdir(output, { recursive: true });
let workId = "";
const title = "검수 캡처 실편집기 검증";
const snapshot = {
  title, description: "Synthetic full Host capture fixture", tagsText: "", linkedTitleId: null,
  linkedSeriesId: null, linkedChallengeId: null,
  pagesList: [
    { id: "qa-page-one", elements: [], bg: "#b9dce8", bgGrad: null, canvasH: 1080 },
    { id: "qa-page-two", elements: [], bg: "#f2c9ad", bgGrad: null, canvasH: 1080 },
  ], master: undefined, characterBible: createEmptyStudioCharacterBible(),
  writerRoom: createEmptyStudioWriterRoomDocument(), aiProvenance: createEmptyStudioAiProvenanceDocument(),
  comments: createEmptyStudioCommentsDocument(), releaseSchedule: createEmptyStudioReleaseSchedule(),
  publicationAnalytics: createEmptyStudioPublicationAnalyticsDocument(),
  referenceBoard: createDefaultStudioReferenceBoardDocument(), aiImageReferences: createEmptyStudioAiImageReferenceDocument(),
  currentPageId: "qa-page-one", webtoonTheme: "classic" as const, panelGutter: 24,
  publishPack: { profile: "generic" as const, aiUsage: "none" as const, disclosure: "",
    compliance: DEFAULT_STUDIO_PUBLISH_COMPLIANCE, packageSettings: DEFAULT_STUDIO_PUBLISH_PACKAGE_SETTINGS, packageCredits: "" },
};
const payload = buildStudioSavePayload({ ...snapshot, cover: "", pageImages: [], status: "draft",
  document: { ...snapshot, width: 720 } });
let sourceRevision = 0, digest = "";
let subject: Record<string, unknown> = {};
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "ko-KR" });
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const pageErrors: string[] = [], requests: { method: string; path: string }[] = [];
const uploads: { ordinal: number; sha256: string; width: number; height: number; bytes: number }[] = [];
let sourceReads = 0, prepareCount = 0, completeCount = 0;
let intent: Record<string, unknown> | null = null;
page.on("pageerror", (error) => pageErrors.push(error.message));
await page.route("**/*", async (route) => {
  const request = route.request(), url = new URL(request.url());
  if (!url.pathname.startsWith("/api/")) return url.origin === origin.origin ? route.continue() : route.abort();
  requests.push({ method: request.method(), path: url.pathname });
  if (url.pathname === `/api/creator/works/${workId}/team/document`) {
    assert.equal(request.method(), "GET", "Capture must not modify its saved source"); sourceReads++;
    return route.continue();
  }
  if (url.pathname.endsWith("/review-captures/prepare")) {
    assert.equal(request.method(), "POST"); prepareCount++;
    const body = request.postDataJSON();
    assert.equal(body.workId, workId); assert.equal(body.sourceServerRevision, sourceRevision);
    assert.equal(body.sourceContentDigest, digest); assert.equal(body.pageCount, 2);
    intent = { ...body, projectId: subject.projectId, artifactId: subject.artifactId,
      expectedHeadRevisionId: "qa-host-prior", expectedHeadRootGraphHash: "a".repeat(64) };
    return route.fulfill({ json: intent });
  }
  if (url.pathname.endsWith("/review-captures/status")) {
    assert.deepEqual(request.postDataJSON(), intent); return route.fulfill({ json: { status: "pending" } });
  }
  const match = /\/review-captures\/pages\/(\d+)$/u.exec(url.pathname);
  if (match) {
    assert.equal(request.method(), "PUT");
    const bytes = request.postDataBuffer(); assert(bytes);
    const form = await new Response(new Uint8Array(bytes), { headers: { "content-type": request.headers()["content-type"]! } }).formData();
    assert.deepEqual(JSON.parse(String(form.get("intent"))), intent);
    const file = form.get("file"); assert(file instanceof Blob && file.type === "image/png");
    const png = Buffer.from(await file.arrayBuffer()); assert.equal(png.subarray(1, 4).toString(), "PNG");
    const receipt = { ordinal: Number(match[1]), sha256: createHash("sha256").update(png).digest("hex"),
      width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
    uploads.push({ ...receipt, bytes: png.byteLength });
    await writeFile(path.join(output, `page-${receipt.ordinal}.png`), png);
    return route.fulfill({ json: receipt });
  }
  if (url.pathname.endsWith("/review-captures/complete")) {
    completeCount++; const body = request.postDataJSON(); assert.deepEqual(body.intent, intent);
    assert.deepEqual(body.pages, uploads.map(({ ordinal, sha256 }) => ({ ordinal, sha256 })));
    return route.fulfill({ json: { status: "completed", subject } });
  }
  if (url.pathname.endsWith("/review-captures/cancel")) return route.fulfill({ json: { status: "cancelled" } });
  return route.continue();
});
try {
  const headers = { "x-toonspectrum-csrf": "1", Origin: origin.origin, Referer: `${origin.origin}/studio` };
  const accountId = randomUUID(), email = `qa-review-host-${accountId}@example.test`, password = `Qa-${accountId}-pw`;
  // A new verified fixture account avoids sending external signup email. Login,
  // session cookies and every source/collaboration ACL still use the actual API.
  await pool.query('INSERT INTO "user" (id, name, email, "emailVerified", "passwordHash", "createdAt") VALUES ($1, $2, $3, NOW(), $4, NOW())',
    [accountId, "검수 작가", email, await hashPassword(password)]);
  console.log("Seeded disposable verified account.");
  const login = await context.request.post(`${origin.origin}/api/auth/login`, { headers, data: { email, password } });
  assert(login.ok(), `Local login returned ${login.status()}`);
  assert.equal((await login.json()).ok, true, "Authenticate through the actual local API");
  console.log("Authenticated through the local API.");
  const created = await context.request.post(`${origin.origin}/api/creator/works`, { headers, data: payload });
  assert([200, 201].includes(created.status()), `Create returned ${created.status()}: ${await created.text()}`);
  workId = (await created.json()).id; assert.equal(typeof workId, "string");
  const source = await context.request.get(`${origin.origin}/api/creator/works/${workId}/team/document`, { headers });
  assert.equal(source.status(), 200); const saved = await source.json();
  sourceRevision = saved.revision;
  console.log("Created and read the saved source document.");
  digest = createHash("sha256").update(canonicalJson(saved.document.doc)).digest("hex");
  subject = { schemaVersion: 1, workId, projectId: "qa-host-graph", artifactId: "qa-host-artifact",
    reviewId: "qa-host-review", revisionId: "qa-host-snapshot", rootGraphHash: digest };
  await page.goto(`${origin.origin}/studio?id=${workId}`, { waitUntil: "domcontentloaded" });
  console.log("Navigated to the actual Studio Host.");
  await page.getByRole("heading", { name: title, exact: true }).waitFor({ timeout: 60_000 });
  const onboarding = page.getByRole("heading", { name: "나에게 맞는 작업 환경 만들기", exact: true });
  await onboarding.waitFor({ timeout: 15_000 });
  await page.getByRole("button", { name: "나중에 설정", exact: true }).first().click();
  await onboarding.waitFor({ state: "hidden" });
  const gate = page.getByRole("button", { name: "나중에 보기", exact: true });
  if (await gate.isVisible()) await gate.click();
  await page.getByRole("button", { name: "프로젝트 센터", exact: true }).click();
  await page.getByRole("button", { name: "저장된 원고로 검수본 만들기", exact: true }).click();
  await page.getByText("고정 검수본이 준비됐어요.", { exact: true }).waitFor({ timeout: 60_000 });
  assert.equal(prepareCount, 1); assert.equal(completeCount, 1); assert.equal(uploads.length, 2);
  assert.notEqual(uploads[0]!.sha256, uploads[1]!.sha256, "Distinct source pages must produce distinct captures");
  assert(uploads.every(({ width, height }) => width === 1440 && height === 2160), "Retain the actual default 2x export resolution");
  const sourcePixels = [];
  for (const upload of uploads) {
    const png = await readFile(path.join(output, `page-${upload.ordinal}.png`));
    const center = await page.evaluate(async (bytes) => {
      const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
      try {
        const canvas = new OffscreenCanvas(1, 1), context2d = canvas.getContext("2d");
        if (!context2d) throw new Error("Cannot inspect the captured PNG pixels");
        context2d.drawImage(bitmap, Math.floor(bitmap.width / 2), Math.floor(bitmap.height / 2), 1, 1, 0, 0, 1, 1);
        return Array.from(context2d.getImageData(0, 0, 1, 1).data);
      } finally { bitmap.close(); }
    }, [...png]);
    const expected = upload.ordinal === 0 ? [185, 220, 232, 255] : [242, 201, 173, 255];
    assert.deepEqual(center, expected, "The page ordinal must retain its saved source background");
    sourcePixels.push({ ordinal: upload.ordinal, center });
  }
  assert.deepEqual(pageErrors, []);
  await page.screenshot({ path: path.join(output, "capture-complete.png") });
  const report = { passed: true, scope: "Actual Studio Host, local auth/database/source/collaboration and canvas export with synthetic capture producer HTTP; not production object storage or source-to-pixel certification",
    sourceReads, prepareCount, completeCount, uploads, sourcePixels, pageErrors, requests };
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(String(error));
  await page.screenshot({ path: path.join(output, "failed.png"), timeout: 5_000 }).catch(() => undefined);
  await writeFile(path.join(output, "failed.json"), JSON.stringify({ error: String(error), sourceReads, prepareCount,
    completeCount, uploads, pageErrors, requests, text: await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "unavailable") }, null, 2));
  throw error;
} finally { await browser.close(); await pool.end(); }
});
