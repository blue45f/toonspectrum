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
  isExpectedStaticPreviewSocketIoHandshakeClose,
  STUDIO_3D_WEBGPU_SWIFTSHADER_LAUNCH_ARGS,
} from "./verify-studio-3d-console.mts";

const PREVIEW_URL = "http://127.0.0.1:51758/studio";
const EXPECTED_HANDSHAKE_CLOSE = [
  "WebSocket connection to ",
  "'ws://127.0.0.1:51758/socket.io/?EIO=4&transport=websocket' failed: ",
  "Connection closed before receiving a handshake response",
].join("");

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
});
