import { mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";

import { chromium, type FullConfig } from "@playwright/test";

/**
 * Diagnose the browser independently of the editor's capability policy. In particular, a 3s
 * policy timeout must not be described as a proven absence of navigator.gpu or a GPU adapter.
 * This does not supply a fake adapter, change application policy, or select a fallback renderer.
 */
export default async function captureBg3dAdapterStartup(config: FullConfig): Promise<void> {
  const directory = path.resolve("test-results/bg3d-adapter");
  mkdirSync(directory, { recursive: true });
  const server = createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>BG3D adapter capability probe</title>");
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No loopback diagnostic address");
  const settings = config.projects[0]?.use;
  const browser = await chromium.launch({
    ...settings?.launchOptions,
    channel: settings?.channel,
    headless: settings?.headless ?? false,
  });
  const deadline = setTimeout(() => { void browser.close(); }, 45_000);
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/`);
    const adapter = await page.evaluate(async () => {
      interface Adapter {
        readonly info?: { vendor?: string; architecture?: string; description?: string };
        readonly limits?: {
          maxBufferSize?: number;
          maxStorageBufferBindingSize?: number;
          maxComputeWorkgroupSizeX?: number;
        };
        readonly features?: Iterable<string>;
      }
      const gpu = (navigator as Navigator & {
        gpu?: { requestAdapter(options?: { powerPreference?: "high-performance" }): Promise<Adapter | null> };
      }).gpu;
      const started = performance.now();
      if (!gpu) return { secureContext: isSecureContext, api: false, available: false };
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          gpu.requestAdapter({ powerPreference: "high-performance" }),
          new Promise<"timeout">((resolve) => { timer = setTimeout(() => resolve("timeout"), 15_000); }),
        ]);
        const elapsedMs = Math.round(performance.now() - started);
        if (result === "timeout" || !result) {
          return { secureContext: isSecureContext, api: true, available: false, elapsedMs, reason: result ?? "null-adapter" };
        }
        return {
          secureContext: isSecureContext,
          api: true,
          available: true,
          elapsedMs,
          info: {
            vendor: result.info?.vendor,
            architecture: result.info?.architecture,
            description: result.info?.description,
          },
          limits: {
            maxBufferSize: result.limits?.maxBufferSize,
            maxStorageBufferBindingSize: result.limits?.maxStorageBufferBindingSize,
            maxComputeWorkgroupSizeX: result.limits?.maxComputeWorkgroupSizeX,
          },
          features: Array.from(result.features ?? []),
        };
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    });
    const session = await browser.newBrowserCDPSession();
    const system = await session.send("SystemInfo.getInfo");
    const evidence = { browser: browser.version(), launchOptions: settings?.launchOptions, adapter, system };
    writeFileSync(path.join(directory, "startup.json"), `${JSON.stringify(evidence, null, 2)}\n`);
    console.info(`[bg3d-adapter-startup] ${JSON.stringify(adapter)}`);
  } finally {
    clearTimeout(deadline);
    await browser.close();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}
