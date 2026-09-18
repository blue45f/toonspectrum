import { MOTION_IMAGE_BYTES, MOTION_IMAGE_PIXELS, motionImageType } from "./motion-panel-model";

const aborted = () => new DOMException("이미지 불러오기를 취소했습니다.", "AbortError");
/** Local raster files only. Re-encode to a bounded PNG; no remote URLs or metadata are retained. */
export async function loadMotionImage(file: File, signal: AbortSignal): Promise<string> {
  if (signal.aborted) throw aborted();
  if (!file.size || file.size > MOTION_IMAGE_BYTES) throw new Error("8MB 이하의 PNG·JPEG·WebP 이미지를 골라 주세요.");
  const type = motionImageType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  if (!type || (file.type && type !== file.type)) throw new Error("PNG·JPEG·WebP 파일만 사용할 수 있어요. SVG·GIF와 손상된 파일은 지원하지 않아요.");
  if (signal.aborted) throw aborted();
  const source = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      const finish = (error?: Error) => { clearTimeout(timer); signal.removeEventListener("abort", cancel); image.onload = null; image.onerror = null; if (error) reject(error); else resolve(); };
      const cancel = () => { image.src = ""; finish(aborted()); };
      signal.addEventListener("abort", cancel, { once: true });
      const timer = setTimeout(() => { image.src = ""; finish(new Error("이미지를 읽는 시간이 초과됐어요. 더 작은 파일로 다시 시도해 주세요.")); }, 10000);
      image.onload = () => finish(); image.onerror = () => finish(new Error("이미지를 읽을 수 없어요. 다른 파일을 골라 주세요."));
      image.src = source;
    });
    if (signal.aborted) throw aborted();
    const pixels = image.naturalWidth * image.naturalHeight;
    if (!pixels || pixels > MOTION_IMAGE_PIXELS) throw new Error("1600만 화소 이하의 이미지를 사용해 주세요.");
    const ratio = Math.min(1, 1600 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio)); canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("이 브라우저는 이미지 변환을 지원하지 않아요. 기본 그림으로 체험해 주세요.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => result ? resolve(result) : reject(new Error("이미지 변환에 실패했어요. 다른 파일을 골라 주세요.")), "image/png");
    });
    if (signal.aborted) throw aborted();
    const result = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      const cancel = () => { reader.abort(); reject(aborted()); };
      signal.addEventListener("abort", cancel, { once: true });
      reader.onerror = () => { signal.removeEventListener("abort", cancel); reject(new Error("이미지 변환 결과를 읽지 못했어요.")); };
      reader.onload = () => { signal.removeEventListener("abort", cancel); resolve(String(reader.result ?? "")); };
      reader.readAsDataURL(blob);
    });
    if (!result.startsWith("data:image/png;base64,")) throw new Error("이미지 변환에 실패했어요. 다른 파일을 골라 주세요.");
    return result;
  } finally { image.src = ""; URL.revokeObjectURL(source); }
}
