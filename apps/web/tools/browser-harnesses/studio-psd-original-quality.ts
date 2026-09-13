import { writePsd } from "ag-psd";

import { encodeStudioLosslessCanvasSource } from "../../src/domains/creator/studio-lossless-canvas-source";
import { importPsdFile } from "../../src/domains/creator/studio-psd-import";

function requireValue<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message);
  return value;
}
function createPattern(width: number, height: number, grayscale = false): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const ctx = requireValue(canvas.getContext("2d"), "Canvas unavailable");
  const image = ctx.createImageData(width, height);
  for (let index = 0; index < width * height; index++) {
    const x = index % width;
    const y = Math.floor(index / width);
    const shade = (x + y * 3) % 256;
    image.data.set([shade, grayscale ? shade : (x * 7 + y) % 256, grayscale ? shade : (x + y * 11) % 256, 255], index * 4);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}
async function decode(source: string) {
  const image = new Image(); image.src = source; await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  const ctx = requireValue(canvas.getContext("2d"), "Decode canvas unavailable");
  ctx.drawImage(image, 0, 0);
  return { canvas, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
}
async function checkPixels(width: number, height: number, withMask: boolean) {
  const source = createPattern(width, height);
  const mask = withMask ? createPattern(width, height, true) : undefined;
  const bytes = writePsd({ width, height, children: [{ name: "native", canvas: source,
    ...(mask ? { mask: { canvas: mask, left: 0, top: 0, right: width, bottom: height, defaultColor: 255 as const } } : {}),
  }] }, { generateThumbnail: false, noBackground: true, trimImageData: false });
  const file = new File([bytes], "original.psd", { type: "image/vnd.adobe.photoshop" });
  const started = performance.now();
  const imported = await importPsdFile(file, 720);
  const elapsedMs = performance.now() - started;
  if (imported.layerPixelStorage !== "native-png") throw new Error("Native PNG storage missing");
  const layer = requireValue(imported.elements[0], "Imported layer missing");
  const actual = await decode(layer.src);
  if (actual.canvas.width !== width || actual.canvas.height !== height) throw new Error("Original dimensions changed");
  const expected = requireValue(source.getContext("2d"), "Source context missing").getImageData(0, 0, width, height).data;
  let differentChannels = 0;
  for (let index = 0; index < expected.length; index++) if (expected[index] !== actual.data[index]) differentChannels++;
  if (differentChannels) throw new Error(`${differentChannels} original pixel channels changed`);
  const reopened = await decode(await encodeStudioLosslessCanvasSource(actual.canvas));
  for (let index = 0; index < expected.length; index++) {
    if (reopened.data[index] !== expected[index]) throw new Error("PNG re-encoding changed original pixels");
  }
  let maskDifferentPixels = 0;
  if (mask) {
    const decodedMask = await decode(requireValue(layer.maskSrc, "Native mask missing"));
    if (decodedMask.canvas.width !== width || decodedMask.canvas.height !== height) throw new Error("Mask dimensions changed");
    const maskPixels = requireValue(mask.getContext("2d"), "Mask context missing").getImageData(0, 0, width, height).data;
    for (let index = 0; index < width * height; index++) {
      if (decodedMask.data[index * 4 + 3] !== maskPixels[index * 4]) maskDifferentPixels++;
    }
    if (maskDifferentPixels) throw new Error(`${maskDifferentPixels} mask alpha values changed`);
  }
  if (imported.skipped.length) throw new Error(imported.skipped.join("; "));
  return { width, height, withMask, differentChannels, maskDifferentPixels, encodedBytes: bytes.byteLength,
    originalStored: true, placementWidth: layer.width, elapsedMs: Math.round(elapsedMs) };
}
async function checkCancellation() {
  const canvas = createPattern(2560, 256);
  const controller = new AbortController();
  const pending = encodeStudioLosslessCanvasSource(canvas, controller.signal);
  controller.abort();
  try { await pending; throw new Error("Cancelled encoding unexpectedly completed"); }
  catch (error) { if (!(error instanceof DOMException) || error.name !== "AbortError") throw error; }
  return true;
}
async function run() {
  const scenarios = [];
  for (const [width, height, withMask] of [[2560, 128, true], [96, 2560, true], [128, 64, false]] as const) {
    scenarios.push(await checkPixels(width, height, withMask));
  }
  return { status: "passed", scenarios, cancelledEncoding: await checkCancellation(),
    boundary: "Real browser codec/pixel verification; not full Studio UI, pen latency, or production deployment verification." };
}
void run().then((report) => {
  document.documentElement.dataset.verification = "passed";
  requireValue(document.getElementById("result"), "Output missing").textContent = JSON.stringify(report, null, 2);
}).catch((error: unknown) => {
  document.documentElement.dataset.verification = "failed";
  requireValue(document.getElementById("result"), "Output missing").textContent = JSON.stringify({ status: "failed", error: error instanceof Error ? error.message : String(error) });
});
