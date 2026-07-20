import { describe, expect, it, vi } from "vitest";

import {
  applyLiquifyDisplacement,
  buildLiquifyDisplacementField,
  type LiquifyDisplacementField,
} from "./studio-liquify";
import {
  runStudioLiquifyWorker,
  type StudioLiquifyWorkerLike,
} from "./studio-liquify-worker-client";
import {
  studioLiquifySuccessTransfers,
  type StudioLiquifyWorkerResponseMessage,
  type StudioLiquifyWorkerRunMessage,
  type StudioLiquifyWorkerSuccessMessage,
} from "./studio-liquify-worker-protocol";

import type { StudioImageDataLike } from "./studio-filters";

function image(width: number, height: number): StudioImageDataLike {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      data[offset] = (x * 17 + y * 3) % 256;
      data[offset + 1] = (x * 5 + y * 11) % 256;
      data[offset + 2] = (x * 7 + y * 13) % 256;
      data[offset + 3] = 255;
    }
  }
  return { data, width, height };
}

function cloneImage(source: StudioImageDataLike): StudioImageDataLike {
  return { data: new Uint8ClampedArray(source.data), width: source.width, height: source.height };
}

function fieldFixture(): LiquifyDisplacementField {
  return {
    originX: 1,
    originY: 1,
    width: 2,
    height: 2,
    dx: new Float32Array([0, 0.5, 1, 0]),
    dy: new Float32Array([0, 0, 0.5, 0]),
  };
}

class ApplyingWorker implements StudioLiquifyWorkerLike {
  onmessage: StudioLiquifyWorkerLike["onmessage"] = null;
  onerror: StudioLiquifyWorkerLike["onerror"] = null;
  terminateCount = 0;
  transferCount = 0;

  constructor() {
    queueMicrotask(() => this.onmessage?.({
      data: { type: "studio-liquify/ready", version: 1 },
    } as MessageEvent<StudioLiquifyWorkerResponseMessage>));
  }

  postMessage(message: StudioLiquifyWorkerRunMessage, transfer: Transferable[]): void {
    this.transferCount = transfer.length;
    const received = structuredClone(message, { transfer });
    applyLiquifyDisplacement(received.request.src, received.request.dst, received.request.field);
    const response: StudioLiquifyWorkerSuccessMessage = {
      type: "studio-liquify/success",
      version: 1,
      dst: received.request.dst,
    };
    const returned = structuredClone(response, { transfer: studioLiquifySuccessTransfers(response) });
    this.onmessage?.({ data: returned } as MessageEvent<StudioLiquifyWorkerResponseMessage>);
  }

  terminate(): void {
    this.terminateCount += 1;
  }
}

class InvalidResultWorker extends ApplyingWorker {
  override postMessage(): void {
    this.onmessage?.({
      data: {
        type: "studio-liquify/success",
        version: 1,
        dst: { data: new Uint8ClampedArray(4), width: 4, height: 4 },
      },
    } as MessageEvent<StudioLiquifyWorkerResponseMessage>);
  }
}

describe("runStudioLiquifyWorker", () => {
  it("worker 전송 결과가 direct 변위 결과와 일치하고 동기 응답 race를 허용한다", async () => {
    const src = image(4, 4);
    const expected = cloneImage(src);
    const field = fieldFixture();
    applyLiquifyDisplacement(src, expected, field);
    const worker = new ApplyingWorker();

    const result = await runStudioLiquifyWorker(
      { src, dst: cloneImage(src), field },
      { workerFactory: () => worker },
    );

    expect(result.execution).toBe("worker");
    expect(result.dst.data).toEqual(expected.data);
    expect(worker.transferCount).toBe(4);
    expect(worker.terminateCount).toBe(1);
  });

  it("512px bloat 단일 dab은 필드 밖 RGB/alpha를 바꾸지 않고 direct와 동일하다", async () => {
    const src = image(512, 512);
    const field = buildLiquifyDisplacementField(
      [{ x: 256, y: 256 }],
      60,
      0.7,
      512,
      512,
      { mode: "bloat" },
    )!;
    const expected = cloneImage(src);
    applyLiquifyDisplacement(src, expected, field);
    const worker = new ApplyingWorker();

    const result = await runStudioLiquifyWorker(
      { src, dst: cloneImage(src), field },
      { workerFactory: () => worker },
    );

    expect(result.dst.data).toEqual(expected.data);
    const farPixelOffset = (20 * 512 + 20) * 4;
    expect(result.dst.data.slice(farPixelOffset, farPixelOffset + 4)).toEqual(
      expected.data.slice(farPixelOffset, farPixelOffset + 4),
    );
    let changedAlphaCount = 0;
    for (let offset = 3; offset < result.dst.data.length; offset += 4) {
      if (result.dst.data[offset] !== 255) changedAlphaCount += 1;
    }
    expect(changedAlphaCount).toBe(0);
  });

  it("src와 dst가 같은 버퍼여도 frozen source를 분리해 스캔 순서 오염을 막는다", async () => {
    const shared = image(4, 4);
    const frozen = cloneImage(shared);
    const expected = cloneImage(shared);
    const field = fieldFixture();
    applyLiquifyDisplacement(frozen, expected, field);

    const result = await runStudioLiquifyWorker(
      { src: shared, dst: shared, field },
      { workerFactory: () => new ApplyingWorker() },
    );

    expect(result.dst.data).toEqual(expected.data);
  });

  it("부분 view를 복제해 무관한 backing buffer와 형제 view를 detach하지 않는다", async () => {
    const backing = new ArrayBuffer(160);
    const srcData = new Uint8ClampedArray(backing, 8, 64);
    const dstData = new Uint8ClampedArray(backing, 80, 64);
    srcData.set(image(4, 4).data);
    dstData.set(srcData);
    const sentinel = new Uint8Array(backing, 0, 4);
    sentinel.set([4, 3, 2, 1]);

    const result = await runStudioLiquifyWorker({
      src: { data: srcData, width: 4, height: 4 },
      dst: { data: dstData, width: 4, height: 4 },
      field: fieldFixture(),
    }, { workerFactory: () => new ApplyingWorker() });

    expect(result.execution).toBe("worker");
    expect(backing.byteLength).toBe(160);
    expect(Array.from(sentinel)).toEqual([4, 3, 2, 1]);
  });

  it("잘못된 입력은 Worker 생성 전에, 잘못된 성공 결과는 적용 전에 거부한다", async () => {
    const factory = vi.fn(() => new ApplyingWorker());
    await expect(runStudioLiquifyWorker({
      src: { data: new Uint8ClampedArray(4), width: 2, height: 2 },
      dst: image(2, 2),
      field: fieldFixture(),
    }, { workerFactory: factory })).rejects.toThrow(/버퍼 길이/);
    expect(factory).not.toHaveBeenCalled();

    const invalidWorker = new InvalidResultWorker();
    await expect(runStudioLiquifyWorker({
      src: image(4, 4),
      dst: image(4, 4),
      field: fieldFixture(),
    }, { workerFactory: () => invalidWorker })).rejects.toThrow(/버퍼 길이/);
    expect(invalidWorker.terminateCount).toBe(1);
  });
});
