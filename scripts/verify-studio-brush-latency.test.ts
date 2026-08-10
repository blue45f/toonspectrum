import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { expectedStudioBrushLatencyPreviewFailure } from "./verify-studio-brush-latency.mts";

const verifierSource = readFileSync(
  new URL("./verify-studio-brush-latency.mts", import.meta.url),
  "utf8",
);

describe("studio brush latency verifier compositor boundary", () => {
  it("samples the Stage and every sibling live/GPU canvas for input and settle probes", () => {
    expect(
      verifierSource.match(
        /const compositorRoot = root\.parentElement\?\.closest<HTMLElement>\("\.relative"\) \?\? root;/gu,
      ),
    ).toHaveLength(2);
    expect(
      verifierSource.match(
        /compositorRoot\.querySelectorAll<HTMLCanvasElement>\("canvas"\)/gu,
      ),
    ).toHaveLength(2);
  });

  it("does not regress to Konva-only pixel sampling", () => {
    expect(verifierSource).not.toContain(
      'for (const canvas of root.querySelectorAll<HTMLCanvasElement>("canvas"))',
    );
    expect(verifierSource).not.toContain(
      'for (const layer of root.querySelectorAll<HTMLCanvasElement>("canvas"))',
    );
  });

  it("suppresses optional API failures only for its own exact loopback preview", () => {
    expect(verifierSource).toContain('previewUrl.hostname !== "127.0.0.1"');
    expect(verifierSource).toContain("url.origin === previewUrl.origin");
    expect(verifierSource).toContain("OPTIONAL_LOOPBACK_PREVIEW_PATHS.has(url.pathname)");
    expect(verifierSource).toContain('url.search === "?EIO=4&transport=websocket"');
    expect(verifierSource).not.toContain('message.includes("/api/auth/session")');
    const studioUrl = "http://127.0.0.1:5199/studio";
    expect(expectedStudioBrushLatencyPreviewFailure(
      "WebSocket connection to 'ws://127.0.0.1:5199/socket.io/?EIO=4&transport=websocket' failed",
      studioUrl,
    )).toBe(true);
    expect(expectedStudioBrushLatencyPreviewFailure(
      "WebSocket connection to 'ws://127.0.0.1:5199/socket.io/?EIO=3&transport=websocket' failed",
      studioUrl,
    )).toBe(false);
    expect(expectedStudioBrushLatencyPreviewFailure(
      "500 https://toonspectrum.example/api/auth/session",
      "https://toonspectrum.example/studio",
    )).toBe(false);
  });
});
