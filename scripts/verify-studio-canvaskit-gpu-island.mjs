/** Real-browser package integration check. No production services or credentials are used. */
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = new URL("../.qa/engine-resume/", import.meta.url);
const server = await createServer({
  configFile: false, envFile: false, root,
  optimizeDeps: { noDiscovery: true, include: ["canvaskit-wasm", "zod"] },
  server: { host: "127.0.0.1", port: 5277, strictPort: true },
  plugins: [{
    name: "canvaskit-gpu-probe-page",
    configureServer(instance) {
      instance.middlewares.use((request, response, next) => {
        if (request.url !== "/__canvaskit_probe") return next();
        response.setHeader("Content-Type", "text/html");
        response.end("<!doctype html><title>CanvasKit GPU island verification</title><body></body>");
      });
    },
  }],
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:5277/__canvaskit_probe");
  const result = await page.evaluate(async () => {
    const { createSkiaGpuIslandBackend } = await import("/packages/studio-engine-skia/src/gpu-island.ts");
    const { getStroke } = await import("/node_modules/perfect-freehand/dist/esm/index.mjs");
    const canvases = [];
    const NativeCanvas = globalThis.OffscreenCanvas;
    globalThis.OffscreenCanvas = class extends NativeCanvas {
      constructor(width, height) { super(width, height); canvases.push(this); }
    };
    let nativeReadbacks = 0;
    const readPixels = WebGL2RenderingContext.prototype.readPixels;
    WebGL2RenderingContext.prototype.readPixels = function (...args) {
      nativeReadbacks += 1;
      return Reflect.apply(readPixels, this, args);
    };
    const samples = Array.from({ length: 64 }, (_, i) => [12 + i * 2, 45 + Math.sin(i / 9) * 20, 0.15 + Math.sin(i / 63 * Math.PI) * 0.8]);
    const outline = getStroke(samples, { size: 12, thinning: 0.6, last: true });
    const verbs = [{ v: "M", x: outline[0][0], y: outline[0][1] }];
    outline.forEach((point, index) => {
      const next = outline[(index + 1) % outline.length];
      verbs.push({ v: "Q", cx: point[0], cy: point[1], x: (point[0] + next[0]) / 2, y: (point[1] + next[1]) / 2 });
    });
    verbs.push({ v: "Z" });
    const scene = {
      version: 11, width: 160, height: 96, background: { r: 0, g: 0, b: 0, a: 0 },
      nodes: [{ id: "ink", kind: "fill-path", path: { verbs }, fillRule: "nonzero", opacity: 0.7,
        blend: "src-over", paint: { kind: "solid", color: { r: 0.1, g: 0.3, b: 0.8, a: 1 } } }],
    };
    const backend = createSkiaGpuIslandBackend();
    const request = { islandId: "brush-probe", width: 160, height: 96, revision: 1, scene };
    const checkFrame = (frame) => {
      if (frame.status !== "transferred") throw new Error(JSON.stringify(frame));
      const canvas = document.createElement("canvas");
      canvas.width = frame.bitmap.width; canvas.height = frame.bitmap.height;
      const context = canvas.getContext("2d");
      context.drawImage(frame.bitmap, 0, 0); frame.bitmap.close();
      document.body.append(canvas);
      // Diagnostic-only Canvas2D readback is outside the interactive WebGL renderer.
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let visible = 0, mass = 0;
      for (let i = 3; i < pixels.length; i += 4) { mass += pixels[i]; if (pixels[i]) visible += 1; }
      if (!visible) throw new Error("Blank brush output");
      return { width: canvas.width, height: canvas.height, visible, alphaMass: mass };
    };
    try {
      const first = checkFrame(await backend.render(request));
      const cached = await backend.render(request);
      if (cached.status !== "cached") throw new Error("Revision cache did not hit");
      const second = checkFrame(await backend.render({ ...request, revision: 2 }));
      if (first.alphaMass !== second.alphaMass) throw new Error("Repeat render changed alpha mass");
      const resizedScene = { ...scene, width: 192 };
      const resized = checkFrame(await backend.render({ ...request, width: 192, scene: resizedScene }));
      if (resized.width !== 192) throw new Error("Stale bitmap reused after resize");
      const gl = canvases.at(-1).getContext("webgl2");
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : "unavailable";
      const lose = gl.getExtension("WEBGL_lose_context");
      let contextLoss = "not-supported";
      if (lose) {
        const lost = new Promise((resolve) => canvases.at(-1).addEventListener("webglcontextlost", resolve, { once: true }));
        lose.loseContext();
        let timeout;
        try {
          await Promise.race([lost, new Promise((_, reject) => {
            timeout = setTimeout(() => reject(new Error("Context-loss event timed out")), 5000);
          })]);
        } finally { clearTimeout(timeout); }
        const rejected = await backend.render({ ...request, width: 192, scene: resizedScene, revision: 3 });
        if (rejected.status !== "unavailable") throw new Error("Context loss did not fail closed");
        contextLoss = "fail-closed";
      }
      backend.dispose();
      const disposed = await backend.render(request);
      if (disposed.status !== "unavailable") throw new Error("Disposed backend rendered again");
      return { first, second, resized, cache: cached.status, interactiveWebGlReadPixelsCalls: nativeReadbacks, contextLoss, renderer };
    } finally {
      backend.dispose();
      globalThis.OffscreenCanvas = NativeCanvas;
      WebGL2RenderingContext.prototype.readPixels = readPixels;
    }
  });
  assert.equal(result.interactiveWebGlReadPixelsCalls, 0);
  assert.equal(result.contextLoss, "fail-closed");
  assert.deepEqual(errors, []);
  await mkdir(output, { recursive: true });
  const report = { scope: "isolated real-browser package runtime; not whole-product or physical-pen certification", browser: browser.version(), ...result, pageErrors: errors };
  await writeFile(new URL("canvaskit-gpu-browser.json", output), JSON.stringify(report, null, 2) + "\n");
  await page.screenshot({ path: fileURLToPath(new URL("canvaskit-gpu-browser.png", output)) });
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await server.close();
}
