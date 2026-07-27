import { describe, expect, it } from "vitest";

import { calculateStudioCrc32 } from "./studio-crc32";
import {
  createStudioCrc32WorkerSession,
  type StudioCrc32WorkerLike,
} from "./studio-crc32-worker-client";
import {
  studioCrc32SuccessTransfers,
  type StudioCrc32WorkerResponseMessage,
  type StudioCrc32WorkerRunMessage,
  type StudioCrc32WorkerSuccessMessage,
} from "./studio-crc32-worker-protocol";

class ControlledWorker implements StudioCrc32WorkerLike {
  onmessage: StudioCrc32WorkerLike["onmessage"] = null;
  onerror: StudioCrc32WorkerLike["onerror"] = null;
  readonly messages: StudioCrc32WorkerRunMessage[] = [];
  readonly transfers: Transferable[][] = [];
  terminateCount = 0;

  postMessage(message: StudioCrc32WorkerRunMessage, transfer: Transferable[]): void {
    this.transfers.push(transfer);
    this.messages.push(structuredClone(message, { transfer }));
  }

  terminate(): void {
    this.terminateCount += 1;
  }

  emitReady(): void {
    this.emit({ type: "studio-crc32/ready", version: 1 });
  }

  emitCalculated(index = 0): void {
    const message = this.messages[index]!;
    const response: StudioCrc32WorkerSuccessMessage = {
      type: "studio-crc32/success",
      version: 1,
      requestId: message.requestId,
      crc32: calculateStudioCrc32(message.data),
      data: message.data,
    };
    this.emit(structuredClone(response, {
      transfer: studioCrc32SuccessTransfers(response),
    }));
  }

  emitFailure(requestId: number, name: string, message: string): void {
    this.emit({
      type: "studio-crc32/failure",
      version: 1,
      requestId,
      error: { name, message },
    });
  }

  emitLoadError(message: string): void {
    this.onerror?.({ message });
  }

  private emit(message: StudioCrc32WorkerResponseMessage): void {
    this.onmessage?.({ data: message } as MessageEvent<StudioCrc32WorkerResponseMessage>);
  }
}

function pattern(length = 128): Uint8Array {
  return Uint8Array.from(
    { length },
    (_, index) => (index * 73 + (index >>> 2) * 11) & 0xff,
  );
}

describe("createStudioCrc32WorkerSession", () => {
  it("uses the bounded direct path without detaching small inputs", async () => {
    const data = pattern();
    const session = createStudioCrc32WorkerSession({ workerFactory: null });

    await expect(session.run(data)).resolves.toEqual({
      execution: "direct",
      crc32: calculateStudioCrc32(data),
      data,
    });
    expect(data.byteLength).toBe(128);
    session.dispose();
  });

  it.each([16, 64])(
    "fails closed for %d MiB instead of blocking the main thread when Worker is unavailable",
    async (megabytes) => {
      const data = new Uint8Array(megabytes * 1024 * 1024);
      const session = createStudioCrc32WorkerSession({ workerFactory: null });

      await expect(session.run(data)).rejects.toThrow(
        "편집 화면 멈춤을 막기 위해 메인 스레드에서 계산하지 않습니다",
      );
      expect(data.byteLength).toBe(megabytes * 1024 * 1024);
      session.dispose();
    },
  );

  it("allows an explicit large direct fallback only for a headless archive runtime", async () => {
    const data = pattern(2 * 1024 * 1024);
    const session = createStudioCrc32WorkerSession({
      workerFactory: null,
      allowLargeDirectFallbackInHeadless: true,
    });

    await expect(session.run(data)).resolves.toEqual({
      execution: "direct",
      crc32: calculateStudioCrc32(data),
      data,
    });
    session.dispose();
  });

  it("transfers ownership out and back while reusing one warm Worker", async () => {
    const worker = new ControlledWorker();
    let factoryCalls = 0;
    const session = createStudioCrc32WorkerSession({
      workerFactory: () => {
        factoryCalls += 1;
        return worker;
      },
    });
    const firstOriginal = pattern(4_096);
    const firstExpected = calculateStudioCrc32(firstOriginal);
    const first = session.run(firstOriginal);

    worker.emitReady();
    expect(firstOriginal.byteLength).toBe(0);
    expect(worker.transfers[0]).toHaveLength(1);
    worker.emitCalculated(0);
    const firstResult = await first;
    expect(firstResult).toMatchObject({
      execution: "worker",
      crc32: firstExpected,
    });
    expect(firstResult.data.byteLength).toBe(4_096);

    const secondOriginal = pattern(8_192);
    const secondExpected = calculateStudioCrc32(secondOriginal);
    const second = session.run(secondOriginal);
    expect(secondOriginal.byteLength).toBe(0);
    worker.emitCalculated(1);
    const secondResult = await second;
    expect(secondResult).toMatchObject({
      execution: "worker",
      crc32: secondExpected,
    });
    expect(secondResult.data.byteLength).toBe(8_192);
    expect(factoryCalls).toBe(1);
    expect(worker.terminateCount).toBe(0);

    session.dispose();
    expect(worker.terminateCount).toBe(1);
  });

  it("copies a partial view into a dedicated transfer without detaching its owner", async () => {
    const owner = new ArrayBuffer(80);
    const partial = new Uint8Array(owner, 8, 64);
    partial.set(pattern(64));
    const expected = calculateStudioCrc32(partial);
    const worker = new ControlledWorker();
    const session = createStudioCrc32WorkerSession({ workerFactory: () => worker });
    const pending = session.run(partial);

    worker.emitReady();
    expect(owner.byteLength).toBe(80);
    expect(partial.byteLength).toBe(64);
    expect(worker.messages[0]!.data.byteOffset).toBe(0);
    expect(worker.messages[0]!.data.buffer.byteLength).toBe(64);
    worker.emitCalculated();
    await expect(pending).resolves.toMatchObject({
      execution: "worker",
      crc32: expected,
    });
    session.dispose();
  });

  it("terminates an aborted epoch, ignores its late response, and creates a fresh Worker", async () => {
    const firstWorker = new ControlledWorker();
    const secondWorker = new ControlledWorker();
    const workers = [firstWorker, secondWorker];
    const session = createStudioCrc32WorkerSession({
      workerFactory: () => workers.shift() ?? null,
    });
    const controller = new AbortController();
    const first = session.run(pattern(), { signal: controller.signal });
    workerReadyAndPosted(firstWorker);

    controller.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    expect(firstWorker.terminateCount).toBe(1);
    firstWorker.emitCalculated();

    const second = session.run(pattern(256));
    workerReadyAndPosted(secondWorker);
    secondWorker.emitCalculated();
    await expect(second).resolves.toMatchObject({ execution: "worker" });
    session.dispose();
  });

  it("supersedes an active request with a new Worker epoch", async () => {
    const firstWorker = new ControlledWorker();
    const secondWorker = new ControlledWorker();
    const workers = [firstWorker, secondWorker];
    const session = createStudioCrc32WorkerSession({
      workerFactory: () => workers.shift() ?? null,
    });
    const first = session.run(pattern());
    workerReadyAndPosted(firstWorker);
    const firstRejection = expect(first).rejects.toMatchObject({ name: "AbortError" });

    const second = session.run(pattern(256));
    await firstRejection;
    expect(firstWorker.terminateCount).toBe(1);
    workerReadyAndPosted(secondWorker);
    secondWorker.emitCalculated();
    await expect(second).resolves.toMatchObject({ execution: "worker" });
    session.dispose();
  });

  it("falls back only before transfer and preserves post-transfer Worker failures", async () => {
    const loadFailureWorker = new ControlledWorker();
    const directSession = createStudioCrc32WorkerSession({
      workerFactory: () => loadFailureWorker,
    });
    const directInput = pattern();
    const direct = directSession.run(directInput);
    loadFailureWorker.emitLoadError("worker chunk blocked");
    await expect(direct).resolves.toMatchObject({
      execution: "direct",
      crc32: calculateStudioCrc32(directInput),
    });
    directSession.dispose();

    const executionFailureWorker = new ControlledWorker();
    const workerSession = createStudioCrc32WorkerSession({
      workerFactory: () => executionFailureWorker,
    });
    const posted = workerSession.run(pattern());
    workerReadyAndPosted(executionFailureWorker);
    executionFailureWorker.emitFailure(
      executionFailureWorker.messages[0]!.requestId,
      "RangeError",
      "source is too large",
    );
    await expect(posted).rejects.toMatchObject({
      name: "RangeError",
      message: "source is too large",
    });
    workerSession.dispose();
  });

  it("rejects an already-aborted request before creating or detaching a Worker", async () => {
    const controller = new AbortController();
    controller.abort();
    const input = pattern();
    let factoryCalls = 0;
    const session = createStudioCrc32WorkerSession({
      workerFactory: () => {
        factoryCalls += 1;
        return new ControlledWorker();
      },
    });

    await expect(session.run(input, { signal: controller.signal })).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(factoryCalls).toBe(0);
    expect(input.byteLength).toBe(128);
    session.dispose();
  });
});

function workerReadyAndPosted(worker: ControlledWorker): void {
  worker.emitReady();
  expect(worker.messages).toHaveLength(1);
}
