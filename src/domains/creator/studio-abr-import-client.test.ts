import { describe, expect, it } from "vitest";

import { importStudioAbrFile } from "./studio-abr-import-client";
import { STUDIO_ABR_WORKER_PROTOCOL_VERSION } from "./studio-abr-import-worker-protocol";

import type { StudioAbrWorkerRequest } from "./studio-abr-import-worker-protocol";

function abrFile(): File {
  return new File([Uint8Array.of(0, 10, 0, 1)], "pack.abr", { type: "application/octet-stream" });
}

describe("Studio ABR worker client", () => {
  it("transfers the owned buffer, accepts one correlated response and terminates the worker", async () => {
    const messageListeners = new Set<(event: MessageEvent<unknown>) => void>();
    let terminated = 0;
    let transferred: Transferable[] = [];
    const result = await importStudioAbrFile(abrFile(), {
      workerFactory: () => ({
        postMessage(request: StudioAbrWorkerRequest, transfer: Transferable[]) {
          transferred = transfer;
          queueMicrotask(() => {
            for (const listener of messageListeners) listener({ data: {
              version: STUDIO_ABR_WORKER_PROTOCOL_VERSION,
              requestId: request.requestId,
              ok: true,
              result: {
                brushes: [],
                sourceBrushCount: 0,
                sourceSampleCount: 0,
                skippedBrushCount: 0,
                approximatedBrushCount: 0,
              },
            } } as MessageEvent<unknown>);
          });
        },
        addEventListener(type, listener) {
          if (type === "message") messageListeners.add(listener as (event: MessageEvent<unknown>) => void);
        },
        removeEventListener(type, listener) {
          if (type === "message") messageListeners.delete(listener as (event: MessageEvent<unknown>) => void);
        },
        terminate() { terminated++; },
      }),
    });
    expect(result.sourceBrushCount).toBe(0);
    expect(transferred).toHaveLength(1);
    expect(terminated).toBe(1);
  });

  it("hard-cancels a running parser worker", async () => {
    const controller = new AbortController();
    let terminated = 0;
    const promise = importStudioAbrFile(abrFile(), {
      signal: controller.signal,
      workerFactory: () => ({
        postMessage() { controller.abort(); },
        addEventListener() {},
        removeEventListener() {},
        terminate() { terminated++; },
      }),
    });
    await expect(promise).rejects.toMatchObject({ code: "aborted" });
    expect(terminated).toBe(1);
  });
});
