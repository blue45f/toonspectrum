export const ATTACHMENT_MAX_COUNT = 3;
export const ATTACHMENT_MAX_DIMENSION = 1600;
export const ATTACHMENT_MAX_BYTES = 2 * 1024 * 1024;

const DATA_URL_RE = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/;

export function dataUrlBytes(dataUrl: string): number {
  const comma = dataUrl.indexOf(",");
  const base64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length / 4) * 3 - padding));
}

export function isAllowedImageDataUrl(value: unknown): value is string {
  return typeof value === "string" && DATA_URL_RE.test(value);
}

export function validateAttachmentImages(value: unknown): { images?: string[]; error?: string } {
  if (value === undefined || value === null) return { images: [] };
  if (!Array.isArray(value)) return { error: "첨부 형식이 올바르지 않아요." };
  if (value.length > ATTACHMENT_MAX_COUNT) {
    return { error: `이미지는 최대 ${ATTACHMENT_MAX_COUNT}장까지 첨부할 수 있어요.` };
  }
  const images: string[] = [];
  for (const item of value) {
    if (!isAllowedImageDataUrl(item)) {
      return { error: "이미지는 webp/jpeg/png 데이터 URL만 첨부할 수 있어요." };
    }
    if (dataUrlBytes(item) > ATTACHMENT_MAX_BYTES) {
      return { error: "이미지 한 장은 2MB 이하여야 해요." };
    }
    images.push(item);
  }
  return { images };
}
