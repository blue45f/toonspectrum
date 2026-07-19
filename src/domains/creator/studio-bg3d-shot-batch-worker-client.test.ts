import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildStudioBg3dShotBatchArchiveInWorker,
  type StudioBg3dShotBatchWorkerLike,
} from "./studio-bg3d-shot-batch-worker-client";
import {
  STUDIO_BG3D_SHOT_BATCH_WORKER_PROTOCOL_VERSION,
  isStudioBg3dShotBatchWorkerRequest,
  isStudioBg3dShotBatchWorkerResponse,
  type StudioBg3dShotBatchWorkerRequest,
} from "./studio-bg3d-shot-batch-worker-protocol";

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const ZIP_BYTES = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]);
const PSD_BYTES = new Uint8Array([0x38, 0x42, 0x50, 0x53, 0, 1, 0]);

class FakeWorker implements StudioBg3dShotBatchWorkerLike {
  readonly requests: StudioBg3dShotBatchWorkerRequest[] = [];
  readonly messages = new Set<(event: { readonly data: unknown }) => void>();
  readonly errors = new Set<(event: { preventDefault?(): void }) => void>();
  readonly messageErrors = new Set<(event: { preventDefault?(): void }) => void>();
  terminated = false;

  postMessage(message: StudioBg3dShotBatchWorkerRequest): void {
    this.requests.push(message);
  }

  addEventListener(
    type: "message" | "error" | "messageerror",
    listener: ((event: { readonly data: unknown }) => void) | ((event: { preventDefault?(): void }) => void),
  ): void {
    if (type === "message") this.messages.add(listener as (event: { readonly data: unknown }) => void);
    else if (type === "error") this.errors.add(listener as (event: { preventDefault?(): void }) => void);
    else this.messageErrors.add(listener as (event: { preventDefault?(): void }) => void);
  }

  removeEventListener(
    type: "message" | "error" | "messageerror",
    listener: ((event: { readonly data: unknown }) => void) | ((event: { preventDefault?(): void }) => void),
  ): void {
    if (type === "message") this.messages.delete(listener as (event: { readonly data: unknown }) => void);
    else if (type === "error") this.errors.delete(listener as (event: { preventDefault?(): void }) => void);
    else this.messageErrors.delete(listener as (event: { preventDefault?(): void }) => void);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(data: unknown): void {
    for (const listener of this.messages) listener({ data });
  }
}

function image() {
  return {
    shotId: "shot-a",
    shotName: "첫 컷",
    width: 320,
    height: 180,
    png: new Blob([PNG_BYTES], { type: "image/png" }),
  };
}

afterEach(() => vi.useRealTimers());

describe("Studio BG3D shot batch archive Worker client", () => {
  it("correlates progress and accepts only a ZIP-signature result", async () => {
    const worker = new FakeWorker();
    const progress = vi.fn();
    const result = buildStudioBg3dShotBatchArchiveInWorker([image()], {
      workerFactory: () => worker,
      onProgress: progress,
      manifest: {
        resumeKey: "bg3d-batch-deadbeef",
        shots: [{ id: "shot-a", name: "첫 컷" }],
        requestedPasses: ["lt-composite"],
        layeredPsdRequested: true,
        contactSheetRequested: true,
      },
      layeredPsds: [{
        shotId: "shot-a",
        shotName: "첫 컷",
        width: 320,
        height: 180,
        psd: new Blob([PSD_BYTES], { type: "image/vnd.adobe.photoshop" }),
      }],
      contactSheets: [{
        sheetNumber: 1,
        fileName: "contact-sheet-001.png",
        width: 320,
        height: 180,
        shotIds: ["shot-a"],
        png: new Blob([PNG_BYTES], { type: "image/png" }),
      }],
    });
    const request = worker.requests[0];
    expect(request && isStudioBg3dShotBatchWorkerRequest(request)).toBe(true);
    expect(request?.manifest).toMatchObject({ resumeKey: "bg3d-batch-deadbeef" });
    expect(request?.layeredPsds).toHaveLength(1);
    expect(request?.contactSheets).toHaveLength(1);
    worker.emit({
      version: STUDIO_BG3D_SHOT_BATCH_WORKER_PROTOCOL_VERSION,
      kind: "progress",
      requestId: request?.requestId,
      progress: { completedFiles: 1, totalFiles: 2 },
    });
    const archive = new Blob([ZIP_BYTES], { type: "application/zip" });
    worker.emit({
      version: STUDIO_BG3D_SHOT_BATCH_WORKER_PROTOCOL_VERSION,
      kind: "result",
      requestId: request?.requestId,
      archive,
    });

    await expect(result).resolves.toBe(archive);
    expect(progress).toHaveBeenCalledWith({ completedFiles: 1, totalFiles: 2 });
    expect(worker.terminated).toBe(true);
  });

  it("terminates immediately on abort and rejects late or malformed output", async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const result = buildStudioBg3dShotBatchArchiveInWorker([image()], {
      workerFactory: () => worker,
      signal: controller.signal,
    });
    controller.abort();

    await expect(result).rejects.toMatchObject({ name: "AbortError" });
    expect(worker.terminated).toBe(true);

    const malformedWorker = new FakeWorker();
    const malformed = buildStudioBg3dShotBatchArchiveInWorker([image()], {
      workerFactory: () => malformedWorker,
    });
    malformedWorker.emit({ kind: "result" });
    await expect(malformed).rejects.toMatchObject({ name: "ProtocolError" });
    expect(malformedWorker.terminated).toBe(true);
  });

  it("validates strict progress, result, and unknown response fields", () => {
    const base = {
      version: STUDIO_BG3D_SHOT_BATCH_WORKER_PROTOCOL_VERSION,
      requestId: 1,
    };
    expect(isStudioBg3dShotBatchWorkerResponse({
      ...base,
      kind: "progress",
      progress: { completedFiles: 1, totalFiles: 2 },
    })).toBe(true);
    expect(isStudioBg3dShotBatchWorkerResponse({
      ...base,
      kind: "progress",
      progress: { completedFiles: 3, totalFiles: 2 },
    })).toBe(false);
    expect(isStudioBg3dShotBatchWorkerResponse({
      ...base,
      kind: "result",
      archive: new Blob([ZIP_BYTES], { type: "application/zip" }),
      extra: true,
    })).toBe(false);
    expect(isStudioBg3dShotBatchWorkerRequest({
      version: STUDIO_BG3D_SHOT_BATCH_WORKER_PROTOCOL_VERSION,
      kind: "build",
      requestId: 1,
      images: [image()],
      manifest: { resumeKey: "forged" },
    })).toBe(false);
  });
});
