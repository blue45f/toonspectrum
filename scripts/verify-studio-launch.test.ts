import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  isExpectedStaticPreviewApiError,
  resolveStudioMobileDockIsolation,
  studioLaunchTouchTargetsReady,
} from "./verify-studio-launch.mts";

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

  it("checks every rendered Brush Studio category target without fixing the product category count", () => {
    expect(studioLaunchTouchTargetsReady([44, 44, 44, 44, 44, 44])).toBe(true);
    expect(studioLaunchTouchTargetsReady([44])).toBe(true);
    expect(studioLaunchTouchTargetsReady([])).toBe(false);
    expect(studioLaunchTouchTargetsReady([44, 43.99])).toBe(false);
    expect(studioLaunchTouchTargetsReady([44, Number.NaN])).toBe(false);
    expect(launchHarness).not.toContain("categoryTabHeights.length === 5");
  });

  it("accepts an above-dock panel or a BODY-portalled modal cover over the inert dock", () => {
    const dockBox = { x: 0, y: 788, width: 390, height: 56 };
    const fullViewport = { x: 0, y: 0, width: 390, height: 844 };

    expect(resolveStudioMobileDockIsolation({
      panelBox: { x: 0, y: 0, width: 390, height: 788 },
      modalBox: null,
      dockBox,
      rootInert: false,
      modalPortalled: false,
    })).toMatchObject({ ok: true, panelEndsBeforeDock: true });

    expect(resolveStudioMobileDockIsolation({
      panelBox: fullViewport,
      modalBox: fullViewport,
      dockBox,
      rootInert: true,
      modalPortalled: true,
    })).toEqual({
      ok: true,
      panelEndsBeforeDock: false,
      modalCoversDock: true,
    });

    for (const contract of [
      { rootInert: false, modalPortalled: true, modalBox: fullViewport },
      { rootInert: true, modalPortalled: false, modalBox: fullViewport },
      { rootInert: true, modalPortalled: true, modalBox: { ...fullViewport, height: 760 } },
    ]) {
      expect(resolveStudioMobileDockIsolation({
        panelBox: fullViewport,
        dockBox,
        ...contract,
      }).ok).toBe(false);
    }

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
