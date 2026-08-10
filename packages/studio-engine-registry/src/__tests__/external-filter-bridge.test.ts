import { describe, expect, it } from "vitest";

import {
  computeExternalFilterDescriptorFingerprint,
  connectExternalFilterBridge,
  EXTERNAL_FILTER_PROTOCOL,
  EXTERNAL_FILTER_PROTOCOL_VERSION,
  ExternalFilterBridgeError,
} from "../external-filter-bridge";

import type {
  ExternalFilterBridge,
  ExternalFilterBridgeOptions,
  ExternalFilterClientMessage,
  ExternalFilterMessagePort,
  ExternalFilterProviderDescriptor,
  ExternalFilterRunMessage,
  ExternalFilterRuntime,
  ExternalFilterTransportEvent,
  ExternalFilterTransportListener,
} from "../external-filter-bridge";

const PROVIDER_ID = "gmic-toonbridge";
const ORIGIN = "toonbridge://local.gmic";

class VirtualRuntime implements ExternalFilterRuntime {
  private current = 0;
  private nextTimerId = 1;
  private readonly timers = new Map<
    number,
    { readonly at: number; readonly callback: () => void }
  >();

  now(): number {
    return this.current;
  }

  elapse(milliseconds: number): void {
    this.current += milliseconds;
  }

  setTimeout(callback: () => void, delayMs: number): number {
    const id = this.nextTimerId;
    this.nextTimerId += 1;
    this.timers.set(id, { at: this.current + delayMs, callback });
    return id;
  }

  clearTimeout(handle: unknown): void {
    if (typeof handle === "number") this.timers.delete(handle);
  }

  advanceBy(milliseconds: number): void {
    const target = this.current + milliseconds;
    for (;;) {
      const next = [...this.timers.entries()]
        .filter(([, timer]) => timer.at <= target)
        .sort((left, right) => left[1].at - right[1].at || left[0] - right[0])[0];
      if (next === undefined) break;
      const [id, timer] = next;
      this.timers.delete(id);
      this.current = timer.at;
      timer.callback();
    }
    this.current = target;
  }

  runAll(): void {
    while (this.timers.size > 0) {
      const nextAt = Math.min(...[...this.timers.values()].map((timer) => timer.at));
      this.advanceBy(nextAt - this.current);
    }
  }

  get activeTimerCount(): number {
    return this.timers.size;
  }
}

interface PostedClientMessage {
  readonly message: ExternalFilterClientMessage;
  readonly transferCount: number;
}

class FakeMessagePort implements ExternalFilterMessagePort {
  private readonly listeners = new Map<
    "message" | "messageerror" | "error",
    Set<ExternalFilterTransportListener>
  >([
    ["message", new Set()],
    ["messageerror", new Set()],
    ["error", new Set()],
  ]);
  readonly posted: PostedClientMessage[] = [];
  closed = false;
  started = false;
  clientLatencyMs = 0;
  onClientMessage: ((message: ExternalFilterClientMessage) => void) | null = null;

  constructor(
    readonly runtime: VirtualRuntime,
    readonly defaultOrigin = ORIGIN,
  ) {}

  postMessage(message: unknown, transfer: readonly ArrayBuffer[] = []): void {
    if (this.closed) throw new Error("port closed");
    const received = structuredClone(message, { transfer: [...transfer] }) as ExternalFilterClientMessage;
    this.posted.push({ message: received, transferCount: transfer.length });
    this.runtime.elapse(this.clientLatencyMs);
    this.onClientMessage?.(received);
  }

  providerPost(
    message: unknown,
    transfer: readonly ArrayBuffer[] = [],
    origin = this.defaultOrigin,
    delayMs = 0,
  ): void {
    const received = structuredClone(message, { transfer: [...transfer] });
    this.runtime.setTimeout(() => {
      this.emit("message", { data: received, origin });
    }, delayMs);
  }

  crash(message = "provider crashed"): void {
    this.emit("error", { message, error: new Error(message) });
  }

  corruptMessage(): void {
    this.emit("messageerror", { message: "structured clone failed" });
  }

  addEventListener(
    type: "message" | "messageerror" | "error",
    listener: ExternalFilterTransportListener,
  ): void {
    this.listeners.get(type)?.add(listener);
  }

  removeEventListener(
    type: "message" | "messageerror" | "error",
    listener: ExternalFilterTransportListener,
  ): void {
    this.listeners.get(type)?.delete(listener);
  }

  start(): void {
    this.started = true;
  }

  close(): void {
    this.closed = true;
  }

  listenerCount(): number {
    return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
  }

  private emit(
    type: "message" | "messageerror" | "error",
    event: ExternalFilterTransportEvent,
  ): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }
}

function descriptor(
  overrides: Partial<ExternalFilterProviderDescriptor> = {},
): ExternalFilterProviderDescriptor {
  return {
    providerId: PROVIDER_ID,
    providerVersion: "1.4.0",
    engineName: "G'MIC",
    engineVersion: "3.6.3",
    buildId: "gmic-3.6.3-arm64-20260809",
    origin: ORIGIN,
    deployment: "local-toonbridge",
    license: {
      spdx: "CeCILL-2.1",
      sourceUrl: "https://example.test/source/gmic-3.6.3",
      noticeUrl: "https://example.test/notices/gmic-3.6.3",
      binaryBundled: false,
    },
    capabilities: [
      {
        operationId: "gmic.stylize.ink",
        title: "Ink stylization",
        deterministic: true,
        supportsProgress: true,
        supportsCancellation: true,
        maxWidth: 8_192,
        maxHeight: 8_192,
        maxInputBytes: 256 * 1024 * 1024,
        maxOutputBytes: 256 * 1024 * 1024,
      },
      {
        operationId: "gmic.restore.denoise",
        title: "Denoise",
        deterministic: true,
        supportsProgress: true,
        supportsCancellation: true,
        maxWidth: 8_192,
        maxHeight: 8_192,
        maxInputBytes: 256 * 1024 * 1024,
        maxOutputBytes: 256 * 1024 * 1024,
      },
    ],
    ...overrides,
  };
}

function providerEnvelope(
  type: string,
  requestId: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    protocol: EXTERNAL_FILTER_PROTOCOL,
    version: EXTERNAL_FILTER_PROTOCOL_VERSION,
    type,
    providerId: PROVIDER_ID,
    requestId,
    ...fields,
  };
}

function resultEnvelope(
  run: ExternalFilterRunMessage,
  pixels = new Uint8Array(run.width * run.height * 4).fill(77).buffer,
): Record<string, unknown> {
  return providerEnvelope("result", run.requestId, {
    operationId: run.operationId,
    width: run.width,
    height: run.height,
    pixelFormat: "rgba8",
    colorSpace: "srgb",
    pixels,
  });
}

interface Harness {
  readonly bridge: ExternalFilterBridge;
  readonly port: FakeMessagePort;
  readonly runtime: VirtualRuntime;
}

async function connectHarness(
  options: {
    readonly descriptor?: ExternalFilterProviderDescriptor;
    readonly bridge?: Partial<Omit<ExternalFilterBridgeOptions, "port" | "runtime" | "idFactory">>;
    readonly providerReadyTransform?: (message: Record<string, unknown>) => Record<string, unknown>;
    readonly readyOrigin?: string;
  } = {},
): Promise<Harness> {
  const runtime = new VirtualRuntime();
  const port = new FakeMessagePort(runtime);
  const providerDescriptor = options.descriptor ?? descriptor();
  let id = 0;
  port.onClientMessage = (message) => {
    if (message.type !== "client-hello") return;
    const ready = {
      protocol: EXTERNAL_FILTER_PROTOCOL,
      version: EXTERNAL_FILTER_PROTOCOL_VERSION,
      type: "provider-ready",
      handshakeId: message.handshakeId,
      descriptor: providerDescriptor,
      descriptorFingerprint: computeExternalFilterDescriptorFingerprint(providerDescriptor),
    };
    port.providerPost(
      options.providerReadyTransform?.(ready) ?? ready,
      [],
      options.readyOrigin ?? providerDescriptor.origin,
    );
  };
  const connecting = connectExternalFilterBridge({
    port,
    runtime,
    idFactory: () => `test-id-${++id}`,
    allowedOrigins: [ORIGIN],
    allowedProviders: [{ providerId: PROVIDER_ID, licenses: ["CeCILL-2.1"] }],
    ...options.bridge,
  });
  runtime.runAll();
  const bridge = await connecting;
  expect(port.started).toBe(true);
  return { bridge, port, runtime };
}

function pixels(width = 2, height = 2, value = 11): ArrayBuffer {
  return new Uint8Array(width * height * 4).fill(value).buffer;
}

function latestRun(port: FakeMessagePort): ExternalFilterRunMessage {
  const run = [...port.posted].reverse().find(({ message }) => message.type === "run")?.message;
  if (run?.type !== "run") throw new Error("run message missing");
  return run;
}

describe("ExternalFilterBridge handshake", () => {
  it("accepts a deterministic canonical capability/license descriptor", async () => {
    const original = descriptor();
    const reordered = descriptor({ capabilities: [...original.capabilities].reverse() });
    expect(computeExternalFilterDescriptorFingerprint(original)).toBe(
      computeExternalFilterDescriptorFingerprint(reordered),
    );

    const { bridge } = await connectHarness({ descriptor: reordered });
    expect(bridge.descriptor.capabilities.map((item) => item.operationId)).toEqual([
      "gmic.restore.denoise",
      "gmic.stylize.ink",
    ]);
    expect(Object.isFrozen(bridge.descriptor)).toBe(true);
  });

  it.each([
    [
      "VERSION_REJECTED",
      (ready: Record<string, unknown>) => ({ ...ready, version: 99 }),
      undefined,
    ],
    [
      "PROTOCOL_VIOLATION",
      (ready: Record<string, unknown>) => ({ ...ready, descriptorFingerprint: "tampered" }),
      undefined,
    ],
    ["ORIGIN_REJECTED", undefined, "https://evil.example"],
  ] as const)("rejects an invalid handshake with %s", async (code, transform, readyOrigin) => {
    const runtime = new VirtualRuntime();
    const port = new FakeMessagePort(runtime);
    let id = 0;
    port.onClientMessage = (message) => {
      if (message.type !== "client-hello") return;
      const providerDescriptor = descriptor();
      const ready: Record<string, unknown> = {
        protocol: EXTERNAL_FILTER_PROTOCOL,
        version: EXTERNAL_FILTER_PROTOCOL_VERSION,
        type: "provider-ready",
        handshakeId: message.handshakeId,
        descriptor: providerDescriptor,
        descriptorFingerprint: computeExternalFilterDescriptorFingerprint(providerDescriptor),
      };
      port.providerPost(transform?.(ready) ?? ready, [], readyOrigin ?? ORIGIN);
    };
    const connecting = connectExternalFilterBridge({
      port,
      runtime,
      idFactory: () => `reject-${++id}`,
      allowedOrigins: [ORIGIN],
      allowedProviders: [{ providerId: PROVIDER_ID, licenses: ["CeCILL-2.1"] }],
    });
    runtime.runAll();
    await expect(connecting).rejects.toMatchObject({ code });
    expect(port.listenerCount()).toBe(0);
    expect(port.closed).toBe(true);
  });

  it("rejects non-allowlisted providers and licenses independently", async () => {
    const cases: readonly [ExternalFilterProviderDescriptor, string][] = [
      [descriptor({ providerId: "gegl-bridge" }), "PROVIDER_REJECTED"],
      [
        descriptor({
          license: {
            ...descriptor().license,
            spdx: "GPL-3.0-or-later",
          },
        }),
        "LICENSE_REJECTED",
      ],
    ];
    for (const [providerDescriptor, code] of cases) {
      const runtime = new VirtualRuntime();
      const port = new FakeMessagePort(runtime);
      let id = 0;
      port.onClientMessage = (message) => {
        if (message.type !== "client-hello") return;
        port.providerPost({
          protocol: EXTERNAL_FILTER_PROTOCOL,
          version: EXTERNAL_FILTER_PROTOCOL_VERSION,
          type: "provider-ready",
          handshakeId: message.handshakeId,
          descriptor: providerDescriptor,
          descriptorFingerprint: computeExternalFilterDescriptorFingerprint(providerDescriptor),
        });
      };
      const connecting = connectExternalFilterBridge({
        port,
        runtime,
        idFactory: () => `allow-${++id}`,
        allowedOrigins: [ORIGIN],
        allowedProviders: [{ providerId: PROVIDER_ID, licenses: ["CeCILL-2.1"] }],
      });
      runtime.runAll();
      await expect(connecting).rejects.toMatchObject({ code });
    }
  });

  it("rejects a descriptor claiming that the copyleft binary is bundled", async () => {
    const runtime = new VirtualRuntime();
    const port = new FakeMessagePort(runtime);
    port.onClientMessage = (message) => {
      if (message.type !== "client-hello") return;
      const invalid = {
        ...descriptor(),
        license: { ...descriptor().license, binaryBundled: true },
      };
      port.providerPost({
        protocol: EXTERNAL_FILTER_PROTOCOL,
        version: EXTERNAL_FILTER_PROTOCOL_VERSION,
        type: "provider-ready",
        handshakeId: message.handshakeId,
        descriptor: invalid,
        descriptorFingerprint: "not-reached",
      });
    };
    const connecting = connectExternalFilterBridge({
      port,
      runtime,
      idFactory: () => "bundle-check",
      allowedOrigins: [ORIGIN],
      allowedProviders: [{ providerId: PROVIDER_ID, licenses: ["CeCILL-2.1"] }],
    });
    runtime.runAll();
    await expect(connecting).rejects.toMatchObject({ code: "LICENSE_REJECTED" });
  });

  it("times out a silent handshake without leaking listeners or timers", async () => {
    const runtime = new VirtualRuntime();
    const port = new FakeMessagePort(runtime);
    const connecting = connectExternalFilterBridge({
      port,
      runtime,
      idFactory: () => "silent-handshake",
      allowedOrigins: [ORIGIN],
      allowedProviders: [{ providerId: PROVIDER_ID, licenses: ["CeCILL-2.1"] }],
      quotas: { handshakeTimeoutMs: 25 },
    });
    runtime.advanceBy(25);
    await expect(connecting).rejects.toMatchObject({ code: "HANDSHAKE_TIMEOUT" });
    expect(runtime.activeTimerCount).toBe(0);
    expect(port.listenerCount()).toBe(0);
  });
});

describe("ExternalFilterBridge execution", () => {
  it("round-trips result pixels and transfers both input and output ownership", async () => {
    const { bridge, port, runtime } = await connectHarness();
    const providerOutputByteLengthsAfterTransfer: number[] = [];
    port.onClientMessage = (message) => {
      if (message.type !== "run") return;
      const providerOutput = new Uint8Array(message.pixels.byteLength).fill(203).buffer;
      port.providerPost(resultEnvelope(message, providerOutput), [providerOutput]);
      providerOutputByteLengthsAfterTransfer.push(providerOutput.byteLength);
    };
    const input = pixels(2, 2, 17);
    const resultPromise = bridge.execute({
      operationId: "gmic.stylize.ink",
      width: 2,
      height: 2,
      pixels: input,
      parameters: { strength: 0.8 },
      seed: 7,
    });
    expect(input.byteLength).toBe(0);
    expect(port.posted.at(-1)?.transferCount).toBe(1);
    expect(providerOutputByteLengthsAfterTransfer).toEqual([0]);
    runtime.runAll();
    const result = await resultPromise;
    expect([...new Uint8Array(result.pixels)]).toEqual(new Array(16).fill(203));
    expect(result).toMatchObject({
      providerId: PROVIDER_ID,
      operationId: "gmic.stylize.ink",
      width: 2,
      height: 2,
    });
    expect(bridge.metrics()).toMatchObject({
      pendingRequests: 0,
      inFlightBytes: 0,
      peakInFlightBytes: 32,
      completedRequests: 1,
    });
  });

  it("isolates out-of-order responses by request id", async () => {
    const { bridge, port, runtime } = await connectHarness({
      bridge: { quotas: { maxInFlightRequests: 2 } },
    });
    const runs: ExternalFilterRunMessage[] = [];
    port.onClientMessage = (message) => {
      if (message.type === "run") runs.push(message);
    };
    const first = bridge.execute({
      operationId: "gmic.stylize.ink",
      width: 1,
      height: 1,
      pixels: pixels(1, 1, 1),
    });
    const second = bridge.execute({
      operationId: "gmic.restore.denoise",
      width: 1,
      height: 1,
      pixels: pixels(1, 1, 2),
    });
    expect(runs).toHaveLength(2);
    const secondPixels = new Uint8Array([2, 2, 2, 255]).buffer;
    const firstPixels = new Uint8Array([1, 1, 1, 255]).buffer;
    port.providerPost(resultEnvelope(runs[1], secondPixels), [secondPixels]);
    port.providerPost(resultEnvelope(runs[0], firstPixels), [firstPixels]);
    runtime.runAll();
    await expect(first).resolves.toMatchObject({ requestId: runs[0].requestId });
    await expect(second).resolves.toMatchObject({ requestId: runs[1].requestId });
  });

  it("delivers monotonic progress and rejects a regression as a fatal protocol breach", async () => {
    const { bridge, port, runtime } = await connectHarness();
    const observed: number[] = [];
    const request = bridge.execute({
      operationId: "gmic.stylize.ink",
      width: 1,
      height: 1,
      pixels: pixels(1, 1),
      onProgress: ({ progress }) => observed.push(progress),
    });
    const run = latestRun(port);
    port.providerPost(providerEnvelope("progress", run.requestId, { progress: 0.2, phase: "decode" }));
    port.providerPost(providerEnvelope("progress", run.requestId, { progress: 0.7, phase: "filter" }));
    runtime.advanceBy(0);
    expect(observed).toEqual([0.2, 0.7]);
    const rejection = expect(request).rejects.toMatchObject({ code: "PROTOCOL_VIOLATION" });
    port.providerPost(providerEnvelope("progress", run.requestId, { progress: 0.6, phase: "bad" }));
    runtime.advanceBy(0);
    await rejection;
    expect(bridge.metrics()).toMatchObject({ state: "failed", pendingRequests: 0 });
  });

  it("maps provider errors to structured bridge errors without fallback", async () => {
    const { bridge, port, runtime } = await connectHarness();
    port.onClientMessage = (message) => {
      if (message.type !== "run") return;
      port.providerPost(
        providerEnvelope("provider-error", message.requestId, {
          error: {
            code: "GMIC_RECIPE_FAILED",
            message: "recipe rejected",
            retryable: false,
            details: { line: 12 },
          },
        }),
      );
    };
    const request = bridge.execute({
      operationId: "gmic.stylize.ink",
      width: 1,
      height: 1,
      pixels: pixels(1, 1),
    });
    runtime.runAll();
    await expect(request).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
      retryable: false,
      details: { providerCode: "GMIC_RECIPE_FAILED", line: 12 },
    });
    expect(bridge.metrics().state).toBe("ready");
  });

  it("requires an explicit cancel acknowledgement for AbortSignal cancellation", async () => {
    const { bridge, port, runtime } = await connectHarness();
    port.onClientMessage = (message) => {
      if (message.type === "cancel") {
        port.providerPost(providerEnvelope("cancel-ack", message.requestId));
      }
    };
    const controller = new AbortController();
    const request = bridge.execute({
      operationId: "gmic.stylize.ink",
      width: 1,
      height: 1,
      pixels: pixels(1, 1),
      signal: controller.signal,
    });
    const rejection = expect(request).rejects.toMatchObject({ code: "CANCELLED" });
    controller.abort();
    expect(port.posted.at(-1)?.message).toMatchObject({ type: "cancel", reason: "abort-signal" });
    runtime.runAll();
    await rejection;
    expect(bridge.metrics()).toMatchObject({
      pendingRequests: 0,
      inFlightBytes: 0,
      cancelledRequests: 1,
    });
  });

  it("rejects when cancellation acknowledgement exceeds its bounded timeout", async () => {
    const { bridge, runtime } = await connectHarness({
      bridge: { quotas: { cancelAckTimeoutMs: 10 } },
    });
    const controller = new AbortController();
    const request = bridge.execute({
      operationId: "gmic.stylize.ink",
      width: 1,
      height: 1,
      pixels: pixels(1, 1),
      signal: controller.signal,
    });
    const rejection = expect(request).rejects.toMatchObject({
      code: "CANCEL_ACK_TIMEOUT",
      details: { originalCode: "CANCELLED" },
    });
    controller.abort();
    runtime.advanceBy(10);
    await rejection;
    expect(bridge.metrics()).toMatchObject({ pendingRequests: 0, inFlightBytes: 0 });
  });

  it("enforces runtime timeout and reports it after provider cancellation ack", async () => {
    const { bridge, port, runtime } = await connectHarness();
    port.onClientMessage = (message) => {
      if (message.type === "cancel") {
        expect(message.reason).toBe("runtime-timeout");
        port.providerPost(providerEnvelope("cancel-ack", message.requestId));
      }
    };
    const request = bridge.execute({
      operationId: "gmic.restore.denoise",
      width: 1,
      height: 1,
      pixels: pixels(1, 1),
      timeoutMs: 25,
    });
    const rejection = expect(request).rejects.toMatchObject({ code: "RUNTIME_TIMEOUT" });
    runtime.advanceBy(25);
    await rejection;
    expect(bridge.metrics()).toMatchObject({ timedOutRequests: 1, pendingRequests: 0 });
  });

  it("rejects all in-flight work and cleans resources after a provider crash", async () => {
    const { bridge, port, runtime } = await connectHarness({
      bridge: { quotas: { maxInFlightRequests: 2 } },
    });
    const first = bridge.execute({
      operationId: "gmic.stylize.ink",
      width: 1,
      height: 1,
      pixels: pixels(1, 1),
    });
    const second = bridge.execute({
      operationId: "gmic.restore.denoise",
      width: 1,
      height: 1,
      pixels: pixels(1, 1),
    });
    const firstRejection = expect(first).rejects.toMatchObject({ code: "TRANSPORT_ERROR" });
    const secondRejection = expect(second).rejects.toMatchObject({ code: "TRANSPORT_ERROR" });
    port.crash();
    await Promise.all([firstRejection, secondRejection]);
    expect(bridge.metrics()).toMatchObject({
      state: "failed",
      pendingRequests: 0,
      inFlightBytes: 0,
      retiredRequestIds: 0,
    });
    expect(runtime.activeTimerCount).toBe(0);
    expect(port.listenerCount()).toBe(0);
  });

  it("treats malformed provider messages as fatal and releases the request", async () => {
    const { bridge, port, runtime } = await connectHarness();
    const request = bridge.execute({
      operationId: "gmic.stylize.ink",
      width: 1,
      height: 1,
      pixels: pixels(1, 1),
    });
    const run = latestRun(port);
    const malformed = { ...resultEnvelope(run), hidden: "not allowed" };
    const rejection = expect(request).rejects.toMatchObject({ code: "PROTOCOL_VIOLATION" });
    port.providerPost(malformed);
    runtime.runAll();
    await rejection;
    expect(bridge.metrics()).toMatchObject({ state: "failed", rejectedMessages: 1 });
  });

  it("suppresses valid late messages for retired request ids", async () => {
    const { bridge, port, runtime } = await connectHarness();
    port.onClientMessage = (message) => {
      if (message.type === "cancel") {
        port.providerPost(providerEnvelope("cancel-ack", message.requestId));
      }
    };
    const controller = new AbortController();
    const request = bridge.execute({
      operationId: "gmic.stylize.ink",
      width: 1,
      height: 1,
      pixels: pixels(1, 1),
      signal: controller.signal,
    });
    const run = latestRun(port);
    const rejection = expect(request).rejects.toMatchObject({ code: "CANCELLED" });
    controller.abort();
    runtime.runAll();
    await rejection;
    const latePixels = pixels(1, 1, 99);
    port.providerPost(resultEnvelope(run, latePixels), [latePixels]);
    runtime.runAll();
    expect(bridge.metrics()).toMatchObject({ state: "ready", ignoredLateMessages: 1 });
  });

  it("enforces dimension, byte, request-count and reserved-memory quotas before transfer", async () => {
    const { bridge } = await connectHarness({
      bridge: {
        quotas: {
          maxWidth: 8,
          maxInFlightRequests: 1,
          maxInFlightBytes: 32,
        },
      },
    });
    const oversized = pixels(9, 1);
    await expect(
      bridge.execute({
        operationId: "gmic.stylize.ink",
        width: 9,
        height: 1,
        pixels: oversized,
      }),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    expect(oversized.byteLength).toBe(36);

    await expect(
      bridge.execute({
        operationId: "gmic.stylize.ink",
        width: 2,
        height: 2,
        pixels: new ArrayBuffer(15),
      }),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });

    const live = bridge.execute({
      operationId: "gmic.stylize.ink",
      width: 2,
      height: 2,
      pixels: pixels(2, 2),
    });
    const liveRejection = expect(live).rejects.toMatchObject({ code: "DISPOSED" });
    await expect(
      bridge.execute({
        operationId: "gmic.stylize.ink",
        width: 1,
        height: 1,
        pixels: pixels(1, 1),
      }),
    ).rejects.toMatchObject({ code: "QUOTA_EXCEEDED" });
    bridge.dispose();
    await liveRejection;

    const { bridge: byteBridge } = await connectHarness({
      bridge: {
        quotas: {
          maxInFlightRequests: 2,
          maxInFlightBytes: 31,
        },
      },
    });
    const byteQuotaInput = pixels(2, 2);
    await expect(
      byteBridge.execute({
        operationId: "gmic.stylize.ink",
        width: 2,
        height: 2,
        pixels: byteQuotaInput,
      }),
    ).rejects.toMatchObject({
      code: "QUOTA_EXCEEDED",
      details: { requestedReservationBytes: 32, inFlightBytes: 0 },
    });
    expect(byteQuotaInput.byteLength).toBe(16);
    byteBridge.dispose();
  });

  it("disposes idempotently and leaves no listeners, timers, requests, or tombstones", async () => {
    const { bridge, port, runtime } = await connectHarness();
    const request = bridge.execute({
      operationId: "gmic.stylize.ink",
      width: 1,
      height: 1,
      pixels: pixels(1, 1),
    });
    const rejection = expect(request).rejects.toMatchObject({ code: "DISPOSED" });
    bridge.dispose();
    bridge.dispose();
    await rejection;
    expect(port.posted.some(({ message }) => message.type === "dispose")).toBe(true);
    expect(port.closed).toBe(true);
    expect(port.listenerCount()).toBe(0);
    expect(runtime.activeTimerCount).toBe(0);
    expect(bridge.metrics()).toEqual(
      expect.objectContaining({
        state: "disposed",
        pendingRequests: 0,
        inFlightBytes: 0,
        retiredRequestIds: 0,
      }),
    );
  });

  it("routes messageerror through the same crash cleanup path", async () => {
    const { bridge, port } = await connectHarness();
    const request = bridge.execute({
      operationId: "gmic.stylize.ink",
      width: 1,
      height: 1,
      pixels: pixels(1, 1),
    });
    const rejection = expect(request).rejects.toMatchObject({ code: "TRANSPORT_ERROR" });
    port.corruptMessage();
    await rejection;
    expect(bridge.metrics().state).toBe("failed");
  });
});

function nearestRank(values: readonly number[], percentile: number): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(percentile * sorted.length) - 1)] ?? 0;
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

describe("deterministic in-memory protocol overhead", () => {
  it("pins p50/p95/p99 and peak reserved bytes without claiming engine or network time", async () => {
    const runtime = new VirtualRuntime();
    const port = new FakeMessagePort(runtime);
    port.clientLatencyMs = 0.025;
    let id = 0;
    let ordinal = 0;
    const providerDescriptor = descriptor();
    port.onClientMessage = (message) => {
      if (message.type === "client-hello") {
        port.providerPost({
          protocol: EXTERNAL_FILTER_PROTOCOL,
          version: EXTERNAL_FILTER_PROTOCOL_VERSION,
          type: "provider-ready",
          handshakeId: message.handshakeId,
          descriptor: providerDescriptor,
          descriptorFingerprint: computeExternalFilterDescriptorFingerprint(providerDescriptor),
        });
        return;
      }
      if (message.type !== "run") return;
      const delayMs = 0.06 + ((ordinal * 17) % 11) * 0.005;
      ordinal += 1;
      const output = new ArrayBuffer(message.pixels.byteLength);
      port.providerPost(resultEnvelope(message, output), [output], ORIGIN, delayMs);
    };
    const connecting = connectExternalFilterBridge({
      port,
      runtime,
      idFactory: () => `bench-${++id}`,
      allowedOrigins: [ORIGIN],
      allowedProviders: [{ providerId: PROVIDER_ID, licenses: ["CeCILL-2.1"] }],
      quotas: { maxRuntimeMs: 1_000 },
    });
    runtime.runAll();
    const bridge = await connecting;
    const samples: number[] = [];
    for (let sample = 0; sample < 1_000; sample += 1) {
      const request = bridge.execute({
        operationId: "gmic.stylize.ink",
        width: 32,
        height: 32,
        pixels: pixels(32, 32, sample % 256),
      });
      runtime.runAll();
      samples.push((await request).elapsedMs);
    }
    const measurement = {
      harness: "virtual-postmessage-zero-engine-work",
      samples: samples.length,
      inputBytesPerRequest: 4_096,
      outputBytesPerRequest: 4_096,
      p50Ms: rounded(nearestRank(samples, 0.5)),
      p95Ms: rounded(nearestRank(samples, 0.95)),
      p99Ms: rounded(nearestRank(samples, 0.99)),
      peakInFlightBytes: bridge.metrics().peakInFlightBytes,
    };
    expect(measurement).toEqual({
      harness: "virtual-postmessage-zero-engine-work",
      samples: 1_000,
      inputBytesPerRequest: 4_096,
      outputBytesPerRequest: 4_096,
      p50Ms: 0.11,
      p95Ms: 0.135,
      p99Ms: 0.135,
      peakInFlightBytes: 8_192,
    });
    expect(bridge.metrics()).toMatchObject({
      pendingRequests: 0,
      inFlightBytes: 0,
      completedRequests: 1_000,
    });
  });
});

describe("error shape", () => {
  it("retains a stable structured code and JSON-safe details", () => {
    const error = new ExternalFilterBridgeError("QUOTA_EXCEEDED", "too large", {
      requestId: "r-1",
      retryable: false,
      details: { maximum: 10 },
    });
    expect(error).toMatchObject({
      name: "ExternalFilterBridgeError",
      code: "QUOTA_EXCEEDED",
      requestId: "r-1",
      retryable: false,
      details: { maximum: 10 },
    });
  });
});
