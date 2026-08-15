import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { isExpectedStaticPreviewApiError } from "./verify-studio-launch.mts";

const STUDIO_URL = "http://127.0.0.1:51758/studio";
const launchHarness = readFileSync(new URL("./verify-studio-launch.mts", import.meta.url), "utf8");
const EXPECTED_HANDSHAKE_CLOSE = [
  "WebSocket connection to ",
  "'ws://127.0.0.1:51758/socket.io/?EIO=4&transport=websocket' failed: ",
  "Connection closed before receiving a handshake response",
].join("");

describe("Studio launch static-preview diagnostics", () => {
  it("requires the shipped live-collaboration host on the Studio work session", () => {
    expect(launchHarness).toContain("data-studio-presence-dock='true'");
    expect(launchHarness).toContain("liveHostMounted");
  });

  it("drives the current unified brush catalogue rather than retired mobile copy", () => {
    expect(launchHarness).toContain('sheet.locator(\'[data-studio-open-brush-library="true"]\')');
    expect(launchHarness).toContain(
      'page.locator(\'[data-studio-brush-catalog-session="true"]\')',
    );
    expect(launchHarness).not.toContain('name: "기본 프리셋 전체 보기"');
    expect(launchHarness).not.toContain('name: "앱 브러시"');
  });

  it("accepts only an above-dock sheet or a full modal cover over the inert dock", () => {
    expect(launchHarness).toContain(
      "const panelDockIsolation = panelEndsBeforeDock || (rootInert && panelCoversDock);",
    );
    expect(launchHarness).toContain("panelBox.x + panelBox.width >= dockBox.x + dockBox.width - 1");
    expect(launchHarness).toContain("panelBox.y + panelBox.height >= dockBox.y + dockBox.height - 1");
    expect(launchHarness).not.toContain("noPanelDockOverlap");
  });

  it("allows the exact active-preview Socket.IO handshake close", () => {
    expect(
      isExpectedStaticPreviewApiError(EXPECTED_HANDSHAKE_CLOSE, STUDIO_URL),
    ).toBe(true);
    expect(
      isExpectedStaticPreviewApiError(
        `${EXPECTED_HANDSHAKE_CLOSE} @ http://127.0.0.1:51758/assets/app-AbC123.js`,
        STUDIO_URL,
      ),
    ).toBe(true);
  });

  it.each([
    [
      "another preview port",
      EXPECTED_HANDSHAKE_CLOSE.replace(":51758/socket.io", ":51759/socket.io"),
      STUDIO_URL,
    ],
    [
      "another hostname",
      EXPECTED_HANDSHAKE_CLOSE.replace("127.0.0.1", "localhost"),
      STUDIO_URL,
    ],
    [
      "another WebSocket route",
      EXPECTED_HANDSHAKE_CLOSE.replace("/socket.io/", "/studio-live/"),
      STUDIO_URL,
    ],
    [
      "another transport",
      EXPECTED_HANDSHAKE_CLOSE.replace("transport=websocket", "transport=polling"),
      STUDIO_URL,
    ],
    [
      "another failure reason",
      EXPECTED_HANDSHAKE_CLOSE.replace(
        "Connection closed before receiving a handshake response",
        "net::ERR_CONNECTION_REFUSED",
      ),
      STUDIO_URL,
    ],
    [
      "unexpected trailing text",
      `${EXPECTED_HANDSHAKE_CLOSE} extra`,
      STUDIO_URL,
    ],
    [
      "wrong source origin",
      `${EXPECTED_HANDSHAKE_CLOSE} @ http://127.0.0.1:51759/assets/app.js`,
      STUDIO_URL,
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
    ["malformed preview URL", EXPECTED_HANDSHAKE_CLOSE, "not-a-url"],
  ])("rejects %s", (_label, message, studioUrl) => {
    expect(isExpectedStaticPreviewApiError(message, studioUrl)).toBe(false);
  });

  it("allows only optional API failures from the active preview origin", () => {
    expect(
      isExpectedStaticPreviewApiError(
        "502 http://127.0.0.1:51758/api/auth/session",
        STUDIO_URL,
      ),
    ).toBe(true);
    expect(
      isExpectedStaticPreviewApiError(
        "500 http://127.0.0.1:51758/api/studio-ai/status",
        STUDIO_URL,
      ),
    ).toBe(true);
    expect(
      isExpectedStaticPreviewApiError(
        "500 http://127.0.0.1:51759/api/studio-ai/status",
        STUDIO_URL,
      ),
    ).toBe(false);
    expect(
      isExpectedStaticPreviewApiError(
        "500 http://127.0.0.1:51758/api/unexpected",
        STUDIO_URL,
      ),
    ).toBe(false);
  });
});
