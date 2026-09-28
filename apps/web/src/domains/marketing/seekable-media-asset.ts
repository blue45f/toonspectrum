export const SEEKABLE_MEDIA_TIMEOUT_MS = 30_000;
export const TOUR_AUDIO_MAX_BYTES = 12 * 1024 * 1024;
export const TOUR_VIDEO_MAX_BYTES = 32 * 1024 * 1024;

/**
 * 공개 미디어 CDN이 Range를 무시하고 200을 반환하는 환경에서도 탐색할 수 있도록
 * 크기·MIME을 확인한 완전한 파일만 Blob으로 준비한다. 인증·사용자 파일에는 사용하지 않는다.
 */
export async function fetchSeekableMediaAsset(
  source: string,
  options: { readonly signal: AbortSignal; readonly maxBytes: number; readonly mediaType: "audio" | "video" },
): Promise<Blob> {
  if (!source.startsWith("/brand/") || source.startsWith("//")) throw new Error("Unexpected public media path");
  if (!Number.isSafeInteger(options.maxBytes) || options.maxBytes <= 0) throw new Error("Invalid media size limit");
  const response = await fetch(source, { signal: options.signal, credentials: "same-origin" });
  const mime = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  const declaredSize = Number(response.headers.get("content-length"));
  if (response.status !== 200 || !mime.startsWith(`${options.mediaType}/`) || !response.body) {
    await response.body?.cancel();
    throw new Error("The media response is unavailable or has an unexpected format");
  }
  if (declaredSize > options.maxBytes) {
    await response.body.cancel();
    throw new Error("The media file exceeds its preparation limit");
  }
  const reader = response.body.getReader();
  const parts: ArrayBuffer[] = [];
  let bytes = 0;
  try {
    while (true) {
      options.signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > options.maxBytes) throw new Error("The media stream exceeds its preparation limit");
      parts.push(new Uint8Array(chunk.value).buffer);
    }
    if (bytes === 0) throw new Error("The media file is empty");
    if (declaredSize > 0 && !response.headers.has("content-encoding") && bytes !== declaredSize) {
      throw new Error("The media file is incomplete");
    }
    options.signal.throwIfAborted();
    return new Blob(parts, { type: mime });
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}
