import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { Browser, Page } from "playwright";
import type { ViteDevServer } from "vite";

const ENABLED = process.env.THORVG_BROWSER_PROBE === "1";
const describeProbe = ENABLED ? describe : describe.skip;


const LAUNCH_CANDIDATES: Array<{
  readonly label: string;
  readonly options: { channel?: "chrome"; headless: boolean; args: string[] };
}> = [
  {
    label: "playwright chromium headless shell (metal, unsafe-webgpu)",
    options: {
      headless: true,
      args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--use-angle=metal"],
    },
  },
  {
    label: "system chrome headless (metal, unsafe-webgpu)",
    options: {
      channel: "chrome",
      headless: true,
      args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU", "--use-angle=metal"],
    },
  },
  {
    label: "system chrome headed (metal, unsafe-webgpu)",
    options: {
      channel: "chrome",
      headless: false,
      args: ["--enable-unsafe-webgpu", "--use-angle=metal"],
    },
  },
];

const SVG = `<svg width="96" height="96" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g"><stop stop-color="#ff0044"/><stop offset="1" stop-color="#0066ff"/></linearGradient>
    <filter id="f"><feGaussianBlur stdDeviation="2"/></filter>
  </defs>
  <rect x="12" y="12" width="72" height="72" rx="12" fill="url(#g)" filter="url(#f)"/>
</svg>`;

describeProbe("ThorVG selected-provider real-browser lifecycle", () => {
  let server: ViteDevServer;
  let browser: Browser | undefined;
  let page: Page;
  let baseUrl = "";
  const browserErrors: string[] = [];

  beforeAll(async () => {
    const { createServer } = await import("vite");
    server = await createServer({
      configFile: false,
      logLevel: "silent",
      server: { host: "127.0.0.1", port: 0, strictPort: false },
      plugins: [{
        name: "thorvg-probe-page",
        configureServer(vite) {
          vite.middlewares.use("/favicon.ico", (_request, response) => {
            response.writeHead(204);
            response.end();
          });
          vite.middlewares.use("/__thorvg_probe__", (_request, response) => {
            response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
            response.end("<!doctype html><html><body></body></html>");
          });
        },
      }],
    });
    await server.listen();
    baseUrl = server.resolvedUrls?.local[0]?.replace(/\/$/u, "") ?? "";
    if (!baseUrl) throw new Error("ThorVG probe Vite server has no local URL");

    const { chromium } = await import("playwright");
    const launchErrors: string[] = [];
    for (const candidate of LAUNCH_CANDIDATES) {
      try {
        const attempt = await chromium.launch(candidate.options);
        const attemptPage = await attempt.newPage();
        attemptPage.on("console", (message) => {
          if (message.type() === "error") browserErrors.push(message.text());
        });
        attemptPage.on("pageerror", (error) => browserErrors.push(error.message));
        await attemptPage.goto(`${baseUrl}/__thorvg_probe__`);
        browser = attempt;
        page = attemptPage;
        break;
      } catch (error) {
        launchErrors.push(
          `${candidate.label}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
    if (!browser) {
      throw new Error(`ThorVG browser launch failed: ${launchErrors.join(" | ")}`);
    }
  }, 120_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it("renders and releases 32 WebGPU surfaces without readback or leaked runtime refs", async () => {
    const result = await page.evaluate(async ({ moduleUrl, svg }) => {
      const importer = new Function("url", "return import(url)") as (
        url: string,
      ) => Promise<typeof import("./runtime")>;
      const runtime = await importer(moduleUrl);
      const dataUrlLengths: number[] = [];
      for (let index = 0; index < 32; index += 1) {
        const canvas = document.createElement("canvas");
        document.body.append(canvas);
        const surface = await runtime.mountThorvgAsset({
          canvas,
          kind: "svg",
          source: svg,
          width: 96,
          height: 96,
          backend: "wg",
        });
        await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
        dataUrlLengths.push(canvas.toDataURL("image/png").length);
        const receipt = surface.receipt;
        if (
          receipt.selectedProviderId !== receipt.attemptedProviderId
          || receipt.attemptedProviderId !== receipt.activeProviderId
          || receipt.cpuReadbackBytes !== 0
        ) {
          throw new Error(`invalid provider receipt: ${JSON.stringify(receipt)}`);
        }
        surface.destroy();
        canvas.remove();
        const snapshot = runtime.thorvgRuntimeSnapshot();
        if (snapshot.backend !== null || snapshot.references !== 0) {
          throw new Error(`runtime leak after cycle ${index}: ${JSON.stringify(snapshot)}`);
        }
      }
      return {
        minimumDataUrlLength: Math.min(...dataUrlLengths),
        maximumDataUrlLength: Math.max(...dataUrlLengths),
        finalSnapshot: runtime.thorvgRuntimeSnapshot(),
      };
    }, {
      moduleUrl: `${baseUrl}/packages/studio-engine-thorvg/src/runtime.ts`,
      svg: SVG,
    });

    expect(result.minimumDataUrlLength).toBeGreaterThan(300);
    expect(result.maximumDataUrlLength).toBe(result.minimumDataUrlLength);
    expect(result.finalSnapshot).toEqual({ backend: null, references: 0 });
    expect(browserErrors).toEqual([]);
  }, 120_000);

  it("shares one backend across simultaneous surfaces and terminates only after the final owner", async () => {
    const snapshots = await page.evaluate(async ({ moduleUrl, svg }) => {
      const importer = new Function("url", "return import(url)") as (
        url: string,
      ) => Promise<typeof import("./runtime")>;
      const runtime = await importer(moduleUrl);
      const firstCanvas = document.createElement("canvas");
      const secondCanvas = document.createElement("canvas");
      document.body.append(firstCanvas, secondCanvas);
      const first = await runtime.mountThorvgAsset({
        canvas: firstCanvas, kind: "svg", source: svg, width: 96, height: 96, backend: "wg",
      });
      const second = await runtime.mountThorvgAsset({
        canvas: secondCanvas, kind: "svg", source: svg, width: 96, height: 96, backend: "wg",
      });
      const both = runtime.thorvgRuntimeSnapshot();
      first.destroy();
      const one = runtime.thorvgRuntimeSnapshot();
      second.destroy();
      const none = runtime.thorvgRuntimeSnapshot();
      firstCanvas.remove();
      secondCanvas.remove();
      return { both, one, none };
    }, {
      moduleUrl: `${baseUrl}/packages/studio-engine-thorvg/src/runtime.ts`,
      svg: SVG,
    });

    expect(snapshots).toEqual({
      both: { backend: "wg", references: 2 },
      one: { backend: "wg", references: 1 },
      none: { backend: null, references: 0 },
    });
    expect(browserErrors).toEqual([]);
  }, 120_000);
});
