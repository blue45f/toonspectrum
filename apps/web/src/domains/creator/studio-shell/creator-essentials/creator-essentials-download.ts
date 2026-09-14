import { ESSENTIALS_MAX_BYTES, isEssentialsPath, type CreatorEssential } from "./creator-essentials-catalog";

/** Stream into the declared budget; a corrupt response cannot allocate unbounded asset memory. */
export async function fetchCreatorEssential(asset: CreatorEssential, signal?: AbortSignal): Promise<ArrayBuffer> {
  if (!isEssentialsPath(asset.url) || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || asset.bytes > ESSENTIALS_MAX_BYTES) {
    throw new Error("Invalid asset manifest entry");
  }
  const response = await fetch(asset.url, { signal, credentials: "omit", redirect: "error" });
  if (!response.ok || !response.body) throw new Error("Asset download failed");
  const reader = response.body.getReader();
  const bytes = new Uint8Array(asset.bytes);
  let offset = 0;
  try {
    for (;;) {
      signal?.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      if (offset + chunk.value.byteLength > bytes.length) throw new Error("Asset exceeds its declared size");
      bytes.set(chunk.value, offset);
      offset += chunk.value.byteLength;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (offset !== asset.bytes) throw new Error("Incomplete asset download");
  const digest = await crypto.subtle.digest("SHA-256", bytes.buffer);
  const hash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  if (hash !== asset.sha256) throw new Error("Asset integrity check failed");
  return bytes.buffer;
}

/** No popup or navigation. Retain the object URL long enough for embedded-browser downloads. */
export function downloadCreatorBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  try {
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body.append(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    globalThis.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

async function convertSvgToPng(bytes: ArrayBuffer, asset: CreatorEssential, signal?: AbortSignal): Promise<Blob> {
  const image = new Image();
  const url = URL.createObjectURL(new Blob([bytes], { type: "image/svg+xml" }));
  try {
    image.src = url;
    await image.decode();
    signal?.throwIfAborted();
    const scale = Math.min(1, 2048 / Math.max(asset.width, asset.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(asset.width * scale));
    canvas.height = Math.max(1, Math.round(asset.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("PNG conversion is unavailable in this browser");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
      canvas.width = 1; canvas.height = 1;
      if (blob) resolve(blob); else reject(new Error("PNG conversion failed"));
    }, "image/png"));
  } finally {
    image.src = "";
    URL.revokeObjectURL(url);
  }
}

export async function downloadCreatorEssential(asset: CreatorEssential, png: boolean, signal?: AbortSignal): Promise<void> {
  if (png && !asset.url.endsWith(".svg")) throw new Error("PNG export requires an SVG asset");
  const bytes = await fetchCreatorEssential(asset, signal);
  const type = asset.url.endsWith(".glb") ? "model/gltf-binary" : "image/svg+xml;charset=utf-8";
  const blob = png ? await convertSvgToPng(bytes, asset, signal) : new Blob([bytes], { type });
  signal?.throwIfAborted();
  downloadCreatorBlob(blob, `${asset.id}.${png ? "png" : asset.url.endsWith(".glb") ? "glb" : "svg"}`);
}
