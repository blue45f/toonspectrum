/** Actual Host/auth/source/gateway; legacy HTTP fixture or explicit local-storage acceptance. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson } from "@toonspectrum/studio-project-model";
import { decodePng } from "image-js";
import pg from "pg";
import { chromium } from "playwright";

import { parseStudioVirtualSpaceReviewSubject } from "../apps/web/src/domains/creator/virtual-space/studio-virtual-space-review-subject";

import { assertReviewHostInkDiffers, inspectReviewHostPixels, type ReviewHostPage } from "./studio-review-host-pixel-evidence";
import { withStudioReviewHostQaRuntime } from "./studio-review-host-qa-runtime.mjs";
import { createStudioReviewHostFixture, openStudioReviewHost, authorStudioReviewHostSketches, requestStudioReviewHostCapture } from "./studio-review-host-steps";
import { approveAndExportStudioReview, readBackStudioReviewStorage, rejectCompletedStudioReviewReplacement, type StudioReviewLocalStorage, type StudioReviewStorageReceipt } from "./studio-review-storage-acceptance";

export async function verifyStudioReviewHost(environment: NodeJS.ProcessEnv, storage?: StudioReviewLocalStorage) {
await withStudioReviewHostQaRuntime(environment, async ({ origin, databaseTarget }: {
  origin: URL; databaseTarget: { databaseUrl: string };
}) => {
const pool = new pg.Pool({ connectionString: databaseTarget.databaseUrl, max: 1 });
const output = path.resolve(environment.STUDIO_QA_OUTPUT ?? ".qa/virtual-studio-review-host");
await mkdir(output, { recursive: true });
let workId = "";
let sourceRevision = 0, digest = "", initialRevision = 0;
let pinnedPages: ReviewHostPage[] = [];
let subject: Record<string, unknown> = {};
const browser = await chromium.launch({ headless: true,
  ...(storage ? { args: [`--ignore-certificate-errors-spki-list=${storage.spki}`] } : {}) });
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "ko-KR" });
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const pageErrors: string[] = [], requests: { method: string; path: string }[] = [];
const savePins: { baseRevision: number; crdtServerSequence: string }[] = [];
const uploads: { ordinal: number; sha256: string; width: number; height: number; bytes: number }[] = [];
const canonicalReceipts: StudioReviewStorageReceipt[] = [], observations: Promise<void>[] = [], observationErrors: unknown[] = [];
let exportEvidence: unknown = null;
let immutableRejection: unknown = null;
let sourceReads = 0, sourceWrites = 0, prepareCount = 0, completeCount = 0;
let intent: Record<string, unknown> | null = null;
page.on("pageerror", (error) => pageErrors.push(error.message));
if (storage) page.on("response", (response) => {
  const url = new URL(response.url());
  if (url.origin !== origin.origin || !url.pathname.includes("/review-captures/")) return;
  observations.push((async () => {
    const responseText = await response.text();
    assert(response.ok(), `Actual capture API ${url.pathname} returned ${response.status()}: ${responseText}`);
    const body = JSON.parse(responseText);
    if (url.pathname.endsWith("/prepare")) intent = body;
    else if (/\/pages\/\d+$/u.test(url.pathname)) canonicalReceipts.push(body);
    else if (url.pathname.endsWith("/complete")) { assert.equal(body.status, "completed"); subject = body.subject; }
  })().catch((error) => { observationErrors.push(error); console.error(String(error)); }));
});
await page.route("**/*", async (route) => {
  const request = route.request(), url = new URL(request.url());
  if (storage && url.origin === storage.endpoint) {
    assert.equal(request.method(), "GET"); assert.equal(request.headers().cookie, undefined); assert.equal(request.headers().referer, undefined);
    return route.continue();
  }
  if (!url.pathname.startsWith("/api/")) return url.origin === origin.origin ? route.continue() : route.abort();
  requests.push({ method: request.method(), path: url.pathname });
  if (url.pathname === `/api/creator/works/${workId}/team/document`) {
    if (request.method() === "GET") sourceReads++;
    else {
      assert.equal(prepareCount, 0, "Capture must not modify its pinned source");
      const body = request.postDataJSON();
      assert.equal(request.method(), "PATCH");
      assert.equal(typeof body.crdtServerSequence, "string");
      assert(/^\d+$/u.test(body.crdtServerSequence) && BigInt(body.crdtServerSequence) > BigInt(0),
        "Authored shared saves require a real, nonzero gateway acknowledgement");
      savePins.push({ baseRevision: body.baseRevision, crdtServerSequence: body.crdtServerSequence });
      sourceWrites++;
    }
    return route.continue();
  }
  if (url.pathname.endsWith("/review-captures/prepare")) {
    assert.equal(request.method(), "POST"); prepareCount++;
    // This independent authenticated read occurs after the shipped save flow. Never substitute
    // the prepared request's claimed digest or inject strokes into the saved document.
    const response = await context.request.get(`${origin.origin}/api/creator/works/${workId}/team/document`);
    assert.equal(response.status(), 200);
    const saved = await response.json();
    sourceRevision = saved.revision;
    assert(sourceRevision > initialRevision, "Actual Host authoring must advance the server revision");
    digest = createHash("sha256").update(canonicalJson(saved.document.doc)).digest("hex");
    pinnedPages = saved.document.doc.pagesList;
    assert.deepEqual(pinnedPages.map(({ id }) => id), ["qa-page-one", "qa-page-two"]);
    assert(pinnedPages.every(({ elements }) => elements.length >= 3 && elements.every(({ type }) => type === "draw")));
    assert.equal(saved.document.doc.width, 720);
    await writeFile(path.join(output, "saved-source.json"), JSON.stringify(saved.document.doc, null, 2));
    subject = { ...subject, rootGraphHash: digest };
    const body = request.postDataJSON();
    assert.equal(body.workId, workId); assert.equal(body.sourceServerRevision, sourceRevision);
    assert.equal(body.sourceContentDigest, digest); assert.equal(body.pageCount, 2);
    if (storage) return route.continue();
    intent = { ...body, projectId: subject.projectId, artifactId: subject.artifactId,
      expectedHeadRevisionId: "qa-host-prior", expectedHeadRootGraphHash: "a".repeat(64) };
    return route.fulfill({ json: intent });
  }
  if (url.pathname.endsWith("/review-captures/status")) {
    if (storage) return route.continue();
    assert.deepEqual(request.postDataJSON(), intent); return route.fulfill({ json: { status: "pending" } });
  }
  const match = /\/review-captures\/pages\/(\d+)$/u.exec(url.pathname);
  if (match) {
    assert.equal(request.method(), "PUT");
    const bytes = request.postDataBuffer(); assert(bytes);
    const form = await new Response(new Uint8Array(bytes), { headers: { "content-type": request.headers()["content-type"]! } }).formData();
    const uploadIntent = JSON.parse(String(form.get("intent")));
    if (storage) { assert.equal(uploadIntent.workId, workId); assert.equal(uploadIntent.sourceContentDigest, digest); }
    else assert.deepEqual(uploadIntent, intent);
    const file = form.get("file"); assert(file instanceof Blob && file.type === "image/png");
    const png = Buffer.from(await file.arrayBuffer()); assert.equal(png.subarray(1, 4).toString(), "PNG");
    const receipt = { ordinal: Number(match[1]), sha256: createHash("sha256").update(png).digest("hex"),
      width: png.readUInt32BE(16), height: png.readUInt32BE(20) };
    if (storage) {
      await writeFile(path.join(output, `input-page-${receipt.ordinal}.png`), png);
      return route.continue();
    }
    uploads.push({ ...receipt, bytes: png.byteLength });
    await writeFile(path.join(output, `page-${receipt.ordinal}.png`), png);
    return route.fulfill({ json: receipt });
  }
  if (url.pathname.endsWith("/review-captures/complete")) {
    completeCount++; const body = request.postDataJSON();
    if (storage) return route.continue();
    assert.deepEqual(body.intent, intent);
    assert.deepEqual(body.pages, uploads.map(({ ordinal, sha256 }) => ({ ordinal, sha256 })));
    return route.fulfill({ json: { status: "completed", subject } });
  }
  if (url.pathname.endsWith("/review-captures/cancel")) return storage ? route.continue() : route.fulfill({ json: { status: "cancelled" } });
  return route.continue();
});
try {
  const fixture = await createStudioReviewHostFixture(context, pool, origin);
  const { headers } = fixture; workId = fixture.workId;
  sourceRevision = fixture.initialSaved.revision; initialRevision = sourceRevision;
  digest = createHash("sha256").update(canonicalJson(fixture.initialSaved.document.doc)).digest("hex");
  subject = { schemaVersion: 1, workId, projectId: "qa-host-graph", artifactId: "qa-host-artifact",
    reviewId: "qa-host-review", revisionId: "qa-host-snapshot", rootGraphHash: digest };
  await openStudioReviewHost(page, origin, workId);
  const authoredGestures = await authorStudioReviewHostSketches(page, output);
  await requestStudioReviewHostCapture(page);
  await Promise.all(observations); assert.deepEqual(observationErrors, []);
  if (storage) {
    const actualSubject = parseStudioVirtualSpaceReviewSubject(subject); assert(actualSubject);
    assert.equal(actualSubject.rootGraphHash, digest); assert.equal(actualSubject.workId, workId);
    uploads.push(...await readBackStudioReviewStorage({ context, origin, subject: actualSubject, receipts: canonicalReceipts, output, storage }));
  }
  assert.equal(prepareCount, 1); assert.equal(completeCount, 1); assert.equal(uploads.length, 2);
  assert.notEqual(uploads[0]!.sha256, uploads[1]!.sha256, "Distinct source pages must produce distinct captures");
  assert(uploads.every(({ width, height }) => width === 1440 && height === 2160), "Retain the actual default 2x export resolution");
  const sourcePixels = [], masks = [];
  for (const upload of uploads) {
    const png = await readFile(path.join(output, `page-${upload.ordinal}.png`));
    assert.equal(createHash("sha256").update(png).digest("hex"), upload.sha256, "Evidence must preserve the accepted PNG bytes");
    const image = decodePng(new Uint8Array(png));
    const { inkMask, ...evidence } = inspectReviewHostPixels({ width: image.width, height: image.height,
      channels: image.channels, data: image.getRawImage().data }, pinnedPages[upload.ordinal]!, 720);
    masks.push(inkMask);
    sourcePixels.push({ ordinal: upload.ordinal, ...evidence });
  }
  const differentInkPixels = assertReviewHostInkDiffers(masks[0]!, masks[1]!);
  const finalSource = await context.request.get(`${origin.origin}/api/creator/works/${workId}/team/document`, { headers });
  assert.equal(finalSource.status(), 200);
  const finalSaved = await finalSource.json();
  assert.equal(finalSaved.revision, sourceRevision, "Capture must leave the pinned server source unchanged");
  assert.equal(createHash("sha256").update(canonicalJson(finalSaved.document.doc)).digest("hex"), digest);
  assert(sourceWrites > 0, "The authored pages must pass through the actual Host save endpoint");
  assert.deepEqual(pageErrors, []);
  await page.screenshot({ path: path.join(output, "capture-complete.png") });
  if (storage) {
    const actualSubject = parseStudioVirtualSpaceReviewSubject(subject); assert(actualSubject);
    const writesBeforeExport = sourceWrites;
    exportEvidence = await approveAndExportStudioReview({ page, context, origin, subject: actualSubject, receipts: canonicalReceipts, output });
    assert(intent);
    immutableRejection = await rejectCompletedStudioReviewReplacement({ context, origin, subject: actualSubject, intent,
      receipts: canonicalReceipts, output, storage });
    assert.equal(sourceWrites, writesBeforeExport, "Approval and original-byte export must not rewrite source");
    assert.deepEqual(pageErrors, []);
  }
  const report = { passed: true, scope: storage
    ? "Actual full Host authoring, auth/Core/PG/gateway save, canonical capture and immutable local TLS S3, explicit approval and actual Worker ZIP; not production R2/B2 or full correction-chain certification"
    : "Actual Studio Host pen authoring, local auth/database/source/collaboration, saved-source pin and 2x manuscript pixel evidence with synthetic capture producer HTTP; not production object storage or universal renderer certification",
    initialRevision, sourceRevision, sourceContentDigest: digest, sourceReads, sourceWrites, savePins, prepareCount, completeCount,
    uploads, authoredGestures, sourcePixels, differentInkPixels, pageErrors, requests, exportEvidence, immutableRejection, subject,
    ...(storage ? { tls: { api: "NODE_EXTRA_CA_CERTS validates the disposable CA", independentReadback: "explicit CA validates the TLS chain and IP SAN",
      chromium: "fresh process accepts only the disposable leaf SPKI; not browser trust-store chain validation" } } : {}) };
  await writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} catch (error) {
  console.error(String(error));
  await page.screenshot({ path: path.join(output, "failed.png"), timeout: 5_000 }).catch(() => undefined);
  await writeFile(path.join(output, "failed.json"), JSON.stringify({ error: String(error), sourceReads, prepareCount,
    completeCount, uploads, pageErrors, requests, observationErrors: observationErrors.map(String),
    text: await page.locator("body").innerText({ timeout: 5_000 }).catch(() => "unavailable") }, null, 2));
  throw error;
} finally { await browser.close(); await pool.end(); }
}, { localReviewStorage: storage?.options });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await verifyStudioReviewHost(process.env);
