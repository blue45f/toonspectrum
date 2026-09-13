import { drawPromoFrame, loadPromoImages } from "./promo-canvas";
import { promoSize, promoTimeline, type PromoProject } from "./promo-model";

export async function createPromoPoster(project: PromoProject, contactSheet: boolean, signal?: AbortSignal): Promise<Blob> {
  if (!project.panels.length) throw new Error("먼저 컷을 추가해 주세요.");
  const images = await loadPromoImages(project, signal);
  const timeline = promoTimeline(project);
  const size = promoSize(project.ratio, contactSheet ? 240 : 1080);
  const columns = contactSheet ? Math.min(3, timeline.length) : 1;
  const rows = contactSheet ? Math.ceil(timeline.length / columns) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = columns * size.width; canvas.height = rows * size.height;
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("썸네일 캔버스를 만들지 못했어요.");
    ctx.fillStyle = "#0b1120"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const [index, scene] of (contactSheet ? timeline : timeline.slice(0, 1)).entries()) {
      if (signal?.aborted) throw new DOMException("취소했어요.", "AbortError");
      ctx.save(); ctx.translate((index % columns) * size.width, Math.floor(index / columns) * size.height);
      ctx.beginPath(); ctx.rect(0, 0, size.width, size.height); ctx.clip();
      drawPromoFrame(ctx, project, images, scene.from + Math.floor(scene.duration * 0.5), size.width, size.height);
      ctx.restore();
    }
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("PNG를 만들지 못했어요.")), "image/png"));
  } finally { canvas.width = 0; canvas.height = 0; }
}
