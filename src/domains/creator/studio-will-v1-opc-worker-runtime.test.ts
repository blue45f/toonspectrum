import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildStudioWillV1OpcBytes,
  STUDIO_WILL_V1_OPC_ASSURANCE,
} from "./studio-will-v1-opc-interchange";
import {
  STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
  type StudioWillV1OpcWorkerRequest,
  type StudioWillV1OpcWorkerResponse,
} from "./studio-will-v1-opc-worker-protocol";

const SAMPLE_INPUT = {
  width: 48,
  height: 36,
  title: "Runtime sample",
  paths: [
    {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ],
      strokeWidths: [1],
      strokeColor: { r: 12, g: 34, b: 56, a: 255 },
    },
  ],
};

interface PostedResponse {
  readonly response: StudioWillV1OpcWorkerResponse;
  readonly transfer: Transferable[];
}

interface LoadedWorker {
  readonly posted: PostedResponse[];
  readonly close: ReturnType<typeof vi.fn>;
  dispatch(request: unknown): void;
}

async function loadWorker(
  options: { readonly postThrows?: boolean } = {},
): Promise<LoadedWorker> {
  vi.resetModules();
  const posted: PostedResponse[] = [];
  const close = vi.fn();
  vi.stubGlobal(
    "postMessage",
    vi.fn((response: StudioWillV1OpcWorkerResponse, transfer: Transferable[]) => {
      if (options.postThrows) {
        throw new DOMException(
          "/private/raw/worker-response clone failed",
          "DataCloneError",
        );
      }
      posted.push({ response, transfer: [...transfer] });
    })
  );
  vi.stubGlobal("close", close);
  await import("./studio-will-v1-opc.worker");
  const scope = globalThis as unknown as {
    onmessage: ((event: MessageEvent<unknown>) => void) | null;
  };
  if (!scope.onmessage) throw new Error("Worker did not install its message handler.");
  return {
    posted,
    close,
    dispatch(request) {
      scope.onmessage?.({ data: request } as MessageEvent<unknown>);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
  Reflect.deleteProperty(globalThis, "onmessage");
});

describe("WILL v1 OPC dedicated Worker runtime", () => {
  it("encodes through the runtime and transfers the Worker-owned archive bytes", async () => {
    const worker = await loadWorker();
    const request: StudioWillV1OpcWorkerRequest = {
      type: "studio-will-v1-opc/encode",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "runtime-encode",
      input: SAMPLE_INPUT,
    };

    worker.dispatch(request);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    const dispatch = worker.posted[0]!;
    expect(dispatch.response).toMatchObject({
      type: "studio-will-v1-opc/encode-success",
      requestId: "runtime-encode",
      result: {
        assurance: STUDIO_WILL_V1_OPC_ASSURANCE,
      },
    });
    if (dispatch.response.type !== "studio-will-v1-opc/encode-success") {
      throw new Error("Expected encode success.");
    }
    expect(dispatch.response.result.bytes.byteLength).toBeGreaterThan(22);
    expect(dispatch.transfer).toEqual([dispatch.response.result.bytes.buffer]);
  });

  it("reads Blob input inside the Worker runtime and decodes it", async () => {
    const encoded = await buildStudioWillV1OpcBytes(SAMPLE_INPUT);
    const worker = await loadWorker();
    const request: StudioWillV1OpcWorkerRequest = {
      type: "studio-will-v1-opc/decode",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "runtime-blob-decode",
      source: new Blob([encoded.bytes.slice().buffer as ArrayBuffer]),
    };

    worker.dispatch(request);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(1));

    expect(worker.posted[0]!.response).toMatchObject({
      type: "studio-will-v1-opc/decode-success",
      requestId: "runtime-blob-decode",
      result: {
        width: SAMPLE_INPUT.width,
        height: SAMPLE_INPUT.height,
        title: SAMPLE_INPUT.title,
        assurance: STUDIO_WILL_V1_OPC_ASSURANCE,
      },
    });
    expect(worker.posted[0]!.transfer).toEqual([]);
  });

  it("returns bounded typed failures for invalid protocol and malformed archives", async () => {
    const invalidWorker = await loadWorker();
    invalidWorker.dispatch({
      type: "studio-will-v1-opc/decode",
      version: 999,
      requestId: "invalid-version",
      source: new Uint8Array([1]),
    });
    await vi.waitFor(() => expect(invalidWorker.posted).toHaveLength(1));
    expect(invalidWorker.posted[0]!.response).toMatchObject({
      type: "studio-will-v1-opc/failure",
      requestId: "invalid-version",
      operation: "decode",
      error: {
        code: "INVALID_REQUEST",
        message: "WILL v1 OPC Worker 요청 프로토콜이 올바르지 않습니다.",
      },
    });

    const archiveWorker = await loadWorker();
    archiveWorker.dispatch({
      type: "studio-will-v1-opc/decode",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "invalid-archive",
      source: new Uint8Array([1, 2, 3]),
    });
    await vi.waitFor(() => expect(archiveWorker.posted).toHaveLength(1));
    expect(archiveWorker.posted[0]!.response).toMatchObject({
      type: "studio-will-v1-opc/failure",
      requestId: "invalid-archive",
      operation: "decode",
      error: {
        code: "ARCHIVE_INVALID",
        name: "StudioWillV1OpcInterchangeError",
      },
    });
  });

  it("rejects a second request because each Worker is deliberately one-shot", async () => {
    const worker = await loadWorker();
    const first: StudioWillV1OpcWorkerRequest = {
      type: "studio-will-v1-opc/encode",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "first",
      input: SAMPLE_INPUT,
    };
    const second: StudioWillV1OpcWorkerRequest = {
      ...first,
      requestId: "second",
    };

    worker.dispatch(first);
    worker.dispatch(second);
    await vi.waitFor(() => expect(worker.posted).toHaveLength(2));

    expect(worker.posted.some(({ response }) =>
      response.type === "studio-will-v1-opc/failure"
      && response.requestId === "second"
      && response.error.code === "INVALID_REQUEST"
    )).toBe(true);
  });

  it("closes immediately when response postMessage fails", async () => {
    const worker = await loadWorker({ postThrows: true });
    worker.dispatch({
      type: "studio-will-v1-opc/encode",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "post-failure",
      input: SAMPLE_INPUT,
    });

    await vi.waitFor(() => expect(worker.close).toHaveBeenCalledOnce());
    expect(worker.posted).toHaveLength(0);
  });
});
