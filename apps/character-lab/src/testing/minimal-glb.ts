/**
 * 최소 유효 GLB 생성·파싱(glTF 2.0 binary container). 로더·exporter 테스트용.
 * 의존성 없음. 메시 1개(삼각형), 노드 1개, 씬 1개.
 */
export const GLB_MAGIC = 0x46546c67; // "glTF"
export const GLB_VERSION = 2;
export const GLB_CHUNK_JSON = 0x4e4f534a; // "JSON"
export const GLB_CHUNK_BIN = 0x004e4942; // "BIN\0"

const UTF8_ENCODER = new TextEncoder();
const UTF8_DECODER = new TextDecoder();

export interface MinimalGlbOptions {
  readonly meshName?: string;
  readonly nodeName?: string;
  /** 추가 노드 이름(본 이름 매핑 테스트용, 메시 없음) */
  readonly extraNodeNames?: readonly string[];
  /** 메시에 붙일 morph target 이름 */
  readonly morphTargetNames?: readonly string[];
  /** glTF JSON 루트에 합칠 확장(`extensions`) */
  readonly extensions?: Record<string, unknown>;
}

function pad4(length: number): number {
  return (length + 3) & ~3;
}

/** 삼각형 1개짜리 최소 GLB */
export function buildMinimalGlb(options: MinimalGlbOptions = {}): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0]); // 4바이트 정렬을 위해 패딩 1개
  const morphNames = options.morphTargetNames ?? [];

  const binParts: Uint8Array[] = [new Uint8Array(positions.buffer), new Uint8Array(indices.buffer)];
  const bufferViews: Array<Record<string, number>> = [
    { buffer: 0, byteOffset: 0, byteLength: positions.byteLength, target: 34962 },
    { buffer: 0, byteOffset: positions.byteLength, byteLength: 6, target: 34963 },
  ];
  const accessors: Array<Record<string, unknown>> = [
    { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
    { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
  ];
  let binLength = positions.byteLength + indices.byteLength;
  const targets: Array<{ POSITION: number }> = [];
  for (const _name of morphNames) {
    const delta = new Float32Array([0, 0.1, 0, 0, 0.1, 0, 0, 0.1, 0]);
    binParts.push(new Uint8Array(delta.buffer));
    bufferViews.push({ buffer: 0, byteOffset: binLength, byteLength: delta.byteLength, target: 34962 });
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [0, 0.1, 0] });
    targets.push({ POSITION: accessors.length - 1 });
    binLength += delta.byteLength;
  }

  const nodes: Array<Record<string, unknown>> = [{ name: options.nodeName ?? "Character", mesh: 0 }];
  for (const name of options.extraNodeNames ?? []) nodes.push({ name });

  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "toonstudio character-lab minimal-glb" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_node, index) => index) }],
    nodes,
    meshes: [
      {
        name: options.meshName ?? "Body",
        primitives: [{ attributes: { POSITION: 0 }, indices: 1, ...(targets.length ? { targets } : {}) }],
        ...(morphNames.length ? { extras: { targetNames: [...morphNames] } } : {}),
      },
    ],
    accessors,
    bufferViews,
    buffers: [{ byteLength: binLength }],
    ...(options.extensions ? { extensions: options.extensions, extensionsUsed: Object.keys(options.extensions) } : {}),
  };

  const jsonBytes = UTF8_ENCODER.encode(JSON.stringify(json));
  const jsonPadded = pad4(jsonBytes.length);
  const binPadded = pad4(binLength);
  const total = 12 + 8 + jsonPadded + 8 + binPadded;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, GLB_MAGIC, true);
  view.setUint32(4, GLB_VERSION, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonPadded, true);
  view.setUint32(16, GLB_CHUNK_JSON, true);
  out.set(jsonBytes, 20);
  for (let i = 20 + jsonBytes.length; i < 20 + jsonPadded; i += 1) out[i] = 0x20;
  const binOffset = 20 + jsonPadded;
  view.setUint32(binOffset, binPadded, true);
  view.setUint32(binOffset + 4, GLB_CHUNK_BIN, true);
  let cursor = binOffset + 8;
  for (const part of binParts) {
    out.set(part, cursor);
    cursor += part.byteLength;
  }
  return out;
}

export interface ParsedGlb {
  readonly version: number;
  readonly json: Record<string, unknown>;
  readonly bin: Uint8Array | null;
  readonly totalLength: number;
}

export function isGlb(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true) === GLB_MAGIC;
}

/** GLB 컨테이너 파싱. 형식이 틀리면 throw. */
export function parseGlb(bytes: Uint8Array): ParsedGlb {
  if (!isGlb(bytes)) throw new Error("GLB magic이 아닙니다.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(4, true);
  const totalLength = view.getUint32(8, true);
  if (totalLength !== bytes.byteLength) throw new Error(`GLB 길이 불일치: 헤더 ${totalLength}, 실제 ${bytes.byteLength}`);
  let offset = 12;
  let json: Record<string, unknown> | null = null;
  let bin: Uint8Array | null = null;
  while (offset + 8 <= bytes.byteLength) {
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    const chunk = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === GLB_CHUNK_JSON) json = JSON.parse(UTF8_DECODER.decode(chunk)) as Record<string, unknown>;
    else if (chunkType === GLB_CHUNK_BIN) bin = chunk;
    offset += 8 + chunkLength;
  }
  if (!json) throw new Error("GLB에 JSON 청크가 없습니다.");
  return { version, json, bin, totalLength };
}
