import { describe, expect, it, vi } from "vitest";

import { STUDIO_WILL_V1_LIMITS } from "./studio-will-v1-interchange";
import {
  buildStudioWillV1OpcBytes,
  importStudioWillV1Opc,
  STUDIO_WILL_V1_OPC_ASSURANCE,
} from "./studio-will-v1-opc-interchange";
import {
  buildStudioWillV1OpcBytesInWorker,
  importStudioWillV1OpcInWorker,
  type StudioWillV1OpcWorkerLike,
} from "./studio-will-v1-opc-worker-client";
import {
  STUDIO_WILL_V1_OPC_WORKER_MAX_STRUCTURED_CLONE_POINTS,
  STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
  studioWillV1OpcWorkerResponseTransfers,
  type StudioWillV1OpcWorkerRequest,
  type StudioWillV1OpcWorkerResponse,
} from "./studio-will-v1-opc-worker-protocol";

const SAMPLE_INPUT = {
  width: 32,
  height: 24,
  title: "Worker sample",
  paths: [
    {
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
      ],
      strokeWidths: [1],
      strokeColor: { r: 10, g: 20, b: 30, a: 255 },
    },
  ],
};

interface FakeWorkerOptions {
  readonly autoRespond?: boolean;
  readonly postThrows?: boolean;
}

class FakeWorker implements StudioWillV1OpcWorkerLike {
  onmessage: StudioWillV1OpcWorkerLike["onmessage"] = null;
  onerror: StudioWillV1OpcWorkerLike["onerror"] = null;
  onmessageerror: StudioWillV1OpcWorkerLike["onmessageerror"] = null;
  readonly requests: StudioWillV1OpcWorkerRequest[] = [];
  readonly transfers: Transferable[][] = [];
  terminateCount = 0;
  readonly #options: FakeWorkerOptions;

  constructor(options: FakeWorkerOptions = {}) {
    this.#options = options;
  }

  postMessage(
    message: StudioWillV1OpcWorkerRequest,
    transfer: Transferable[]
  ): void {
    if (this.#options.postThrows) throw new DOMException("secret clone path", "DataCloneError");
    this.transfers.push([...transfer]);
    const request = structuredClone(message, { transfer });
    this.requests.push(request);
    if (this.#options.autoRespond) {
      queueMicrotask(() => {
        void this.respond(request);
      });
    }
  }

  terminate(): void {
    this.terminateCount += 1;
  }

  emit(value: unknown): void {
    this.onmessage?.({ data: value } as MessageEvent<unknown>);
  }

  emitRawError(): void {
    this.onerror?.({
      error: new Error("/private/secret/opc.zip: raw panic"),
      message: "/private/secret/opc.zip: raw panic",
      preventDefault() {},
    });
  }

  async respond(request = this.requests.at(-1)): Promise<void> {
    if (!request) throw new Error("No Worker request is available.");
    let response: StudioWillV1OpcWorkerResponse;
    if (request.type === "studio-will-v1-opc/encode") {
      response = {
        type: "studio-will-v1-opc/encode-success",
        version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
        requestId: request.requestId,
        result: await buildStudioWillV1OpcBytes(request.input, request.options),
      };
    } else {
      response = {
        type: "studio-will-v1-opc/decode-success",
        version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
        requestId: request.requestId,
        result: await importStudioWillV1Opc(request.source, request.options),
      };
    }
    this.emit(
      structuredClone(response, {
        transfer: studioWillV1OpcWorkerResponseTransfers(response),
      })
    );
  }
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("WILL v1 OPC Worker client success", () => {
  it("roundtrips a document and transfers only a private Uint8Array snapshot", async () => {
    const encodeWorker = new FakeWorker({ autoRespond: true });
    const encoded = await buildStudioWillV1OpcBytesInWorker(SAMPLE_INPUT, {
      requestIdFactory: () => "roundtrip-encode",
      workerFactory: () => encodeWorker,
    });

    expect(encoded.paths).toHaveLength(1);
    expect(encoded.bytes.byteLength).toBeGreaterThan(22);
    expect(encodeWorker.transfers).toEqual([[]]);
    expect(encodeWorker.terminateCount).toBe(1);

    const source = encoded.bytes;
    const sourceSnapshot = source.slice();
    const sourceBuffer = source.buffer;
    const decodeWorker = new FakeWorker({ autoRespond: true });
    const decoded = await importStudioWillV1OpcInWorker(source, {
      requestIdFactory: () => "roundtrip-decode",
      workerFactory: () => decodeWorker,
    });

    expect(decoded).toMatchObject({
      width: SAMPLE_INPUT.width,
      height: SAMPLE_INPUT.height,
      title: SAMPLE_INPUT.title,
    });
    expect(decoded.paths).toHaveLength(1);
    expect(source.buffer).toBe(sourceBuffer);
    expect(source).toEqual(sourceSnapshot);
    expect(decodeWorker.transfers[0]).toHaveLength(1);
    expect(decodeWorker.requests[0]).toMatchObject({
      type: "studio-will-v1-opc/decode",
      requestId: "roundtrip-decode",
    });
    expect(decodeWorker.terminateCount).toBe(1);
  });

  it("structured-clones Blob input without reading it on the main thread", async () => {
    const encoded = await buildStudioWillV1OpcBytes(SAMPLE_INPUT);
    const decoded = await importStudioWillV1Opc(encoded.bytes);
    const blob = new Blob([encoded.bytes.slice().buffer as ArrayBuffer]);
    const arrayBufferSpy = vi.spyOn(blob, "arrayBuffer");
    const worker = new FakeWorker();
    const pending = importStudioWillV1OpcInWorker(blob, {
      requestIdFactory: () => "blob-decode",
      workerFactory: () => worker,
    });
    await flushMicrotasks();

    const request = worker.requests[0]!;
    expect(request.type).toBe("studio-will-v1-opc/decode");
    if (request.type !== "studio-will-v1-opc/decode") {
      throw new Error("Expected a decode request.");
    }
    expect(request.source).toBeInstanceOf(Blob);
    expect(worker.transfers).toEqual([[]]);
    expect(arrayBufferSpy).not.toHaveBeenCalled();

    worker.emit({
      type: "studio-will-v1-opc/decode-success",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: request.requestId,
      result: decoded,
    });

    await expect(pending).resolves.toMatchObject({
      width: SAMPLE_INPUT.width,
      height: SAMPLE_INPUT.height,
    });
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(worker.terminateCount).toBe(1);
  });
});

describe("WILL v1 OPC Worker client lifecycle", () => {
  it("terminates an active Worker when AbortSignal fires", async () => {
    const worker = new FakeWorker();
    const controller = new AbortController();
    const pending = buildStudioWillV1OpcBytesInWorker(SAMPLE_INPUT, {
      signal: controller.signal,
      workerFactory: () => worker,
    });
    const rejection = expect(pending).rejects.toMatchObject({
      code: "ABORTED",
      name: "AbortError",
    });
    await flushMicrotasks();

    controller.abort();

    await rejection;
    expect(worker.terminateCount).toBe(1);
    expect(worker.onmessage).toBeNull();
  });

  it("enforces a hard timeout and terminates the Worker", async () => {
    vi.useFakeTimers();
    try {
      const worker = new FakeWorker();
      const pending = buildStudioWillV1OpcBytesInWorker(SAMPLE_INPUT, {
        timeoutMs: 5,
        workerFactory: () => worker,
      });
      const rejection = expect(pending).rejects.toMatchObject({
        code: "WORKER_TIMEOUT",
        name: "TimeoutError",
      });

      await vi.advanceTimersByTimeAsync(5);

      await rejection;
      expect(worker.terminateCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails fast on a response carrying the wrong request ID", async () => {
    const worker = new FakeWorker();
    const pending = buildStudioWillV1OpcBytesInWorker(SAMPLE_INPUT, {
      requestIdFactory: () => "current-request",
      workerFactory: () => worker,
    });
    const rejection = expect(pending).rejects.toMatchObject({
      code: "WORKER_PROTOCOL",
    });
    await flushMicrotasks();

    worker.emit({
      type: "studio-will-v1-opc/encode-success",
      version: 999,
      requestId: "stale-request",
      result: { bytes: "hostile" },
    });
    await rejection;
    expect(worker.terminateCount).toBe(1);
  });
});

describe("WILL v1 OPC Worker client preflight", () => {
  it("rejects path-count and total-point budgets before Worker creation or posting", async () => {
    const worker = new FakeWorker();
    const workerFactory = vi.fn(() => worker);
    const secondPath = {
      ...SAMPLE_INPUT.paths[0]!,
      points: SAMPLE_INPUT.paths[0]!.points.map((point) => ({ ...point })),
    };

    await expect(
      buildStudioWillV1OpcBytesInWorker(
        {
          ...SAMPLE_INPUT,
          paths: [SAMPLE_INPUT.paths[0]!, secondPath],
        },
        {
          willLimits: { maxPaths: 1 },
          workerFactory,
        }
      )
    ).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
    expect(workerFactory).not.toHaveBeenCalled();
    expect(worker.requests).toEqual([]);

    await expect(
      buildStudioWillV1OpcBytesInWorker(
        {
          ...SAMPLE_INPUT,
          paths: [SAMPLE_INPUT.paths[0]!, secondPath],
        },
        {
          willLimits: {
            maxPaths: 2,
            maxPointsPerPath: 4,
            maxTotalPoints: 7,
          },
          workerFactory,
        }
      )
    ).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
    expect(workerFactory).not.toHaveBeenCalled();
    expect(worker.requests).toEqual([]);
  });

  it("rejects invalid custom limits and archive budgets before Worker creation", async () => {
    const worker = new FakeWorker();
    const workerFactory = vi.fn(() => worker);

    await expect(
      buildStudioWillV1OpcBytesInWorker(SAMPLE_INPUT, {
        willLimits: {
          maxPaths: STUDIO_WILL_V1_LIMITS.maxPaths + 1,
        },
        workerFactory,
      })
    ).rejects.toMatchObject({ code: "OPTIONS_INVALID" });

    await expect(
      importStudioWillV1OpcInWorker(new Uint8Array(23), {
        limits: { maxArchiveBytes: 22 },
        workerFactory,
      })
    ).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });

    expect(workerFactory).not.toHaveBeenCalled();
    expect(worker.requests).toEqual([]);
  });

  it("fails closed above the object-clone point cap before Worker creation", async () => {
    const workerFactory = vi.fn(() => new FakeWorker());
    await expect(
      buildStudioWillV1OpcBytesInWorker(SAMPLE_INPUT, {
        willLimits: {
          maxTotalPoints:
            STUDIO_WILL_V1_OPC_WORKER_MAX_STRUCTURED_CLONE_POINTS + 1,
        },
        workerFactory,
      }),
    ).rejects.toMatchObject({ code: "OPTIONS_INVALID" });

    const point = { x: 0, y: 0 };
    const firstPoints = new Array(50_001).fill(point);
    const secondPoints = new Array(50_000).fill(point);
    await expect(
      buildStudioWillV1OpcBytesInWorker(
        {
          ...SAMPLE_INPUT,
          paths: [
            {
              ...SAMPLE_INPUT.paths[0]!,
              points: firstPoints,
            },
            {
              ...SAMPLE_INPUT.paths[0]!,
              points: secondPoints,
            },
          ],
        },
        { workerFactory },
      ),
    ).rejects.toMatchObject({ code: "RESOURCE_LIMIT" });
    expect(workerFactory).not.toHaveBeenCalled();
  });

  it("includes createdAt in custom metadata result budgets", async () => {
    const workerFactory = vi.fn(() => new FakeWorker());
    await expect(
      buildStudioWillV1OpcBytesInWorker(SAMPLE_INPUT, {
        limits: { maxMetadataCharacters: 19 },
        workerFactory,
      }),
    ).rejects.toMatchObject({ code: "METADATA_INVALID" });
    expect(workerFactory).not.toHaveBeenCalled();

    const encoded = await buildStudioWillV1OpcBytes(SAMPLE_INPUT);
    const decoded = await importStudioWillV1Opc(encoded.bytes);
    const worker = new FakeWorker();
    const pending = importStudioWillV1OpcInWorker(encoded.bytes, {
      limits: { maxMetadataCharacters: 19 },
      requestIdFactory: () => "created-at-budget",
      workerFactory: () => worker,
    });
    await flushMicrotasks();
    worker.emit({
      type: "studio-will-v1-opc/decode-success",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "created-at-budget",
      result: decoded,
    });
    await expect(pending).rejects.toMatchObject({
      code: "WORKER_PROTOCOL",
    });
    expect(worker.terminateCount).toBe(1);
  });
});

describe("WILL v1 OPC Worker client fail-closed behavior", () => {
  it("does not expose raw Worker runtime messages", async () => {
    const worker = new FakeWorker();
    const pending = buildStudioWillV1OpcBytesInWorker(SAMPLE_INPUT, {
      workerFactory: () => worker,
    });
    await flushMicrotasks();

    worker.emitRawError();

    const error = await pending.catch((cause: unknown) => cause);
    expect(error).toMatchObject({ code: "WORKER_RUNTIME" });
    expect(String((error as Error).message)).not.toContain("secret");
    expect(String((error as Error).message)).not.toContain("private");
    expect(String((error as Error).message)).not.toContain("panic");
    expect(Object.hasOwn(error as object, "cause")).toBe(false);
    expect(worker.terminateCount).toBe(1);
  });

  it("rejects malformed correlated success and hostile assurance payloads", async () => {
    const malformedWorker = new FakeWorker();
    const malformed = buildStudioWillV1OpcBytesInWorker(SAMPLE_INPUT, {
      requestIdFactory: () => "malformed",
      workerFactory: () => malformedWorker,
    });
    await flushMicrotasks();
    malformedWorker.emit({
      type: "studio-will-v1-opc/encode-success",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "malformed",
      result: { bytes: new Uint8Array(21) },
    });
    await expect(malformed).rejects.toMatchObject({ code: "WORKER_PROTOCOL" });

    const valid = await buildStudioWillV1OpcBytes(SAMPLE_INPUT);
    const hostileWorker = new FakeWorker();
    const hostile = buildStudioWillV1OpcBytesInWorker(SAMPLE_INPUT, {
      requestIdFactory: () => "hostile",
      workerFactory: () => hostileWorker,
    });
    await flushMicrotasks();
    hostileWorker.emit({
      type: "studio-will-v1-opc/encode-success",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "hostile",
      result: {
        ...valid,
        assurance: {
          ...STUDIO_WILL_V1_OPC_ASSURANCE,
          vendorCertified: true,
        },
      },
    });
    await expect(hostile).rejects.toMatchObject({ code: "WORKER_PROTOCOL" });
  });

  it("maps typed failures and reports unsupported/postMessage hosts explicitly", async () => {
    await expect(
      buildStudioWillV1OpcBytesInWorker(SAMPLE_INPUT, { workerFactory: null })
    ).rejects.toMatchObject({ code: "WORKER_UNAVAILABLE" });

    const postWorker = new FakeWorker({ postThrows: true });
    const postFailure = await buildStudioWillV1OpcBytesInWorker(SAMPLE_INPUT, {
      workerFactory: () => postWorker,
    }).catch((cause: unknown) => cause);
    expect(postFailure).toMatchObject({ code: "WORKER_POST_FAILED" });
    expect(String((postFailure as Error).message)).not.toContain("secret");
    expect(Object.hasOwn(postFailure as object, "cause")).toBe(false);
    expect(postWorker.terminateCount).toBe(1);

    const startupFailure = await buildStudioWillV1OpcBytesInWorker(
      SAMPLE_INPUT,
      {
        workerFactory: () => {
          throw new Error("/private/secret/worker-entry.js");
        },
      },
    ).catch((reason: unknown) => reason);
    expect(startupFailure).toMatchObject({
      code: "WORKER_UNAVAILABLE",
    });
    expect(String((startupFailure as Error).message)).not.toContain(
      "secret",
    );
    expect(Object.hasOwn(startupFailure as object, "cause")).toBe(false);

    const typedWorker = new FakeWorker();
    const typedFailure = buildStudioWillV1OpcBytesInWorker(SAMPLE_INPUT, {
      requestIdFactory: () => "typed-failure",
      workerFactory: () => typedWorker,
    });
    await flushMicrotasks();
    typedWorker.emit({
      type: "studio-will-v1-opc/failure",
      version: STUDIO_WILL_V1_OPC_WORKER_PROTOCOL_VERSION,
      requestId: "typed-failure",
      operation: "encode",
      error: {
        code: "DIMENSION_INVALID",
        name: "StudioWillV1OpcInterchangeError",
        message: "문서 크기가 올바르지 않습니다.",
      },
    });
    await expect(typedFailure).rejects.toMatchObject({
      code: "DIMENSION_INVALID",
      name: "StudioWillV1OpcInterchangeError",
    });
  });
});
