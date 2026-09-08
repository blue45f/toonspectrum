import { EBML_ID, ebmlElement, ebmlFloat64Bytes, ebmlIdBytes, ebmlUintBytes, encodeVint } from "../studio-webcodecs-webm";

const MAX_VIDEO_BYTES = 256 * 1024 * 1024;
const CRC32_ID = 0xbf;
const SEGMENT_LEVEL_IDS = new Set<number>([EBML_ID.cluster, EBML_ID.info, EBML_ID.tracks, EBML_ID.cues, EBML_ID.seekHead]);
interface ElementSpan { id: number; start: number; data: number; end: number }

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) { output.set(part, at); at += part.length; }
  return output;
}
const uint = (id: number, value: number, length?: number) => ebmlElement(id, ebmlUintBytes(value, length));

/** Finalize MediaRecorder's streaming WebM without re-encoding either media track. */
export async function finalizeStudioAnimaticRecordedWebm(blob: Blob, durationMs: number): Promise<Blob> {
  if (blob.size < 12 || blob.size > MAX_VIDEO_BYTES || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 601000) throw new Error("영상의 크기 또는 재생 길이가 올바르지 않습니다.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  function vint(offset: number, keepMarker = false): { value: number; length: number; unknown: boolean } {
    if (offset >= bytes.length || bytes[offset] === 0) throw new Error("영상 EBML 헤더가 손상되었습니다.");
    let length = 1;
    while ((bytes[offset]! & (1 << (8 - length))) === 0) length++;
    if (length > (keepMarker ? 4 : 8) || offset + length > bytes.length) throw new Error("영상 EBML 길이가 잘렸습니다.");
    let value = BigInt(keepMarker ? bytes[offset]! : bytes[offset]! & ((1 << (8 - length)) - 1));
    for (let index = 1; index < length; index++) value = value * BigInt(256) + BigInt(bytes[offset + index]!);
    const unknown = !keepMarker && value === (BigInt(1) << BigInt(7 * length)) - BigInt(1);
    if (!unknown && value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("영상 요소가 크기 한도를 넘었습니다.");
    return { value: unknown ? 0 : Number(value), length, unknown };
  }
  function span(start: number, boundary: number): ElementSpan {
    const id = vint(start, true), size = vint(start + id.length);
    const data = start + id.length + size.length;
    let end = data + size.value;
    if (size.unknown) {
      if (id.value === EBML_ID.segment) end = boundary;
      else if (id.value === EBML_ID.cluster) {
        end = data;
        // A streaming Cluster ends when its next Segment-level sibling begins.
        while (end < boundary) {
          const childId = vint(end, true).value;
          if (SEGMENT_LEVEL_IDS.has(childId)) break;
          end = span(end, boundary).end;
        }
      } else throw new Error("지원하지 않는 무한 길이 영상 요소입니다.");
    }
    if (data > boundary || end > boundary || end < data) throw new Error("영상 요소의 범위가 올바르지 않습니다.");
    return { id: id.value, start, data, end };
  }
  function children(parent: ElementSpan) {
    const result: ElementSpan[] = [];
    for (let at = parent.data; at < parent.end;) { const child = span(at, parent.end); result.push(child); at = child.end; }
    return result;
  }
  function value(element: ElementSpan | undefined, fallback = 0): number {
    if (!element) return fallback;
    let result = 0;
    if (element.end - element.data > 8) throw new Error("영상 숫자 필드가 올바르지 않습니다.");
    for (let at = element.data; at < element.end; at++) result = result * 256 + bytes[at]!;
    if (!Number.isSafeInteger(result)) throw new Error("영상 숫자가 범위를 넘었습니다.");
    return result;
  }
  const header = span(0, bytes.length);
  if (header.id !== EBML_ID.ebml) throw new Error("WebM 영상 헤더가 없습니다.");
  const segment = span(header.end, bytes.length);
  if (segment.id !== EBML_ID.segment || segment.end !== bytes.length) throw new Error("WebM 영상 본문이 올바르지 않습니다.");
  const content = children(segment);
  const info = content.find((item) => item.id === EBML_ID.info);
  const tracks = content.find((item) => item.id === EBML_ID.tracks);
  if (!info || !tracks) throw new Error("영상 정보 또는 트랙 정보가 없습니다.");
  const infoChildren = children(info);
  const scale = value(infoChildren.find((item) => item.id === EBML_ID.timestampScale), 1000000);
  if (scale <= 0) throw new Error("영상 시간 단위가 올바르지 않습니다.");
  const finalizedInfo = ebmlElement(EBML_ID.info, concat([
    ...infoChildren.filter((item) => item.id !== EBML_ID.duration && item.id !== CRC32_ID).map((item) => bytes.subarray(item.start, item.end)),
    ebmlElement(EBML_ID.duration, ebmlFloat64Bytes(durationMs * 1000000 / scale)),
  ]));
  const video = children(tracks).filter((item) => item.id === EBML_ID.trackEntry).map(children)
    .find((entry) => value(entry.find((item) => item.id === EBML_ID.trackType)) === 1);
  const videoTrack = value(video?.find((item) => item.id === EBML_ID.trackNumber));
  if (!videoTrack) throw new Error("내보낸 파일에 영상 트랙이 없습니다.");
  const seek = (id: number, position: number) => ebmlElement(EBML_ID.seek, concat([
    ebmlElement(EBML_ID.seekId, ebmlIdBytes(id)), uint(EBML_ID.seekPosition, position, 8),
  ]));
  const seekHead = (infoPosition: number, tracksPosition: number, cuesPosition: number) => ebmlElement(EBML_ID.seekHead, concat([
    seek(EBML_ID.info, infoPosition), seek(EBML_ID.tracks, tracksPosition), seek(EBML_ID.cues, cuesPosition),
  ]));
  const headLength = seekHead(0, 0, 0).length;
  const parts: BlobPart[] = [];
  const cues: Uint8Array[] = [];
  let offset = headLength, infoPosition = 0, tracksPosition = 0;
  for (const item of content) {
    // Their offsets and checksums refer to the old streaming layout.
    if (item.id === EBML_ID.seekHead || item.id === EBML_ID.cues || item.id === CRC32_ID) continue;
    if (item.id === EBML_ID.info) {
      infoPosition = offset;
      parts.push(new Uint8Array(finalizedInfo)); offset += finalizedInfo.length;
      continue;
    }
    if (item.id === EBML_ID.tracks) tracksPosition = offset;
    if (item.id === EBML_ID.cluster) {
      const clusterChildren = children(item);
      const timestamp = value(clusterChildren.find((child) => child.id === EBML_ID.timestamp));
      for (const block of clusterChildren.filter((child) => child.id === EBML_ID.simpleBlock)) {
        const track = vint(block.data);
        const at = block.data + track.length;
        if (at + 3 > block.end) throw new Error("영상 블록이 잘렸습니다.");
        if (track.value !== videoTrack || !(bytes[at + 2]! & 0x80)) continue;
        const relative = new DataView(bytes.buffer, at, 2).getInt16(0, false);
        cues.push(ebmlElement(EBML_ID.cuePoint, concat([
          uint(EBML_ID.cueTime, Math.max(0, timestamp + relative)),
          ebmlElement(EBML_ID.cueTrackPositions, concat([uint(EBML_ID.cueTrack, videoTrack), uint(EBML_ID.cueClusterPosition, offset)])),
        ])));
      }
    }
    // Give formerly streaming Clusters a finite size so following Cues remain siblings.
    const elementHeader = concat([ebmlIdBytes(item.id), encodeVint(item.end - item.data)]);
    parts.push(elementHeader, blob.slice(item.data, item.end));
    offset += elementHeader.length + item.end - item.data;
  }
  const finalizedCues = ebmlElement(EBML_ID.cues, concat(cues));
  const finalizedHead = seekHead(infoPosition, tracksPosition, offset);
  const segmentHeader = concat([ebmlIdBytes(EBML_ID.segment), encodeVint(offset + finalizedCues.length)]);
  return new Blob([blob.slice(0, header.end), segmentHeader, new Uint8Array(finalizedHead), ...parts, new Uint8Array(finalizedCues)], { type: blob.type });
}
