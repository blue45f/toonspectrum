import { afterEach, describe, expect, it, vi } from "vitest";

import {
  clearSkiaGraphiteArtifact,
  probeSkiaGraphiteAdoption,
  registerSkiaGraphiteArtifact,
  SKIA_GRAPHITE_PROVIDER_ID,
} from "../graphite-probe";

const ARTIFACT = {
  loadCanvasKit: async () => ({}),
  sourcePin: { version: "m0.0.0-test", commit: "0".repeat(40) },
};

/** A `navigator.gpu` double whose adapter answer the test controls. */
function gpuWith(adapter: unknown | (() => Promise<unknown>)) {
  return {
    requestAdapter: typeof adapter === "function"
      ? (adapter as () => Promise<unknown>)
      : vi.fn(async () => adapter),
  };
}

afterEach(() => {
  clearSkiaGraphiteArtifact();
});

describe("probeSkiaGraphiteAdoption", () => {
  it("refuses without WebGPU, naming the precondition", async () => {
    const probe = await probeSkiaGraphiteAdoption({ gpu: undefined });
    expect(probe.status).toBe("no-webgpu");
    if (probe.status === "no-webgpu") expect(probe.reason).toContain("navigator.gpu");
  });

  it("refuses without a registered Graphite build and names the upstream gap honestly", async () => {
    const probe = await probeSkiaGraphiteAdoption({ gpu: gpuWith({}) });
    expect(probe.status).toBe("missing-artifact");
    if (probe.status === "missing-artifact") expect(probe.reason).toContain("Ganesh");
  });

  it("refuses when the device exposes no usable adapter, rather than deferring the failure", async () => {
    registerSkiaGraphiteArtifact(ARTIFACT);

    // Blocklisted driver / software-only configuration: gpu exists, adapter does not.
    const nullAdapter = await probeSkiaGraphiteAdoption({ gpu: gpuWith(null) });
    expect(nullAdapter.status).toBe("no-adapter");

    // A rejecting requestAdapter is the same verdict, not an unhandled rejection.
    const rejected = await probeSkiaGraphiteAdoption({
      gpu: gpuWith(() => Promise.reject(new Error("adapter request failed"))),
    });
    expect(rejected.status).toBe("no-adapter");

    // A realm without requestAdapter at all must not be admitted either.
    const noMethod = await probeSkiaGraphiteAdoption({ gpu: {} });
    expect(noMethod.status).toBe("no-adapter");
  });

  it("bounds a requestAdapter that never settles instead of parking the caller", async () => {
    registerSkiaGraphiteArtifact(ARTIFACT);

    const probe = await probeSkiaGraphiteAdoption({
      gpu: gpuWith(() => new Promise<unknown>(() => undefined)),
      timeoutMs: 5,
    });

    expect(probe.status).toBe("adapter-timeout");
    if (probe.status === "adapter-timeout") expect(probe.reason).toContain("5ms");
  });

  it("honours an abort signal, including one already aborted", async () => {
    registerSkiaGraphiteArtifact(ARTIFACT);
    const listeners: Array<() => void> = [];

    const pending = probeSkiaGraphiteAdoption({
      gpu: gpuWith(() => new Promise<unknown>(() => undefined)),
      timeoutMs: 60_000,
      signal: {
        aborted: false,
        addEventListener: (_type, listener) => listeners.push(listener),
      },
    });
    listeners.forEach((listener) => listener());
    expect((await pending).status).toBe("no-adapter");

    const preAborted = await probeSkiaGraphiteAdoption({
      gpu: gpuWith(() => new Promise<unknown>(() => undefined)),
      timeoutMs: 60_000,
      signal: { aborted: true, addEventListener: () => undefined },
    });
    expect(preAborted.status).toBe("no-adapter");
  });

  it("never reports adoptable with a cleared artifact, even if it clears mid-flight", async () => {
    registerSkiaGraphiteArtifact(ARTIFACT);

    const probe = await probeSkiaGraphiteAdoption({
      gpu: gpuWith(async () => {
        // What a teardown racing the adapter request looks like.
        clearSkiaGraphiteArtifact();
        return { name: "late-adapter" };
      }),
    });

    // The union promises callers a non-null artifact on `adoptable`; the snapshot keeps that true.
    expect(probe.status).toBe("adoptable");
    if (probe.status === "adoptable") expect(probe.artifact).toBe(ARTIFACT);
  });

  it("detaches its abort listener once the probe settles", async () => {
    registerSkiaGraphiteArtifact(ARTIFACT);
    const added: Array<() => void> = [];
    const removed: Array<() => void> = [];

    await probeSkiaGraphiteAdoption({
      gpu: gpuWith({ name: "adapter" }),
      signal: {
        aborted: false,
        addEventListener: (_type, listener) => added.push(listener),
        removeEventListener: (_type, listener) => removed.push(listener),
      },
    });

    // `{ once: true }` alone would leak one resolver closure per probe on a long-lived signal.
    expect(added).toHaveLength(1);
    expect(removed).toEqual(added);
  });

  it("flips to adoptable once an artifact and a real adapter are both present", async () => {
    registerSkiaGraphiteArtifact(ARTIFACT);

    const probe = await probeSkiaGraphiteAdoption({ gpu: gpuWith({ name: "test-adapter" }) });
    expect(probe.status).toBe("adoptable");
    if (probe.status === "adoptable") expect(probe.artifact).toBe(ARTIFACT);

    clearSkiaGraphiteArtifact();
    expect((await probeSkiaGraphiteAdoption({ gpu: gpuWith({}) })).status).toBe(
      "missing-artifact",
    );
  });

  it("pins the challenger provider id the tournament and fallback chain use", () => {
    expect(SKIA_GRAPHITE_PROVIDER_ID).toBe("skia-graphite-webgpu");
  });
});
