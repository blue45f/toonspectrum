import { PROMOTION_COVER_MAX_BYTES } from "../../../../../packages/core/src/promotion";

/** Convert locally; send no original metadata, third-party upload, or video blob. */
export async function preparePromotionCover(file: File): Promise<string> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error("8MB 이하의 JPEG·PNG·WebP 이미지를 선택해 주세요.");
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 24_000_000) throw new Error("이미지는 2,400만 화소 이하로 준비해 주세요.");
    const scale = Math.min(1, 640 / bitmap.width, 800 / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이미지를 변환할 수 없는 브라우저예요.");
    context.fillStyle = "#ffffff"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.8, 0.65, 0.5, 0.35]) {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (blob && blob.size <= PROMOTION_COVER_MAX_BYTES) return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("이미지를 읽지 못했어요.")); reader.readAsDataURL(blob);
      });
    }
    throw new Error("표지를 128KB 이하로 줄이지 못했어요. 작은 이미지를 선택해 주세요.");
  } finally { bitmap.close(); }
}
