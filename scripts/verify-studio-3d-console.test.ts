import { describe, expect, it } from "vitest";

import { isExpectedStaticPreviewSocketIoHandshakeClose } from "./verify-studio-3d-console.mts";

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
