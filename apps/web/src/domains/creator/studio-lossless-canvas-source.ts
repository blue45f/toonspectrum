/** Encode original pixels once. Never substitute a lossy preview for document data. */
export async function encodeStudioLosslessCanvasSource(
  canvas: Pick<HTMLCanvasElement, "toDataURL"> & Partial<Pick<HTMLCanvasElement, "toBlob">>,
  signal?: AbortSignal,
): Promise<string> {
  const cancelled = () => new DOMException("이미지 변환을 취소했어요.", "AbortError");
  if (signal?.aborted) throw cancelled();
  // Canvas-compatible decoders/test adapters may only expose the synchronous API.
  if (typeof canvas.toBlob !== "function") return canvas.toDataURL("image/png");
  return new Promise<string>((resolve, reject) => {
    let settled = false;
    let reader: FileReader | undefined;
    const cleanup = () => {
      signal?.removeEventListener("abort", onAbort);
      if (reader) reader.onload = reader.onerror = reader.onabort = null;
    };
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (reader && reader.readyState === FileReader.LOADING) {
        try { reader.abort(); } catch { /* Rejection must settle even if abort fails. */ }
      }
      reject(error);
    };
    const onAbort = () => fail(cancelled());
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) { onAbort(); return; }
    try {
      canvas.toBlob?.((blob) => {
        if (settled) return;
        if (!blob || blob.type !== "image/png" || blob.size === 0) {
          fail(new Error("원본 PNG 인코딩을 완료하지 못했어요."));
          return;
        }
        try { reader = new FileReader(); }
        catch { fail(new Error("원본 PNG 읽기를 시작하지 못했어요.")); return; }
        reader.onload = () => {
          if (settled) return;
          if (typeof reader?.result !== "string") {
            fail(new Error("원본 PNG 데이터를 읽지 못했어요."));
            return;
          }
          const result = reader.result;
          settled = true;
          cleanup();
          resolve(result);
        };
        reader.onerror = () => fail(new Error("원본 PNG 데이터를 읽지 못했어요."));
        reader.onabort = onAbort;
        try { reader.readAsDataURL(blob); }
        catch { fail(new Error("원본 PNG 데이터를 읽지 못했어요.")); }
      }, "image/png");
    } catch { fail(new Error("원본 PNG 인코딩을 시작하지 못했어요.")); }
  });
}
