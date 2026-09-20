import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import { decodePng } from "image-js";

import { readStudioReviewQaObject } from "./studio-review-local-storage-runtime.mjs";

import type { StudioReviewLocalStorageOptions } from "./studio-review-local-storage-config.mjs";
import type { StudioVirtualSpaceReviewSubject } from "../apps/web/src/domains/creator/virtual-space/studio-virtual-space-review-subject";
import type { BrowserContext, Page } from "playwright";

export interface StudioReviewLocalStorage {
  readonly options: StudioReviewLocalStorageOptions;
  readonly endpoint: string;
  readonly ca: Buffer;
  readonly spki: string;
}
export interface StudioReviewStorageReceipt { ordinal: number; sha256: string; width: number; height: number }
const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const run = promisify(execFile);

/** Actual Core authority and signed HTTPS GET. Only returned checksums, never signed URLs, enter evidence. */
export async function readBackStudioReviewStorage(input: {
  context: BrowserContext; origin: URL; subject: StudioVirtualSpaceReviewSubject;
  receipts: readonly StudioReviewStorageReceipt[]; output: string; storage: StudioReviewLocalStorage;
}) {
  const { context, origin, subject, receipts, output, storage } = input;
  const query = new URLSearchParams({ workId: subject.workId, projectId: subject.projectId, artifactId: subject.artifactId,
    revisionId: subject.revisionId, rootGraphHash: subject.rootGraphHash });
  const response = await context.request.get(`${origin.origin}/api/studio-project-graph/reviews/${subject.reviewId}/previews?${query}`);
  assert.equal(response.status(), 200);
  const value = await response.json(); assert.equal(value.ok, true); assert.deepEqual(value.subject, subject);
  assert.equal(value.nextCursor, null); assert.equal(value.previews.length, 2); assert.equal(receipts.length, 2);
  const uploads: (StudioReviewStorageReceipt & { bytes: number; inputSha256: string; pixelsPreserved: true; unsignedStatus: number; foreignOriginCorsDenied: true })[] = [];
  for (const preview of value.previews) {
    const receipt = receipts.find((item) => item.ordinal === preview.ordinal); assert(receipt);
    assert.equal(preview.sha256, receipt.sha256); assert.equal(preview.mediaType, "image/png");
    assert.equal(preview.mapping.status, "mapped"); assert.equal(preview.mapping.sourceContentDigest, subject.rootGraphHash);
    const signed = new URL(preview.url); assert.equal(signed.origin, storage.endpoint);
    assert.equal(signed.protocol, "https:"); assert(signed.searchParams.has("X-Amz-Signature"));
    const object = await readStudioReviewQaObject(signed, storage.ca, { origin: origin.origin });
    assert.equal(object.status, 200); assert.equal(object.headers["content-type"], "image/png");
    assert.equal(object.headers["access-control-allow-origin"], origin.origin);
    assert.equal(object.bytes.byteLength, preview.byteLength); assert.equal(sha256(object.bytes), receipt.sha256);
    assert.equal(object.headers["cache-control"], "private, max-age=31536000, immutable");
    assert.equal(object.headers["x-amz-meta-toonspectrum-purpose"], "derived");
    assert.equal(object.headers["x-amz-meta-toonspectrum-digest"], `sha256:${receipt.sha256}`);
    assert.equal(object.headers["x-amz-meta-toonspectrum-byte-length"], String(object.bytes.byteLength));
    const foreignOrigin = await readStudioReviewQaObject(signed, storage.ca, { origin: "https://unrelated-studio-qa.invalid" });
    assert.equal(foreignOrigin.status, 200, "CORS header evidence must come from a successful signed object response");
    assert.equal(foreignOrigin.headers["access-control-allow-origin"], undefined, "Unrelated origins cannot read QA object bytes through browser CORS");
    const unsigned = new URL(signed); unsigned.search = "";
    const denied = await readStudioReviewQaObject(unsigned, storage.ca); assert.equal(denied.status, 403);
    const original = await readFile(path.join(output, `input-page-${receipt.ordinal}.png`));
    const before = decodePng(new Uint8Array(original)), after = decodePng(new Uint8Array(object.bytes));
    assert.equal(after.width, receipt.width); assert.equal(after.height, receipt.height);
    assert.equal(before.width, after.width); assert.equal(before.height, after.height); assert.equal(before.channels, after.channels);
    assert.deepEqual(before.getRawImage().data, after.getRawImage().data, "Server reconstruction must preserve the authored raster pixels");
    await writeFile(path.join(output, `page-${receipt.ordinal}.png`), object.bytes);
    uploads.push({ ...receipt, bytes: object.bytes.byteLength, inputSha256: sha256(original), pixelsPreserved: true, unsignedStatus: denied.status!, foreignOriginCorsDenied: true });
  }
  return uploads.sort((a, b) => a.ordinal - b.ordinal);
}

/** A real late upload cannot change a completed pin, its receipt, or the accepted S3 bytes. */
export async function rejectCompletedStudioReviewReplacement(input: {
  context: BrowserContext; origin: URL; subject: StudioVirtualSpaceReviewSubject;
  intent: Record<string, unknown>; receipts: readonly StudioReviewStorageReceipt[];
  output: string; storage: StudioReviewLocalStorage;
}) {
  const { context, origin, subject, intent, receipts, output, storage } = input;
  const originalInput = await readFile(path.join(output, "input-page-0.png"));
  const changedInput = await readFile(path.join(output, "input-page-1.png"));
  assert.notEqual(sha256(originalInput), sha256(changedInput));
  const headers = { "x-toonspectrum-csrf": "1", Origin: origin.origin, Referer: `${origin.origin}/studio` };
  const replacement = await context.request.put(`${origin.origin}/api/studio-project-graph/review-captures/pages/0`, {
    headers, multipart: { intent: JSON.stringify(intent), file: { name: "changed-page.png", mimeType: "image/png", buffer: changedInput } },
  });
  assert.equal(replacement.status(), 409);
  const rejection = await replacement.json(); assert.equal(rejection.code, "preview-head-version-mismatch");
  const completed = await context.request.post(`${origin.origin}/api/studio-project-graph/review-captures/status`, { headers, data: intent });
  assert.equal(completed.status(), 200); assert.deepEqual(await completed.json(), { status: "completed", subject });
  const query = new URLSearchParams({ workId: subject.workId, projectId: subject.projectId, artifactId: subject.artifactId,
    revisionId: subject.revisionId, rootGraphHash: subject.rootGraphHash });
  const previewResponse = await context.request.get(`${origin.origin}/api/studio-project-graph/reviews/${subject.reviewId}/previews?${query}`);
  assert.equal(previewResponse.status(), 200);
  const previews = await previewResponse.json(); assert.equal(previews.ok, true); assert.deepEqual(previews.subject, subject);
  assert.equal(previews.previews.length, receipts.length);
  for (const preview of previews.previews) {
    const receipt = receipts.find((value) => value.ordinal === preview.ordinal); assert(receipt);
    assert.equal(preview.sha256, receipt.sha256);
    const url = new URL(preview.url); assert.equal(url.origin, storage.endpoint);
    const stored = await readStudioReviewQaObject(url, storage.ca); assert.equal(stored.status, 200);
    assert.equal(sha256(stored.bytes), receipt.sha256);
    assert.deepEqual(stored.bytes, await readFile(path.join(output, `page-${receipt.ordinal}.png`)));
  }
  return { status: replacement.status(), code: rejection.code, changedInputSha256: sha256(changedInput),
    completedReceiptPreserved: true, canonicalBytesPreserved: true,
    boundary: "API head pin rejects before storage; does not certify the S3 conditional PUT collision branch" };
}

/** Explicit approval and actual Worker ZIP through the product UI, with independent Core read-back. */
export async function approveAndExportStudioReview(input: {
  page: Page; context: BrowserContext; origin: URL; subject: StudioVirtualSpaceReviewSubject;
  receipts: readonly StudioReviewStorageReceipt[]; output: string;
}) {
  const { page, context, origin, subject, receipts, output } = input;
  await page.getByRole("link", { name: "검수본 보기", exact: true }).click();
  await page.getByRole("button", { name: "이 검수본 승인", exact: true }).waitFor({ timeout: 60_000 });
  const initial = await context.request.get(`${origin.origin}/api/studio-project-graph/reviews/${subject.reviewId}`);
  assert.equal(initial.status(), 200); const openReview = await initial.json(); assert.equal(openReview.status, "open");
  assert.equal(openReview.revisionId, subject.revisionId); assert.equal(openReview.openRequiredCommentCount, 0);
  const decisionRequest = page.waitForResponse((response) => new URL(response.url()).pathname === `/api/studio-project-graph/reviews/${subject.reviewId}/decision`);
  await page.getByRole("button", { name: "이 검수본 승인", exact: true }).click();
  await page.getByRole("button", { name: "승인 확정", exact: true }).click();
  const decision = await decisionRequest; assert.equal(decision.status(), 200);
  const approved = await context.request.get(`${origin.origin}/api/studio-project-graph/reviews/${subject.reviewId}`);
  assert.equal(approved.status(), 200); const review = await approved.json();
  assert.equal(review.status, "approved"); assert(review.decidedAt && review.decidedBy);
  assert.equal(review.revisionId, subject.revisionId); assert.equal(review.openRequiredCommentCount, 0);
  const downloadReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "승인 검수본 ZIP 저장", exact: true }).click();
  const download = await downloadReady, archivePath = path.join(output, "approved-review.zip"); await download.saveAs(archivePath);
  const manifest = JSON.parse((await run("unzip", ["-p", archivePath, "manifest.json"])).stdout);
  assert.deepEqual(manifest.subject, subject); assert.equal(manifest.reviewDecision.status, "approved");
  assert.equal(manifest.reviewDecision.decidedAt, review.decidedAt); assert.equal(manifest.pages.length, receipts.length);
  for (const entry of manifest.pages) {
    const receipt = receipts.find((item) => item.ordinal === entry.ordinal); assert(receipt);
    assert.equal(entry.sha256, receipt.sha256);
    const original = await readFile(path.join(output, `page-${entry.ordinal}.png`));
    const bytes = (await run("unzip", ["-p", archivePath, entry.path], { encoding: "buffer", maxBuffer: 16 * 1024 * 1024 })).stdout;
    assert.equal(sha256(bytes), receipt.sha256); assert.deepEqual(bytes, original);
  }
  assert(!/X-Amz-|127\.0\.0\.1|secret|accessKey|assigneeIds|comments/u.test(JSON.stringify(manifest)));
  await page.getByText("브라우저에 승인된 검수본의 ZIP 다운로드를 요청했어요.", { exact: true }).waitFor();
  await page.screenshot({ path: path.join(output, "approved-review-export.png") });
  return { decision: { status: review.status, decidedAt: review.decidedAt }, pages: manifest.pages,
    archiveSha256: sha256(await readFile(archivePath)), archiveFile: path.basename(archivePath) };
}
