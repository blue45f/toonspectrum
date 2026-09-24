import canvasSource from "./promo-canvas.ts?raw";
import { downloadPromoBlob } from "./promo-media";
import modelSource from "./promo-model.ts?raw";
import { promoRemotionFiles } from "./promo-remotion";
import voiceStudioModelSource from "./promo-voice-studio-model.ts?raw";
import { promoZip } from "./promo-zip";

import type { PromoProject } from "./promo-model";

export function downloadPromoRemotion(project: PromoProject): void {
  const files = promoRemotionFiles(project, {
    model: modelSource,
    canvas: canvasSource,
    voiceStudioModel: voiceStudioModelSource,
  });
  const bytes = promoZip(files);
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  downloadPromoBlob(new Blob([buffer], { type: "application/zip" }), "toonstudio-remotion-project.zip");
}
