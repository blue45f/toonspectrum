import { useEffect, useMemo, useState } from "react";
import { fetchSeekableMediaAsset, SEEKABLE_MEDIA_TIMEOUT_MS } from "./seekable-media-asset";

interface MediaRequest { readonly source: string; readonly maxBytes: number; readonly mediaType: "audio" | "video" }
interface PreparedMedia { readonly source: string | null; readonly url: string | null; readonly error: string | null; readonly loading: boolean }

/** 교체·이탈 시 요청과 Blob URL을 해제한다. 같은 파일 재진입도 새 요청으로 구분한다. */
export function useSeekableMediaAsset(source: string | null, maxBytes: number, mediaType: "audio" | "video"): PreparedMedia {
  const request = useMemo<MediaRequest | null>(() => source ? { source, maxBytes, mediaType } : null, [source, maxBytes, mediaType]);
  const [result, setResult] = useState<{ readonly request: MediaRequest; readonly url: string | null; readonly error: string | null } | null>(null);
  useEffect(() => {
    if (!request) return;
    let disposed = false;
    let objectUrl: string | null = null;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(new DOMException("Media preparation timed out", "TimeoutError")), SEEKABLE_MEDIA_TIMEOUT_MS);
    void fetchSeekableMediaAsset(request.source, { signal: controller.signal, maxBytes: request.maxBytes, mediaType: request.mediaType }).then((blob) => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(blob);
      setResult({ request, url: objectUrl, error: null });
    }).catch((error: unknown) => {
      if (disposed) return;
      setResult({ request, url: null, error: error instanceof Error ? error.message : "Media preparation failed" });
    }).finally(() => window.clearTimeout(timer));
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [request]);
  if (!request) return { source: null, url: null, error: null, loading: false };
  if (result?.request === request) return { source: request.source, url: result.url, error: result.error, loading: false };
  return { source: request.source, url: null, error: null, loading: true };
}
