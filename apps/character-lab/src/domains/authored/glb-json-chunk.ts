/**
 * GLB 컨테이너에서 JSON 청크만 읽는 순수 파서(의존성 없음).
 * VRM 확장(VRMC_vrm / VRM) 메타·휴머노이드를 읽을 때 BIN 청크는 필요 없으므로 JSON만 디코드한다.
 */
const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const DECODER = new TextDecoder();

export type GlbJsonResult =
  | { readonly ok: true; readonly version: number; readonly json: Record<string, unknown> }
  | { readonly ok: false; readonly reasonKo: string };

/** 바이트 열이 GLB(glTF 2.0 binary)인지 */
export function isGlbBytes(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 12) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(0, true) === GLB_MAGIC;
}

/** GLB의 첫 JSON 청크를 파싱한다. 형식 오류는 한글 사유로 돌려준다(throw 없음). */
export function readGlbJsonChunk(bytes: Uint8Array): GlbJsonResult {
  if (!isGlbBytes(bytes)) return { ok: false, reasonKo: "GLB magic(glTF)이 아닙니다." };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  const declaredLength = view.getUint32(8, true);
  if (declaredLength > bytes.byteLength) {
    return { ok: false, reasonKo: `GLB 헤더 길이(${declaredLength})가 실제 바이트 수(${bytes.byteLength})보다 큽니다.` };
  }
  let offset = 12;
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const start = offset + 8;
    const end = start + chunkLength;
    if (end > bytes.byteLength) return { ok: false, reasonKo: "GLB 청크 길이가 파일 끝을 넘습니다." };
    if (chunkType === CHUNK_JSON) {
      try {
        const parsed: unknown = JSON.parse(DECODER.decode(bytes.subarray(start, end)));
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          return { ok: false, reasonKo: "GLB JSON 청크가 객체가 아닙니다." };
        }
        return { ok: true, version, json: parsed as Record<string, unknown> };
      } catch (error) {
        return { ok: false, reasonKo: `GLB JSON 청크를 파싱하지 못했습니다: ${error instanceof Error ? error.message : String(error)}` };
      }
    }
    offset = end;
  }
  return { ok: false, reasonKo: "GLB에 JSON 청크가 없습니다." };
}
