import { readFileSync } from "node:fs";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  armInputProbe,
  armSettleProbe,
  expectedStudioBrushLatencyPreviewFailure,
  studioBrushCompetitiveLongStrokeRequested,
} from "./verify-studio-brush-latency.mts";

import type { Page } from "playwright";

afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(globalThis, "__studioBrushLatencyProbe");
  Reflect.deleteProperty(globalThis, "__studioBrushSettleProbe");
});

describe("brush latency probes with reclaimed canvas layers", () => {
  it.each(["input", "settle"] as const)("samples live pixels with the %s probe while a sibling has no bitmap", async (probe) => {
    const rect = { left: 0, top: 0, width: 400, height: 300 };
    const layers = [
      { width: 0, height: 300, getBoundingClientRect: () => rect },
      { width: 400, height: 0, getBoundingClientRect: () => rect },
      { width: 400, height: 300, getBoundingClientRect: () => rect },
    ];
    const sampled: unknown[] = [];
    const context = {
      clearRect: vi.fn(),
      drawImage: (canvas: { width: number; height: number }) => {
        if (!canvas.width || !canvas.height) throw new Error("InvalidStateError: empty canvas");
        sampled.push(canvas);
      },
      getImageData: () => ({ data: new Uint8ClampedArray([12, 34, 56, 255]) }),
    };
    const root = {
      parentElement: { closest: () => ({ querySelectorAll: () => layers }) },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal("document", { querySelector: () => root });
    vi.stubGlobal("OffscreenCanvas", class {
      getContext() { return context; }
    });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const page = {
      evaluate: async (callback: (input: unknown) => unknown, input: unknown) => callback(input),
    } as unknown as Page;

    if (probe === "input") await armInputProbe(page, "pointerdown", 0, { x: 100, y: 100 }, 48);
    else await armSettleProbe(page, { x: 20, y: 20, width: 80, height: 80 });

    expect(sampled).toEqual([layers[2]]);
    expect(root.addEventListener).toHaveBeenCalledOnce();
    expect(requestAnimationFrame).toHaveBeenCalledOnce();
  });
});

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

  it("allows an exact representative subset for focused performance regressions", () => {
    expect(verifierSource).toContain("process.env.TOONSPECTRUM_BRUSH_LATENCY_IDS");
    expect(verifierSource).toContain("STUDIO_BRUSH_LATENCY_IDS.filter");
    expect(verifierSource).toContain("requestedIds.length === 0");
    expect(verifierSource).toContain(
      "TOONSPECTRUM_BRUSH_LATENCY_IDS contains an unknown or duplicate representative id",
    );
  });

  it("keeps the multi-hour competitive matrix behind one explicit CLI flag", () => {
    expect(studioBrushCompetitiveLongStrokeRequested([])).toBe(false);
    expect(studioBrushCompetitiveLongStrokeRequested(["--competitive-long-stroke"]))
      .toBe(true);
    expect(studioBrushCompetitiveLongStrokeRequested(["--competitive-long-strokes"]))
      .toBe(false);
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
