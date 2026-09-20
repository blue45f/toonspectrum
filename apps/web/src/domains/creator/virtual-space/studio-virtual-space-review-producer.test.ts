import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalJson } from "@toonspectrum/studio-project-model";
import { cancelStudioVirtualSpaceReviewCapture, getStudioVirtualSpaceReviewCaptureStatus, prepareStudioVirtualSpaceReviewCapture,
  produceStudioVirtualSpaceReviewCapture, studioReviewCaptureContentDigest, type StudioReviewCaptureInput, type StudioReviewCaptureIntent } from "./studio-virtual-space-review-producer";

const http = vi.hoisted(() => ({ post: vi.fn(), put: vi.fn() }));
vi.mock("@/infrastructure/api", () => ({ api: { post: http.post, raw: { put: http.put } }, apiPath: (path: string) => `/api${path}`,
  httpStatus: (error: { status?: number }) => error?.status ?? null }));

const capture: StudioReviewCaptureInput = { intentId: "intent-1", workId: "work-1", sourceServerRevision: 4,
  sourceContentDigest: "a".repeat(64), pageCount: 2, title: "Episode review", deviceId: "device-1", createdAt: "2026-09-20T00:00:00.000Z" };
const intent: StudioReviewCaptureIntent = { ...capture, projectId: "graph-1", artifactId: "artifact-1", expectedHeadRevisionId: "head-1", expectedHeadRootGraphHash: "b".repeat(64) };
const subject = { schemaVersion: 1 as const, workId: intent.workId, projectId: intent.projectId, artifactId: intent.artifactId,
  revisionId: "snapshot-1", reviewId: "review-1", rootGraphHash: intent.sourceContentDigest };
const pages = [new Blob(["identical page"], { type: "image/png" }), new Blob(["identical page"], { type: "image/png" })];
function uploadResult(ordinal: number) { return { ordinal, sha256: (ordinal ? "c" : "d").repeat(64), width: 2, height: 1 }; }

beforeEach(() => { http.post.mockReset(); http.put.mockReset(); });

describe("explicit pinned review production client", () => {
  it("computes the same canonical saved-doc digest independent of object key order", async () => {
    const doc = { pagesList: [{ id: "a", elements: [] }], version: 3 };
    expect(await studioReviewCaptureContentDigest(doc)).toBe(createHash("sha256").update(canonicalJson(doc)).digest("hex"));
    expect(await studioReviewCaptureContentDigest({ version: 3, pagesList: doc.pagesList })).toBe(await studioReviewCaptureContentDigest(doc));
  });

  it("pins and freezes the server preparation response before any image upload", async () => {
    http.post.mockResolvedValue(intent);
    const result = await prepareStudioVirtualSpaceReviewCapture(capture);
    expect(result).toEqual(intent); expect(Object.isFrozen(result)).toBe(true);
    expect(http.put).not.toHaveBeenCalled();
    expect(http.post).toHaveBeenCalledWith(expect.stringMatching(/\/prepare$/u), capture, expect.objectContaining({ retry: 0 }));
  });

  it("rejects a preparation response that substitutes a latest document or unknown authority field", async () => {
    http.post.mockResolvedValueOnce({ ...intent, sourceServerRevision: 5 });
    await expect(prepareStudioVirtualSpaceReviewCapture(capture)).rejects.toMatchObject({ code: "preview-response-version-mismatch", retryable: false });
    http.post.mockResolvedValueOnce({ ...intent, token: "not-allowed" });
    await expect(prepareStudioVirtualSpaceReviewCapture(capture)).rejects.toMatchObject({ code: "preview-response-invalid" });
  });

  it("uploads every identical page in source order and completes only after all server-verified receipts", async () => {
    http.post.mockResolvedValueOnce({ status: "pending" }).mockResolvedValueOnce({ status: "completed", subject });
    http.put.mockImplementation((url: string) => ({ json: async () => uploadResult(Number(url.at(-1))) }));
    const progress = vi.fn();
    await expect(produceStudioVirtualSpaceReviewCapture(intent, pages, { onProgress: progress })).resolves.toEqual(subject);
    expect(http.put).toHaveBeenCalledTimes(2);
    for (const [i, call] of http.put.mock.calls.entries()) {
      const form = call[1].body as FormData;
      expect(JSON.parse(form.get("intent") as string)).toEqual(intent);
      expect(await (form.get("file") as Blob).text()).toBe(await pages[i]!.text());
      expect(call[1].retry).toBe(0);
    }
    expect(http.post.mock.calls[1]![1]).toEqual({ intent, pages: [0, 1].map((ordinal) => ({ ordinal, sha256: uploadResult(ordinal).sha256 })) });
    expect(progress.mock.calls.at(-1)?.[0]).toEqual({ phase: "complete", completed: 2, total: 2 });
  });

  it("reconciles an ambiguous completion using the same intent without recapturing or uploading again", async () => {
    http.post.mockResolvedValueOnce({ status: "pending" }).mockRejectedValueOnce(new Error("connection lost"));
    http.put.mockImplementation((url: string) => ({ json: async () => uploadResult(Number(url.at(-1))) }));
    await expect(produceStudioVirtualSpaceReviewCapture(intent, pages)).rejects.toMatchObject({ phase: "complete", ambiguous: true, retryable: true });
    expect(http.post).toHaveBeenCalledTimes(2);
    http.post.mockResolvedValueOnce({ status: "completed", subject });
    await expect(produceStudioVirtualSpaceReviewCapture(intent, pages)).resolves.toEqual(subject);
    expect(http.put).toHaveBeenCalledTimes(2);
    expect(http.post.mock.calls[2]![1]).toEqual(intent);
  });

  it("never completes a partial, reordered or cancelled capture", async () => {
    http.post.mockResolvedValue({ status: "pending" });
    http.put.mockReturnValue({ json: async () => uploadResult(1) });
    await expect(produceStudioVirtualSpaceReviewCapture(intent, pages)).rejects.toMatchObject({ code: "preview-response-invalid" });
    expect(http.post).toHaveBeenCalledTimes(1);
    http.post.mockReset().mockResolvedValue({ status: "cancelled" }); http.put.mockClear();
    await expect(produceStudioVirtualSpaceReviewCapture(intent, pages)).rejects.toMatchObject({ code: "preview-intent-cancelled" });
    expect(http.put).not.toHaveBeenCalled();
  });

  it("stops before the next write when blur/close cancels during progress", async () => {
    http.post.mockResolvedValueOnce({ status: "pending" });
    http.put.mockReturnValue({ json: async () => uploadResult(0) });
    const abort = new AbortController();
    await expect(produceStudioVirtualSpaceReviewCapture(intent, pages, { signal: abort.signal, onProgress: () => abort.abort() }))
      .rejects.toMatchObject({ code: "preview-cancelled", ambiguous: false });
    expect(http.put).toHaveBeenCalledTimes(1); expect(http.post).toHaveBeenCalledTimes(1);
  });

  it("can cancel from retained prepare input and reports a concurrently completed result honestly", async () => {
    http.post.mockResolvedValueOnce({ status: "cancelled", cleanupPending: true });
    await expect(cancelStudioVirtualSpaceReviewCapture(capture)).resolves.toEqual({ status: "cancelled", cleanupPending: true });
    http.post.mockResolvedValueOnce({ status: "completed", subject });
    await expect(cancelStudioVirtualSpaceReviewCapture(intent)).resolves.toEqual({ status: "completed", subject });
  });

  it("fails closed on wrong-work status, oversized/non-PNG/missing pages and denied admission", async () => {
    http.post.mockResolvedValueOnce({ status: "completed", subject: { ...subject, workId: "another-work" } });
    await expect(getStudioVirtualSpaceReviewCaptureStatus(intent)).rejects.toMatchObject({ code: "preview-response-version-mismatch" });
    await expect(produceStudioVirtualSpaceReviewCapture(intent, pages.slice(0, 1))).rejects.toMatchObject({ code: "preview-pages-invalid" });
    await expect(produceStudioVirtualSpaceReviewCapture(intent, [pages[0]!, new Blob(["<svg/>"])])).rejects.toMatchObject({ code: "preview-pages-invalid" });
    http.post.mockRejectedValueOnce({ status: 403 });
    await expect(prepareStudioVirtualSpaceReviewCapture(capture)).rejects.toMatchObject({ retryable: false, ambiguous: false, code: "preview-access-or-admission-denied" });
  });
});
