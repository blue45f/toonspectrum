import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  STUDIO_BG3D_BEAUTY_RGBA8_PROFILE,
  STUDIO_BG3D_DEPTH_FLOAT32_PROFILE,
  STUDIO_BG3D_NORMAL_PROFILE,
  STUDIO_BG3D_STABLE_ID_PROFILE,
} from "../src/domains/creator/studio-bg3d-artifact-capture-v2";

import {
  BABYLON_ALIGNED_RASTER_SMOKE_SIZE,
  BABYLON_STABLE_ID_PARITY_HEIGHT,
  BABYLON_STABLE_ID_PARITY_WIDTHS,
  createBabylonAlignedRasterSmokeRequest,
  createBabylonStableIdParityRequests,
  classifyStudio3dWebGpuRetryableFailure,
  isExpectedStaticPreviewSocketIoHandshakeClose,
  runStudio3dWebGpuConformanceWithFreshBrowserRetry,
  STUDIO_3D_WEBGPU_MAX_BROWSER_ATTEMPTS,
  STUDIO_3D_WEBGPU_SWIFTSHADER_LAUNCH_ARGS,
} from "./verify-studio-3d-console.mts";

const PREVIEW_URL = "http://127.0.0.1:51758/studio";
const EXPECTED_HANDSHAKE_CLOSE = [
  "WebSocket connection to ",
  "'ws://127.0.0.1:51758/socket.io/?EIO=4&transport=websocket' failed: ",
  "Connection closed before receiving a handshake response",
].join("");
const verifierSource = readFileSync(
  new URL("./verify-studio-3d-console.mts", import.meta.url),
  "utf8",
);
const magicProductionProofSource = readFileSync(
  new URL(
    "../src/domains/creator/studio-bg3d-magic-production-proof.ts",
    import.meta.url,
  ),
  "utf8",
);

function sourceBetween(startMarker: string, endMarker: string): string {
  const start = verifierSource.indexOf(startMarker);
  const end = verifierSource.indexOf(endMarker, start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return verifierSource.slice(start, end);
}

describe("3D static-preview Socket.IO diagnostics", () => {
  it("allows only the exact handshake close from the active 127.0.0.1 preview", () => {
    expect(
      isExpectedStaticPreviewSocketIoHandshakeClose(
        EXPECTED_HANDSHAKE_CLOSE,
        PREVIEW_URL,
      ),
    ).toBe(true);
  });

  it.each([
    [
      "another preview port",
      EXPECTED_HANDSHAKE_CLOSE.replace(":51758/socket.io", ":51759/socket.io"),
      PREVIEW_URL,
    ],
    [
      "localhost hostname",
      EXPECTED_HANDSHAKE_CLOSE.replace("127.0.0.1", "localhost"),
      PREVIEW_URL,
    ],
    [
      "another WebSocket route",
      EXPECTED_HANDSHAKE_CLOSE.replace("/socket.io/", "/studio-live/"),
      PREVIEW_URL,
    ],
    [
      "another Socket.IO transport",
      EXPECTED_HANDSHAKE_CLOSE.replace("transport=websocket", "transport=polling"),
      PREVIEW_URL,
    ],
    [
      "another failure reason",
      EXPECTED_HANDSHAKE_CLOSE.replace(
        "Connection closed before receiving a handshake response",
        "net::ERR_CONNECTION_REFUSED",
      ),
      PREVIEW_URL,
    ],
    [
      "non-loopback preview",
      EXPECTED_HANDSHAKE_CLOSE,
      "http://192.168.0.8:51758/studio",
    ],
    [
      "secure preview",
      EXPECTED_HANDSHAKE_CLOSE,
      "https://127.0.0.1:51758/studio",
    ],
    [
      "malformed preview URL",
      EXPECTED_HANDSHAKE_CLOSE,
      "not-a-url",
    ],
  ])("rejects %s", (_label, message, studioUrl) => {
    expect(
      isExpectedStaticPreviewSocketIoHandshakeClose(message, studioUrl),
    ).toBe(false);
  });
});

describe("3D WebGPU conformance browser boundary", () => {
  it("pins both Dawn WebGPU and ANGLE WebGL to SwiftShader", () => {
    expect(Object.isFrozen(STUDIO_3D_WEBGPU_SWIFTSHADER_LAUNCH_ARGS)).toBe(true);
    expect(STUDIO_3D_WEBGPU_SWIFTSHADER_LAUNCH_ARGS).toEqual([
      "--no-sandbox",
      "--enable-unsafe-webgpu",
      "--use-webgpu-adapter=swiftshader",
      "--use-gpu-in-tests",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ]);
  });

  it("keeps unaligned parity captures limited to compact stable-ID planes", () => {
    const requests = createBabylonStableIdParityRequests();

    expect(Object.isFrozen(requests)).toBe(true);
    expect(requests.map(({ width }) => width)).toEqual([
      ...BABYLON_STABLE_ID_PARITY_WIDTHS,
    ]);
    expect(requests.every(({ width }) => width % 64 !== 0)).toBe(true);
    for (const request of requests) {
      expect(request.height).toBe(BABYLON_STABLE_ID_PARITY_HEIGHT);
      expect(request.artifacts).toEqual([
        { kind: "object-id", profile: STUDIO_BG3D_STABLE_ID_PROFILE },
        { kind: "material-id", profile: STUDIO_BG3D_STABLE_ID_PROFILE },
      ]);
    }
  });

  it("keeps beauty, depth, and normal smoke capture on a row-aligned target", () => {
    const request = createBabylonAlignedRasterSmokeRequest();

    expect(Object.isFrozen(request)).toBe(true);
    expect(request.width).toBe(BABYLON_ALIGNED_RASTER_SMOKE_SIZE);
    expect(request.height).toBe(BABYLON_ALIGNED_RASTER_SMOKE_SIZE);
    expect(request.width % 64).toBe(0);
    expect(request.artifacts).toEqual([
      { kind: "beauty", profile: STUDIO_BG3D_BEAUTY_RGBA8_PROFILE },
      { kind: "depth", profile: STUDIO_BG3D_DEPTH_FLOAT32_PROFILE },
      { kind: "normal", profile: STUDIO_BG3D_NORMAL_PROFILE },
    ]);
  });

  it.each([
    [
      "structured context-loss code",
      Object.assign(new Error("capture stopped"), { code: "context-lost" }),
      "context-or-device-lost",
    ],
    [
      "serialized specialist context-loss code",
      new Error("StudioBg3dBabylonSpecialistError[context-lost]: context unavailable"),
      "context-or-device-lost",
    ],
    [
      "explicit WebGPU device loss",
      new Error("WebGPU device was lost."),
      "context-or-device-lost",
    ],
    [
      "exact Chromium external-instance readback abort",
      new DOMException(
        "Failed to execute 'mapAsync' on 'GPUBuffer': " +
          "A valid external Instance reference no longer exists.",
        "AbortError",
      ),
      "external-instance-map-readback",
    ],
    [
      "serialized Chromium external-instance readback abort",
      new Error(
        "page.evaluate: AbortError: Failed to execute 'mapAsync' on 'GPUBuffer': " +
          "A valid external Instance reference no longer exists.",
      ),
      "external-instance-map-readback",
    ],
  ] as const)("classifies only retryable GPU lifetime failure: %s", (_label, error, reason) => {
    expect(classifyStudio3dWebGpuRetryableFailure(error)).toBe(reason);
  });

  it.each([
    ["semantic parity", new Error("WebGPU/WebGL2 object-id spatial parity failed")],
    ["timeout", new Error("TimeoutError: aligned raster exceeded 60000ms")],
    [
      "generic map abort",
      new DOMException("Failed to execute 'mapAsync': operation aborted.", "AbortError"),
    ],
    [
      "external-instance without readback abort",
      new Error("A valid external Instance reference no longer exists."),
    ],
    [
      "assertion mentioning diagnostics",
      new Error("context lost diagnostics should remain zero"),
    ],
    [
      "timeout followed by disposal map abort",
      new Error("WebGPU capture timed out after 60000ms", {
        cause: new DOMException(
          "Failed to execute 'mapAsync' on 'GPUBuffer': " +
            "A valid external Instance reference no longer exists.",
          "AbortError",
        ),
      }),
    ],
  ] as const)("hard-fails non-lifetime verifier error: %s", (_label, error) => {
    expect(classifyStudio3dWebGpuRetryableFailure(error)).toBeNull();
  });

  it("restarts exactly one fresh attempt after a classified loss", async () => {
    const attempts: number[] = [];
    const retryReasons: string[] = [];

    await runStudio3dWebGpuConformanceWithFreshBrowserRetry(
      async (attempt) => {
        attempts.push(attempt);
        if (attempt === 1) {
          throw Object.assign(new Error("lost during map readback"), {
            code: "device-lost",
          });
        }
      },
      ({ reason }) => {
        retryReasons.push(reason);
      },
    );

    expect(STUDIO_3D_WEBGPU_MAX_BROWSER_ATTEMPTS).toBe(2);
    expect(attempts).toEqual([1, 2]);
    expect(retryReasons).toEqual(["context-or-device-lost"]);
  });

  it("does not retry semantic, parity, or timeout failures", async () => {
    const failure = new Error("WebGPU/WebGL2 normal spatial parity failed");
    const attempts: number[] = [];

    await expect(
      runStudio3dWebGpuConformanceWithFreshBrowserRetry(async (attempt) => {
        attempts.push(attempt);
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(attempts).toEqual([1]);
  });

  it("hard-fails the second classified loss without a third attempt", async () => {
    const failure = Object.assign(new Error("WebGPU context was lost."), {
      code: "context-lost",
    });
    const attempts: number[] = [];
    const retries: number[] = [];

    await expect(
      runStudio3dWebGpuConformanceWithFreshBrowserRetry(
        async (attempt) => {
          attempts.push(attempt);
          throw failure;
        },
        ({ attempt }) => {
          retries.push(attempt);
        },
      ),
    ).rejects.toBe(failure);
    expect(attempts).toEqual([1, 2]);
    expect(retries).toEqual([1]);
  });

  it("closes the exclusive WebGPU browser before launching normal Chromium", () => {
    const webGpuAttempt = sourceBetween(
      "async function runStudio3dWebGpuConformanceBrowserAttempt(",
      "async function main(): Promise<void>",
    );
    const main = sourceBetween(
      "async function main(): Promise<void>",
      "if (process.argv[1]",
    );
    const webGpuProof = main.indexOf(
      "await runStudio3dWebGpuConformanceWithFreshBrowserRetry(",
    );
    const normalBrowser = main.indexOf(
      'browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });',
    );

    expect(webGpuAttempt).toContain("await webGpuContext.close().catch(() => undefined)");
    expect(webGpuAttempt).toContain("await webGpuBrowser.close().catch(() => undefined)");
    expect(webGpuProof).toBeGreaterThanOrEqual(0);
    expect(normalBrowser).toBeGreaterThan(webGpuProof);
  });

  it("explicitly releases both temporary WebGL2 capability probes", () => {
    expect(
      verifierSource.match(/getExtension\("WEBGL_lose_context"\)\?\.loseContext\(\)/gu),
    ).toHaveLength(2);
  });
});

describe("3D Magic production-preview product boundary", () => {
  it("re-exports and exercises the shipped registry coordinator instead of a runtime shortcut", () => {
    const alignmentProof = sourceBetween(
      "async function runMagicLayerProductionAlignmentProof(",
      "async function main(): Promise<void>",
    );
    const snapshot = alignmentProof.indexOf(
      "productionProofEntry.createStudioBg3dRuntimeSnapshot(",
    );
    const capture = alignmentProof.indexOf(
      "productionProofEntry.captureStudioBg3dMagicObjectIds({",
    );

    expect(magicProductionProofSource).toContain(
      "captureStudioBg3dMagicObjectIds,",
    );
    expect(magicProductionProofSource).toContain(
      'from "./studio-bg3d-magic-object-id-capture"',
    );
    expect(magicProductionProofSource).toContain(
      "createStudioBg3dRuntimeSnapshot,",
    );
    expect(magicProductionProofSource).not.toContain(
      "function captureStudioBg3dMagicObjectIds(",
    );
    expect(snapshot).toBeGreaterThanOrEqual(0);
    expect(capture).toBeGreaterThan(snapshot);
    expect(alignmentProof).toContain('backends: ["webgpu", "webgl2"]');
    expect(alignmentProof).toContain(
      "createRuntime: ({ backend, canvas, capabilities, settings }) =>",
    );
    expect(alignmentProof).toContain("capabilities,");
    expect(alignmentProof).toContain('objectIdCapture.backend !== "webgpu"');
    expect(alignmentProof).toContain("objectIdCapture.fallbackUsed");
    expect(alignmentProof).toContain(
      'objectIdCapture.attempts[0]?.outcome !== "succeeded"',
    );
    expect(alignmentProof).not.toContain(".runIsolated(");
    expect(alignmentProof).not.toContain('kind: "artifact-capture-v2"');
  });
});
