// 커뮤니티 게시글 이미지 첨부 — 공용 한도/검증(서버·클라이언트)과 클라이언트 다운스케일.
// 저장 형식은 creator_asset.dataUrl과 동일한 "축소된 webp/jpeg 데이터 URL"(별도 스토리지 없음).
// 클라이언트가 긴 변 1600px 이하로 줄이고, 서버는 데이터 URL의 실제 바이트(≤2MB)와 형식만 다시 검증한다.

import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_DIMENSION,
  dataUrlBytes,
} from "@toonstudio/contracts/image-attach";

export {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  ATTACHMENT_MAX_DIMENSION,
  dataUrlBytes,
  isAllowedImageDataUrl,
  validateAttachmentImages,
} from "@toonstudio/contracts/image-attach";

// ── 클라이언트 전용(브라우저 DOM) ──────────────────────────────────────────────

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지를 읽지 못했어요."));
    };
    img.src = url;
  });
}

// 파일 → 긴 변 1600px 이하 webp(미지원 시 jpeg) 데이터 URL. 2MB를 넘으면 품질을 단계적으로 낮춘다.
// avatar-uploader의 다운스케일 컨벤션을 따르되, 크롭 없이 비율을 유지한다.
export async function fileToAttachmentDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("이미지 파일만 첨부할 수 있어요.");
  const img = await loadImageFromFile(file);
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > ATTACHMENT_MAX_DIMENSION ? ATTACHMENT_MAX_DIMENSION / longest : 1;
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("이미지를 변환할 수 없어요.");
  ctx.drawImage(img, 0, 0, width, height);

  let quality = 0.82;
  let out = canvas.toDataURL("image/webp", quality);
  if (!out.startsWith("data:image/webp")) out = canvas.toDataURL("image/jpeg", quality);
  while (dataUrlBytes(out) > ATTACHMENT_MAX_BYTES && quality > 0.35) {
    quality -= 0.12;
    out = out.startsWith("data:image/webp")
      ? canvas.toDataURL("image/webp", quality)
      : canvas.toDataURL("image/jpeg", quality);
  }
  if (dataUrlBytes(out) > ATTACHMENT_MAX_BYTES) {
    throw new Error("이미지를 2MB 이하로 줄이지 못했어요. 더 작은 이미지를 사용해 주세요.");
  }
  return out;
}
