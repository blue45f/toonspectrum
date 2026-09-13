import { loadPromoImages } from "./promo-canvas";
import { readPromoFile } from "./promo-media";
import { promoDataUrl, type PromoPanel } from "./promo-model";

/** Split before downscaling, so long manuscripts do not lose their text resolution. */
export async function importPromoPanels(file: File, index: number, parts = 1, signal?: AbortSignal): Promise<PromoPanel[]> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 10_000_000 || file.size === 0) throw new Error("컷은 10MB 이하 PNG·JPEG·WebP 파일이어야 해요.");
  if (!Number.isInteger(parts) || parts < 1 || parts > 12) throw new Error("원고 분할 수가 올바르지 않아요.");
  const src = await readPromoFile(file, signal);
  const original: PromoPanel = { id: crypto.randomUUID(), src, description: "", caption: "", motion: "push-in", fit: "contain", weight: 1 };
  const images = await loadPromoImages({ panels: [original] }, signal);
  const image = images.get(original.id);
  if (!image) throw new Error("이미지를 읽지 못했어요.");
  if (parts > 1 && image.naturalHeight / parts < 32) throw new Error("분할할 이미지의 높이가 너무 작아요.");
  const canvas = document.createElement("canvas");
  const panels: PromoPanel[] = [];
  try {
    for (let part = 0; part < parts; part += 1) {
      if (signal?.aborted) throw new DOMException("취소했어요.", "AbortError");
      const top = Math.floor(image.naturalHeight * part / parts);
      const cropHeight = Math.floor(image.naturalHeight * (part + 1) / parts) - top;
      const scale = Math.min(1, 2048 / Math.max(image.naturalWidth, cropHeight));
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(cropHeight * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("이 브라우저에서 이미지 처리를 지원하지 않아요.");
      ctx.drawImage(image, 0, top, image.naturalWidth, cropHeight, 0, 0, canvas.width, canvas.height);
      panels.push({ ...original, id: crypto.randomUUID(), src: promoDataUrl(canvas.toDataURL("image/webp", 0.92), "image"), caption: `컷 ${index + part + 1}` });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return panels;
  } finally { canvas.width = 0; canvas.height = 0; image.src = ""; }
}

export async function importPromoAudio(file: File, signal?: AbortSignal): Promise<{ src: string; durationSec: number }> {
  if (file.size === 0 || file.size > 20_000_000 || !file.type.startsWith("audio/")) throw new Error("음원은 20MB 이하 오디오 파일이어야 해요.");
  const src = promoDataUrl(await readPromoFile(file, signal), "audio");
  if (signal?.aborted) throw new DOMException("취소했어요.", "AbortError");
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData(await file.arrayBuffer());
    if (signal?.aborted) throw new DOMException("취소했어요.", "AbortError");
    if (!Number.isFinite(buffer.duration) || buffer.duration <= 0 || buffer.duration > 180) throw new Error("음원은 3분 이하로 준비해 주세요.");
    return { src, durationSec: buffer.duration };
  } finally { await context.close(); }
}
