/** Read only bounded JSON; never buffer an unbounded response before checking it. */
export const OPEN_RESPONSE_BYTES = 2 * 1024 * 1024;
export async function readOpenJson(response: Response, signal: AbortSignal): Promise<unknown> {
  const length = Number(response.headers.get("content-length"));
  const type = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  if (!response.ok || (type !== "application/json" && !type.endsWith("+json")) || length > OPEN_RESPONSE_BYTES) {
    void response.body?.cancel().catch(() => undefined);
    throw new Error("허용된 크기와 JSON 형식의 검색 응답이 아닙니다.");
  }
  if (!response.body) throw new Error("검색 응답 본문이 없습니다.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunks: string[] = [];
  let bytes = 0;
  const abort = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", abort, { once: true });
  try {
    if (signal.aborted) throw new DOMException("검색을 취소했습니다.", "AbortError");
    for (;;) {
      const next = await reader.read();
      if (signal.aborted) throw new DOMException("검색을 취소했습니다.", "AbortError");
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > OPEN_RESPONSE_BYTES) throw new Error("검색 응답이 허용 크기를 초과했습니다.");
      chunks.push(decoder.decode(next.value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return JSON.parse(chunks.join("")) as unknown;
  } catch (error) {
    void reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
}
