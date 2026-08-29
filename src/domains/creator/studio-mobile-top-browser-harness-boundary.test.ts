import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const harness = readFileSync(
  resolve(process.cwd(), "scripts/verify-studio-mobile-top.mts"),
  "utf8",
);

describe("Studio mobile top browser harness boundary", () => {
  it("honors the dedicated temporary artifact directory before the legacy alias", () => {
    const dedicated = harness.indexOf(
      "process.env.TOONSPECTRUM_MOBILE_TOP_VERIFY_DIR",
    );
    const legacy = harness.indexOf("process.env.TOONSPECTRUM_VERIFY_DIR");
    const fallback = harness.indexOf(
      'join(tmpdir(), "toonspectrum-studio-mobile-top")',
    );

    expect(dedicated).toBeGreaterThanOrEqual(0);
    expect(legacy).toBeGreaterThan(dedicated);
    expect(fallback).toBeGreaterThan(legacy);
  });

  it("allows only the exact current local preview Socket.IO handshake shutdown", () => {
    expect(harness).toContain('previewUrl.hostname !== "127.0.0.1"');
    expect(harness).toContain("previewUrl.port.length === 0");
    expect(harness).toContain(
      "`ws://127.0.0.1:${previewUrl.port}/socket.io/?EIO=4&transport=websocket`",
    );
    expect(harness).toContain(
      '"Connection closed before receiving a handshake response"',
    );
    expect(harness).toContain(
      '"Error during WebSocket handshake: Unexpected response code: 400"',
    );
    expect(harness).toContain("expectedMessages.includes");
    expect(harness).toContain("sourceUrl.origin === previewUrl.origin");
    expect(harness).toContain(
      "/^\\/assets\\/[A-Za-z0-9._-]+\\.js$/u.test(sourceUrl.pathname)",
    );
    expect(harness).not.toContain(
      `message.includes("WebSocket connection to 'ws://127.0.0.1:")`,
    );
  });

  it("measures the canvas-sticky presence dock as top-chrome, not as canvas content", () => {
    // The immersive pill (absolute, shell-owned) and the presence dock (sticky, viewport-owned)
    // cannot see each other's width. Leaving the dock out of the container set is what let it
    // cover the publish CTA at 320/360px while only an anonymous hit-test loss was reported.
    expect(harness).toContain(
      'const presenceDock = document.querySelector(\'[data-studio-presence-dock="true"]\');',
    );
    expect(harness).toContain(
      "for (const candidate of [siteHeader, menubar, statusRail, toolBelt, presenceDock]) {",
    );
  });

  it("does not suppress the retired visit ping from browser health failures", () => {
    expect(harness).not.toContain("/api/v1/apps/toonspectrum/visits/ping");
    expect(harness).toContain('"/api/kmas/merge-on-access"');
    expect(harness).toContain('"/api/studio-ai/status"');
  });

  it("measures the mobile dock as an overlay while preserving scroll-safe canvas content", () => {
    expect(harness).toContain("canvasViewportPaddingBottom");
    expect(harness).toContain("canvasViewportBottom < metrics.viewportHeight - 1");
    expect(harness).toContain(
      "mobile dock still shrinks the canvas instead of overlaying its scrollport",
    );
    expect(harness).toContain("metrics.canvasViewportPaddingBottom < metrics.dockHeight - 1");
    expect(harness).toContain("dockSmallTargets");
    expect(harness).toContain("small dock target:");
    expect(harness).toContain("expanded mobile dock changes the canvas viewport height");
    expect(harness).toContain(
      "expanded mobile dock is not covered by canvas scroll-safe padding",
    );
    expect(harness).toContain("small expanded dock target:");
  });
});
