/**
 * render 테스트용 다중 메시 GLB 빌더. 실제 제작 패키지에는 없는 규약(`_Outline` 셸·멀티 프리미티브·헤어 LOD 이름)을 로더가
 * 처리하는지 확인할 때 쓴다. 메시마다 삼각형 1개(프리미티브 수만큼 반복)와 선택 morph target, 스킨은 없다.
 * 최소 GLB 컨테이너 형식은 `testing/minimal-glb.ts`와 같다(JSON + BIN 청크, 4바이트 정렬).
 */
import { GLB_CHUNK_BIN, GLB_CHUNK_JSON, GLB_MAGIC, GLB_VERSION } from "../../testing/minimal-glb";

export interface GlbMeshSpec {
  /** 노드·메시 이름. 프리미티브가 둘 이상이면 Babylon이 `<name>_primitive<i>`로 나눈다. */
  readonly name: string;
  /** 프리미티브 수(기본 1) */
  readonly primitives?: number;
  /** morph target 이름(프리미티브마다 같은 타깃이 붙는다) */
  readonly morphTargets?: readonly string[];
}

const ENCODER = new TextEncoder();

function pad4(length: number): number {
  return (length + 3) & ~3;
}

export function buildMultiMeshGlb(meshes: readonly GlbMeshSpec[]): Uint8Array {
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const indices = new Uint16Array([0, 1, 2, 0]);
  const morphNameSet = [...new Set(meshes.flatMap((mesh) => mesh.morphTargets ?? []))];

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
  const morphAccessor = new Map<string, number>();
  for (const name of morphNameSet) {
    const delta = new Float32Array([0, 0.1, 0, 0, 0.1, 0, 0, 0.1, 0]);
    binParts.push(new Uint8Array(delta.buffer));
    bufferViews.push({ buffer: 0, byteOffset: binLength, byteLength: delta.byteLength, target: 34962 });
    accessors.push({ bufferView: bufferViews.length - 1, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [0, 0.1, 0] });
    morphAccessor.set(name, accessors.length - 1);
    binLength += delta.byteLength;
  }

  const gltfMeshes = meshes.map((mesh) => {
    const targets = (mesh.morphTargets ?? []).map((name) => ({ POSITION: morphAccessor.get(name) }));
    const primitives = Array.from({ length: mesh.primitives ?? 1 }, () => ({ attributes: { POSITION: 0 }, indices: 1, ...(targets.length ? { targets } : {}) }));
    return { name: mesh.name, primitives, ...(mesh.morphTargets?.length ? { extras: { targetNames: [...mesh.morphTargets] } } : {}) };
  });
  const nodes = meshes.map((mesh, index) => ({ name: mesh.name, mesh: index }));
  const json = {
    asset: { version: "2.0", generator: "toonstudio character-lab render glb-fixture" },
    scene: 0,
    scenes: [{ nodes: nodes.map((_node, index) => index) }],
    nodes,
    meshes: gltfMeshes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: binLength }],
  };

  const jsonBytes = ENCODER.encode(JSON.stringify(json));
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
